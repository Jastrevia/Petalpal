# PetalPal — Project Guidance

This is the root guidance for coding sessions. `mobile/CLAUDE.md` → `mobile/AGENTS.md` also applies inside `mobile/`:
**Expo has changed — read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.**

## 1. Product identity
PetalPal is an AI-powered emotional journaling and companionship app. Its heart is a beautiful,
interactive fantasy garden that responds to the user's emotions and journal entries.
The fairy is an extension of the user's own presence in the garden, not the whole product.

## 2. Visual quality bar
- Target: world-class, production-quality visuals. Elegant, immersive, delicate, softly semi-realistic, artistically refined.
- Avoid: childish cartoon styling, generic "AI-generated" looks, harsh colors, clutter, gratuitous effects.
- Preserve: established proportions, character identity, camera perspective, asset transparency (alpha), approved compositions.

## 3. Approved work
- Explicitly approved visual assets and compositions must be preserved unless the user authorizes changes.
- Assets under active development may be modified when the requested task explicitly requires it.
- Never infer approval or rejection solely from filenames ("approved", "final", "flawless", "REJECTED", etc.).
- Untracked review images, animation assets and source files may contain important approved work. Never delete or replace them without authorization.
- Preserve approved character identity, visual quality and existing working behavior, even when editing related assets.
- When approval status is uncertain and a change would replace or damage existing artwork, **ask first**.
- Always protected unless explicitly authorized: `Resources/garden/checkpoints/APPROVED_*` snapshots,
  `mobile/src/components/garden/planting/approvedPlantingMasks.*`, `mobile/src/components/garden/fairy/v2-preservation.json`,
  `mobile/assets/dev/fairy-approved-walk-8/`, `flower-visuals/gardenArtManifest.json` and `contract.generated.json`.

## 4. Engineering principles
- Inspect the relevant code before changing it.
- Make small, targeted changes. Don't refactor unrelated systems or touch unrelated files to finish a focused task.
- Preserve existing functionality and visual behavior.
- Run the relevant tests after implementing (see §8).
- Report modified files, test results and remaining risks.
- Never claim visual correctness from automated tests alone. Say what still needs human visual review.

## 5. Git safety
- Never switch branches, merge, rebase, reset, clean, stash, commit or push without explicit authorization.
- Never delete untracked files without explicit authorization. The working tree holds many untracked review images, scripts and fairy animation zips that are the user's work. Root-level PNG/script clutter is intentional until the user says otherwise.
- Never expose, print or commit secrets. Root `.env` holds real credentials (gitignored); use `.env.example` for reference.
- Read-only git: prefer `GIT_OPTIONAL_LOCKS=0`. Avoid `git status --ignored` (very slow: `node_modules`, `.git` ≈ 3.5 GB).

## 6. Workflow for each substantial task
1. Understand the relevant implementation.
2. Identify the minimum necessary scope.
3. Implement the requested change.
4. Validate (tests, plus visual check where it matters).
5. Summarize what changed and what still needs visual review.

## 7. Architecture (verified 2026-10-20 on branch `frontend-MVP-all`)
**Active frontend: `mobile/`.** Expo 57, React Native 0.86, React 19, expo-router (typed routes, React Compiler),
@shopify/react-native-skia, Reanimated 4, gesture-handler. Runs on web too: `entry.js` → `bootstrap.web.js` loads CanvasKit
(`/canvaskit.wasm`) before `expo-router/entry`. Path alias `@/*` → `mobile/src/*`.

**Legacy frontend: `client/`.** Vite + React SPA (Auth, Garden, Friends, Visit, Onboarding). The root README still describes it.

**Backend (repo root).** Express 5 `server.js`, Socket.IO, Prisma 7 + Postgres (`prisma/schema.prisma`, `prisma.config.ts`),
Firebase Admin auth (`lib/auth.js`, `lib/firebase-admin.js`), emotion/flower/fairy logic in `lib/`, `cloudflare-worker/`.
Docs: `docs/` (`FAIRY_RUNTIME_ARCHITECTURE.md`, `fairy-backend.md`, `emotion-routing.md`, `flower-visuals/`).

### Key locations (`mobile/src/`)
| Area | Location |
|---|---|
| Root layout / navigation | `app/_layout.tsx`. In `__DEV__` it is a `Stack` wrapped in `LoginEntranceTransitionHost`. Production still renders the Expo starter tabs (`components/app-tabs(.web).tsx`). `WorldTimeProvider`, `FeedbackDraftProvider` and `GlobalHelpFeedback` wrap everything. |
| Dev launcher | `app/index.tsx` (`DEV_ROUTES`). Non-dev shows the Expo welcome screen. |
| Garden | `components/garden/GardenExperience.tsx` (`mode: 'development' \| 'player'`, mailbox state machine) → `GardenScene.tsx` (~2k lines). Subdirs: `planting/`, `water/`, `rendering/`, `flower-visuals/`, `flower-density-sandbox/`, `world-time/`, `performance/`. Many `*CalibrationEditor.tsx` dev tools. |
| Fairy | `components/fairy/` (runtime, playback, pose sprites). `components/garden/fairy/` (`GardenFairy`, `MailboxFairy`, `TeaFairy`, `SeatedSwingFairy`, `SleepingMoonFairy`, `FairyNavigation`, `walkNetwork`, `*Destination.ts`, `README.md`). |
| Login / Login Preview | `components/auth/`: `LoginPreviewPage.tsx`, `LoginEntranceTransitionHost.tsx`, `LoginEntranceScene.tsx`, `entranceTimeline.ts`, `useLoginEntrance.ts`, `FairyLoadingExperience.tsx`, `fairyLoadingTimeline.ts`. Art in `mobile/assets/auth/`. |
| Mailbox | `components/mailbox/` (`MailboxPage`, `LetterEnvelope`, `FloatingLetterStack`, `ExpandedLetter`, `HelpFeedbackPanel`, `mockLetters`). Art in `mobile/assets/mailbox/`. |
| Flower mood effects | `components/garden/flower-mood-effects/` (`FlowerEffectsPreview`, `FlowerEffectsRenderer`, `effectEngine`, `moodPresets`, `effectConfig`). |
| Help / feedback | `components/feedback/` (`GlobalHelpFeedback`, `SendFeedbackForm`, `feedbackService`). |
| Journal data | `app/journal.tsx`, `data/journalEntries.ts` (sample entries). |

### Navigation flows (dev)
- `/login-preview` → on entrance start, `router.replace('/player-preview')`. Reset goes back to `/login-preview`. The host keeps the player garden mounted on `/login-preview`, `/player-preview`, `/mailbox` and `/journal`.
- Garden → mailbox: the fairy retrieves a letter, then `GardenExperience` calls `router.push('/mailbox')`. On refocus it runs `returnFromMailbox()`.
- Mailbox "back": `router.back()`, or `router.replace('/garden-test')` if there is no history (not `/player-preview`).
- Journal Plant/Adjust → `/player-preview?mode=plant|adjust&...`.

### Preview routes (all `__DEV__`-only; production redirects to `/`)
`/` (dev menu), `/login-preview`, `/player-preview` (clean player garden), `/garden-test` (dev garden + sandboxes),
`/mailbox`, `/journal`, `/flower-effects-test`, `/fairy-loading-test`, `/fairy-test`, `/fairy-sprite-test`,
`/fairy-swing-test`, `/treehouse-test`, `/swing-test`, `/moon-bed-test`, `/tea-set-test`, `/waterfall-test`, `/water-test`, `/explore`.

## 8. Running and testing
- Mobile web dev server: `cd mobile && npm run web`. Lint: `cd mobile && npm run lint`.
- `cd mobile && npm test` runs only 5 suites: planting, mask refinement, flower detail, flower mood effects, mailbox.
- Other `mobile/test/*.test.mjs` run individually with `node`, e.g. `node test/loginPreview.test.mjs`, `loginEntrance`, `fairyLoadingTimeline`, `fairyLoadingSystem`, `gardenMailboxIntegration`, `fairyRuntime`. `test/fairyWalk.test.cjs` covers fairy path movement. Many other files in `mobile/test/` and `mobile/scripts/` are browser-capture/verification scripts, not unit tests.
- Root: `npm test` (backend `node --test test/back/*.test.js` + `client/` tests). `npm run check` is the full gate.
- Type check: `cd mobile && npx tsc --noEmit`.

## 9. Known context and risks
- `frontend-MVP-all` has diverged from `origin/main` (merge-base `81444834`, 2026-10-05). Main has many deploy/security commits this branch lacks. Any future integration is significant work, so don't attempt it unasked.
- Production routing is still the Expo starter. Real PetalPal screens are dev-gated.
- Large binaries (Blender files, PNGs) are tracked, so keep git operations deliberate.
