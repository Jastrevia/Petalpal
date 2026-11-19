// VIP billing (docs/billing/BILLING.md). Two plans: a monthly subscription that is always on sale,
// and a lifetime plan sold only until BILLING_LIFETIME_OFFER_ENDS_AT. Purchases happen in the app
// through RevenueCat (App Store, Google Play or web); this server never sees a card or a receipt.
// It reads the owner's state from RevenueCat's REST API and keeps it in SubscriptionEntitlement.
//
// Free-account limits apply only when BILLING_ENFORCED=true, so turning payments on is one switch.
// VIP perks (more flowers, Weekly/Monthly AI, tarot) work either way.
import { timingSafeEqual } from "node:crypto";
import { grantItem, purchasedItemIds } from "./items.js";

export const VIP_LIMITS = Object.freeze({
  dailyFlowers: 3,
  tarotReadingsPerWeek: 3
});
export const FREE_LIMITS = Object.freeze({
  dailyFlowers: 2,
  weeklyAiTrials: 2,
  // A trial is only spent on a week with at least this many Events, so it is never a thin letter.
  weeklyAiTrialMinEvents: 3
});
export const TRIAL_FEATURES = Object.freeze({ WEEKLY_AI: "WEEKLY_AI" });

const VIP_STATUSES = new Set(["ACTIVE", "GRACE_PERIOD"]);
const DEFAULT_PRODUCTS = Object.freeze({ MONTHLY: "petalpal_vip_monthly", LIFETIME: "petalpal_vip_lifetime" });
const STORE_SOURCES = Object.freeze({ app_store: "APP_STORE", mac_app_store: "APP_STORE", play_store: "PLAY_STORE",
  stripe: "STRIPE", rc_billing: "WEB", paddle: "WEB", amazon: "AMAZON", promotional: "PROMOTIONAL" });
// Account ids are user_<ms> (server.js account creation); RevenueCat app user ids must be set to them.
const USER_ID = /^user_\d{10,16}$/;

export const billingEnforced = (env = process.env) => env.BILLING_ENFORCED === "true";
const list = value => String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
export function productIds(env = process.env) {
  return {
    MONTHLY: list(env.BILLING_MONTHLY_PRODUCT_IDS).length ? list(env.BILLING_MONTHLY_PRODUCT_IDS) : [DEFAULT_PRODUCTS.MONTHLY],
    LIFETIME: list(env.BILLING_LIFETIME_PRODUCT_IDS).length ? list(env.BILLING_LIFETIME_PRODUCT_IDS) : [DEFAULT_PRODUCTS.LIFETIME]
  };
}
const entitlementId = (env = process.env) => env.REVENUECAT_ENTITLEMENT_ID || "vip";

// The lifetime offer is on sale only before its end instant. Unset means not on sale, so the offer can
// never run forever by mistake.
export function lifetimeOfferEndsAt(env = process.env) {
  const value = env.BILLING_LIFETIME_OFFER_ENDS_AT;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// What the app shows on the paywall. Prices come from the store through the RevenueCat SDK (they
// differ by country); the USD amounts here are only the plan's reference price.
export function billingPlans({ env = process.env, now = new Date() } = {}) {
  const endsAt = lifetimeOfferEndsAt(env);
  const products = productIds(env);
  return {
    entitlementId: entitlementId(env),
    plans: [
      { plan: "MONTHLY", productId: products.MONTHLY[0], referencePriceUsd: 3, period: "P1M", available: true, endsAt: null },
      { plan: "LIFETIME", productId: products.LIFETIME[0], referencePriceUsd: 10, period: null,
        available: Boolean(endsAt && now < endsAt), endsAt: endsAt ? endsAt.toISOString() : null }
    ]
  };
}

// The one rule for "is this owner VIP right now". The stored period end is checked too, so a
// missed expiration webhook never keeps VIP on.
export function vipFrom(entitlement, now = new Date()) {
  if (!entitlement || entitlement.tier !== "PREMIUM" || !VIP_STATUSES.has(entitlement.status)) return false;
  if (entitlement.currentPeriodEnd == null) return entitlement.plan === "LIFETIME";
  return new Date(entitlement.currentPeriodEnd).getTime() > now.getTime();
}

const ENTITLEMENT_SELECT = { tier: true, status: true, plan: true, currentPeriodEnd: true, willRenew: true,
  productId: true, source: true, purchasedAt: true };
export async function loadEntitlement(db, userId) {
  return db.subscriptionEntitlement.findUnique({ where: { userId }, select: ENTITLEMENT_SELECT });
}
export async function isVip(db, userId, now = new Date()) {
  try { return vipFrom(await loadEntitlement(db, userId), now); }
  catch { return false; }
}
export async function dailyFlowerLimitFor(db, userId, now = new Date()) {
  return await isVip(db, userId, now) ? VIP_LIMITS.dailyFlowers : FREE_LIMITS.dailyFlowers;
}

// Weekly AI for one owner: VIP always, everyone while billing is not enforced, otherwise a trial while
// any are left. "NONE" means the code-template Weekly.
export async function weeklyAiAccess(db, userId, { env = process.env, now = new Date() } = {}) {
  if (!billingEnforced(env)) return "OPEN";
  if (await isVip(db, userId, now)) return "VIP";
  const used = await db.billingTrialUse.count({ where: { userId, feature: TRIAL_FEATURES.WEEKLY_AI } });
  return used < FREE_LIMITS.weeklyAiTrials ? "TRIAL" : "NONE";
}

// Takes one Weekly AI trial for this week. Insert, then count: if two jobs raced past the limit, the
// one that went over gives its row back and that week gets the template.
export async function reserveWeeklyAiTrial(db, { userId, periodKey }) {
  try {
    await db.billingTrialUse.create({ data: { userId, feature: TRIAL_FEATURES.WEEKLY_AI, periodKey } });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    return true; // This week already holds a trial (a retried job); it does not take another.
  }
  const used = await db.billingTrialUse.count({ where: { userId, feature: TRIAL_FEATURES.WEEKLY_AI } });
  if (used <= FREE_LIMITS.weeklyAiTrials) return true;
  await releaseWeeklyAiTrial(db, { userId, periodKey });
  return false;
}
export async function releaseWeeklyAiTrial(db, { userId, periodKey }) {
  await db.billingTrialUse.deleteMany({ where: { userId, feature: TRIAL_FEATURES.WEEKLY_AI, periodKey } });
}

// Monthly is written by Opus for VIP (and for everyone while billing is not enforced); free accounts
// get the code-only Monthly 2.0.
export async function monthlyAiAllowed(db, userId, { env = process.env, now = new Date() } = {}) {
  return !billingEnforced(env) || await isVip(db, userId, now);
}

// GET /billing/me: everything the app needs to draw VIP state and the free counters.
export async function billingSummary(db, userId, { env = process.env, now = new Date() } = {}) {
  const entitlement = await loadEntitlement(db, userId);
  const vip = vipFrom(entitlement, now);
  const trialsUsed = await db.billingTrialUse.count({ where: { userId, feature: TRIAL_FEATURES.WEEKLY_AI } });
  return {
    vip,
    plan: vip ? entitlement.plan ?? null : null,
    founder: vip && entitlement.plan === "LIFETIME",
    expiresAt: vip && entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd).toISOString() : null,
    willRenew: vip && entitlement.plan === "MONTHLY" ? entitlement.willRenew === true : false,
    inGracePeriod: vip && entitlement.status === "GRACE_PERIOD",
    store: vip ? entitlement.source ?? null : null,
    enforced: billingEnforced(env),
    benefits: {
      weeklyAi: vip || !billingEnforced(env),
      monthlyAi: vip || !billingEnforced(env),
      weeklyAiTrialsLeft: vip ? null : Math.max(0, FREE_LIMITS.weeklyAiTrials - trialsUsed),
      dailyFlowers: vip ? VIP_LIMITS.dailyFlowers : FREE_LIMITS.dailyFlowers,
      tarotReadingsPerWeek: vip ? VIP_LIMITS.tarotReadingsPerWeek : null
    }
  };
}

// ---- RevenueCat ----------------------------------------------------------------------------------

export const isAppUserId = value => typeof value === "string" && USER_ID.test(value);

// Webhook Authorization header, compared in constant time. Unset secret means webhooks are refused.
export function revenueCatWebhookAuthorized(header, env = process.env) {
  const expected = env.REVENUECAT_WEBHOOK_AUTH;
  if (typeof expected !== "string" || expected.length < 16 || typeof header !== "string") return false;
  const actual = Buffer.from(header), secret = Buffer.from(expected);
  return actual.length === secret.length && timingSafeEqual(actual, secret);
}

// Every PetalPal user id a webhook names (aliases and transfers included); anonymous ids are skipped.
export function webhookUserIds(body) {
  const event = body?.event;
  if (!event || typeof event !== "object") return [];
  const ids = [event.app_user_id, event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])];
  return [...new Set(ids.filter(isAppUserId))].slice(0, 10);
}

const dateOrNull = value => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Turns RevenueCat's subscriber object into the row we store. Pure, so every store case is testable.
export function entitlementFromSubscriber(subscriber, { env = process.env, now = new Date() } = {}) {
  const free = { tier: "FREE", status: "INACTIVE", plan: null, productId: null, willRenew: false,
    currentPeriodEnd: null, purchasedAt: null, source: null };
  const entitlement = subscriber?.entitlements?.[entitlementId(env)];
  if (!entitlement || typeof entitlement !== "object") return free;
  const productId = typeof entitlement.product_identifier === "string" ? entitlement.product_identifier.slice(0, 128) : null;
  const subscription = productId ? subscriber.subscriptions?.[productId] : null;
  const purchases = productId && Array.isArray(subscriber.non_subscriptions?.[productId]) ? subscriber.non_subscriptions[productId] : [];
  const purchase = subscription || purchases.at(-1) || null;
  // Sandbox purchases (TestFlight, store test accounts) count only where BILLING_ALLOW_SANDBOX=true (TEST).
  if (purchase?.is_sandbox === true && env.BILLING_ALLOW_SANDBOX !== "true") return free;
  if (subscription?.refunded_at) return { ...free, status: "CANCELED", productId };
  const products = productIds(env);
  const expires = dateOrNull(entitlement.expires_date);
  const grace = dateOrNull(entitlement.grace_period_expires_date);
  const lifetime = products.LIFETIME.includes(productId) || (!products.MONTHLY.includes(productId) && entitlement.expires_date == null);
  const store = typeof purchase?.store === "string" ? STORE_SOURCES[purchase.store] ?? "OTHER" : null;
  const base = { tier: "PREMIUM", productId, purchasedAt: dateOrNull(entitlement.purchase_date), source: store };
  if (lifetime) return { ...base, status: "ACTIVE", plan: "LIFETIME", willRenew: false, currentPeriodEnd: null };
  if (!expires) return free;
  const inGrace = grace && expires <= now && now < grace;
  const end = inGrace ? grace : expires;
  if (end <= now) return { ...base, tier: "FREE", status: "EXPIRED", plan: "MONTHLY", willRenew: false, currentPeriodEnd: end };
  return { ...base, status: inGrace ? "GRACE_PERIOD" : "ACTIVE", plan: "MONTHLY",
    willRenew: !subscription?.unsubscribe_detected_at, currentPeriodEnd: end };
}

export async function fetchRevenueCatSubscriber(userId, { env = process.env, fetchImpl = fetch } = {}) {
  const key = env.REVENUECAT_SECRET_API_KEY;
  if (typeof key !== "string" || !/^[\x21-\x7e]{8,512}$/.test(key)) {
    const error = new Error("RevenueCat is not configured"); error.code = "BILLING_NOT_CONFIGURED"; throw error;
  }
  const response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    void response.body?.cancel?.().catch(() => {}); // Provider error bodies are never parsed or logged.
    const error = new Error("RevenueCat request failed"); error.code = "BILLING_PROVIDER_FAILED"; error.status = response.status; throw error;
  }
  const body = await response.json();
  return body?.subscriber ?? null;
}

// Reads the owner's store state (VIP and shop items) and saves it. Only existing accounts are written.
export async function syncEntitlement(db, userId, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  if (!isAppUserId(userId)) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return null;
  const subscriber = await fetchRevenueCatSubscriber(userId, { env, fetchImpl });
  const data = { ...entitlementFromSubscriber(subscriber, { env, now }), syncedAt: now };
  // Shop items (lib/items.js) bought as non-consumable products are owned from the same read.
  for (const itemId of purchasedItemIds(subscriber, env)) await grantItem(db, { userId, itemId, source: "PURCHASE" });
  return db.subscriptionEntitlement.upsert({ where: { userId }, update: data, create: { userId, ...data }, select: ENTITLEMENT_SELECT });
}

// Monday (YYYY-MM-DD) of the account-local week that holds localDate. Calendar arithmetic only.
export function localWeekStart(localDate) {
  const time = Date.parse(`${localDate}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay(); // 0 = Sunday
  return new Date(time - ((weekday + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}
