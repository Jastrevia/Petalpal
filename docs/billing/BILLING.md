# PetalPal VIP billing

Code: [lib/billing.js](../../lib/billing.js). Routes: `GET /billing/me`, `GET /billing/plans`, `POST /billing/sync`,
`POST /billing/webhooks/revenuecat` ([server.js](../../server.js), [docs/openapi.yaml](../openapi.yaml)).

## Plans (owner decision 2026-11-18)

| Plan | Price | On sale | Store product (default id) |
|---|---|---|---|
| Monthly VIP | US$3 / month, auto-renewing | Always | `petalpal_vip_monthly` (auto-renewable subscription) |
| Lifetime VIP ("Founding Member") | US$10 once | Only until `BILLING_LIFETIME_OFFER_ENDS_AT` (launch + 3 months) | `petalpal_vip_lifetime` (non-consumable) |

Both plans give the same benefits. Lifetime buyers also get `founder: true` (a badge the app can show).

## Benefits

| | Free | VIP |
|---|---|---|
| Garden, journal, Events, emotion analysis | ✓ | ✓ |
| New flowers per local day | 2 | 3 |
| Weekly report | Code-written Weekly 2.0; **2 AI-written trials** per account, each spent only on a week with ≥ 3 Events | AI-written (Sonnet) every week |
| Monthly report | Code-written Monthly 2.0 | AI-written (Opus) |
| Tarot draw | Every day | Every day |
| Tarot AI reading | 3 per account, ever | 3 per account-local week (Monday start) |
| VIP-only cosmetics | — | ✓ (item system, later) |

Free-account limits (the Weekly/Monthly rows) apply only when `BILLING_ENFORCED=true`. Until then every account keeps
today's AI reports, so the switch can be turned on on launch day. VIP perks (3 flowers, tarot weekly limit) apply
either way. Weekly gating needs Weekly 2.0 on (`WEEKLY_INSIGHTS_OWNER_IDS=*` and `AI_WEEKLY_SHORT_OWNER_IDS=*`):
other Weekly contracts have no code template and keep using the model.

A trial is given back if the model call fails and the template is saved instead. A week that already holds a trial
never takes a second one (retried jobs).

### Cost per VIP (estimate, 2026-11-18 list prices, not measured)

Weekly ≈ $0.05 × 4, Monthly ≈ $0.20, tarot ≈ $0.04 × 12, Haiku per Event ≈ $0.03/month → about **$0.93/month for a
heavy VIP**, ~$0.45 typical. Monthly nets ~$2.55 after Apple's 15% (Small Business Program; 30% without it). Lifetime
nets ~$8.50 once. Keep `AI_USER_MONTHLY_USD_LIMIT` at about `1.50`: reservations count worst-case quotes until the
real usage is recorded.

## How it works

```
App (RevenueCat SDK) ──purchase──► App Store / Google Play / Web
       │                                   │
       │ POST /billing/sync                ▼
       ▼                           RevenueCat ──webhook──► POST /billing/webhooks/revenuecat
  Render backend ◄──────── GET https://api.revenuecat.com/v1/subscribers/{userId} ────────┘
       │
       └─► SubscriptionEntitlement (tier, status, plan, currentPeriodEnd, willRenew)
```

- The RevenueCat **app user id must be the PetalPal account id** (`user_<digits>`). Anonymous RevenueCat ids are ignored.
- The server never trusts a webhook body: it only takes the account ids from it and re-reads each account from
  RevenueCat's REST API (RevenueCat's own recommendation). A forged or replayed body cannot grant VIP.
- VIP is true only while `currentPeriodEnd` is in the future (lifetime: no end), so a missed expiration webhook never
  keeps VIP on. Billing-retry grace periods count as VIP until the grace end.
- Refunded subscriptions become `CANCELED`. Sandbox purchases are ignored unless `BILLING_ALLOW_SANDBOX=true` (TEST only).

## For the app (frontend)

1. Install `react-native-purchases` (and `react-native-purchases-ui` if you use RevenueCat's paywall). Needs a native
   build (not Expo Go).
2. After sign-in: `Purchases.configure({ apiKey: <public iOS/Android SDK key> })`, then `await Purchases.logIn(user.id)`.
   On sign-out: `Purchases.logOut()`.
3. Paywall: `GET /billing/plans` says which plans to show (`available`), and `endsAt` for a lifetime countdown. Take
   prices from `Purchases.getOfferings()` (localized store prices), never from the server.
4. Buy: `Purchases.purchasePackage(pkg)`. Then call `POST /billing/sync` with body `{}` and redraw from its response.
   Restore: `Purchases.restorePurchases()` then `POST /billing/sync`.
5. Everywhere else read `GET /billing/me`:
   - `vip`, `plan`, `founder`, `expiresAt`, `willRenew`, `inGracePeriod`
   - `benefits.weeklyAiTrialsLeft` ("2 AI letters left to try"), `benefits.dailyFlowers`
   - tarot: `GET /api/petal-cards/today` now also returns `weeklyLeft` for VIP owners.
6. "Manage subscription" opens the store's page (`Purchases.showManageSubscriptions()` or the store URL). Lifetime has
   nothing to manage.

### In the app (release/1.0.1, 2026-11-26)

- Me → **PetalPal VIP** ([VipMembership.tsx](../../mobile/src/components/features/VipMembership.tsx)) shows the
  owner's state from `GET /billing/me` (free / VIP until or renewing / Founding Member, grace-period notice, AI
  trial letters left) and opens the membership sheet: the benefits, the plans from `GET /billing/plans` matched to
  the RevenueCat `default` offering ([services/billing.ts](../../mobile/src/services/billing.ts) `plansToShow`:
  product id first, else package type), store prices, the lifetime end date, Buy, Restore, Manage (monthly), and
  the auto-renewal terms with Terms of Use and Privacy Policy links (App Review 3.1.2).
- [purchases.native.ts](../../mobile/src/services/purchases.native.ts): `react-native-purchases` **11.0.4** (pinned;
  needs a new native build). RevenueCat is configured lazily with `appUserID` = the PetalPal account id the first
  time the owner opens the sheet (`logIn` when another account signed in since). A user cancel is not an error.
  After a purchase or restore it calls `POST /billing/sync`.
- Web ([purchases.ts](../../mobile/src/services/purchases.ts)) never sells: the sheet says VIP is bought in the
  iPhone app. Dev web `?store=preview` stands in a pretend store to look at the sheet (the local preview's
  fixtures make the account a Founding Member on sync).
- Build setting (EAS environment, production and preview): **`EXPO_PUBLIC_REVENUECAT_IOS_KEY`** = the RevenueCat
  *public* Apple SDK key (Project settings → API keys; public keys are meant to ship in the app). Without it the
  sheet says "VIP opens soon". Never use a RevenueCat Test Store key in a release build. Android later:
  `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
- Legal pages (effective November 26, 2026, not yet published): Terms §4 PetalPal VIP (auto-renewal, cancelling,
  Founding Member, refunds through Apple), Privacy Policy names RevenueCat and Apple, the deletion page and the
  in-app Delete Account screen say deleting the account does not cancel an App Store subscription.

## Owner setup (one time)

Nothing here can be done from code. Do these yourself; never paste keys into chat.

1. **Apple**: App Store Connect → Agreements → accept *Paid Applications*, add bank and tax info. Join the **App Store
   Small Business Program** (15% instead of 30%).
2. App Store Connect → your app → create a subscription group "VIP" with `petalpal_vip_monthly` (1 month, US$2.99 or
   US$3 tier), and an in-app purchase **non-consumable** `petalpal_vip_lifetime` (US$9.99 tier). Fill in review notes and
   screenshots. (Google Play later: same ids.)
3. **RevenueCat** (free up to US$2.5k monthly tracked revenue): create the project, add the iOS app (App Store Connect
   API key / in-app purchase key), create entitlement **`vip`**, attach both products, make an offering `default` with a
   monthly and a lifetime package.
4. RevenueCat → Integrations → Webhooks: URL `https://<render backend>/billing/webhooks/revenuecat`, Authorization header
   value = a long random string.
5. Render (TEST first, then production) environment:

| Variable | Value |
|---|---|
| `REVENUECAT_SECRET_API_KEY` | RevenueCat secret API key (v1) |
| `REVENUECAT_WEBHOOK_AUTH` | the same string as the webhook Authorization header (≥ 16 characters) |
| `REVENUECAT_ENTITLEMENT_ID` | `vip` (default) |
| `BILLING_LIFETIME_OFFER_ENDS_AT` | e.g. `2027-07-31T23:59:59-07:00` (launch + 3 months). Unset = lifetime not on sale |
| `BILLING_ENFORCED` | `true` on launch day; unset until then |
| `BILLING_ALLOW_SANDBOX` | `true` on **TEST only** |
| `BILLING_MONTHLY_PRODUCT_IDS` / `BILLING_LIFETIME_PRODUCT_IDS` | only if the store ids differ from the defaults |

6. Migration `202611180001_vip_billing` must be applied before deploying this backend (adds columns and
   `BillingTrialUse`). Run it the usual way (`npx prisma migrate deploy` with the database URL), TEST first.
7. When the lifetime offer ends: also remove the lifetime package from the RevenueCat offering and set the App Store
   product to "Removed from sale". The server already hides it, but someone with an old app build could still buy it
   from the store; such purchases are honored.
8. Beta testers can get a free lifetime VIP: RevenueCat → customer → *Grant promotional entitlement* `vip`, lifetime.
   It shows as `plan: LIFETIME`, `store: PROMOTIONAL`.

## Account deletion

Deleting a PetalPal account deletes its `SubscriptionEntitlement` and `BillingTrialUse` rows (cascade). The RevenueCat
customer record is **not** deleted yet; delete it from the RevenueCat dashboard (or add a RevenueCat delete call to the
deletion workflow) and mention RevenueCat as a processor in the privacy policy before launch.
