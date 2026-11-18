# Winter 2027 backend and AI: handoff for the app (frontend)

Written 2026-11-18. Branch `feat/w27-backend` (11 commits over `main` cd17ac65). Everything the Winter 2027 plan
needs on the server is here; the app screens are the frontend's work. Read [AGENTS.md](../../AGENTS.md) and
[WARNING.md](../../WARNING.md) first; they take precedence.

## How to call the backend

- Every route below needs the signed-in Firebase ID token, as the existing app already sends (`apiRequest` in
  `mobile/src/services/api.ts`). Bodies are JSON objects; unknown fields are refused with 400.
- Errors are `{ error, code? }`. Codes worth handling in the UI: `VIP_REQUIRED` (show the paywall), `ITEM_LOCKED`,
  rate/limit codes (429) with a `nextAvailableAt` to show "come back at …".
- All lists of user-facing text come back in the owner's language (`preferredLocale`: `en` or `zh-Hans`).
- Full request/response details: [docs/openapi.yaml](../openapi.yaml) (billing and feedback) and the per-feature docs
  linked below.

## Features → docs → routes

| # | Feature (plan) | Doc | Main routes |
|---|---|---|---|
| 9 | Paid features: VIP monthly US$3, lifetime US$10 (first 3 months only) | [billing/BILLING.md](../billing/BILLING.md) | `GET /billing/me`, `GET /billing/plans`, `POST /billing/sync` (+ RevenueCat SDK in the app) |
| 1 | Fairy outfits and looks; one item system | [items/ITEMS.md](../items/ITEMS.md) | `GET /api/items`, `GET/PUT /api/fairy/wardrobe`, looks save/wear/delete, `GET /users/:id/fairy-outfit` |
| 4 | Keepsake garden DIY | [items/ITEMS.md](../items/ITEMS.md#keepsake-diy-garden) | `GET/PUT /api/garden/layout`, `GET /users/:id/garden-layout` |
| 2 | Monthly flower deity | [items/GARDEN_TIME_FEATURES.md](../items/GARDEN_TIME_FEATURES.md) | `GET /api/garden/deity` |
| 7 | Pet homes | [items/GARDEN_TIME_FEATURES.md](../items/GARDEN_TIME_FEATURES.md#pet-homes) | `GET /api/fairy/pets/homes`, `PUT /api/fairy/pets/:petId/home`, `GET /users/:id/pet-homes` |
| 3 | Live weather | [items/WEATHER.md](../items/WEATHER.md) | `GET /api/weather`, `PUT /api/weather/location`, `GET /users/:id/weather` |
| 5 | Tap-to-interact (tea house) | [items/INTERACTIONS.md](../items/INTERACTIONS.md) | `GET/POST /api/fairy/tea`, `POST /api/fairy/tea/:id/finish` |
| 6 | Group visits and gatherings | [items/INTERACTIONS.md](../items/INTERACTIONS.md#several-fairies-in-one-garden) | `GET /api/visits/:hostId/fairies`, `GET/POST /api/gatherings`, respond, cancel; socket `gatheringUpdated` |
| 8 | Smarter tarot (agent) | [ai/TAROT_AGENT.md](../ai/TAROT_AGENT.md) | unchanged tarot routes; READY readings add `sources`, VIP readings add `weeklyLeft` |
| 10 | Fairy Moments with a persona | [ai/FAIRY_PERSONA.md](../ai/FAIRY_PERSONA.md) | `GET/PUT /api/fairy/persona`; Moments routes unchanged |
| — | Feedback and reports for the team | [release/MODERATION_RUNBOOK.md](../release/MODERATION_RUNBOOK.md) | `POST /feedback`; staff page already in the app (`/staff`) |

What is already done in the app (not only backend): the feedback form now saves to the server when signed in, and
the team-only Staff page (Me → Team) lists feedback and reports.

## Art the features wait for

Nothing breaks without art: unfinished things stay hidden.

- Outfit pieces and decorations: add catalog entries (`data/items/catalog.json`); keep `placeholder: true` until the
  art exists. Keepsake decorations go live by adding the keepsake id to `decorationsReady`.
- Flower deities: set `FLOWER_DEITIES_READY` on Render (or `ready: true` in `lib/flower-deity.js`).
- Weather scenes, tea house frames, pet beds, gathering tables: the API already returns the states; the app picks the art.

## Owner release checklist (Xingran)

Nothing has been pushed, deployed or migrated. Steps, TEST first, then production, each with your own approval:

1. Push `feat/w27-backend`, open the PR, merge.
2. Back up the database, then apply the migrations in order (all add tables or nullable/defaulted columns; none
   drop data):
   `202611180001_vip_billing`, `…0002_app_feedback`, `…0003_items_wardrobe`, `…0004_garden_layout`,
   `…0005_pet_homes`, `…0006_weather_location`, `…0007_fairy_tea`, `…0008_gatherings`,
   `…0009_tarot_agent_sources`, `…0010_fairy_persona`.
3. Deploy Render, then the web build as usual.
4. Render environment (only what you want on; everything defaults to off or safe):

| Variable | For | Value |
|---|---|---|
| `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` | billing | from RevenueCat (never paste into chat) |
| `BILLING_LIFETIME_OFFER_ENDS_AT` | lifetime offer | launch + 3 months, e.g. `2027-07-31T23:59:59-07:00` |
| `BILLING_ENFORCED` | free-account limits | `true` on launch day |
| `BILLING_ALLOW_SANDBOX` | billing | `true` on TEST only |
| `AI_USER_MONTHLY_USD_LIMIT` | cost cap per user | about `1.50` |
| `MODERATOR_FIREBASE_UIDS` | staff page | your and Jinyin's Firebase uids, comma-separated |
| `STAFF_NOTIFY_WEBHOOK_URL` | team pings | a Discord/Slack incoming-webhook URL |
| `WEATHER_USER_AGENT` | weather | e.g. `PetalPal/1.0 jastrevia.com` (after you accept MET's terms) |
| `FLOWER_DEITIES_READY` | deity | ids whose art shipped |
| `GARDEN_VISITOR_LIMIT` | group visits | from the capacity test (default 6) |
| `AI_PETAL_READING_AGENT` | tarot agent | `true` when you approve the paid test |
| `AI_FAIRY_PERSONA` | persona posts | `true` when you approve the paid test |
| `WEEKLY_INSIGHTS_OWNER_IDS`, `AI_WEEKLY_SHORT_OWNER_IDS` | Weekly 2.0 (needed for free-account Weekly gating) | `*` |

5. Store and provider setup that only you can do: App Store paid agreement + Small Business Program, the two products,
   RevenueCat project and webhook (BILLING.md), MET terms (WEATHER.md), privacy policy additions (RevenueCat, feedback,
   approximate location for weather).

## Verified and not verified

- Verified: backend unit and integration tests with synthetic data and injected providers (`npm run test:backend`:
  1,278 tests, the same 22 environment failures as `main` before these changes, no new failures); mobile route and
  feedback tests; TypeScript check of the app.
- Not verified: any real RevenueCat, App Store, MET Norway or Anthropic call; hosted TEST; the Staff page and
  feedback form on a device or in the browser; the capacity test.
