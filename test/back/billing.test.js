import assert from "node:assert/strict";
import test from "node:test";
import {
  billingPlans, billingSummary, dailyFlowerLimitFor, entitlementFromSubscriber, localWeekStart, monthlyAiAllowed,
  reserveWeeklyAiTrial, releaseWeeklyAiTrial, revenueCatWebhookAuthorized, syncEntitlement, vipFrom, weeklyAiAccess, webhookUserIds
} from "../../lib/billing.js";

const NOW = new Date("2026-11-18T20:00:00Z");
const USER = "user_1762000000001";
const OTHER = "user_1762000000002";
const later = days => new Date(NOW.getTime() + days * 86_400_000).toISOString();

function fakeDb({ entitlement = null, users = [USER] } = {}) {
  const trials = [];
  let row = entitlement;
  return {
    trials,
    get row() { return row; },
    user: { findUnique: async ({ where }) => users.includes(where.id) ? { id: where.id } : null },
    subscriptionEntitlement: {
      findUnique: async () => row,
      upsert: async ({ create, update }) => (row = row ? { ...row, ...update } : create)
    },
    billingTrialUse: {
      count: async ({ where }) => trials.filter(t => t.userId === where.userId && t.feature === where.feature).length,
      create: async ({ data }) => {
        if (trials.some(t => t.userId === data.userId && t.feature === data.feature && t.periodKey === data.periodKey)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        trials.push(data); return data;
      },
      deleteMany: async ({ where }) => {
        for (let i = trials.length - 1; i >= 0; i--) {
          const t = trials[i];
          if (t.userId === where.userId && t.feature === where.feature && t.periodKey === where.periodKey) trials.splice(i, 1);
        }
      }
    }
  };
}

test("VIP needs PREMIUM, an active status and an end in the future (or the lifetime plan)", () => {
  assert.equal(vipFrom(null, NOW), false);
  assert.equal(vipFrom({ tier: "PREMIUM", status: "ACTIVE", plan: "LIFETIME", currentPeriodEnd: null }, NOW), true);
  assert.equal(vipFrom({ tier: "PREMIUM", status: "ACTIVE", plan: "MONTHLY", currentPeriodEnd: null }, NOW), false);
  assert.equal(vipFrom({ tier: "PREMIUM", status: "ACTIVE", plan: "MONTHLY", currentPeriodEnd: later(3) }, NOW), true);
  assert.equal(vipFrom({ tier: "PREMIUM", status: "GRACE_PERIOD", plan: "MONTHLY", currentPeriodEnd: later(1) }, NOW), true);
  assert.equal(vipFrom({ tier: "PREMIUM", status: "ACTIVE", plan: "MONTHLY", currentPeriodEnd: later(-1) }, NOW), false, "missed expiration webhook");
  assert.equal(vipFrom({ tier: "PREMIUM", status: "EXPIRED", plan: "LIFETIME", currentPeriodEnd: null }, NOW), false);
  assert.equal(vipFrom({ tier: "FREE", status: "ACTIVE", plan: "LIFETIME", currentPeriodEnd: null }, NOW), false);
});

test("the lifetime plan is on sale only before its end; unset means not on sale", () => {
  const plan = (env, now = NOW) => billingPlans({ env, now }).plans.find(p => p.plan === "LIFETIME");
  assert.equal(plan({}).available, false);
  assert.equal(plan({ BILLING_LIFETIME_OFFER_ENDS_AT: "not a date" }).available, false);
  assert.deepEqual(plan({ BILLING_LIFETIME_OFFER_ENDS_AT: "2027-04-30T23:59:59-07:00" }),
    { plan: "LIFETIME", productId: "petalpal_vip_lifetime", referencePriceUsd: 10, period: null, available: true, endsAt: "2027-05-01T06:59:59.000Z" });
  assert.equal(plan({ BILLING_LIFETIME_OFFER_ENDS_AT: "2026-11-18T20:00:00Z" }).available, false, "ends exactly at its instant");
  const monthly = billingPlans({ env: { BILLING_MONTHLY_PRODUCT_IDS: "vip_m1, vip_m0" }, now: NOW }).plans[0];
  assert.deepEqual(monthly, { plan: "MONTHLY", productId: "vip_m1", referencePriceUsd: 3, period: "P1M", available: true, endsAt: null });
});

test("RevenueCat subscriber state maps to the stored entitlement", () => {
  const sub = (entitlement, extra = {}) => ({ entitlements: entitlement ? { vip: entitlement } : {}, subscriptions: {}, non_subscriptions: {}, ...extra });
  const map = (s, env = {}) => entitlementFromSubscriber(s, { env, now: NOW });
  assert.deepEqual(map(sub(null)), { tier: "FREE", status: "INACTIVE", plan: null, productId: null, willRenew: false, currentPeriodEnd: null, purchasedAt: null, source: null });

  const monthly = sub({ product_identifier: "petalpal_vip_monthly", expires_date: later(20), purchase_date: "2026-11-08T20:00:00Z" },
    { subscriptions: { petalpal_vip_monthly: { store: "app_store", is_sandbox: false, unsubscribe_detected_at: null } } });
  assert.deepEqual(map(monthly), { tier: "PREMIUM", status: "ACTIVE", plan: "MONTHLY", productId: "petalpal_vip_monthly", willRenew: true,
    currentPeriodEnd: new Date(later(20)), purchasedAt: new Date("2026-11-08T20:00:00Z"), source: "APP_STORE" });

  monthly.subscriptions.petalpal_vip_monthly.unsubscribe_detected_at = "2026-11-10T00:00:00Z";
  assert.equal(map(monthly).willRenew, false, "auto-renew off: VIP until the period ends");
  assert.equal(map(monthly).status, "ACTIVE");

  const grace = sub({ product_identifier: "petalpal_vip_monthly", expires_date: later(-1), grace_period_expires_date: later(5) },
    { subscriptions: { petalpal_vip_monthly: { store: "play_store" } } });
  assert.equal(map(grace).status, "GRACE_PERIOD");
  assert.deepEqual(map(grace).currentPeriodEnd, new Date(later(5)));

  const expired = sub({ product_identifier: "petalpal_vip_monthly", expires_date: later(-2) }, { subscriptions: { petalpal_vip_monthly: { store: "stripe" } } });
  assert.equal(map(expired).tier, "FREE");
  assert.equal(map(expired).status, "EXPIRED");

  const lifetime = sub({ product_identifier: "petalpal_vip_lifetime", expires_date: null, purchase_date: "2027-01-05T00:00:00Z" },
    { non_subscriptions: { petalpal_vip_lifetime: [{ store: "app_store", is_sandbox: false }] } });
  assert.deepEqual(map(lifetime), { tier: "PREMIUM", status: "ACTIVE", plan: "LIFETIME", productId: "petalpal_vip_lifetime", willRenew: false,
    currentPeriodEnd: null, purchasedAt: new Date("2027-01-05T00:00:00Z"), source: "APP_STORE" });

  // A promotional lifetime grant from the RevenueCat dashboard (e.g. for a beta tester).
  const promo = sub({ product_identifier: "rc_promo_vip_lifetime", expires_date: null });
  assert.equal(map(promo).plan, "LIFETIME");

  const sandbox = sub({ product_identifier: "petalpal_vip_monthly", expires_date: later(3) },
    { subscriptions: { petalpal_vip_monthly: { store: "app_store", is_sandbox: true } } });
  assert.equal(map(sandbox).tier, "FREE", "production ignores sandbox purchases");
  assert.equal(map(sandbox, { BILLING_ALLOW_SANDBOX: "true" }).tier, "PREMIUM", "TEST accepts them");

  const refunded = sub({ product_identifier: "petalpal_vip_monthly", expires_date: later(3) },
    { subscriptions: { petalpal_vip_monthly: { store: "app_store", refunded_at: "2026-11-17T00:00:00Z" } } });
  assert.equal(map(refunded).tier, "FREE");
  assert.equal(map(refunded).status, "CANCELED");

  assert.equal(map({ entitlements: { pro: { expires_date: null } } }).tier, "FREE", "only the configured entitlement counts");
  assert.equal(map({ entitlements: { pro: { expires_date: null } } }, { REVENUECAT_ENTITLEMENT_ID: "pro" }).tier, "PREMIUM");
});

test("webhook auth is a constant-time match against a configured secret of at least 16 characters", () => {
  const env = { REVENUECAT_WEBHOOK_AUTH: "Bearer s3cret-value-123456" };
  assert.equal(revenueCatWebhookAuthorized("Bearer s3cret-value-123456", env), true);
  assert.equal(revenueCatWebhookAuthorized("Bearer s3cret-value-123457", env), false);
  assert.equal(revenueCatWebhookAuthorized(undefined, env), false);
  assert.equal(revenueCatWebhookAuthorized("short", { REVENUECAT_WEBHOOK_AUTH: "short" }), false);
  assert.equal(revenueCatWebhookAuthorized("anything", {}), false);
});

test("a webhook names only PetalPal user ids, deduplicated, transfers included", () => {
  assert.deepEqual(webhookUserIds({ event: { type: "TRANSFER", transferred_from: [USER, "$RCAnonymousID:abc"], transferred_to: [OTHER] } }), [USER, OTHER]);
  assert.deepEqual(webhookUserIds({ event: { app_user_id: USER, original_app_user_id: USER, aliases: [USER, "x"] } }), [USER]);
  assert.deepEqual(webhookUserIds({}), []);
  assert.deepEqual(webhookUserIds({ event: "nope" }), []);
});

test("sync reads RevenueCat with the secret key and saves only existing accounts", async () => {
  const db = fakeDb();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    return Response.json({ subscriber: { entitlements: { vip: { product_identifier: "petalpal_vip_lifetime", expires_date: null } },
      subscriptions: {}, non_subscriptions: { petalpal_vip_lifetime: [{ store: "app_store" }] } } });
  };
  const env = { REVENUECAT_SECRET_API_KEY: "sk_test_secret_value" };
  await assert.rejects(syncEntitlement(db, USER, { env: {}, fetchImpl, now: NOW }), { code: "BILLING_NOT_CONFIGURED" });
  const saved = await syncEntitlement(db, USER, { env, fetchImpl, now: NOW });
  assert.equal(saved.plan, "LIFETIME");
  assert.deepEqual(db.row.syncedAt, NOW);
  assert.deepEqual(calls, [{ url: `https://api.revenuecat.com/v1/subscribers/${USER}`, auth: "Bearer sk_test_secret_value" }]);
  assert.equal(await syncEntitlement(db, OTHER, { env, fetchImpl, now: NOW }), null, "unknown account");
  assert.equal(await syncEntitlement(db, "../admin", { env, fetchImpl, now: NOW }), null, "not a user id");
  assert.equal(calls.length, 1);
  await assert.rejects(syncEntitlement(db, USER, { env, fetchImpl: async () => new Response("no", { status: 500 }), now: NOW }),
    { code: "BILLING_PROVIDER_FAILED" });
});

test("free limits apply only when billing is enforced; VIP perks always", async () => {
  const free = fakeDb();
  const vip = fakeDb({ entitlement: { tier: "PREMIUM", status: "ACTIVE", plan: "LIFETIME", currentPeriodEnd: null } });
  const on = { BILLING_ENFORCED: "true" };
  assert.equal(await weeklyAiAccess(free, USER, { env: {}, now: NOW }), "OPEN");
  assert.equal(await monthlyAiAllowed(free, USER, { env: {}, now: NOW }), true);
  assert.equal(await weeklyAiAccess(free, USER, { env: on, now: NOW }), "TRIAL");
  assert.equal(await monthlyAiAllowed(free, USER, { env: on, now: NOW }), false);
  assert.equal(await weeklyAiAccess(vip, USER, { env: on, now: NOW }), "VIP");
  assert.equal(await monthlyAiAllowed(vip, USER, { env: on, now: NOW }), true);
  assert.equal(await dailyFlowerLimitFor(free, USER, NOW), 2);
  assert.equal(await dailyFlowerLimitFor(vip, USER, NOW), 3);
  const broken = { subscriptionEntitlement: { findUnique: async () => { throw new Error("db down"); } } };
  assert.equal(await dailyFlowerLimitFor(broken, USER, NOW), 2, "fails closed to the free limit");
});

test("two Weekly AI trials per account, one per week, given back when not used", async () => {
  const db = fakeDb();
  assert.equal(await reserveWeeklyAiTrial(db, { userId: USER, periodKey: "2026-11-09" }), true);
  assert.equal(await reserveWeeklyAiTrial(db, { userId: USER, periodKey: "2026-11-09" }), true, "a retried job keeps its week's trial");
  assert.equal(db.trials.length, 1);
  assert.equal(await reserveWeeklyAiTrial(db, { userId: USER, periodKey: "2026-11-16" }), true);
  assert.equal(await reserveWeeklyAiTrial(db, { userId: USER, periodKey: "2026-11-23" }), false);
  assert.equal(db.trials.length, 2, "the third row was given back");
  assert.equal(await weeklyAiAccess(db, USER, { env: { BILLING_ENFORCED: "true" }, now: NOW }), "NONE");
  await releaseWeeklyAiTrial(db, { userId: USER, periodKey: "2026-11-16" });
  assert.equal(await weeklyAiAccess(db, USER, { env: { BILLING_ENFORCED: "true" }, now: NOW }), "TRIAL");
});

test("the billing summary shows VIP state and the free counters", async () => {
  const free = fakeDb();
  assert.deepEqual(await billingSummary(free, USER, { env: { BILLING_ENFORCED: "true" }, now: NOW }), {
    vip: false, plan: null, founder: false, expiresAt: null, willRenew: false, inGracePeriod: false, store: null, enforced: true,
    benefits: { weeklyAi: false, monthlyAi: false, weeklyAiTrialsLeft: 2, dailyFlowers: 2, tarotReadingsPerWeek: null }
  });
  const monthly = fakeDb({ entitlement: { tier: "PREMIUM", status: "ACTIVE", plan: "MONTHLY", currentPeriodEnd: new Date(later(10)), willRenew: true, source: "APP_STORE" } });
  const summary = await billingSummary(monthly, USER, { env: { BILLING_ENFORCED: "true" }, now: NOW });
  assert.equal(summary.vip, true);
  assert.equal(summary.founder, false);
  assert.equal(summary.expiresAt, later(10));
  assert.equal(summary.willRenew, true);
  assert.deepEqual(summary.benefits, { weeklyAi: true, monthlyAi: true, weeklyAiTrialsLeft: null, dailyFlowers: 3, tarotReadingsPerWeek: 3 });
  const lifetime = fakeDb({ entitlement: { tier: "PREMIUM", status: "ACTIVE", plan: "LIFETIME", currentPeriodEnd: null } });
  assert.equal((await billingSummary(lifetime, USER, { now: NOW })).founder, true);
});

test("the local week starts on Monday, by calendar date only", () => {
  assert.equal(localWeekStart("2026-11-16"), "2026-11-16"); // Monday
  assert.equal(localWeekStart("2026-11-22"), "2026-11-16"); // Sunday
  assert.equal(localWeekStart("2026-11-01"), "2026-10-26"); // Sunday of the fall-back weekend
  assert.equal(localWeekStart("2027-01-01"), "2026-12-28");
});
