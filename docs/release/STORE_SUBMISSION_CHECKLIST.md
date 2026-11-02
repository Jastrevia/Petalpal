# Store submission and native acceptance — owner/operator draft

Status: NOT READY for submission. Nothing in this checklist authorizes publishing, production changes, paid builds, uploads or account creation. Current source candidate is on `codex/appstore-release-readiness`; see the central readiness report for exact evidence. Historical Expo Go testing in MOBILE.md is preserved and does not verify this release.

## Build identity and configuration

1. Confirm the verified Apple Developer account holder and App Store Connect seller. Use [LEGAL PUBLISHER NAME — OWNER CONFIRMATION REQUIRED] in drafts until confirmed. Jastrevia is the brand; JX Technology Inc. is an unverified internal company name. Confirm Google Play developer identity too.
2. Reserve/confirm the existing or new iOS bundle ID and Android package in those accounts. Do not invent them. The existing Expo project owner `jeanc66`, project ID in app.json, slug `mobile` and URL scheme `mobile` are historical settings, not proof of ownership. Verify access and callback conflicts before using them; changing them requires coordination with the actual auth flow.
3. `mobile/app.config.js` reads `PETALPAL_IOS_BUNDLE_ID`, `PETALPAL_ANDROID_PACKAGE`, `PETALPAL_IOS_BUILD_NUMBER`, `PETALPAL_ANDROID_VERSION_CODE`. Marketing version is currently 1.0.0: confirm whether it is appropriate and choose unused, increasing build numbers. iPhone is the current target (`supportsTablet:false`); explicitly decide and test iPad before adding tablet support.
4. Production EAS profile requires `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_DELETION_URL`, `EXPO_PUBLIC_SUPPORT_URL`, and four public Firebase client fields: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`. Enter only owner-verified values in the approved build environment. Public client fields are embedded; never put server keys/tokens/database URLs into EXPO_PUBLIC variables. Build validation checks syntax and missing values; it cannot prove account ownership, DNS, URL content or provider availability.
5. Verify Firebase email/password and verification flows, authorized web domains/action-link destination, native token persistence and callbacks on the signed build. Check HTTPS API and WSS Socket.IO availability, approved web CORS origins and backend Firebase audience/project alignment. No live settings were inspected/changed in this task.
6. Production EAS settings use store distribution and Android app-bundle; preview uses internal distribution/APK. No submit profile is configured. After separate authorization, an operator with installed EAS CLI and signing access runs `eas build --platform ios --profile production --local` from mobile (full supported Xcode, CocoaPods and SDK required), or approves a cloud build. Android equivalent: `eas build --platform android --profile production --local` with JDK/SDK/NDK and approved signing. Cloud build may cost money; neither path was run here.

As of the 2026-10-15 source check, [Apple requires Xcode 26+ and iOS 26 SDK+](https://developer.apple.com/news/upcoming-requirements/). [Google requires target API 36+ for new phone apps/updates](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en). Verify the generated archive/AAB, not only the Expo SDK label; recheck official rules at submission. This machine has Command Line Tools but no full Xcode, so signed archive/signing verification is NOT VERIFIED. No Android signed AAB is verified either.

## Native acceptance matrix — all unchecked for this candidate

Use separately authorized disposable test identities, an isolated service/database and synthetic content. Disable paid AI unless the operator explicitly approves a bounded test. Record device/OS/build/version, result and issue reference without private entries or credentials.

| Area | Exact acceptance action |
|---|---|
| Startup/auth | Cold launch and process restore; register/verify with authorized test identity; login; wrong password/network loss; expired token; logout/account switch without stale content. |
| Core navigation | Garden, Fairy, Journal, Events, Friends, Bookhouse, Reflection, Settings; back navigation, deep links, keyboard and scroll behavior. |
| Social safety | A/B/C: report profile/message, deduplicate, block from profile/message, lose visit/socket access, third-party Garden filtering, unblock from paginated list, no automatic friendship restoration. Moderator removes message and restricts/restores account. |
| Publication | New and existing users explicitly accept current Guidelines; disallowed profile/message gets actionable rejection and creates no message/visit/notification. Help-seeking remains allowed. |
| AI controls | Defaults off; read actual processor/configuration status; explicit save; withdrawal works including disclosure error; disabled providers do not claim successful AI; report Emotion/Reflection without private text; changing account clears screen state. |
| Journal/privacy | Owner-only text/photos; chosen photo picker/cancel/denial; no Journal in Event memories/reflections. Denied microphone preserves typing; consent is checked before recording and before dispatch. |
| Deletion | Recent sign-in required; cancel; confirm; relational/vector cleanup; logout/cache cleanup; restart empty; simulated Firebase outage shows pending and operator completes durable retry; old identity cannot recreate profile. |
| Network/failure | Offline launch/write/retry; slow response followed by logout; unavailable policy link; unavailable API/AI; no fabricated success or duplicate Event writes. |
| Accessibility/layout | VoiceOver/TalkBack names/order/actions; larger text; small and large iPhones; light/dark theme; keyboard-safe dialogs, color contrast; Android low-memory/representative devices. |
| Performance | Garden/Fairy animation, background/foreground, sustained navigation; native memory/crash profiling with synthetic data; inspect excessive texture allocations and cold start. No native performance claim from JS export. |
| Packaging | Inspect actual Info.plist, entitlements, privacy manifests and required-reason APIs; merged Android permissions/target SDK; microphone/photos only as needed, camera/background recording disabled; no dev/debug routes, test hooks, source maps, secrets or fixture configuration in distributable. |

## Assets and publication

- Replace the inspected blue Expo template icon, iOS `assets/expo.icon`, Android adaptive icons, splash and favicon with owner-approved PetalPal artwork. Check all platform sizes/masks and light/dark rendering. Current template assets block final branding approval.
- Complete `AUDIENCE_PERMISSIONS_RIGHTS.md`: intended minimum age, launch regions, age questionnaires, Health apps declaration applicability and rights for artwork/fonts/audio/packages. No claim of children's privacy compliance. No exact age rating is guessed.
- Review `POLICY_DRAFTS.md` and settle legal identity, retention limits, providers/contracts/regions and actual data categories. Publish only after separate owner approval. Remove draft placeholders/verification notices only after verification.
- Published 2026-10-22 at https://app.jastrevia.com/legal/ (privacy.html, terms.html, account-deletion.html; [LEGAL_PUBLICATION.md](LEGAL_PUBLICATION.md)); Cloudflare Access must bypass `/legal/*`. Host the deletion HTML and reviewed policies on owner-approved HTTPS URLs. Test without login or app installation, including mobile browsers and email-client absence. Verify contact@jastrevia.com delivery, spam routing and staff access; support address remains proposed until tested.
- Assign moderator and deletion-queue coverage; test the allowlisted moderator workflow on isolated data; set escalation and truthful response expectations. Do not promise continuous monitoring unless staffed.
- Capture final signed-build screenshots with synthetic accounts and no misleading unavailable features. Include accurate permissions/data descriptions and actual review access. Do not reuse Expo Go screenshots as signed-build evidence.

## App Store Connect — submission gates

- Confirm seller, bundle ID, version/build, copyright owner, categories, languages and regional availability; complete applicable trader/business fields with verified facts.
- Complete current age-rating questionnaire, App Privacy using STORE_PRIVACY_WORKSHEETS.md, SDK privacy manifests/required-reason declarations, encryption/export-compliance questions and applicable content rights.
- Set publicly working Privacy Policy and Support URLs. Ensure account deletion and optional AI consent are discoverable in Settings; reviewers must have full authorized feature access.
- Provide dedicated reviewer credentials securely in App Store Connect (never source/docs) and a stable, review-accessible backend. The review account must not contain real private entries. Give clear steps for permission-dependent/disabled features.
- Perform signed-device matrix above, archive validation and crash triage. Upload/TestFlight/submit only after separate approval. No guarantee of approval.

## Review notes draft — replace brackets after verification

PetalPal by Jastrevia is an emotional journaling and reflection app. It does not provide medical diagnosis, treatment, emergency response or continuous crisis monitoring.

Account: [DEDICATED REVIEW ACCOUNT — supplied securely in console]. Verification/access instructions: [VERIFIED STEPS]. Backend: [REVIEW ACCESS CONFIRMED].

Settings contains AI processing & privacy, Community Guidelines, Privacy & support, and Delete Account. Optional AI starts off and requires explicit consent to the disclosed processors. [LIST ACTUALLY ENABLED PROVIDERS/FEATURES]. Typing remains available without microphone permission or voice processing. Private Journal text/photos do not feed Event Memory or reflections; optional voice composition sends audio for transcription as disclosed.

In Friends, open Report / Block user. Flower message details provide Report message and Block user. Choose a reason in the app. Blocked users can be unblocked in Me → Blocked users, which then offers to send a friend request; friendship is not restored automatically. Social text is screened, and reports are reviewed by [VERIFIED COVERAGE]. Settings deletion requires a sign-in within five minutes. An identity-provider failure can leave deletion pending with support recovery; active PetalPal data is already erased.

Public policies/support: [VERIFIED HTTPS LINKS]. Demonstrate social/AI features with [APPROVED SYNTHETIC CONTENT AND REVIEW STEPS]; do not imply unavailable services are active.

## Google Play — additional gates

Verify package/signing ownership, API 36+ target and native library compatibility (including current memory-page requirements), signed AAB/install path, content rating/IARC, target audience, app-access instructions, Data Safety and applicable health declarations. Enter the working external deletion-request URL; it must work after uninstall. Test in-app AI output reporting and social report/block controls. Complete any account-specific testing requirements shown in the verified console. No Play account or submission status was inspected, so none is asserted.
