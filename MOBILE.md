# A. Quick Start — Physical iPhone (2-Minute Guide)

**Final native-security result (2026-10-07): 7/7 PASS on the isolated physical-iPhone Expo Go harness.** Scenario 1 generation 1 and the separate continuation/reload recovery retain their persisted witnesses. Disposable isolated C is deleted; A/B are preserved; failure injection is disarmed. Historical sections below retain their point-in-time evidence; the final workflow and results supersede earlier pending/blocked instructions.

Use the existing Expo Go/on-device resumable harness on 8108. Current recorded phone URL: `exp://206.12.136.139:8108`; current recorded protected backend origin: `https://campus-nurses-pmc-ecological.trycloudflare.com` on isolated 3108. No scenario needs rerunning. Reuse running services. If a later authorized restoration is necessary, the root commands are `node scripts/native-security.mjs backend`, `node scripts/native-security.mjs tunnel 3108` (substitute only the actual isolated backend port if changed), then `node scripts/native-security.mjs expo <verified-new-HTTPS-origin>`. Verify exact isolated health/project/database before opening the phone project. Never reprovision C to satisfy an older readiness instruction or replay completed terminal journals.

The Xcode/dev-build experiment is abandoned. Its source, generated isolated iOS project, dev-client dependency and dormant adapter/UI branches were removed during finalization; the detailed preparation section remains historical only. The Expo harness keeps its isolation guards, encrypted exact-account authorization, C-only deletion guard, append-only checkpoints, pre-restart logout witnesses and durable first-startup observation. It resumes only activated nonterminal work and stops at terminal PASS/FAIL/BLOCKED.

**Reuse the working Expo Go instance on 8107.** The proven login setup uses the Render HTTPS API and production Firebase. Ordinary login may write production account data; use only an authorized existing account and obtain approval before a new production login/test. An existing Firebase identity can also resume automatically when the app opens.

1. Check the branch and listeners; do not start replacements for working services:

   ```bash
   cd /Users/xingranma/Desktop/PetalPal_JX-integration
   git branch --show-current
   lsof -nP -iTCP:8107 -iTCP:8081 -iTCP:8082 -iTCP:3107 -iTCP:5433 -sTCP:LISTEN
   ```

   Branch must be `integration/mobile-backend-test`. Identify 8107's PID/terminal, not merely any Metro QR code. Section J gives a safe API-override check.
2. Check API liveness without credentials or response content:

   ```bash
   curl --max-time 30 -sS -o /dev/null -w 'HTTPS API HTTP %{http_code}\n' https://petalpal-v2.onrender.com/
   curl --max-time 5 -sS -o /dev/null -w 'Mac development API HTTP %{http_code}\n' http://127.0.0.1:3107/
   ```

   A successful root response proves reachability, not Firebase/session/database correctness. The local check is optional for a production-connected preview.
3. Select the API deliberately:

   | Testing surface | API address |
   | --- | --- |
   | Physical iPhone, proven production preview | `https://petalpal-v2.onrender.com` |
   | macOS-only local client | `http://127.0.0.1:3107` |
   | Physical iPhone, isolated security tests | Current recorded isolated HTTPS endpoint in the final workflow above; seven physical runtime scenarios PASS |
   | Physical iPhone, local LAN backend | Requires a verified safe private transport/network; no approved working endpoint is currently recorded |

   **Never use localhost as an iPhone API address. Never send credentials or bearer tokens to public/campus HTTP.** Metro's `exp://` bundle URL and the API's HTTPS URL serve different purposes.
4. Open the existing 8107 terminal and scan its QR code with the iPhone Camera, then open Expo Go. Use the same reachable LAN as the Mac. If the terminal is unavailable, use the current 8107 project in Expo Go's recent projects after confirming its host/port. Check the current LAN address as in J; historical IPs are not configuration.
5. Only if 8107 is absent, the intended production connection is approved, and existing dependencies/configuration are present:

   ```bash
   cd /Users/xingranma/Desktop/PetalPal_JX-integration/mobile
   EXPO_PUBLIC_API_BASE_URL=https://petalpal-v2.onrender.com ./node_modules/.bin/expo start --go --lan --port 8107
   ```

   Scan the QR printed by this process. Do not stop another Metro or reinstall dependencies to run it. Changing the API of an existing process requires approval to restart **that process only**.
6. After approval, use the existing authorized Auth E2E account. Confirm the app enters its authenticated Garden, rather than stopping at Firebase success/profile/verification/error screens. Where safe diagnostics exist, distinguish successful `POST /auth/session` and `GET /session?view=metadata`; retain only statuses, header names and sanitized error codes. Never copy tokens, account identifiers or response bodies.

**Known result:** physical-iPhone login on 8107 with this HTTPS API was **USER-OBSERVED PASS on 2026-10-07**. This does not certify native persistence erasure, authenticated headers in that login, or a released native artifact.

# B. Known Working Configuration

Operational evidence last reconciled **2026-10-07**; process state was not rechecked for this documentation task.

| Item | Recorded configuration / evidence |
| --- | --- |
| Repository / branch | `/Users/xingranma/Desktop/PetalPal_JX-integration` / `integration/mobile-backend-test` |
| Mobile runtime | Expo SDK `~57.0.19`, React Native `0.86.3`, React `19.2.3`; `mobile/package.json`, `mobile/app.json`, `mobile/entry.js` |
| Native test method | Physical iPhone with compatible Expo Go; ordinary login observed working. No development build or simulator was required for that observation |
| Primary Metro | LAN mode, port 8107; other Metro instances may remain on 8081/8082 |
| Development backend / PostgreSQL | 3107 / 5433; preserve existing processes and containers |
| Production HTTPS API | `https://petalpal-v2.onrender.com` |
| Production Firebase | `petalpal-b212c` |
| Isolated Firebase | `petalpal-native-security-test`; Spark/free, Email/Password enabled **USER-REPORTED**; JS app configuration registered/saved **VERIFIED** |
| Isolated backend | Active loopback 3108; temporary HTTPS verified from Mac and user-confirmed on intended iPhone/network (N) |
| Login acceptance | **USER-OBSERVED LOGIN PASS** on physical iPhone; backend-session/header traces not independently captured in that follow-up |

Expo Go includes the native AsyncStorage dependency used here. Browser localStorage and mocked adapters do not substitute for physical-device evidence. Inspect any future new native dependency before deciding a development build is needed; do not install a simulator or rebuild without approval.

**Historical port bug:** a process-level `EXPO_PUBLIC_API_BASE_URL` override used port **3000** while the backend used **3107**. Editing `mobile/.env` did not remove that override. Expo 8107 was subsequently configured with the production HTTPS API; leave the working instance alone. Check port occupancy, process configuration and the Mac's current interface/IP each time; never reuse an old PID or IP blindly.

**SDK 57 decoder backport (2026-10-08):** keep `mobile/vendor/decode-uri-component` with the manifest/lockfile; normal `npm ci` installs its CommonJS security backport. Valid components retain decoding, including long values. Malformed components exceeding 4096 UTF-16 code units remain encoded literals after plus-to-space normalization, bounding fallback work. Garden/Fairy navigation and production route policy are unchanged. See SECURITY.md and the vendor README for provenance and targeted regressions.

# C. Architecture and Authentication Flow

```text
Physical iPhone → Expo Go / PetalPal
                   ├─ Firebase Email/Password authentication
                   └─ Firebase ID token → PetalPal HTTPS API → Prisma/PostgreSQL
```

Source of truth:

| Responsibility | Source |
| --- | --- |
| Firebase initialization/native SDK persistence | `mobile/src/services/firebase.ts` |
| API selection, bearer transport, refresh/401 invalidation | `mobile/src/services/api.ts` |
| Login, verification, backend session, logout/delete lifecycle | `mobile/src/services/auth.tsx` |
| Reduced session hydration | `mobile/src/services/sessionExperience.ts` |
| Firebase Admin project/credential checks | `lib/firebase-admin.js` |
| Server UID mapping/authentication | `lib/auth.js`, `server.js` |
| Database isolation predicate | `lib/database-isolation.js` |
| Owner-scoped private placements | `mobile/src/components/garden/planting/plantingPersistence.ts` |

1. `firebaseAuth()` initializes the named `petalpal-mobile` Firebase app. Web uses Firebase web persistence; native uses `getReactNativePersistence(AsyncStorage)`. Missing client API key fails initialization. Normal development still uses its existing production defaults. The explicit native-security mode requires all four client fields and the verified isolated HTTPS API, fails closed on mismatch, and uses a distinct Firebase app name (`petalpal-native-security-test`) to avoid resuming the production app identity.
2. `apiBaseUrl()` uses an active configured connection, otherwise `EXPO_PUBLIC_API_BASE_URL`. In native development it rewrites a configured loopback hostname to Expo's LAN host, preserving the port. This cannot fix port 3000, make a campus network private, or supply TLS. Without an explicit URL, development web falls back to port 3000; native has no reliable backend fallback. Use an explicit appropriate endpoint.
3. Firebase sign-in precedes backend access. Unverified email enters verification-pending state; the app does not submit that identity to the backend. Verified claims are refreshed. API requests attach the ID token in `Authorization: Bearer`; a 401 allows one refreshed attempt, then invalidates the connection/session. Never log the token.
4. AuthProvider sends `POST /auth/session` with `deferProfileCreation: true`, then loads `GET /session?view=metadata`. Both must succeed, identify the same backend user, and complete placement-scope initialization before signed-in state. A Firebase success alone does **not** prove PetalPal login succeeded.

| Path / condition | Read/write behavior confirmed in source |
| --- | --- |
| `/auth/session`, user already linked by Firebase UID | Reads the existing User and returns selected session fields; this branch does not update that profile |
| UID missing, matching legacy email exists | **Writes** `firebaseUid` and possibly `emailVerifiedAt`, even with `deferProfileCreation: true` |
| No matching User, deferred profile creation | Returns `needsProfile`; does not create the User in this branch |
| Complete new profile | **Creates** User, Garden, Fairy state, AI consent and subscription entitlement |
| `/session?view=metadata` | Reads selected User/Fairy/Daily Check-in metadata; avoids Fairy upsert and full Garden hydration |
| `/session` without metadata view | Can **initialize Fairy state** through upsert; full Garden path has broader behavior |
| Profile/settings, planting, deletion or other actions | Evaluate the specific route; ordinary authenticated UI use is not a blanket read-only guarantee |

Backend token verification checks revocation and verified identity, then server-side UID/owner mapping. An existing Firebase account need not already have a linked PostgreSQL User. Production linkage for the dedicated Auth E2E identity remains **NOT VERIFIED**; no zero-write guarantee was established for the observed login. Do not reopen Render Free Shell/SSH or upgrade dialogs to rediscover this limitation.

# D. Environment Variables and Loading

Only names and purposes belong here; never paste credentials, account passwords, tokens, keys or database connection strings.

| Variable | Purpose / boundary |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Mobile API endpoint; explicitly choose production HTTPS or the isolated protected HTTPS endpoint |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase client configuration; required by initialization |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase client auth domain; must belong to the selected project |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Client identity project; explicitly select production or isolated test |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Registered Firebase JS app identity |
| `EXPO_NO_DOTENV` | Expo switch to disable automatic dotenv loading; useful in a future explicitly loaded isolated launcher |
| `NODE_ENV`, `PORT` | Backend mode/listen port; development server fallback is 3000 if PORT is absent |
| `DEV_DATABASE_URL` | Required non-production database connection; isolation helper requires loopback and a dev/test database name |
| `DATABASE_URL` | Production connection when NODE_ENV is production; never copy into an isolated environment |
| `FIREBASE_PROJECT_ID` | Backend Firebase project; absence currently defaults to production |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Backend Admin credential alternative; project must match; secret |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Paired Admin credential alternative; secret |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google SDK credential-file path when using that credential mechanism; explicit test-project verification still required |
| `AUTH_E2E_TEST_EMAIL`, `AUTH_E2E_TEST_PASSWORD` | Existing dedicated Auth E2E account; secret local configuration, not public Expo variables |
| `AUTH_E2E_PROTECTED_EMAILS` | Existing web Auth E2E protected-account guard; not authorization to run the suite on production |
| `VITE_API_BASE_URL` | Legacy web Auth E2E endpoint; separate from Expo; its current helper expects local port 3000 |
| `NATIVE_TEST_A_EMAIL`, `NATIVE_TEST_A_PASSWORD` | Synthetic isolated account A credentials, prepared locally only |
| `NATIVE_TEST_B_EMAIL`, `NATIVE_TEST_B_PASSWORD` | Synthetic isolated account B credentials, prepared locally only |
| `NATIVE_TEST_C_EMAIL`, `NATIVE_TEST_C_PASSWORD`, `NATIVE_TEST_C_DISPOSABLE` | Proposed disposable C; marker does not authorize deletion |
| `API_DOCS_ENABLED` | Prepared isolated backend keeps API docs disabled |
| `AI_USER_DAILY_CALL_LIMIT`, `AI_GLOBAL_DAILY_CALL_LIMIT`, `AI_ASYNC_EXECUTION_MODE` | Prepared isolated configuration sets call limits to zero and async mode to manual; never use paid AI in these lifecycle tests |

**Mobile loading:** Expo CLI loads standard files from `mobile/`. For development, priority is existing shell/process environment, `.env.development.local`, `.env.local`, `.env.development`, `.env`. `EXPO_PUBLIC_*` references are bundled into the client; they are not a secret store. An inline process override wins over dotenv. Custom `mobile/.env.native-security.local` is **not** a standard development filename and is not automatically selected. Inspecting it does not prove Metro uses it.

**Backend loading:** `server.js` imports `dotenv/config` and normally loads root `.env`, without replacing already-set environment variables. A custom root `.env.native-security.local` needs explicit loading in a separately approved process. `npm start` also runs migrations; do not use it as a harmless health check or isolated activation shortcut.

**Effective configuration:** inspect the selected Metro process's startup API override with J, then compare the intended launch configuration using the sanitized Expo-env command there. A new shell's dotenv result is not proof of an existing bundle. If native URL rewriting applies, confirm the request origin in available safe native diagnostics. Record the host/port and status only. Do not dump `ps eww`, `env`, Expo config, request headers or secret files.

**Changes:** restart only the approved Metro instance when replacing its startup environment; then reload the correct project on the phone. Do not clear Expo caches or Firebase persistence as a first response. Keep production `.env`/8107 intact. A future isolated launcher must load all test client fields explicitly, disable production dotenv fallback, select the verified isolated backend/DB/Admin project, and fail closed on missing/mismatched values. The opt-in launcher/guards in section M are now implemented and locally tested; provider/HTTPS/phone end-to-end activation remains **BLOCKED**.

# E. Troubleshooting Decision Tree

First check the actual API endpoint and selected Metro. Stop at the first confirmed failure; use sanitized error codes/statuses, never payloads.

| Case / symptom | Likely cause and minimal check | Safest fix / avoid |
| --- | --- | --- |
| 1. QR cannot open Expo Go | Wrong Metro/host/port, incompatible Expo Go, unreachable LAN. Run J's listener/interface checks; compare QR to selected 8107 terminal and SDK 57 compatibility message | Use the correct existing QR and compatible Expo Go. Do not kill other Metro instances or install native tooling by default |
| 2. Expo loads indefinitely | Device cannot fetch bundle, bundling error or runtime exception. Inspect selected terminal for iOS bundle completion and sanitized error; check host reachability | Resolve the observed bundle/runtime/network failure. Backend restarts do not fix Metro transport; no blind reinstall/cache purge |
| 3. Login button fails | Identify stage: Firebase `auth/*` code → API connection → `/auth/session` status → UID/profile/DB error → metadata initialization. Use existing safe logs and root liveness check | Correct only the confirmed stage. 403 may mean unverified email; 401 token/session rejection; 500 needs sanitized server evidence. Do not bypass authentication or recreate users |
| 4. Firebase succeeds, app stays outside Garden | Backend session/metadata request fails, profile/verification needed, or placement cleanup fails. Inspect `/auth/session` and `/session?view=metadata` status, not body/token | Complete only authorized normal steps or fix confirmed configuration. Do not assume Firebase success proves DB/session success; do not claim erasure after storage failure |
| 5. “Network request failed” | Wrong effective API (especially 3000 override), loopback, public HTTP restriction, TLS/network failure. Run J's sanitized override/config checks and appropriate root curl | Use intended HTTPS endpoint; approve restart only if active Metro environment is wrong. Never disable TLS validation or iPhone security settings |
| 6. Port already in use | Existing desired process or unrelated listener. `lsof -nP -iTCP:8107 -sTCP:LISTEN`; inspect PID command without environment | Reuse desired process. Obtain approval before stopping an identified required Metro; never kill all Node processes |
| 7. iPhone cannot access local backend | Loopback binding, campus client isolation, firewall/VPN/proxy or HTTP→HTTPS behavior. Check 3107 listener, current interface/IP, local curl; inspect restrictions read-only | Preserve working production HTTPS preview. For isolated tests wait for verified protected HTTPS. Do not disable protections, expose public HTTP, configure a hotspot/tunnel ad hoc, or keep restarting services |
| 8. Production works, local fails | Different network, Firebase Admin setup, DB configuration or API port. Compare sanitized endpoints/project selection and local liveness; local DB is not automatically fully isolated | Repair only confirmed local issue after authorization. Never copy production DB/Admin credentials or alter the production deployment to make local testing work |

If a log viewer offers raw headers/body, close that detail. Report only stage, status and safe error code. Do not repeatedly investigate Firebase/Render/DB identities when the current failure is already known to be network or Metro configuration.

# F. Local vs Production vs Security Test

| Environment | Purpose / Firebase | Backend / database | Transport / production involvement | Allowed / prohibited |
| --- | --- | --- | --- | --- |
| Normal local development | Development; current client defaults/config select production `petalpal-b212c` unless explicitly changed | Mac backend 3107; development PostgreSQL on 5433 selected by `DEV_DATABASE_URL` | Mac loopback HTTP only for local checks; physical phone needs separately verified safe transport. Local DB isolation does not isolate Firebase | Authorized development operations after identity boundary check. No production Firebase deletions, copying production data, DB reset or public HTTP login |
| Production-connected iPhone preview | Ordinary approved preview; production `petalpal-b212c` | Render HTTPS API; deployed production DB, exact connection identity not independently certified for this login task | HTTPS API; **production data and normal account writes may be involved**. Metro LAN is a separate bundle connection | Existing authorized account, approved ordinary login/read checks. No lifecycle deletion/destructive security tests, paid AI, configuration changes or blanket read-only claims |
| Isolated native security testing | Controlled lifecycle verification; `petalpal-native-security-test` only | Prepared backend 3108; dedicated `petalpal_native_security_test` on existing PostgreSQL 5433 | Protected temporary HTTPS **not verified active**; no production credentials/DB/identities allowed | Only after complete isolation/access checks: synthetic A/B; C deletion needs separate approval. No production accounts/data, public unauthenticated exposure, billing or paid AI |

**Isolated environment: READY for the next authorized runtime-test task (latest continuation in N supersedes earlier blockers).** Recorded preparation: dedicated empty DB and tracked migrations verified; test Firebase Spark/Email-Password creation reported; registered JS app configuration saved and project selection checked. Admin/client-app provenance, A/B/C authentication/linkage, active HTTPS from the Mac and separate Expo/iOS bundle now PASS (N). Intended-iPhone anonymous TLS/health is now USER-OBSERVED PASS. Safe storage/race/failure hooks remain unarmed; all seven physical-device scenarios remain NOT EXECUTED / NOT VERIFIED. Console previously intermittently failed permission/terms-status loading; the user's later browser access is not itself Admin/runtime evidence. Reuse the project; do not recreate it.

The temporary tunnel is approved only for a fully isolated authenticated backend, must be limited in scope and removed after testing. A generic HTTPS tunnel alone is not access control. Browser-only OTP gates are not automatically compatible with native API fetches. The limited test tunnel is active as recorded in N. Section M preserves the narrowly scoped activation procedure for the authorized environment-preparation task; no production tunnel/configuration is changed.

# G. Test Account Management

| Account/configuration | Purpose and recorded state |
| --- | --- |
| `.env.auth-e2e.local` at repository root | Existing dedicated account configuration restored from the previous repository; owner-only/Git-ignored. Firebase presence in production project user-confirmed; deployed DB UID linkage not independently verified |
| Root `.env.native-security.local` | Active isolated backend configuration; separate loopback 3108/project/DB (N) |
| `mobile/.env.native-security.local` | Isolated client fields validated against provider config and explicitly loaded into separate 8108; working 8107 unchanged |
| `.env.native-security-accounts.local` | Synthetic A/B/C credentials; all three provisioned, verified and linked only to the isolated DB (N) |
| `.env.native-security-admin.local.json` | User-provided isolated credential, owner-only/ignored; live test-project Admin access verified (N) |

A owns controlled placement data; B proves isolation; C is disposable only after provisioning and **separate explicit deletion authorization**. Prepared synthetic email strings/passwords are not registered accounts or proof of verified email. Do not create more accounts merely because login fails.

Before use, verify Firebase Console's selected project and account membership, then compare UID linkage internally using approved read-only access without displaying identifiers. Client/backend Firebase project, Admin credential project, API and DB must all agree. Never infer test isolation from an email alias or a local port. Keep production identities out of the isolated app session; normal SDK sign-out is permitted, direct SDK-storage manipulation is not.

Secret-bearing local files must be ignored and mode 0600. If a configuration exists, do not overwrite it. Use J's filename-only checks; do not `cat` these files or pass passwords on a command line. Existing production test accounts are not disposable deletion targets. The current `test:auth:e2e` helper is a legacy local web workflow with a port-3000 guard, not an Expo/native read-only production verification command.

# H. Native Persistence Security Verification

**Current status: seven scenarios NOT VERIFIED; execution BLOCKED by isolated runtime/observability prerequisites.** Historical 43 adapter/component tests PASS; they do not run real native storage on the iPhone.

Common preconditions: verified test-only Firebase/Admin/DB/API transport, explicitly selected separate native app runtime, authorized synthetic data/accounts, no paid AI, and privacy-safe observation of native AsyncStorage namespace presence and request statuses. Preserve production-connected 8107. Record device/runtime/project selection, scenario sequence, PASS/FAIL/BLOCKED, and presence/absence only; no keys containing owner IDs or stored values in shared evidence.

Placement cleanup targets legacy `petalpal_flower_placements_v1` and its owner-prefixed namespace, including orphaned caches. Activation starts fresh; backend-owned flowers may legitimately reload. An empty/nonempty Garden alone cannot prove local erasure. Observe the cache boundary separately from server rehydration. Storage failures must close access and retry erasure; physical deletion cannot be claimed while the adapter fails.

Each scenario below requires the common isolated environment. Current code exposes logout and an AuthProvider `deleteAccount()` method. The current preparation task authorizes the minimal DEV/TEST instrumentation in M; its metadata/fault/hold API is implemented, not yet phone-verified. There is no new deletion button or automatic scenario execution. C deletion still requires separate authorization.

## 1. Logout erase — NOT VERIFIED

- **Preconditions:** A signed into the isolated runtime; synthetic placement durably observed in the application-owned native namespace; no storage faults.
- **Steps:** use the existing logout action; await completion; inspect namespace absence; reopen/reload without logging into production.
- **Expected/evidence:** private placement keys absent and no stale in-memory account data; signed-out state survives reload. Normal Firebase signOut is allowed; no SDK keys are manually erased.
- **Criteria:** PASS only with physical storage and UI evidence; FAIL if stale private data remains accessible/reappears after successful cleanup; BLOCKED without safe native observation. UI-only logout is insufficient.
- **Cleanup:** sign out test accounts normally; retain harmless test preferences; remove only authorized synthetic fixtures via the approved test procedure.

## 2. Account-delete erase — NOT VERIFIED

- **Preconditions:** C exists solely in isolated Firebase/DB; explicit separate approval names C as deletable; isolated delete method can be invoked safely and cleanup observed.
- **Steps:** create authorized synthetic placement fixture; invoke existing account deletion; record remote success status; await local cleanup and reload.
- **Expected/evidence:** confirmed remote deletion precedes logout/placement erasure; private namespace absent. A failed remote delete must not falsely report success or erase an unrelated account.
- **Criteria:** PASS requires confirmed C-only remote result and native erase evidence; FAIL for stale accessible data/wrong-account cleanup; BLOCKED without approval, isolated account or safe invocation. Never use production.
- **Cleanup:** record C deletion without identifiers; do not recreate C automatically or delete A/B. Preserve SDK-owned storage.

## 3. Account-switch isolation — NOT VERIFIED

- **Preconditions:** verified isolated A/B, distinct synthetic markers and native scope observations; both identities fully authorized.
- **Steps:** A → normal logout → B; observe B's data; then B → logout → A. Record outgoing namespace cleanup and each new scope.
- **Expected/evidence:** no A private placements/details in B or stale B content in A; caches initialize fresh. Legitimate owner-only server reloads are distinguished from leaked local data.
- **Criteria:** PASS requires both directions and storage/UI evidence; FAIL on cross-account private access; BLOCKED if account/transport/observation prerequisites are missing.
- **Cleanup:** leave both test identities intact and signed out; clear authorized test fixtures without global storage clearing.

## 4. Late-write protection — NOT VERIFIED

- **Preconditions:** approved native instrumentation can delay a real AsyncStorage write and expose completion order without payloads; A/B isolated.
- **Steps:** start a controlled A save/update/remove/reset before logout/switch; hold the asynchronous operation; switch/erase; release it; observe the queue and reload. Include already-started writes and old-generation callbacks.
- **Expected/evidence:** old-generation work cannot affect B or restore erased A data; an already-started write completes before queued physical erasure. Record ordered milestones/namespace absence.
- **Criteria:** PASS only with deterministic real-native delay/order evidence; FAIL if old data survives/reappears or B changes; BLOCKED without instrumentation. Rapid manual taps are not race proof.
- **Cleanup:** release all held operations, remove fault hooks, normal sign-out; verify no pending writer remains.

## 5. Reload behavior — NOT VERIFIED

- **Preconditions:** native storage visible safely; isolated identities; distinguish app reload from uninstall/storage reset.
- **Steps:** save synthetic A data; reload the bundle/app normally; observe fresh scope and correct authorized backend hydration. Logout, reload again, then enter B if authorized.
- **Expected/evidence:** authentication/scoping stays correct; erased or orphaned private placements cannot be revived. Activation intentionally clears this cache, so exact local placement persistence across activation is not promised.
- **Criteria:** PASS with namespace and identity-bound UI evidence before/after reload; FAIL on stale/cross-account recovery; BLOCKED without safe observation. Reinstalling hides persistence defects.
- **Cleanup:** normal sign-out; preserve Expo/Firebase internal storage and existing app installs.

## 6. Global preference preservation — NOT VERIFIED

- **Preconditions:** controlled non-sensitive preferences observed before cleanup; isolated A/B.
- **Steps:** record applicable device-global mask/calibration preferences and account-scoped panel theme/background preference; perform logout/switch; observe values internally without exporting them.
- **Expected/evidence:** placement erasure leaves unrelated safe preferences and SDK storage untouched; B must not inherit A's owner-scoped theme through a scope defect. `PanelTheme.tsx` uses an owner-scoped key, not a global theme key. Some mask code uses browser localStorage: only verify preferences actually supported on native.
- **Criteria:** PASS for explicitly exercised native preferences and proper account scope; FAIL if application cleanup removes unrelated preferences or crosses owners; BLOCKED where native preference support/inspection is unavailable.
- **Cleanup:** restore only approved test preference changes; no AsyncStorage.clear(), localStorage.clear() or blanket namespace purge.

## 7. Storage-failure fail-closed — NOT VERIFIED

- **Preconditions:** approved native-only fault injection for read/write/remove/key enumeration, synthetic data; no production/SDK adapter mutation.
- **Steps:** exercise each application storage failure at activation/save/erase; observe closed private access and safe errors; remove fault, retry activation/cleanup, then reload.
- **Expected/evidence:** no unsafe memory fallback, stale private display or successful-erasure claim during failure; retained cleanup retries before activation. Capture generic error/status and storage readiness only.
- **Criteria:** PASS requires real-native fault/recovery evidence for each operation; FAIL if private access remains open or erased data returns; BLOCKED without approved instrumentation. Do not corrupt files, exhaust storage or force device failure.
- **Cleanup:** remove all injected faults, verify cleanup recovery, normal sign-out. Preserve Firebase adapter and all unrelated data.

Secure credential storage, OS backups, attestation, released native artifacts and other cache scopes remain separate limitations. The seven scenarios do not establish global CDN/cross-account HTTP cache certification either.

# I. Existing Services and Non-Regression Rules

- Do not stop, restart, delete or recreate Docker/Colima containers; reset PostgreSQL; remove volumes; overwrite any development/production database.
- Preserve working Expo 8107 and backend 3107. Identify Metro 8081/8082 before any approved change; never kill all Node processes. Use a separately approved isolated process/port instead of silently repointing the working preview.
- Do not modify production Firebase users/configuration during diagnostics, copy production credentials into test settings, enable billing, or execute account deletion without explicit disposable-account approval.
- Do not manipulate Firebase internal persistence or clear the entire native/browser storage adapter. Normal SDK signOut is distinct from manual key deletion.
- Do not touch the recovery stash, unrelated working-tree files or existing visual assets. Preserve rendering quality, animations, DPR and performance; avoid broad Garden/Fairy refactors.
- No public HTTP authentication, unapproved tunnel/hotspot, TLS bypass, production deployment/configuration change, unnecessary rebuild/simulator/dependency installation or Graphify scan.

# J. Minimal Commands Reference

These commands are derived from current source/scripts and installed tooling. They were reviewed for this runbook, **not executed as new runtime verification**. Read-only diagnostics are separate from explicitly authorized launch/test commands.

## Read-only service, interface and branch checks

```bash
cd /Users/xingranma/Desktop/PetalPal_JX-integration
git branch --show-current
git status --short
lsof -nP -iTCP:8107 -iTCP:8081 -iTCP:8082 -iTCP:3107 -iTCP:5433 -sTCP:LISTEN
route -n get default | awk '/interface:/{print $2}'
```

Use the reported interface, not an assumed `en0`:

```bash
petalpal_interface="$(route -n get default | awk '/interface:/{print $2}')"
ipconfig getifaddr "$petalpal_interface"
```

The current Metro terminal's advertised URL is authoritative, especially with VPN/multiple interfaces. Historical URLs were `exp://206.12.136.148:8107` (October 2) and `exp://206.12.136.139:8107` (October 7). These campus addresses are **not** approved HTTP API destinations. Root curl commands are in A; never substitute an authenticated/mutating/AI route for liveness.

## Sanitized running-Metro override check

Identify the PID using lsof; inspect its command without raw environment (`ps -p PID -o pid=,comm=` with PID replaced). For 8107, this prints only a sanitized startup API origin or a missing-override message:

```bash
python3 - <<'PY'
import re, subprocess, urllib.parse
pids = subprocess.run(['lsof', '-tiTCP:8107', '-sTCP:LISTEN'], capture_output=True, text=True).stdout.split()
for pid in dict.fromkeys(pids):
    raw = subprocess.run(['ps', 'eww', '-p', pid, '-o', 'command='], capture_output=True, text=True).stdout
    match = re.search(r'(?:^|\s)EXPO_PUBLIC_API_BASE_URL=([^\s]+)', raw)
    url = urllib.parse.urlsplit(match.group(1)) if match else None
    if url and url.scheme in ('http', 'https') and url.hostname and not url.username and not url.password:
        print('8107 startup API origin:', url.scheme + '://' + url.hostname + (':' + str(url.port) if url.port else ''))
    else:
        print('8107 startup API override absent or unsuitable; inspect intended dotenv selection safely')
PY
```

This does not dump process credentials, nor prove an already-running bundle's final URL after host rewriting. For a **proposed launch in the current shell**, inspect Expo's environment selection without printing other fields:

```bash
cd /Users/xingranma/Desktop/PetalPal_JX-integration/mobile
NODE_ENV=development node - <<'JS'
const { get } = require('@expo/env');
const env = { ...get(process.cwd(), { mode: 'development', silent: true }).env, ...process.env };
try {
  const url = new URL(env.EXPO_PUBLIC_API_BASE_URL);
  console.log('Proposed API origin:', ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : 'UNSAFE/INVALID');
} catch { console.log('Proposed API origin: NOT CONFIGURED'); }
console.log('Firebase project:', ['petalpal-b212c', 'petalpal-native-security-test'].includes(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ? env.EXPO_PUBLIC_FIREBASE_PROJECT_ID : 'UNKNOWN');
for (const name of ['EXPO_PUBLIC_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_APP_ID']) console.log(name, env[name] ? 'present' : 'missing');
JS
```

## Logs and local-file protection

Prefer the selected Metro/backend terminal: record only iOS bundle completion, safe error code and HTTP status. Do not dump logs, SDK user objects or request content. If an existing log file is known, `rg -n 'Bundled|ERROR|WARN' /path/to/known.log` is only a locator: inspect locally and redact before sharing; matching lines may contain private content. Do not assume a temporary log path still exists.

```bash
cd /Users/xingranma/Desktop/PetalPal_JX-integration
git check-ignore -- .env.auth-e2e.local .env.native-security.local mobile/.env.native-security.local .env.native-security-accounts.local .env.native-security-admin.local.json
stat -f '%Sp %N' .env.auth-e2e.local .env.native-security.local mobile/.env.native-security.local .env.native-security-accounts.local
```

Missing-file errors indicate a preparation blocker, not permission to recreate credentials. Owner-only files should show `-rw-------`. Never display their values.

## Explicitly authorized launch and validation only

Production-connected Expo launch is in A. `npm run web` runs a web client, not real native AsyncStorage; `npm run ios` targets simulator tooling and is not the established physical-iPhone workflow. The isolated launcher in M is active per N; reuse its current processes and confirm phone transport before READY. Do not use root `npm start` merely to inspect the backend: it invokes `prisma migrate deploy` before `node server.js`.

Historical 43-test scope (28 auth/session + 12 persistence + 3 selected provider cases), **do not rerun unless a relevant implementation change justifies it**:

```bash
cd /Users/xingranma/Desktop/PetalPal_JX-integration/mobile
node --test test/authSession.test.mjs test/plantingPersistence.test.mjs
node --test --test-name-pattern='provider rejects self Support|known owner Delete|DELTA-P2-2 delayed provider Delete' test/flowerDetail.test.mjs
```

There is no `typecheck` npm script. For an authorized changed-scope check, this uses the installed TypeScript compiler and project options; change the explicit root-file list to the edited files. Imported dependencies are also checked; all diagnostics are retained. This is not a full-project or native-runtime certification:

```bash
cd /Users/xingranma/Desktop/PetalPal_JX-integration/mobile
node - src/services/auth.tsx src/components/garden/planting/plantingPersistence.ts <<'JS'
const ts = require('typescript');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config || {}, ts.sys, process.cwd());
const program = ts.createProgram(['expo-env.d.ts', ...process.argv.slice(2)], { ...parsed.options, noEmit: true });
const errors = [config.error, ...parsed.errors, ...ts.getPreEmitDiagnostics(program)].filter(Boolean);
const host = { getCanonicalFileName: p => p, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' };
if (errors.length) console.error(ts.formatDiagnosticsWithColorAndContext(errors, host));
process.exitCode = errors.length ? 1 : 0;
JS
```

For a deliberate full mobile static check, `./node_modules/.bin/tsc --noEmit --project tsconfig.json` is the compiler invocation, not an npm script. Existing unrelated diagnostics must not be hidden or attributed to the changed-scope historical PASS. For documentation work use `git diff --check`; no tests/typecheck/service launches are required.

# K. Evidence and Verification History

| Date | Classification | Evidence / limitation |
| --- | --- | --- |
| 2026-09-25 | Historical TESTED / USER-REPORTED | Existing Auth E2E verification passed with production Firebase; account presence later user-confirmed. Not fresh production DB-linkage evidence |
| 2026-10-02 | USER-REPORTED | Physical iPhone/Expo LAN 8107, backend 3107, PG 5433 previously worked; former IP ended `.148`. Temporary `/tmp/petalpal-voice-verification/expo-env.json` may no longer exist; never dump it |
| 2026-10-07 | VERIFIED diagnostic finding | Metro startup API port 3000 override conflicted with 3107. Mac-side backend liveness restored/observed; phone campus HTTP reachability remained unsuitable |
| 2026-10-07 | USER-OBSERVED PASS | Physical-iPhone ordinary login through 8107 after selecting Render HTTPS; process override/iOS bundle completion inspected. Production writes may have occurred; individual authenticated response headers not independently observed here |
| 2026-10-07 | IMPLEMENTED / TESTED | Commit `8f2aa905ebdffb18ea107e3cc3d98fc50de5e55e`: account-scoped cleanup/generation fences; 43 targeted tests PASS; changed-scope TypeScript PASS. No native acceptance evidence |
| 2026-10-07 | VERIFIED preparation | Dedicated empty test PostgreSQL DB on 5433, tracked migrations and read-only identity/zero-User check. Temporary migration copy excluded empty duplicate checkout folders; existing DBs/files untouched |
| 2026-10-07 | USER-REPORTED provider setup | Test Firebase project created on Spark, Email/Password enabled; no billing approval |
| 2026-10-07 | VERIFIED configuration | Isolated Firebase JS app registered without Hosting; four client fields saved owner-only/Git-ignored and test project matched; production mobile configuration unchanged |
| 2026-10-07 | BLOCKED / NOT VERIFIED | Admin credential/access, registered A/B/C, protected HTTPS activation, isolated native runtime and failure/race observability incomplete. Seven native scenarios not run; C deletion not authorized |

These records preserve scope, not a new runtime audit. Existing [SECURITY.md](./SECURITY.md) and [MANUAL_SECURITY_CHECKLIST.md](./MANUAL_SECURITY_CHECKLIST.md) remain the security-status authorities. The latter separately records observed production headers/cache/metadata evidence; those earlier observations do not certify the iPhone login's HTTP headers, Garden Calendar/history runtime, global CDN, cross-account cache isolation or native erasure. This runbook changes no P0/P1/P2 status/count.

# L. Future Agent Operating Procedure — Codex / Claude Code / Astra

1. Read MOBILE.md first, then only relevant security/runtime records and applicable instructions. Establish whether the task is documentation, ordinary login, isolated testing or implementation.
2. Inspect current branch/process state without raw environment dumps. Preserve unrelated files, services and recovery stash.
3. Follow A or E; reuse known working 8107/HTTPS preview. Confirm effective API and identity environment before changing anything.
4. Read only targeted source sections; no full repository scan, Graphify, repeated login/provider/DB investigations or broad tests by default.
5. Never restart containers/databases, kill Metro blindly, reinstall dependencies, or replace an existing working configuration merely to diagnose.
6. Never silently switch production and isolated Firebase/API/DB environments. Require complete verified isolation before tunnel exposure or native lifecycle tests.
7. Request approval before production-write tests, destructive actions or a required identified Metro restart. Deletion needs separately authorized disposable C; prepared credentials are not approval.
8. Capture safe statuses/codes/presence/absence, never secrets/private values. Unit tests, user observations and independently captured native evidence must remain distinct.
9. Update this runbook when operational facts change; append dated evidence and preserve historical scope. Update SECURITY/manual statuses only for genuine new evidence, keeping counts accurate.
10. Report the exact first blocker/manual action. Stop rather than inventing credentials, a native test panel, isolation, successful cleanup or a supported runtime. No commit/push without approval.


# M. Isolated Native-Security Preparation — 2026-10-07

**Earlier preparation snapshot; see N for the current active continuation. Historical blocked evidence below is retained.**

**Environment PARTIAL / downstream activation BLOCKED; seven runtime scenarios NOT EXECUTED.** Branch remains `integration/mobile-backend-test`. Existing 8107, 8081, 3107 and PostgreSQL 5433 listeners retained their original PIDs. No backend, tunnel or Expo test process was launched. Runtime bind probes found free candidates **3108 (backend)** and **8108 (Expo)**; these are not reserved. Each launcher rediscovers a free port and reports its actual choice. Existing 8082 was not listening; nothing was stopped.

Verified preparation:

- Read-only identity/schema check: `petalpal_native_security_test` on existing loopback PostgreSQL 5433; **25 applied migrations, zero User rows**. No migrations/reset/fixtures were run.
- Isolated backend/mobile/account local files remain Git-ignored and mode 0600. Only `NATIVE_SECURITY_TEST=1` was added to the isolated root file. Production/default env files were not edited.
- `lib/native-security.js` is enforced at database URL resolution and Firebase Admin configuration. It rejects missing/mismatched test mode, required settings/port, production/remote/ambiguous DB, production Firebase/credential project/principal, ambient credential/emulator fallback and enabled paid AI. Normal startup is unchanged without the opt-in flag; isolated server binds only loopback and root returns safe boundary metadata with no-store.
- `scripts/native-security.mjs` loads only explicit owner-only ignored files, strips inherited provider/production environment settings, pins dotenv to the isolated file and performs read-only DB/Admin/client-app preflights before launch. Registered test-project Web app fields are compared internally against the provider configuration, including API key provenance; printing a projectId alone is insufficient. Admin/provider live preflight remains blocked and is not claimed PASS.
- Mobile test mode rejects production Firebase/API or a mismatched active API connection. The isolated Firebase app name and isolated placement namespace keep the normal preview's SDK session/cache out of test cleanup. Normal cache prefixes/SDK persistence retain their existing behavior. Production builds reject the test flag and expose no diagnostic global.
- **66 targeted unit/component tests PASS**: 21 backend guard/database cases, 5 new client/hook preparation cases, 12 existing mocked placement cases and 28 existing mocked auth/session cases. Changed-scope TypeScript with `expo-env.d.ts` has zero diagnostics; changed backend/script syntax and diff checks PASS. These are preparation/regression checks, not physical-device scenarios. No injected fault or held write was armed in the real runtime.

**Exact first blocker:** `.env.native-security-admin.local.json` is absent; no ambient authorized Admin credential path or local ADC was available. Provide an authorized service-account JSON for **only** `petalpal-native-security-test` at that ignored root path, owned by the current user and mode 0600. Never paste its contents into chat/docs or reuse production credentials. The test principal must support Firebase Auth user lookup/provisioning, Auth config reads and Firebase Web app config reads; a provider permission/API error is a blocker, not permission to enable billing or borrow production access. Firebase Console access/terms status was not rechecked this task.

A/B/C are still **local credentials only, not provisioned or DB-linked**. A and B are persistent synthetic identities; C is disposable with a pristine empty profile/garden only after provisioning. No private content is seeded and deletion is not authorized by provisioning. The helper is idempotent: existing UID/email linkage mismatches or unverified/disabled identities fail closed, rather than being relinked or overwritten. It verifies the saved credentials only against the independently validated test-project client configuration and checks the resulting token/project/UID privately. `check` does not create users/profiles; `provision` initializes only the test identities/empty relations. No production UID/DB inspection is needed or allowed for this preparation.

Future agents must read this section and use the following sequence from the repository root **after the credential handoff**. Never use `npm start` (migrations), root `.env`, production credentials or the working 8107 for this workflow:

```bash
cd /Users/xingranma/Desktop/PetalPal_JX-integration
node scripts/native-security.mjs db
node scripts/native-security.mjs provision
node scripts/native-security.mjs check
node scripts/native-security.mjs backend
```

Keep that backend process open. In a separate terminal, pass **the actual reported backend port**, replacing the placeholder:

```bash
node scripts/native-security.mjs tunnel BACKEND_PORT
```

This uses the already-installed `cloudflared` quick tunnel and exposes only the verified test loopback backend. The API retains Firebase bearer authentication; a quick tunnel is not an additional identity gate. Its root exposes only sanitized boundary metadata. Do not expose the ordinary backend, Metro or unrelated services through this tunnel. Do not alter production Cloudflare/Render configuration. Native fetch must not depend on a browser-only OTP gate. Keep the dedicated tunnel process open; stop only this new process after testing to remove the temporary endpoint. No tunnel was activated during this blocked preparation.

In another terminal pass only the reported temporary **HTTPS origin**:

```bash
node scripts/native-security.mjs expo HTTPS_ORIGIN
```

The Expo preflight requires valid TLS (no bypass/redirect), matching test-backend root metadata and anonymous `/session?view=metadata` rejection (401), then starts separate Expo Go/LAN on a discovered free port with **EXPO_NO_DOTENV=1** and only explicitly selected test public variables. It never passes Admin/account credentials into Metro. Use its QR, not 8107. Never use localhost/plain HTTP as the phone API URL. Future agent must confirm reachability/certificate on the intended iPhone/network using anonymous health only; Mac-side TLS and effective config do not prove phone transport. Do not mark READY or run scenarios until this and every ready-gate item passes.

## Safe native instrumentation — prepared, not exercised on device

In React Native DevTools attached to the **new isolated Metro**, the DEV-only global is `globalThis.__PETALPAL_NATIVE_SECURITY__`. Normal development and production have no such global. After verifying the correct test runtime, `await globalThis.__PETALPAL_NATIVE_SECURITY__.inspect()` returns only presence/counts, owner-match boolean, generation/readiness, pending cleanup count/result, bounded ordered operation milestones, unarmed fault/hold state and the safe global-preference sentinel comparison. It never returns keys/owner identifiers, tokens, credentials, records or raw adapter errors. Inspection bypasses injected fault hooks and does not mutate storage. The expected owner comes internally from AuthProvider's current backend session; immediately after a transition wait for React to settle before evaluating its comparison.

The following methods are **available for the next task only; not invoked now**:

- `failNext('read' | 'write' | 'remove' | 'keys')`: one-shot synthetic rejection only around isolated placement operations. Does not alter the AsyncStorage adapter, Firebase persistence, device capacity/files or unrelated preference operations. Injection is memory-only and reset on reload. Closed-cache/recovery behavior still needs later native evidence.
- `holdNextWrite()` / `releaseWrite()`: dispatch a real AsyncStorage placement write and hold its queue completion, with adapter-completion/held/released milestones. Later task controls the synthetic write/logout/switch sequence; no fixtures or races run automatically.
- `prepareGlobalPreference()` / `removeGlobalPreference()`: create/remove only a known harmless test sentinel, never a real preference or SDK key. `inspect()` reports whether it survives application cleanup. This tests preservation of a native global key; it does not certify browser-only mask preferences or every cache scope.
- `resetHooks()`: disarm faults/holds and release an outstanding held completion. Call before ending later tests; it does not erase stored placements or reset SDK/device storage.

Do not print complete app/SDK/session objects in DevTools. The diagnostics deliberately have no account deletion action or remote route. Later approved testing must use existing lifecycle actions; explicit disposable-C deletion authorization remains required.

**Ready gate:** DB boundary and local guards/instrumentation preparation PASS. Admin/provider/client-key provenance, A/B/C provisioning/authentication/linkage, active protected HTTPS, effective separate Metro bundle and intended-phone transport are still BLOCKED / NOT VERIFIED. Status remains **PARTIAL, never READY**. SECURITY canonical DELTA-P2-2 status/counts and all seven NOT VERIFIED scenario records remain unchanged; MANUAL_SECURITY_CHECKLIST.md has no new provider/manual action this task.

Primary implementation references consulted: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo explicit public environment loading](https://docs.expo.dev/guides/environment-variables/), [Firebase registered Web app config](https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects.webApps/getConfig), [test-project Auth configuration reads](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig), and [temporary Cloudflare HTTPS tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).


# N. Current Native-Security Continuation — 2026-10-07

**Environment READY for the next authorized runtime-test task.** Supersedes M's missing-credential/unprovisioned/unstarted snapshot. The earlier **“Not checked yet”** phone-health reply is superseded by the user's **“PASS: all three fields match, no certificate warning”** confirmation on the intended iPhone/network. All seven DELTA-P2-2 physical-device scenarios remain **NOT EXECUTED / NOT VERIFIED**; preparation readiness does not certify them.

| Readiness item | Current verified state |
| --- | --- |
| Admin | PASS: owner-owned, regular 0600/Git-ignored test credential; project/type guard and live provider/Auth access verified |
| Provider/client identity | PASS: Email/Password enabled; registered Web app project/app ID/auth domain/API key matched internally against provider configuration |
| Database | PASS: exact isolated DB on existing loopback PostgreSQL 5433; 25 applied migrations; three test profiles; no reset/migrations |
| A/B/C | PROVISIONED: verified isolated Firebase users and empty profile/garden/Fairy/AI-disabled/free-entitlement relations; saved passwords/token project/UID and DB linkage checked without exposing values |
| Authenticated backend | PASS: each A/B/C POST `/auth/session` with deferred profile creation and GET `/session?view=metadata` succeeds over the isolated HTTPS endpoint and matches that isolated profile; no private fixtures |
| Test backend | Active loopback **3108**, PID **28636**, isolated guards active; no production/default credential/DB fallback variables after full module import |
| HTTPS | Active **https://beverage-jurisdiction-organization-addresses.trycloudflare.com**; valid Mac TLS, correct health identity and anonymous session 401; intended-iPhone TLS/health USER-OBSERVED PASS |
| Separate Expo | Active **8108**, PID **24548**, Expo Go/LAN; flag/project/API/dotenv-disabled effective process config verified; no Admin/account secrets in Metro environment |
| iOS bundle | Built successfully; all four isolated Firebase client fields and the intended HTTPS origin are inlined; diagnostic API is included only under DEV/test guards |
| Storage hooks | Prior preparation PASS retained; fault/hold/sentinel controls remain unarmed/uninvoked; no real native storage or SDK persistence manipulation |

A/B are persistent test identities. C remains reserved for later separately authorized deletion; its Journal/Event/Flower counts are zero, as are A/B's. Provisioning/credential verification and stateless backend readiness requests are not native account-switch/logout/reload/deletion scenarios. No production accounts/UIDs/DB/content were read or modified; no private production-like fixtures or paid AI were used.

## Live-startup correction and current workflow

A real authenticated readiness check initially returned 401 even though direct isolated Admin verification passed. Minimal diagnosis found `natural`'s optional storage adapters calling `dotenv.config()` without a path, importing root default settings after the explicit launcher setup. The guard correctly rejected the added ambient credential path before authentication. No fallback credential was used. The backend launcher now runs the absolute `server.js` path from a fresh empty private temporary working directory, while retaining `DOTENV_CONFIG_PATH` pointed at the explicit isolated root env. This prevents third-party default-dotenv discovery from reading root `.env`. Normal production/dev startup is unchanged. The empty temporary directory is removed when this dedicated child exits; no credentials are copied there.

The newly created test backend alone was replaced once to apply this correction. Existing Expo **8107 (PID 34461)**, Metro **8081 (PID 26870)**, backend **3107 (PID 27961)** and PostgreSQL forwarding **5433 (PID 18886)** retained their original PIDs. No 8082 listener was present. The test tunnel and test Metro remained running; Docker/Colima, original services, production config/data, recovery stash and unrelated working-tree files/refs were untouched.

**Reuse the current isolated processes.** Do not restart them or run the full bootstrap merely to inspect readiness. When a future authorized restart is actually necessary, run the existing commands in M from the repo root; `backend` rediscovers a free port and now supplies its own safe working directory. `tunnel` must receive that actual port. `expo` must receive the newly verified HTTPS origin. Never use `npm start`, switch 8107 or manually start the isolated server from the root cwd. A/B/C are already provisioned; use `check` for a deliberate identity/linkage recheck, and do not recreate C after a later approved deletion.

The current Mac interface address is **206.12.136.139**. The separate test project uses **exp://206.12.136.139:8108** on the same reachable LAN; API requests use the HTTPS origin above. Recheck current interface/advertised host as in J if network state changes. This records configuration, not an observed iPhone bundle launch. Metro LAN traffic is distinct from HTTPS credential/session transport.

## Device check — anonymous USER-OBSERVED PASS

From the intended iPhone and network, open the HTTPS origin above in Safari. Confirm no certificate warning and exact safe health fields:

- environment: `native-security-test`
- firebaseProject: `petalpal-native-security-test`
- database: `petalpal_native_security_test`

The user now confirms all three fields match on the intended iPhone/network with no certificate warning: **USER-OBSERVED PASS**. A fresh Mac-side HTTPS health identity/anonymous 401 recheck also PASSes; 3108/8108 and the original service PIDs remain live/unchanged. No sign-in/native lifecycle action, fault/hold or preference sentinel was invoked during this follow-up. The earlier PARTIAL device gate is closed and the preparation environment is **READY**. Only a later authorized task may execute the seven scenarios; C deletion still requires explicit authorization.

New checks: credential ownership/permissions/ignored project boundary, live Admin/provider/client-app provenance, A/B/C provisioning/password/token/DB linkage, valid HTTPS health/anonymous rejection and each account's authenticated metadata/session linkage, empty private-fixture counts, effective backend/Expo environment, successful iOS bundle/config/hook availability, and one changed-scope post-import/default-dotenv isolation regression all PASS. Launcher syntax and tracked/untracked diff checks PASS. The prior **66 tests/typecheck were not rerun**; no mobile source change occurred in this continuation. Earlier failing session probes are superseded by the live A/B/C HTTPS PASS after the cwd fix. A diagnostic-only loopback sibling was closed after use.

SECURITY.md and MANUAL_SECURITY_CHECKLIST.md now record genuine new isolated provider/provisioning/runtime-readiness evidence. Canonical DELTA-P2-2 acceptance and P0/P1/P2 counts remain unchanged. Branch remains `integration/mobile-backend-test`; no staging/commit/push.


Readiness closure — 2026-10-07: user-observed intended-iPhone anonymous TLS/health PASS closes the last preparation blocker. This follow-up reran only anonymous HTTPS health/session rejection, listener checks and documentation diff checks; no unit tests/typecheck, credentials/account provisioning or authenticated requests were repeated. Existing Admin/DB/A/B/C/effective Expo/iOS bundle/guard/instrumentation evidence remains valid. Fault/hold/sentinel hooks remain unarmed; no seven-scenario acceptance claim or canonical SECURITY count change. All current isolated processes are left running for the next authorized task.

# O. Authorized Native Runtime Attempt — 2026-10-07

**Scenario 1 INCONCLUSIVE / POSSIBLE RUNTIME FAILURE; further scenarios stopped. Environment READY evidence in N retained.** The current user explicitly authorizes deletion of disposable C only after exact project/environment/database/C checks. This supersedes N's earlier pending-authorization wording; it does not authorize deletion before those runtime preconditions are observed.

The intended iPhone opening the isolated 8108 sign-in screen, signing in as A, and opening DevTools are **USER-OBSERVED**. Agent-observed Metro 8108 lists one `host.exp.Exponent (iPhone)` native target intermittently. Loopback debugger sockets connect, but Runtime enable/evaluate requests return no native response within the bounded attempt; other checks also find the target disconnected. DevTools opening is not proof of a responsive JavaScript context. Earlier user Console `diagnostics: false` replies are superseded: copied code omitted the double underscores in the property name, and top-level `await` caused a Hermes compile error. A promise callback with the name constructed explicitly now returns the real native diagnostic object. The USER-OBSERVED snapshot shows available native storage, active owner matching expected, zero durable placement keys/records, zero memory records (empty memory cache present), ready storage, successful cleanup state, no pending erasure, and failure/hold unarmed. The initialized nativeSecurity module reports enabled. These confirm native diagnostic availability, not any seven-scenario result. The isolated app was reloaded for troubleshooting before any fixture/logout test; this does not count as scenario 5. Agent HTTPS health recheck confirms `native-security-test`, `petalpal-native-security-test`, and `petalpal_native_security_test`.

| Scenario | Result | Evidence / missing prerequisite |
| --- | --- | --- |
| 1. Logout erase A | INCONCLUSIVE / POSSIBLE RUNTIME FAILURE | Exact-A runner initialization PASS; invoking logoutA disconnected/closed the native runtime before a result was recorded. Reopened state is clean but startup erasure prevents attributing that state to the interrupted logout |
| 2. Account-delete erase C | STOPPED / NOT EXECUTED | User explicitly stopped scenario 2 after the scenario-1 incident. C deletion not attempted |
| 3. A-to-B isolation | BLOCKED / NOT EXECUTED | Native inspection/control unavailable |
| 4. Late-write protection | BLOCKED / NOT EXECUTED | Hold/write/release hooks not invoked |
| 5. Actual reload persistence | BLOCKED / NOT EXECUTED | Cleanup/reload not invoked |
| 6. Global preference preservation | BLOCKED / NOT EXECUTED | Test sentinel not created |
| 7. Storage failure fail-closed | BLOCKED / NOT EXECUTED | Failure injection not armed |

A narrow observability improvement adds `memoryCachePresent` and `memoryRecordCount` to existing DEV/isolated-only diagnostics. These expose counts/presence only, not records, keys or identities. Six focused `mobile/test/nativeSecurity.test.mjs` checks PASS, including memory invalidation/durable removal and no payload disclosure in the mocked adapter; changed-file TypeScript PASS with zero diagnostics. These are local instrumentation tests, not physical-device scenario evidence. Prior 66 tests were not rerun.

The user-assisted scenario-1 runner was invoked after exact-A/native/backend checks passed. Its completion stage was not recorded because the runtime/DevTools disconnected; fixture persistence and pre-restart logout erasure cannot be certified. No scenario-2 deletion, storage fault/hold/sentinel, SDK persistence manipulation or production request was performed. Agent READ ONLY provider/DB checks confirm A/B/C still exist and each linkage matches; C was not deleted. Hooks were never armed by the agent; the user-run native snapshot also confirms fault null and hold false. Existing services remain running. Required branch, recovery stash and unrelated work are preserved; no staging/commit/push. Canonical security statuses/counts and provider/platform limitations remain unchanged. MANUAL_SECURITY_CHECKLIST.md is unchanged because no provider action or native credential/backup verification status changed.

Do not rerun scenario 1 or proceed to scenario 2 while the disconnect is unexplained. Read-only Console runner initialization already confirmed exact A UID/backend-owner checksums, product auth context and the live isolated backend boundary. The current investigation is limited to the scenario-1 runner, logout/cache lifecycle, its immediate auth-gate transition and diagnostic logs. Because the agent debugger socket remains unresponsive and native Mac computer-use service is unavailable, user-assisted native Console results must be labeled USER-OBSERVED, not agent-observed or release VERIFIED. Do not repeat setup, recreate accounts, or delete C remotely as a substitute for the normal native account-delete lifecycle.

## Scenario-1 interruption and recovery — 2026-10-07

The user reports that invoking `petalpalNativeRunner.logoutA()` closed/disconnected the iPhone app/runtime and DevTools immediately; no final scenario JSON or before/after fixture evidence was received. **Never PASS.** The user explicitly stops scenario 2 and C deletion pending diagnosis. The isolated 8108 app alone was reopened; no runner reinstall or other scenario was requested. The new USER-OBSERVED snapshot shows generation 1, owner inactive/matching expected, zero namespace keys/durable records, no memory cache/records, storage ready, no pending erasure, cleanup true, fault null and hold false. Startup key enumeration and legacy removal ran. This verifies clean current recovery state only; startup cleanup obscures the interrupted logout result.

Narrow inspection finds no Expo/runtime reload, exit or close call in the scenario-1 runner, auth logout, placement lifecycle or immediate auth-gate/root transition. Normal logout invalidates account state, scopes placements to null, signs out through Firebase and waits for queued erasure. AuthGate removes signed-in routed content while initializing/signed out; AuthProvider remains above the gate. The runner subsequently inspects module diagnostics and re-traverses the current React auth context; ordinary JS failures are caught and hooks reset. These facts do not exclude a native crash during storage/UI teardown or establish its cause. Captured isolated Metro output has no recognized hook-order/null-access/native-fatal signature; it is not an iPhone crash report. Apple devicectl is unavailable on this Mac, and native computer-use access is unavailable. The next requested read-only evidence is the matching iPhone Expo Go/Exponent crash or JetsamEvent report's timestamp, exception/termination metadata and top function names, without identifiers/full payload.

No incident code fix or additional tests were run; prior six focused instrumentation tests/typecheck remain scoped to the memory-metadata addition. C is untouched; failure/hold state is USER-OBSERVED unarmed. Services and branch/stash/unrelated work remain unchanged. Canonical security status/counts remain unchanged.

MANUAL_SECURITY_CHECKLIST.md now records the genuine new read-only device-crash/termination follow-up. The earlier unchanged-manual statement above predates this incident. No recent synced Expo crash report is available in the Mac's MobileDevice crash-report folder; this does not imply that the iPhone did not crash.

Device-report follow-up: the user found no matching Expo Go/Exponent/JetsamEvent report at the interruption time; timestamp, exception/termination metadata and crashed-thread functions are unavailable. This does not prove that no crash occurred or certify the interrupted logout. The next clarification is the already-observed destination screen (Expo Go project list, iPhone Home Screen, or PetalPal loading/sign-in), without repeating the scenario. The app remains signed out, C deletion and later scenarios remain stopped, and no incident fix/test was performed.

## Scenario-1 exit classification — 2026-10-07

The user clarifies that the iPhone Home Screen appeared and Expo Go exited, rather than remaining on the Expo project list or PetalPal UI. This is USER-OBSERVED native-app exit evidence; it is not a confirmed native crash, jetsam event, inspector-triggered termination or product defect. **Cause classification F: insufficient evidence.** Scenario 1 remains INCONCLUSIVE / POSSIBLE RUNTIME FAILURE. No final runner result or stage evidence was captured; the last completed stage of its boundary/fixture/logout/post-logout path is unknown. Clean generation-1 recovery after startup cannot establish the original logout erasure.

Narrow current inspection of the scenario-1 runner and logout/cache instrumentation finds no explicit process-exit/reload call, no demonstrated destroyed-session dereference, and no confirmed test-only bug. Ordinary post-logout JS errors are caught; a native termination would bypass that handling. Existing isolated Expo output previously lacked recognizable native-fatal/hook-order signatures; this continuation's incremental log read has no new output. Neither is a timestamp-matched iPhone termination record. No code fix or tests were run in this diagnostic continuation; services were not restarted. Scenario 2/C deletion and scenarios 3–7 remain stopped.

Single safest next diagnostic step: capture an iPhone sysdiagnose using Apple's device-log instructions, keeping isolated 8108 signed out and without repeating logout. Inspect only the existing incident-time Expo Go/Exponent process-exit record, if retained; share only timestamp and termination reason/subsystem. Do not upload the full diagnostic archive or private/device/account identifiers. Missing retained evidence leaves classification F; it does not justify a PASS or speculative fix.


## P. Automated isolated native-security harness — 2026-10-07

This replaces the manual DevTools runner for new verification. At the user's direction, historical scenario-1 crash investigation is closed without determining a cause: the old attempt remains **INCONCLUSIVE / F: insufficient evidence**. No retained sysdiagnose result has been supplied. Its Home Screen exit, missing crash/Jetsam report and non-probative post-startup cleanliness remain recorded above. The new harness has not executed a physical-device scenario; C remains undeleted. Earlier instructions to keep later scenarios stopped applied to incident diagnosis and are superseded by the user's explicit authorization for this separate automated run, including deletion of isolated disposable C only.

### Minimal device workflow

Three initial actions from the current signed-out state:

1. Open the isolated project `exp://206.12.136.139:8108` in Expo Go. The new screen is **Native security verification**.
2. Sign in once as saved isolated A using the existing owner-only, Git-ignored `.env.native-security-accounts.local` credentials (`NATIVE_TEST_A_EMAIL` / `NATIVE_TEST_A_PASSWORD`). Enter them on the phone; do not paste values into chat or diagnostics.
3. Tap **Run native security verification** once. The screen runs scenarios 1–7 in order and displays their sanitized status. Scenario 5 requests an actual native app reload and resumes automatically. If Expo/iOS closes the app, the sole recovery action is reopening 8108; the screen resumes only phases with sufficient persisted evidence. Read the final on-device summary; no DevTools commands are needed.

Keep the phone awake and the isolated backend/tunnel available during the run. FAIL/BLOCKED stops the sequence with no blind automatic retry. An interrupted pending logout or deletion without its cleanup witness remains BLOCKED even if startup removed its fixture. Reopening cannot recover evidence that was never written. Do not clear the diagnostic key or recreate/substitute C to force a PASS.

### Isolation, access and evidence

The test layout exists only under DEV plus the native-security flag; the device adapter requires Hermes/native, the exact test Firebase project and the configured isolated HTTPS origin. Before any scenario action, the authenticated test-only backend bridge verifies the environment/project, live `current_database()` and provider/DB A/B/C linkage. The bridge is absent in normal development/production and denies anonymous access. Its bootstrap accepts only exact A. Normal product account deletion has an additional isolated-only C guard; A/B or unrelated identities are rejected.

Saved A/B/C credentials are fetched over the existing isolated HTTPS bridge into device RAM, never bundled as Expo environment values or written to diagnostics. One initial A sign-in is needed to authorize this access. A two-hour opaque resume capability is stored separately in Expo SecureStore under `petalpal_native_security_test_harness_access_v1`; it is not part of the diagnostic journal or Firebase SDK persistence. The backend holds its digest/expiry only in memory. A backend restart or expired capability stops resume safely; it does not authorize a deletion retry. Final success requires revocation and local access cleanup. Credential responses are no-store; redirects are rejected; SDK credentials/persistence internals are unchanged.

AsyncStorage diagnostic key `petalpal_native_security_test_harness_v1` contains only a strict allowlist of scenario/phase/code/timestamp, started/completed, cache and memory presence/count, expected-owner match, cleanup, preference and fault-arm booleans. No emails/passwords/tokens/raw UIDs, account IDs, marker contents or private payloads are included. Unknown fields, skipped phases and malformed/fabricated result sequencing are rejected.

A one-shot test-only witness is called from normal product logout **after awaited private-cache cleanup**, before logout completes. Startup scope cleanup cannot call it. Scenarios 1–6 require this persisted clean durable/memory witness; scenario 7 requires the injected removal failure and memory invalidation witness. A lost or failed witness write cannot PASS. The test controller remains mounted outside AuthGate, so logout does not unmount it. C deletion uses the normal product lifecycle, confirms C absent from both isolated provider and DB, and recognizes already-completed deletion without a second delete. Absence without local evidence blocks rather than substituting A/B.

Scenario 4 uses the existing held-write hook and proves a stale captured A session cannot repopulate the namespace. Scenario 5 records pre-restart logout completion, then checks a fresh runtime and the placement namespace key count captured **before first startup erasure**; post-startup emptiness alone cannot PASS. Scenario 6 uses the supported non-private test preference sentinel. Scenario 7 injects one removal failure, verifies signed-out reads and generic errors, then recovers storage. Fault/hold/witness hooks are disarmed in finally. The final report stays on the separate test screen after logout/reload.

### Implementation verification and runtime limit

Nineteen focused harness/bridge tests PASS: thirteen prior harness checks plus final access-cleanup gating and five bridge checks (14 mobile, 5 backend). Coverage includes production guards, sanitized checkpoint integrity, safe restart/idempotent C resume, startup false-PASS prevention, seven-scenario sequencing, same-runtime reload rejection, failed checkpoint writes and fault disarming. These use mocked provider/native adapters, not physical-device acceptance. Changed-scope TypeScript and JavaScript syntax checks PASS. Prior 66 tests were not rerun.

Only isolated backend 3108 was replaced to load the new bridge; the existing HTTPS tunnel and Expo 8108 remain in place. Anonymous live HTTPS bridge access is rejected with no-store. No production/provider configuration, A/B/C mutation, unrelated service restart, Firebase persistence alteration, staging/commit/push or stash/ref change. Native seven-scenario acceptance remains pending the button run; canonical security statuses/counts remain unchanged.


## Scenario-1 automated harness failure and bounded retry — 2026-10-07

USER-OBSERVED saved phone journal: `ready` at 2026-10-08T03:29:54.506Z; `fixture` at 03:29:55.013Z with one durable/memory record and owner match; `logout-pending` at 03:29:55.025Z; `failed` / FAIL at 03:29:55.047Z. **The required `logout-completed` checkpoint is missing.** The old failure row used synthetic empty defaults, so its zero counts and cleanup=false are not observations of failed native cleanup. The screen's generic BLOCKED heading follows the caught failure; no scenario 2 or C deletion occurred.

The old journal does not retain the failed witness subproperty or callback error. Existing isolated backend logs contain no incident detail; automatic native inspector reads fail even with the phone open. A read-only history view now displays the validated sanitized journal on the test screen; the user supplied it without rerunning a scenario. The separate historical DevTools incident remains INCONCLUSIVE and was not reinvestigated.

**Classification B is the most likely cause: a reproduced harness/checkpoint timing bug; no product logout/cache bug is established.** A focused test using the existing placement queue reproduces a second sign-out-observer scope cleanup before the witness inspection: `storageReady=false`, `cleanupResult=null`, pending erasure >0. The old witness required immediate quiescence and swallowed its failed assertion before `finish(1)` failed on the missing checkpoint. These exact properties are observed in the regression reproduction, not retrospectively proven on the phone.

The test-only Scenario-1 witness now waits at most 100 polls (25ms pauses on device) for clean native state while still inside the original logout completion callback. It never upgrades a false erasure return, and never creates a witness from startup. Persistent non-quiescence still FAILs. Allowlisted `failedChecks` names and the real failed snapshot metadata preserve failed properties; private errors/payloads remain excluded. The device adapter also waits for React auth state to actually become signed out, rather than treating a stale signed-in render as settled. Product auth/logout, placement cleanup and backend/provider behavior are unchanged.

One explicit retry is prepared, **not triggered**. Tap **Rerun Scenario 1 once — stop after Scenario 1** on the isolated 8108 test screen. Saved test access handles A sign-in automatically if still valid; no DevTools commands are required. A terminal failure of original scenario 1 with no later scenarios is required. The retry uses separate sanitized key `petalpal_native_security_test_harness_scenario1_retry_v1`; original history is retained. A terminal retry is never reset or repeated automatically. Safe in-progress resume uses the same witness rules. Scenario-1 PASS in this mode is terminal: no scenario-2 checkpoint/action can start, C is untouched, and future scenarios require a separate instruction. If saved access is unavailable, stop at BLOCKED; do not restart services, clear journals or sign in elsewhere to force continuation.

Seven directly relevant Scenario-1/witness/checkpoint tests PASS: observer queue timing, false erasure, stalled cleanup/safe failure labels, Scenario-1-only terminal resume, startup false-PASS prevention, failed witness storage and one-shot logout provenance. No broad suite or previous seven-scenario sequencing run was repeated. Changed-scope TypeScript and diff checks PASS. Actual fixed-phone verification is pending the one button tap; the original automated attempt remains FAIL, with no security acceptance/count upgrade. No C/A/B deletion, production access, backend/service restart, staging/commit/push or stash/ref change.


### Scenario-1 rerun readiness after isolated restoration — 2026-10-07

The user confirms isolated 8108 is open and idle. Read-only live HTTPS health and anonymous private-session rejection PASS at `https://standings-origins-pct-ticket.trycloudflare.com`; Expo 8108 manifest access PASS. Current phone-facing project is `exp://206.12.136.139:8108`. No scenario was triggered.

**Scenario-1-only rerun readiness: BLOCKED by resume authorization recovery.** The restored backend initializes a new in-memory capability map; authorizations issued by its previous process are invalid. The current device adapter prefers an existing SecureStore capability and throws on its rejected session request, without renewing through exact A authentication. The idle terminal-history screen does not bootstrap access. This is a deterministic access-lifecycle limitation identified from the restart and current code; no phone credential request or native rerun was used to reproduce it. Renewed exact-A authorization is necessary before a one-button retry can safely proceed. Do not clear diagnostic history, expose credentials in Metro, or treat startup cleanup as the missing logout witness.

The corrected Scenario-1-only engine still stops after 1 and retains its original pre-restart-witness rules. Historical DevTools outcome remains INCONCLUSIVE; original automated failure remains FAIL; fixed-phone acceptance remains pending. A/B/C and production are unchanged; scenarios 2–7 remain unstarted. No application-code change, service restart, broad test, account mutation, commit/push or canonical security status/count change occurred in this readiness check.

### Explicit exact-A renewal for the one Scenario-1 retry — 2026-10-07

**Renewal PASS; corrected Scenario-1-only retry ready, not executed.** This supersedes the preceding access-readiness blocker only. The agent authenticated the designated saved A from the existing owner-only, ignored credential file against the isolated Firebase project. The running 3108 bridge independently verified exact A against Firebase and the isolated database. The awake physical 8108 runtime then validated the scoped HTTPS source and original failed/untouched-retry journals, persisted its new grant in SecureStore, read it back, and returned a sanitized readiness acknowledgement. No product login/logout, fixture, deletion or scenario was triggered by renewal.

The explicit operator renewal command is `node scripts/native-security-renew-scenario1.mjs https://standings-origins-pct-ticket.trycloudflare.com`. Keep this helper running alongside the existing services. It adds a loopback-only companion relay on **3118**, currently `https://worth-contributions-knock-floors.trycloudflare.com`; 3108, its existing HTTPS tunnel and Metro 8108 were not restarted. A future explicit renewal may produce a different companion URL, which is handed to the phone automatically. This command requires the isolated phone foreground/awake; it never starts a scenario or renews silently after a backend restart. The Mac checks the new relay through Cloudflare's DNS resolver because its system resolver returned ENOTFOUND; original-hostname TLS verification remains enabled, system DNS is unchanged, and the native handoff independently verified the phone's HTTPS access.

The companion accepts no identity/scenario parameters or deletion/general proxy requests. It exposes credentials for exact A only, grants scope `[1]` for at most 15 minutes, and revalidates the running backend's process-local authorization and exact environment/project/database on each authenticated request. Backend restart, expiry, revoked access or changed isolation fail closed; a new explicit renewal is required. The broader upstream bridge capability stays in Mac RAM. B/C credentials are never delivered by the companion. Neither credentials nor grants are placed in Metro environment values, bundle source or diagnostic history.

The helper activates the native debugger/runtime domains automatically, without manual DevTools commands. A one-use NaCl encrypted handoff carries only public key, nonce and ciphertext over the inspector. Native cryptographic randomness comes from Expo Crypto; decrypted access is stored only under the separate SecureStore key `petalpal_native_security_test_scenario1_authorization_v1`. Legacy inspector Promise handles are not treated as completion: the helper polls only a sanitized completion acknowledgement, issued after live boundary validation and SecureStore readback. A failed/incomplete handoff cannot declare readiness.

**Single phone action: tap “Rerun Scenario 1 once — stop after Scenario 1”.** Its adapter accepts only A and blocks later-scenario/deletion paths; the engine stops after 1, retains the separate retry journal, and revokes/removes scoped access at a terminal outcome. The required `logout-completed` witness must still be persisted inside the original logout callback before any restart. Startup erasure cannot substitute for that evidence; incomplete evidence stops without automatic retry.

Fifteen unique directly relevant tests PASS: five scoped backend authorization tests, nine native authorization/encrypted-handoff tests and the existing Scenario-1-only terminal-resume regression. Changed-scope TypeScript and helper/library syntax checks PASS. No broad tests were repeated. Historical DevTools INCONCLUSIVE and original automated FAIL remain preserved; corrected native acceptance is still pending. Scenarios 2–7 have not started, C and production are untouched, normal product auth semantics are unchanged, and canonical security statuses/counts are unchanged. MANUAL_SECURITY_CHECKLIST.md is unchanged because no manual/provider configuration or acceptance status changed. No commit/push.

### Reported retry failure: persisted-history provenance — 2026-10-07

The user reports a failed Scenario-1 retry with multiple saved phases. Automatic read-only inspection of the awake isolated Hermes runtime finds **no retry key or retry checkpoints** under `petalpal_native_security_test_harness_scenario1_retry_v1`. The original key remains present and validates as: `ready` 2026-10-08T03:29:54.506Z → `fixture` 03:29:55.013Z → `logout-pending` 03:29:55.025Z → `failed` / FAIL 03:29:55.047Z. The mounted screen's displayed final timestamp/code exactly match that original history. Its `logout-completed` and `pass` checkpoints remain absent. This is the earlier automated attempt, not a newly persisted retry result; its synthetic failure counts cannot identify a new cleanup failure. The historical DevTools incident was not reinvestigated.

The current native grant exists and its read-only scoped status returns HTTP 200 with exact isolated project/database/backend and scope `[1]`; mounted auth is signed out. These current checks do not establish authorization or auth state at the earlier button press. **Confirmed classification C: checkpoint/reporting evidence gap; underlying preparation failure remains F / insufficient evidence.** The device adapter previously awaited auth settlement and scoped authorization before entering the retry engine, which wrote its first `ready`. Either preparation rejection therefore left no retry checkpoint, while the screen's caught-error heading continued displaying the original FAIL. The failed preparation step/error was not retained. No new product logout/cache defect is established, nor can a new logout execution be certified from this stored evidence.

Only the test harness is corrected: auth settlement/authorization now run inside the engine after its durable `ready`. Preparation rejection persists a BLOCKED row with allowlisted `preparationFailure` of `auth-settled` or `scenario1-authorization`; raw SDK/adapter errors stay excluded. No fixture, product login/logout or later scenario follows failed preparation. Existing logout witnesses and completed-witness resume rules remain intact. Terminal retry results cannot reauthorize or automatically retry. This fix does not reconstruct the missing historical failure.

Six directly affected Scenario-1 tests and changed-scope TypeScript PASS, including both preparation failures, sanitized field validation, no product actions after failure, terminal idempotence, witnessed resume and existing logout-witness timing/failure checks. No scenario, authorization renewal, account deletion, service restart or broad test was performed. No further phone rerun is prepared or requested while the underlying preparation failure remains unidentified. C, production, historical evidence and canonical statuses/counts are unchanged; MANUAL_SECURITY_CHECKLIST.md is unchanged. No commit/push.

### Current identified Scenario-1 attempt — 2026-10-07

**Generation 1 prepared on the real isolated iPhone; no scenario executed.** Non-secret attempt ID: `s1-dcd05ab770d85d4748202cd9d7232518`. Its own persisted journal currently contains only `preparing → ready`. This supersedes the earlier retry-button workflow and readiness instructions, while preserving every earlier result. The original four-row FAIL journal and legacy retry key are not cleared or rewritten. The new index `petalpal_native_security_test_attempts_v2` explicitly marks legacy evidence `historical-superseded`, selects the current ID/generation, and retains references to any later superseded generations. Each identified journal has a separate ID-derived key; every row must carry the same non-secret attempt ID.

The isolated screen reads only the selected generation and labels older evidence historical. It never falls back to the original FAIL. A changed selection, mismatched ID, corrupt index or failed read blocks display instead of borrowing history. Append-only writes reject stale generations and history replacement; readback confirms persistence. Delayed reads cannot replace a newer selection. Preparation resets only in-memory test witness/fault/hold/controller state; it does not clear placements, Firebase persistence, product evidence or old journals.

The protected success sequence is `preparing → ready → fixture → logout-pending → logout-completed → verification → pass/PASS`. Failures append this generation's `failed/FAIL` or `blocked/BLOCKED`; auth settlement/authorization failures carry only allowlisted preparation-stage names. Storage failure cannot acknowledge readiness or manufacture evidence. The original logout callback must persist a clean `logout-completed` witness before verification. Startup cannot create that witness; missing-phase recovery remains blocked even when startup has erased the cache. Loading/remounting the screen never runs or resumes a scenario automatically.

**Single phone action: tap “Run this Scenario 1 attempt once”.** The button is available only for the current prepared generation and becomes one-use execution state. The identified engine rejects the all-scenarios entry point; the device adapter permits only A and rejects C deletion. The old all-scenarios adapter also refuses execution when an identified attempt is selected. Scenarios 2–7 have no current UI start/continuation path.

Existing backend 3108, main HTTPS `https://standings-origins-pct-ticket.trycloudflare.com`, exact isolated Firebase/database guards and Expo 8108 were reused. The old scoped grant had expired, so only the expired test authorization companion was replaced and exact-A access explicitly renewed through the existing saved-credential/provider/DB mechanism. Current companion: `https://intelligent-discovered-final-travels.trycloudflare.com`. The encrypted native SecureStore acknowledgement and the identified preparation acknowledgement both succeeded. The Scenario-1-only grant retains its 15-minute maximum lifetime and backend-restart invalidation; run-time revalidation still fails closed. No production or normal-service restart/reprovisioning occurred.

Fourteen unique directly relevant tests PASS (nine Scenario-1 engine/witness/preparation tests and five generation/journal tests). Coverage includes complete phase ordering, mixed-generation rejection, stale result/read isolation, append-only evidence, preparation failure, native write acknowledgement, terminal idempotence, no product actions during preparation, Scenario-1-only limits and startup false-PASS prevention. Targeted TypeScript PASS. No broad tests, physical scenario, C deletion, canonical status/count change, commit or push. Historical manual INCONCLUSIVE and original automated FAIL remain unchanged; this preparation is not native logout acceptance. MANUAL_SECURITY_CHECKLIST.md is unchanged because no manual/provider acceptance or configuration status changed.

### Generation-1 Scenario 1 physical PASS and authorized continuation — 2026-10-07

**Scenario 1 persisted evidence VERIFIED PASS.** The user-observed real-iPhone PASS is independently confirmed from generation 1 (`s1-dcd05ab770d85d4748202cd9d7232518`). UTC checkpoints: preparing 2026-10-08T04:30:24.041Z; ready 04:30:25.094Z; fixture 04:39:18.571Z; logout-pending 04:39:18.585Z; logout-completed 04:39:18.647Z; verification 04:39:18.653Z; pass/PASS 04:39:18.659Z. Fixture has exactly one durable and one memory record. The persisted logout witness, verification and PASS have zero durable/memory records, no cache present, expected-owner match, cleanup completed and fault unarmed. Only the original logout callback can write the witness; startup cannot create it, and the identified UI did not resume/repeat Scenario 1. The original INCONCLUSIVE/FAIL attempts remain historical/superseded and unchanged.

The user now authorizes sequential scenarios 2–7, including normal product deletion of **only exact disposable isolated C**. A/B and production remain protected. The continuation uses a separate record keyed by the verified source attempt, retaining a byte-equivalent copy of its seven source checkpoints without modifying the original journal. It requires a separate encrypted native grant for the existing isolated bridge, independently verified saved A/provider/DB identities, and explicit persisted activation. It cannot execute Scenario 1. On planned reload or reopening 8108, only an already activated, nonterminal continuation resumes. Missing logout/deletion evidence, failed authorization, FAIL or BLOCKED stops later work without destructive retry. C absence is accepted only with the proper prior local witness; A/B cannot substitute for C.

The bounded logout-witness quiescence check and allowlisted failure metadata now also apply to scenarios 2–6 because they use the same sign-out-observer cleanup queue. Product cleanup semantics are unchanged. Fourteen directly relevant continuation/witness/deletion/reload/failure-injection tests, targeted TypeScript and helper syntax PASS. No broad tests were run. At this entry, continuation authorization/activation is still blocked by an unresponsive native inspector connection; scenarios 2–7 have not started and C remains untouched. No scenario-1 rerun, production change, commit/push or canonical status/count change. MANUAL_SECURITY_CHECKLIST.md records the genuine new physical Scenario-1 acceptance.

### Dedicated iPhone development build and XCUITest preparation — 2026-10-07

**Historical abandoned experiment.** Retained evidence only: do not run the commands in this section. Finalization removed these experiment-only sources and generated build files; the successful Expo Go workflow above is current.

**Infrastructure prepared; physical acceptance BLOCKED by missing Xcode. No scenario executed.** This is the proposed replacement for recurring Expo Go/inspector authorization. Scenario 1's verified original generation-1 PASS and all superseded evidence remain accepted and untouched. Scenarios 2–7 remain NOT STARTED; C is untouched. Creating an Xcode project is not a successful iPhone build, launch or runtime security result.

The installed SDK-compatible `expo-dev-client`, conditional `app.config.js` and `withNativeSecurityIOS.cjs` produce the dedicated Debug app `dev.petalpal.nativeSecurityTest`, generated `mobile/ios/PetalPalNativeSecurity.xcodeproj`, UI-test target `PetalPalNativeSecurityUITests` and shared `NativeSecurity` scheme. Normal app config and ordinary package scripts are preserved. Release automation is rejected. No EAS/App Store submission, Apple team selection, provider changes or signing operation has occurred. The supported SDK 57 prerequisites are documented in the [Expo versioned reference](https://docs.expo.dev/versions/v57.0.0/); development-client configuration follows [Expo DevClient](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/).

The binary pins the exact isolated environment, Firebase project, database and HTTPS origin in its native configuration. Bootstrap rejects a swapped normal/production Metro bundle before Router/AuthProvider/Firebase initialization. Live bridge responses must independently confirm the isolated database and saved provider/DB identities. A tunnel-origin change requires a new isolated prebuild and physical readiness check; there is no production fallback. Dedicated Metro uses **8109** so Expo Go **8108** and its original evidence remain available. Existing backend 3108, its protected HTTPS tunnel, normal services and recovery stash were not restarted or modified.

**One-time prerequisites:** install Xcode **26.4 or later**, open it to install the iOS platform and select its Command Line Tools in Xcode Settings → Locations; install CocoaPods if unavailable. Connect/unlock exactly one iPhone, trust this Mac and enable Developer Mode if iOS requests it. Open the generated Xcode project and select your existing signing team for the dedicated app if necessary. The operator can preserve that explicit selection in owner-only ignored `mobile/.env.native-security-ios.local` (`NATIVE_SECURITY_IOS_TEAM`); it never invents a team or changes Apple account configuration. Signing/provisioning errors remain blocking and may require completing Xcode's signing setup. No device/team identifier or credential needs to be pasted into chat.

From the repository root, the next command is **readiness only**:

```sh
node scripts/native-security-ios.mjs readiness https://standings-origins-pct-ticket.trycloudflare.com
```

It prebuilds only the marked isolated generated project, installs Pods, builds the real UI-test target, selects the single paired Developer Mode iPhone, launches the dedicated app and validates the harness. The UI test transfers the **existing** sanitized accepted Scenario-1 report from the currently open isolated Expo Go screen if the dedicated sandbox is empty. This is an explicit copy with stored `expo-go-physical-generation-1` provenance, not a new dev-client PASS. Strict source-ID, final timestamp, sequence and schema checks apply; conflicting destination evidence is never overwritten. Historical originals remain in Expo Go. If original evidence is unavailable, the import blocks; it never reconstructs rows from documentation or reruns Scenario 1. The one-time Expo Go bundle-ID/navigation path is implemented but not yet physically validated.

Readiness authenticates saved exact A through the existing ignored local account file and isolated provider/backend bridge. It performs a non-destructive A login, confirms exact provider/DB/placement owner linkage, revokes access, terminates/relaunches the app and compares the persisted source evidence. It cannot prepare/rerun Scenario 1, activate a continuation, create scenario fixtures, log out, delete C or run scenarios 2–7. Relaunching in readiness mode never auto-resumes an active continuation.

No plaintext email, password, UID or bearer is passed to XCTest, child process arguments/environments, logs or UI fields. XCTest observes a one-use native public key; the Mac process accepts it only from its own test-output pipe and encrypts the authorization with the existing NaCl handoff. A temporary loopback **3128** / HTTPS relay serves only ciphertext for that public key, never credential responses or arbitrary proxy requests. UI fields contain only sanitized source JSON or ciphertext. Saved A/B/C credentials remain in the existing local/bridge mechanism and native RAM; continuation access uses existing SecureStore. Native network inspection is disabled, automatic test attachments are set to `keepNever`, and raw subprocess output is suppressed. Physical Xcode artifact behavior still needs validation; these controls are not an assertion that an unperformed device run passed.

**Future scenarios 2–7 command — do not run until physical readiness PASS and explicit execution authorization:**

```sh
node scripts/native-security-ios.mjs run-remaining https://standings-origins-pct-ticket.trycloudflare.com
```

This requires the readiness receipt for the same origin and unchanged scoped automation sources, plus built test products. It uses `testContinue`, a separate explicit launch mode, and the existing resumable continuation engine. Scenario 1 controls are unavailable in the dedicated binary. Normal C-only deletion and exact A/B preservation rules remain in force; the driver does not implement another deletion path. Existing terminal FAIL/BLOCKED stops, unknown/missing witness evidence blocks, and absence of C never substitutes A/B. The driver can relaunch the app up to three times after termination; only the persisted engine decides whether a phase can resume. Temporary loss of Metro/backend can still block progress—no continuous DevTools connection is needed, but this remains a development build requiring Metro. It is not an offline release build.

Validated final/failure journals are written to ignored owner-only `mobile/.native-security-ios/sanitized-journal.json`; only allowlisted result summaries reach the terminal. Readiness receipts and generated build products are ignored. The operator stops only its own dedicated Metro/temporary relay and revokes its capability when it exits. A failed run retains on-device evidence and does not automatically rerun destructive work. Reopening under the automation driver follows existing witness/restart rules; startup cache erasure cannot manufacture PASS. Do not clear evidence, recreate C or reuse a stale receipt to bypass a blocker.

Verification in this preparation: **13 focused tests PASS** (build/runtime mismatch denial; normal config preservation; strict/idempotent/interrupted source transfer; exact-A readiness without scenario access; mode/tamper rejection and revocation; generated target/dependencies/attachment policy; existing continuation source/append-only checks). Targeted TypeScript, Swift **parse-only**, Node syntax and Expo iOS project generation PASS. The actual readiness command returns `BLOCKED / xcode-required` before authentication or device actions. Only Apple Command Line Tools is selected, Xcode is absent from Applications, `xcodebuild` cannot build and `devicectl` is unavailable; CocoaPods is also not on PATH. No compile, physical launch, native credential entry, UI navigation or real relaunch has been claimed. Physical readiness and future one-command execution remain unverified. SECURITY canonical statuses/counts and MANUAL provider/device acceptance are unchanged; no commit/push.

### Expo Go continuation and bounded reload recovery — 2026-10-07

The user explicitly retains Expo Go/on-device resumable verification; the preceding dedicated-build proposal is deferred. Scenario 1 is not rerun. Persisted physical checkpoints verify Scenario 2 PASS at 2026-10-08T06:19:13.698Z, Scenario 3 PASS at 06:19:15.762Z and Scenario 4 PASS at 06:19:16.901Z. Scenario 2 includes delete-pending, clean logout-completed and remote-deleted before PASS. Independent isolated provider/database checks confirm C absent in both, with A/B present in both. C must not be recreated or deleted again.

Original Scenario 5 retained ready → fixture → logout-pending → logout-completed → reload-requested (06:19:18.089Z) → BLOCKED (06:24:08.961Z), after isolated services restarted and invalidated the prior authorization/origin. This is not accepted reload evidence or a confirmed product cleanup defect. The original continuation is preserved unchanged. A separate `:reload-recovery-v1` journal copies only verified completed scenarios 1–4 and starts a fresh, nondestructive Scenario 5, followed only on success by 6–7. Recovery authorization verifies saved exact A, A/B existence and C absence in both isolated stores; it cannot repeat deletion.

The test-only reload observation is armed before requesting reload, then durably captures the first subsequent runtime's placement-key count before startup erasure. That observation is immutable across later startups. Missing, same-runtime, dirty or failed-to-persist evidence cannot pass; startup cleanup cannot replace it with a later clean observation. Product logout semantics remain unchanged. Thirteen directly relevant recovery/observation/reload tests and targeted TypeScript/helper syntax checks PASS.

Existing isolated backend 3108 and Expo 8108 were restored without provisioning or restarting Docker/normal services. Current protected HTTPS is `https://campus-nurses-pmc-ecological.trycloudflare.com`; phone URL remains `exp://206.12.136.139:8108`. Exact isolated Firebase/database checks passed. The new 5–7 grant was accepted and recovery activated once. After its connection dropped, the reopened runtime reports missing native `ExpoAsset`; Expo Constants/Crypto are also unavailable and bootstrap cannot load the harness. No recovery result can yet be read. A full Expo Go close/reopen is requested solely to restore native modules and read/resume existing checkpoints; no Run/Continue action is requested. Scenarios 6–7 remain unverified. Historical evidence, canonical counts, production and recovery stash are unchanged.

### Expo Go continuation completed — 2026-10-07

**All seven scoped physical-iPhone runtime scenarios now have accepted persisted PASS evidence.** After fully closing/reopening Expo Go, the existing active recovery resumed automatically; no Run/Continue tap, account switching, Scenario-1 rerun or repeated C deletion occurred. Missing ExpoAsset was a bootstrap/runtime obstacle; no product cache defect was established.

Recovery Scenario 5 retained ready 2026-10-08T06:29:00.972Z → fixture 06:30:10.526Z → logout-pending 06:30:10.539Z → clean logout-completed 06:30:10.610Z → reload-requested 06:30:10.618Z → PASS 06:32:31.817Z. Independent read-only `reloadObservationPassed()` returned true: the first subsequent startup's durable pre-cleanup observation was zero. Startup cleanup therefore does not supply the logout witness or erase a dirty first observation to manufacture PASS. The original blocked Scenario-5 journal remains preserved separately.

Scenario 6 PASS at 06:32:33.416Z: its fixture and original clean logout witness both retain the global preference, then the harness removes its test preference and records preference-removed before PASS. Scenario 7 PASS at 06:32:35.270Z: ready → fixture → logout-pending → failure-observed → failure-safe → recovered → PASS. Final native read confirms failureArmed null, writeHeld false, zero namespace/scoped/memory records, no active owner, storageReady true, pendingErasureCount zero and cleanupResult true.

Final independent isolated provider/database checks confirm A/B present in both and C absent in both. No production was accessed. No further phone action or scenario execution is needed; terminal PASS prevents automatic replay even though the saved activation flag remains historical true. Services remain running. Thirteen directly relevant tests and scoped type/syntax checks passed for the recovery changes; no broad tests. MOBILE.md, SECURITY.md and the genuine device/provider checklist are updated. DELTA-P2-2 stays PARTIAL for credential-store/backup and production-release limitations; canonical counts are unchanged. No commit/push or recovery-stash modification.

### Final security commit preparation — 2026-10-07

Removed only the abandoned dedicated iOS config/plugin/native source/UI-test driver/test, bootstrap and dormant adapter/UI branches, generated marked iOS project and expo-dev-client dependency/lock entries. Successful Expo Go runtime code, encrypted authorization, isolated guards and all historical journals/documentation are retained. Final focused native-security regression run: **84 tests PASS**; scoped TypeScript: zero diagnostics; relevant Node syntax and diff checks PASS. The seven phone scenarios were not repeated. Canonical status/counts are unchanged. Remaining native/platform follow-up: Firebase SDK credential-store/backup policy and production-release artifact verification. Unrelated files, recovery stash and the malformed main reference were preserved.

### Firebase credential / backup operational boundary — 2026-10-07

The current iPhone path uses Firebase JS with AsyncStorage, not Keychain-backed Firebase Auth. SDK-owned serialized ID/refresh tokens must never be dumped through diagnostics, copied into chat, or manually deleted by an app cleanup tool. The separate native-security SecureStore grant is not Firebase's production credential store. Normal awaited Firebase signOut removes current logical auth persistence on success; it does not erase earlier backups or globally revoke refresh sessions. Treat failed sign-out/storage removal as incomplete, not durable credential erasure.

AsyncStorage 2.2.0 requests iOS backup exclusion by default; this intent is not proof of effective Expo Go or release backup behavior. Do not rely on exclusion for confidentiality or assume new-device transfer requires login. Use encrypted local backups if a backup is intentionally made; restrict/delete historical copies through the backup owner's controls. No backup, migration or provider action was performed here. Before release acceptance, inspect the intended artifact's effective native exclusion/file attributes and verify only isolated backup/restore status; never collect a full backup/auth record as routine evidence. Expo Go's host settings and the accepted 7/7 cache scenarios cannot certify a standalone release. See SECURITY.md's credential review; no Xcode experiment or phone scenario is reopened.


### Account deletion recent-login requirement — 2026-10-08

Backend `DELETE /users/:id` now requires the verified Firebase sign-in `auth_time` to be within five minutes. Stale/missing evidence returns 403 `auth/requires-recent-login` with explicit sign-out/sign-in instructions; token refresh alone is insufficient. The mobile service propagates this safe error and preserves the current account/session/cache. Callers must sign out and sign in normally, then issue a new deletion request; no automatic retry, password prompt or account deletion is performed on rejection. Prior isolated 7/7 native evidence is preserved; this change authorizes no phone scenario or C deletion rerun.

## Journal history pagination — 2026-10-08

Bookhouse now requests `/users/:userId/journals?view=page&limit=50` and follows owner-scoped cursors before publishing the complete history array. Existing year/month/day navigation and refresh retain access to older entries. Refresh/unfocus cancels superseded page loads; a later-page failure keeps the existing retry UI rather than publishing partial history. If a cursor anchor was removed, retry starts from page one. No credentials or cursors are persisted by this service.

Approved rollout should add server page support before updating clients. Requests without `view=page` retain their legacy complete-array response, and Bookhouse accepts an older server's initial complete array without truncation. That fallback and the legacy route remain unbounded; this is not full privacy-enumeration remediation. These changes are locally tested, NOT deployed or verified on a physical device; no Expo/provider/build configuration changed.


## Message refresh safety — 2026-10-08

Native and Expo web Flower detail now replace known server messages after a successful complete detail GET. An empty message array clears removed server records, including messages removed by their author's account deletion in other Gardens; an absent/non-array field is not treated as an authoritative empty list. Pending local sends and arrivals since GET began survive an overlapping response. Failed refresh retains existing data and the current error/retry UX. Superseded responses cannot restore old detail; switching account or Garden owner clears the selected detail and invalidates pending detail actions. Bookhouse Flower History continues to use its direct complete-response replacement.

This is local refresh safety, not immediate deletion propagation or a cross-request snapshot. A later complete refresh is still needed to remove an already-received record deleted on the server; realtime payload arrival order is not versioned. No pagination, additional request, rendering/Flower-order change, provider setting or manual setup is introduced. Message revision/pagination remains blocked as recorded in SECURITY.md.


## Voice upload admission — 2026-10-08

The backend admits one transcription at a time per signed-in owner and four per process. A concurrent owner request returns 429; process saturation returns 503, with retry/type guidance and Retry-After: 1. The existing voice error flow can retry manually or use typed Event input; no automatic retry is added. Upload processing must finish within 30 seconds; disconnect cancels provider fetch without replaying/refunding an already reserved AI call. Successful transcript format, recording limits and Garden behavior are unchanged. Local implementation only, not deployed.

## Unified Expo Web release preparation — 2026-10-08

This isolated candidate changes the **production web build**, not the existing 8107/iPhone setup in A–F. Docker now runs `npm ci --ignore-scripts` and `npm run build:web` in `mobile/`, exporting the actual Expo application into the existing Express `client/dist` static boundary. The root `npm run build` and compatibility `npm run build:client` now export Expo with dotenv disabled and replace generated `client/dist` with that export. Install existing root/mobile locked dependencies first and supply approved public `EXPO_PUBLIC_FIREBASE_*` build settings through the build environment; no environment recreation or secret files are needed. Docker retains its existing public build-argument mapping. The old Vite source remains in Git. Do not restart 8107 or reuse its development API overrides for this build.

The builder disables dotenv and telemetry. Its existing **public** `VITE_FIREBASE_API_KEY` build argument is mapped to `EXPO_PUBLIC_FIREBASE_API_KEY` only during export. `firebase.ts` retains the same registered production project/auth-domain/app-id defaults as the legacy web client. No Admin credentials enter the builder. `EXPO_PUBLIC_API_BASE_URL` is deliberately absent: production `apiBaseUrl()` returns the same-origin path, including Socket.IO. The development web port-3000 fallback is eliminated by the production export. No provider configuration was read or changed; the real public key/app association still requires release configuration attestation without exposing its value.

Express serves only allowlisted application shell/deep-link routes without API authentication; AuthGate still prevents unsigned-in content. Every data/write route retains server authentication and owner checks. Private paths remain no-store. Shell CSP permits WebAssembly compilation for same-origin CanvasKit, while JavaScript eval, inline scripts, wildcard origins and framed embedding remain prohibited. Preview/unknown routes do not get the SPA fallback.

Local validation uses synthetic public configuration and fully intercepted identities/data in a fresh browser profile. It proves no production login or account linkage. Existing native login/lifecycle evidence keeps its original scope; no account, database, service, tunnel or Metro instance was recreated.


## 2026-10-09 — Local Cloudflare Expo Web migration candidate

Workers Static Assets now has a local-only deployment profile at
`deploy/cloudflare/wrangler.jsonc`. The real Expo `single` export is built outside
Render by `npm run build:cloudflare`; the manual GitHub workflow retains the
artifact without deploying it. Direct REST/Socket calls use the existing
`EXPO_PUBLIC_API_BASE_URL` contract, compiled to the Render origin. No product
route, rendering setting, art, Firebase provider or native deployment code changed.
The static Worker reuses the product shell allowlist; unknown assets/APIs do not
fall back to HTML. CSP permits Render HTTPS/WSS plus the existing Firebase hosts.

Synthetic export, Cloudflare/workerd delivery, Chromium sign-in screen/deep link,
WASM, cross-origin browser preflight, token refresh/session hydration/logout and
Socket polling/upgrade/reconnect passed. No real Firebase sign-in was attempted.
Garden, Bookhouse and Reflection exported PNGs are byte-identical to source;
prior user visual acceptance remains applicable, objective performance parity
remains PARTIAL. See `docs/cloudflare-web-migration.md` for exact build inputs,
preview protection, origin-scoped Firebase persistence and cutover/rollback gates.
The existing Render frontend path remains intact until separately approved cutover.

### Static-only migration preview — 2026-10-09

Use `deploy/cloudflare/wrangler.preview.jsonc` with the retained synthetic Expo
export for isolated delivery review. `STATIC_PREVIEW_ONLY=1` restricts browser
connections to self and disables frames; real Render/Firebase login is unavailable
in this profile. No mobile source, export rebuild or provider configuration change
is required. Keep the flag enabled through separately approved protected staging;
real-auth preview uses the distinct compatibility/origin gates in
`docs/cloudflare-web-migration.md`. Existing Render login must survive transition
until the Cloudflare replacement and old-origin traffic disposition are approved.

### Synthetic sign-in for isolated web preview — 2026-10-09

The preview config now selects a separate `preview-worker.js` entry point for
`petalpal-expo-synthetic-9a9d57d`. It reuses the unchanged Expo export and provides
browser-only public synthetic sign-in plus empty Garden/Journal fixtures. Use
`preview@example.invalid` / `preview-only` in a fresh browser profile, never real
credentials. A banner identifies this read-only demo; writes, AI and live Socket
functionality are unavailable. Normal Worker/mobile/Firebase setup is unchanged.
`STATIC_PREVIEW_ONLY=1` remains mandatory; follow the latest migration runbook for
separate resource/Access/upload approval. No new hostname or provider setup was
performed. Discard the synthetic browser profile after review.

### Protected synthetic staging available — 2026-10-09

The existing `petalpal-expo-synthetic-9a9d57d` Worker now serves the retained export
at https://petalpal-expo-synthetic-9a9d57d.petalpal-jx.workers.dev/ behind the
human-configured Access policy for `xma38@jastrevia.com` only. After private OTP
login, use public fixture `preview@example.invalid` / `preview-only`. No real
Firebase/API/Socket/DB/AI functionality. Anonymous asset protection PASS; signed-in
Garden confirmation at this edge is pending. Version upload/activation preserved
routing; do not run full deploy with the local URL-off profile. Render/native
setup, artwork and quality settings remain unchanged.

## Garden/Fairy V2 integration

The authenticated `/` Garden now includes Fairy by default, with all V2 terrain,
koi/wakes, lotus contact/ripple effects, floating petals and compatible grading.
The Fairy HUD button focuses the existing character in the same Canvas; legacy
`/garden-test` and `/feature/fairy` links redirect to this unified Garden. There
is no independent Fairy scene. Events, Friends, Profile and Settings retain their
local overlays; Calendar, Bookhouse and other established routes remain available.

Covered/temporarily inactive Gardens pause Fairy in place rather than clearing
its route or contextual state. After Treehouse entry, explicit in-scene controls
open Bookhouse or return Fairy; Bookhouse return preserves the scene and state.
Mailbox also has an in-scene return action. Planting and flower details take tap
priority before Fairy landmarks/destinations. Normal user mode hides developer
status/debug controls. Existing immediate pointer response, 110 world-unit/sec
walking, authored narrow paths, initial camera, free pan and 0.8–3× zoom remain.

The independent V2 full-screen water-material rewrite remains deferred: main's
animated water field and ripple artwork are retained. Koi, lotus and original
vector petals share the established paused water clock. Shore and opaque land
passes share decoded island images; the existing V2 512 MiB texture-cache ceiling,
static-picture rendering, resource cleanup and quality policy are unchanged.

Owner visual review approved unified Fairy and preferred full V2 effects. This
is functional integration acceptance, not formal FPS evidence. Historical
callback-cadence regressions remain unresolved; keep PR #34 Draft and consult
`INTEGRATION_OPTIMIZATION.md` on main for the closed investigations. No new
performance benchmark or optimization experiment was run for this integration.

Synthetic local review uses the normal `/` entry with
`preview@example.invalid` / `preview-only`; no live API/socket or persistent writes.
Export with `node scripts/build-cloudflare-web.mjs --synthetic` and serve through
the existing loopback preview fixture server. This is not a production artifact.

For changed interaction code, run
`node --test mobile/test/fairyInput.test.cjs mobile/test/gardenFairyV2.test.cjs` from repository root. The latter runs
`checkTreehouseEntry.cjs`, `checkMailboxInteraction.cjs` and `checkGardenGround.cjs`
against the actual controller. For changed sampling or static rendering, include
`gardenShoreCoverage.test.cjs`, `gardenStaticPicture.test.cjs` and
`gardenRuntimeResources.test.mjs` from `mobile/test/`.

After intentional terrain/layout/infrastructure geometry changes, use a Python
runtime with NumPy and Pillow to run `python3 scripts/bakeGardenGround.py` from
`mobile/`; review both existing generated ground-mask files. This is local asset generation, not deployment or migration. Preserve historical checkpoint
evidence; missing approved checkpoint files must not be invented as test fixtures.

## App Store candidate — 2026-10-15

Local candidate worktree: `/Users/xingranma/Documents/ChatGPT/jev/petalpal-appstore-release-readiness`, branch `codex/appstore-release-readiness`. Earlier device/Expo Go evidence above remains historical and does not verify this candidate. Do not use earlier production login steps as authorization for this release review.

Production build metadata now comes from owner-verified variables in `mobile/app.config.js`; `mobile/eas.json` defines preview and store profiles. See `docs/release/STORE_SUBMISSION_CHECKLIST.md` for all required names, exact signing/operator steps and acceptance matrix. Missing production metadata fails the build configuration check; no identifiers or URLs were invented. Full Xcode/signing/device acceptance is NOT VERIFIED. The current Expo template icon/splash requires approved PetalPal assets.

## iPhone beta via TestFlight (2026-10-29, branch `feat/ios-beta`, not released)

Guest mode: signed out, the app opens into the Garden with no server reads (local flower placements only); Events, Friends, Me, mailbox, reflections and journal writing ask for an account, whose pages lie over the still-loaded Garden with a "Back to the Garden" link. Native additions: `react-native-view-shot` and `expo-sharing` (Weekly petal-card share image, made on the phone only), `expo-asset` (required peer of `expo-audio`; its absence can crash native builds), and SDK 57 patch alignment (`npx expo-doctor` 21/21). `ios.infoPlist.ITSAppUsesNonExemptEncryption=false`. Owner steps (Apple Developer, App Store Connect app, EAS production environment values, `eas build --platform ios --profile production --auto-submit`, TestFlight testers): [docs/ios/TESTFLIGHT.md](docs/ios/TESTFLIGHT.md). Not yet run on a device or simulator (no Xcode on the development Mac).

## iPhone usability testing on free signing (branch `feat/ios-beta`, not released)

`EXPO_PUBLIC_APP_VARIANT=dev` builds **PetalPal Dev** (`com.jastrevia.petalpal.dev`, scheme `petalpal-dev`), which installs beside the store app and adds a device reset entry; store builds refuse it. `npm run ios:device` and `npm run ios:device:release` read only `.env.ios.development` and `.env.ios.usability-test` (git-ignored) and need Xcode 26.4 or later. Steps and limits: [docs/usability-testing.md](docs/usability-testing.md). Generated-project configuration checked; not yet built on a device.

### Native Garden texture budget (2026-10-30, measured on iPhone 15 Pro, Release, iOS device)

Time Profiler showed the main thread saturated, about 93% of it re-decoding PNGs per frame through `SkImage_Lazy`, because the Garden's textures did not fit the GPU resource cache and were evicted each frame. Raising the limit to 512 MB did not help; 1.5 GB did. `patches/@shopify+react-native-skia+2.6.2.patch` (applied by `postinstall`, patch-package) now sets the limit to a quarter of device memory, clamped to 512 MB–1.5 GB. Idle Garden after the change: main thread about 35% (was about 100%), thermal state Fair (was Serious to Critical), physical footprint about 1.65 GB. Devices with less memory, and movement, pan and zoom frame rates, are not measured; on a smaller budget the re-decoding could return. Upgrading Skia needs the patch reviewed, since a version mismatch makes `npm install` report it. The bundle's images decode to about 1.9 GB in total, so reducing what is drawn at once is the next memory work.

