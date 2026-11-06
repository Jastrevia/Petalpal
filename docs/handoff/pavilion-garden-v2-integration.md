# Pavilion garden v2 integration (2026-11-05)

Branch `feat/pavilion-garden-v2-integration`, cut from `main` eadcd9c8 (#181). It brings in the teammate's
`origin/pavilion-garden-v2` da7dcf49 (two commits, 7b3caba4 and da7dcf49, merge-base 916ae685, 39 commits behind
main) as a 3-way applied diff, not a merge, the same way as the Treehouse (docs/handoff/treehouse-integration.md).

## What the branch brings

- **Reflection pavilion replaced** (`mobile/src/app/reflection.tsx`, `components/bookhouse/{PavilionBook,PavilionBookReader,
  pavilionMotion,pavilionText,instructionPages,flowerLanguagePages}`): new day/night pavilion art (1.8 s crossfade), books
  that fly from the shelf to the desk and open as a paged book. The four books are now Weekly, Monthly, **Instruction**
  (7 chapters, 24 bilingual pages, bookmarks; replaces the old "About" notes) and **Flower Language Collection**
  (8 bookmarked categories, 26 flowers; `data/flowerLanguageCollection.json`). The lantern switch is now development-only:
  in release builds the pavilion follows the Garden's day/night.
- **Avatar collection** (backend + app): 75 avatars in three tiers (fairy-1…8 + l1-01…24 open; l2 from Fairy Bond Lv 6;
  l3 from Lv 14). New accounts no longer pick an avatar at sign-up; the Garden shows a one-time welcome choice and gives
  three more as a gift; each Fairy Bond level from Lv 2 lets the owner choose one more (BondLevelUp, AvatarCollection).
  Server: `lib/avatar-collection.js`, `GET /api/avatars`, `POST /api/avatars/welcome`, `POST /api/avatars/claim`
  (owner from the token, body allowlists, advisory lock per owner, level from the server's Fairy Bond sum), and
  `PUT …/profile` refuses a library avatar the owner does not own (403 `AVATAR_NOT_OWNED`; the one already worn stays).
- **Migration `202611040001_avatar_collection`** (additive): `User.avatarWelcomeAt`, table `AvatarOwnership`; backfills
  the eight original portraits as owned for every existing account and marks existing accounts as welcomed.
- **Optional Event description**: an Event can be saved with a mood only (`lib/ai-jobs.js`: content may be empty when a
  mood is given; no Memory job for an empty Event; `lib/haiku-event-emotion.js` and `server.js` return no secondary
  labels for empty text without calling AI).
- **Mailbox** night scene, envelope states, fireflies and responsive layout (`components/mailbox/*`).
- **Memory Otter** swims a water network around the lotus (procedural wake, lotus occlusion; `otterSwims.ts`,
  `otterWaterEffect.ts`, `OtterWaterSpirit.tsx`, `LotusLayer` reports its clusters).
- The **Me** button in the bottom bar always uses its highlighted look.

## Changed while integrating

- Conflict in `mobile/src/app/critters-test.tsx` (dev preview): main's pet ring and pair scenes kept, the otter preview
  uses the teammate's swim network.
- **Flower Language images**: the branch required 26 PNGs from `Resources/flower-updated/flower-medium/`, which is not in
  Git (a fresh checkout or CI build would fail to bundle), and added `mobile/metro.config.js` watching the repo root to
  reach them. Now `data/flowerAssets.ts` uses the Garden's own painted medium clusters
  (`assets/garden/flower-clusters/<id>-m.webp`, 23 flowers); Rose, Tumi and White Magnolia (not grown in the Garden) are
  the middle cluster of their delivered sheets (`backup/local-wip-2026-11-03` 8d82f060, `Resources/flower-updated/*.png`),
  cut on transparent columns and saved as 448 px WebP in `assets/reflection/flowers/`. `metro.config.js` dropped.
  The teammate's test now checks the files are bundled WebP with alpha.
- Not taken: the teammate's `mobile/package-lock.json` change (npm metadata only, no dependency change) and
  `assets/reflection/pavilion-blank-v3.png` (2.5 MB, used nowhere).
- `window.__reflectionDebug` / `window.__readerDebug` (open/close/turn/set-language handles) only in development builds.
- `services/locale.ts`: the development language switch listens for window events only where `addEventListener` exists
  (native has no window events).
- **Weekly 2.0, Monthly 2.0 and the Petal collection kept.** The teammate's book drew Weekly from the old v1 fields only,
  so a Weekly 2.0 report showed just its summary: no insight cards, Keep / Follow / Hide, answers, letters or report
  link. Monthly lost tapping a day to open its Event. The cream "Petal collection" book (kept insights and cards, letters
  to a later week, never-use names, almanac) had no place. Now the Weekly and Monthly books show main's
  `ShortWeeklyReport` / `MonthlyReport2` on the new pages whenever the report is a 2.0 report (one page on phones, left
  and right parts on a spread), the teammate's pages stay for older v1 reports, and the Petal collection is the Weekly
  book's last page (`reportPage` / `collectionPage` props of `PavilionBookReader`).
- The Fairy Bond level-up card waits while main's one-tap "Turn on PetalPal's AI?" question is open (they opened on top
  of each other); `AiConsentPrompt` reports `onOpenChange`.
- `test/back/security-p0-http-coverage.test.js` lists the two new POST routes (35).

## Checked

- `npx tsc --noEmit` (mobile) passes; `npx prisma validate` passes.
- Mobile tests: the teammate's new tests (avatar collection, flower language, instruction book, optional event, otter,
  pavilion motion) and mailbox, bookhouse, critters, routePolicy and CI's Garden set: all pass except
  `gardenHudLayer` ("scene overlay zIndex 40 must stay below the HUD (40)"), which fails the same on main since #181
  (pet ring menu), not from this change.
- Backend (`NODE_ENV=test`, CI's fixture `DEV_DATABASE_URL`, no database): `test/back/avatar-collection.test.js` passes;
  the full `test/back` + `test/security-ci.test.js` run is 1138 pass / 23 fail, and the 23 fail identically on main
  eadcd9c8 (no local Postgres, runtime tzdata, `POST /reports` inventory, …), none new.
- Local web preview (fixture account), 390×844: avatar welcome choice and gift; AI question first, then the Lv 2
  level-up; pavilion shelf; Weekly 2.0 inside the new book (bouquet, insight with Keep / Following / Hide), Petal
  collection page; switching to Monthly 2.0 (calendar); Instruction book; Flower Language (Hydrangea, Rose); mailbox.
  1280×800: Weekly 2.0 as a two-page spread. 简体中文 (`?lang=zh-Hans`), 390×844: shelf spines and Weekly 2.0 in the book.

## Not done / owner's decisions

- **Production release order**: the server code reads `AvatarOwnership` and `User.avatarWelcomeAt`, so migration
  `202611040001_avatar_collection` must be applied (with the owner's authorization) before or with this server; until
  then avatar routes and avatar changes in the profile fail.
- The pavilion PNGs are large (four covers about 3 MB each, leather 3.9 MB, room 2.2 MB, wood 2.0 MB; about 21 MB),
  the same format as main's old pavilion art; not recompressed (art quality left as delivered).
- The lantern is development-only now (teammate's choice); main let everyone toggle it.
- `feat/name-only-signup` also changes sign-up; the avatar step removed here will conflict with it.
- `docs/openapi.yaml` does not list the avatar routes yet.
- Not checked: Chinese in the Instruction and Flower Language books, native app / devices, the otter's GPU cost on the Garden
  (INTEGRATION_OPTIMIZATION.md budgets), the pets' ring menu in the preview (its tests pass).
- Nothing pushed, merged or deployed.
