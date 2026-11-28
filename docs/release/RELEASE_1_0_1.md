# PetalPal 1.0.1 — what is in it, what must be set up, and how to try it on TEST

Branch `release/1.0.1` (from `main` 16581599; `origin/main` dffe5a0e merged in). Not sent to App Review:
1.0 (4) is the review build (`main` dffe5a0e). This is the baseline Jean builds on, and what becomes `main`
once 1.0 is through review (plan A, 2026-11-27).

## What it adds over 1.0

| Area | What | Code |
|---|---|---|
| Garden | Golden puppy and Xiaobai live in the Garden; their house; in rain, storms and snow they run home, go in (painted clip) and rest in the doorway; a tap on the house shows them asleep | `critters/GardenCritters.tsx`, `critters/DogHouseOccupants.tsx`, `DogsAsleepCard.tsx`, `dogHouseState.ts` |
| Garden | Weather painting (rain, storm, snow, fog, cloud, wind) | `garden/weather/*` |
| Garden | Live weather: Me → Garden weather (opt-in, approximate location rounded to ~11 km, MET Norway) | `features/GardenWeatherSettings.tsx`, `services/gardenWeather.ts`, `lib/weather.js` (on main) |
| Garden | Silktail Fox: every 14th distinct Event day and 9 holidays (CN + intl), arrives out of petals, small note | `lib/silktail.js`, `GET /api/garden/silktail`, `critters/silktailDays.ts`, `SilktailNote.tsx` |
| Pets | Real dog food: kibble + 8 dog-safe foods (AKC/ASPCA), painted icons, how to serve, "never give dogs" card | `lib/garden-pets.js`, `critters/foodArt.ts` |
| Pets | Pet ring Feed no longer crashes iOS (worklet) | `critters/petRing.ts` |
| Phone | Pinch zoom on phones (no −/+ under 600 pt); smaller butterfly, fairy bubble, treehouse hint; voice errors in Chinese; calendar opens today's petal card when closeness is off | `GardenScene.tsx`, `services/voiceErrors.ts` |
| Reading | Reading fairy moves continuously | `fairy/reading/*` |
| VIP | Me → PetalPal VIP and the membership sheet: Founding Member (US$10 once, limited) beside Monthly (US$3), store prices, restore, manage, Apple's terms | `features/VipMembership.tsx`, `services/billing.ts`, `services/purchases*.ts`, `lib/billing.js` (on main) |
| Limits | A flower uses up the day only when planted; at most 4 Events a day (each is read by the AI); VIP keeps 3 flowers | `lib/flower-quota.js`, `lib/flower-placement.js`, `lib/ai-jobs.js` |
| Launch safety | OTA hotfixes (EAS Update, `npm run hotfix`), crash reports (Sentry, app + backend, off without a DSN), live switches (`GET /app-config`: maintenance notice, minimum version, pause tarot), incident runbook | `services/otaUpdates.ts`, `services/monitoring*.ts`, `lib/app-config.js`, `lib/monitoring.js`, `docs/operations/INCIDENT_RUNBOOK.md` |
| Security | Responses no longer name Express; 2026-11-08 review recorded | `server.js`, `SECURITY.md` |
| Build | Xcode 27.2 EAS image, version 1.0.1, `.easignore` allowlist (~0.7 GB upload), ESLint installed and clean | `mobile/eas.json`, `.easignore` |
| Legal | Privacy Policy (weather, RevenueCat/Apple, Sentry), Terms §4 PetalPal VIP, deletion page (subscriptions continue), effective 2026-11-26, **not yet published** | `mobile/public/legal/*` |

No new database migrations beyond `main`. New native modules (`expo-location`, `react-native-purchases`
11.0.4, `expo-updates` 57.0.28, `expo-application`, `@sentry/react-native` 7.11.0): **needs a new EAS build**.
Backend adds `@sentry/node` 11.12.0.

## Before 1.0.1 goes live (owner)

1. **Weather**: accept MET Norway's terms yourself (https://api.met.no/doc/TermsOfService); then Render
   `WEATHER_USER_AGENT` (e.g. `PetalPal/1.0.1 jastrevia.com`). Without it every Garden stays clear.
2. **VIP**: App Store Connect paid agreement, bank, tax, Small Business Program; products
   `petalpal_vip_monthly` (subscription) and `petalpal_vip_lifetime` (non-consumable); RevenueCat project,
   entitlement `vip`, offering `default`, webhook; Render `REVENUECAT_*`, `BILLING_LIFETIME_OFFER_ENDS_AT`,
   `BILLING_ENFORCED` (launch day); EAS `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (public SDK key). Details:
   [docs/billing/BILLING.md](../billing/BILLING.md).
3. **Crash reports** (optional): EAS `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`; Render `SENTRY_DSN`.
4. **Live switches** (optional): Render `APP_MAINTENANCE_EN` / `_ZH` / `_BLOCKING`, `APP_MIN_VERSION_IOS`.
5. **Privacy**: publish the new legal pages with (or before) the first release containing these features,
   moving the effective date to that day (and `test/back/legal-pages.test.js`); App Store privacy labels add
   **Coarse Location** and **Purchase History**
   ([STORE_PRIVACY_WORKSHEETS.md](STORE_PRIVACY_WORKSHEETS.md)).
6. When merging into `main` later, nothing conflicts (checked 2026-11-27 against dffe5a0e).

## Trying it on TEST (plan A)

The TEST Web deploy only accepts a build of `main` (`cloudflare-integration-deploy.yml` runs on
`refs/heads/main` and `scripts/cloudflare-integration-deploy.mjs` rejects any other `head_branch`), so
1.0.1 reaches TEST once it is on `main`. Each step needs its own explicit approval naming the workflow,
environment, branch/SHA and phase (CLAUDE.md); routing: [WORKFLOW_ROUTING.md](../integration/WORKFLOW_ROUTING.md).

1. **After 1.0 review, owner**: tag the review build, then merge `release/1.0.1` into `main` by PR.
   ```
   git -C <repo> tag -a v1.0.0 dffe5a0e -m "PetalPal 1.0 (4), sent to App Review 2026-11-24"
   git -C <repo> push origin v1.0.0
   ```
   A 1.0.x hotfix, if ever needed, branches from `v1.0.0`. Record the merged `main` SHA.
2. **TEST database** (separate approval): the recorded TEST backend is `1bab6796`; `main` has 30
   migrations added since (up to `202611180010_fairy_persona`). With the TEST connection string, read the
   status first (`npx prisma migrate status`, read-only), then apply what is pending only if approved
   (never through `npm start`).
3. **TEST backend**: Render `petalpal-backend-test` → Deploy a specific commit (the merged SHA); keep
   `node server.js`, `PETALPAL_ENVIRONMENT=integration`, AI `manual` with zero call limits. Then
   `test-backend-smoke.yml`.
4. **TEST Web build**: `cloudflare-web-build.yml`, branch `main`, `integration_config=true`. Record run ID,
   artifact ID, digest, source SHA.
5. **Deploy**: `cloudflare-integration-deploy.yml`, `phase=deploy`, with that artifact ID, digest, SHA.
6. **Activate**: same workflow, `phase=activate`, same inputs.
7. Optional: `integration-e2e.yml` with an existing TEST identity.

### What to check on TEST

- Dog food: 9 painted foods, a tip after feeding, the "never give dogs" card (needs pets enabled for the account).
- VIP: Me → PetalPal VIP opens; on the Web it says VIP is bought in the iPhone app.
- Garden weather toggle: without `WEATHER_USER_AGENT` on TEST it stays clear (expected).
- The 5th Event of a day is refused with the draft kept; a flower uses up the day only when planted.
- `GET https://petalpal-backend-test.onrender.com/app-config` answers; a maintenance notice shows when set.
- Fox: holidays follow the device date; the 14-day milestone needs 14 distinct Event days.
- Phone checks (EAS preview build): pinch zoom, dogs going home in rain (`?weather=rain` is dev-web only;
  on a phone it follows real weather), the VIP sheet with Sandbox purchases (`BILLING_ALLOW_SANDBOX=true`
  on TEST only).
