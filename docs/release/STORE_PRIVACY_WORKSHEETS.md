# Store privacy questionnaires — evidence worksheet, not submitted answers

Owner review required. Final answers must reflect the exact signed binary, enabled services, hosting logs and current console definitions. Treat private emotional writing as sensitive data; do not select “no data collected.” Product/brand: PetalPal/Jastrevia. Legal publisher and support delivery remain unverified.

## Apple App Privacy

| Candidate category | Collection/use evidence | Linked to identity | Tracking / advertising | Operator decision |
|---|---|---|---|---|
| Contact info: email; name | `User`, Firebase registration/session; social profile names | Yes | No advertising/tracking code found in scoped paths; verify all shipped SDKs | Account functionality; verify exact category selections |
| Identifiers: user ID | Firebase UID, User/account IDs, authorization and reports | Yes | Same caveat | App functionality/security |
| User content: other content | Journal/Event text, social messages, reports, memories/reflections in Prisma | Yes | No sale/ads feature identified | App functionality; sensitive emotional content may also need Health category based on definitions |
| Photos or videos | Selected Journal cover is resized and stored owner-only (`journal-cover.js`); no camera capture | Yes | None identified | Photos collected when user selects attachment |
| Audio data | Explicit voice recording to Cloudflare transcription, request-scoped audio | Yes/request-associated | None identified | Determine whether ephemeral processing exception applies; do not assume it |
| Health / sensitive info | Feelings, moods, emotional history may describe health/trauma | Yes | None identified | Conservative classification with owner/legal review; not a medical-product claim |
| Usage / diagnostics | visits, feature/job status, security/cost ledger; host network/error metadata | Potentially | Verify SDK/host telemetry | Check exact SDK privacy manifests and logging settings |
| Location: coarse (builds from release/1.0.1, 2026-11-26) | Optional Garden weather: `expo-location` lowest accuracy, rounded to 0.1° (~11 km) in the app and again on the server; `WeatherLocation` row per user, deleted when turned off or with the account; only the rounded point goes to MET Norway | Yes (stored with the account) | No | App Functionality. Select **Coarse Location** before submitting any build that contains Garden weather; not needed for builds without it |
| Purchases, precise location, contacts, financial info | Not identified in scoped current app paths (precise location blocked: Android `ACCESS_FINE_LOCATION` in `blockedPermissions`, iOS asks only When In Use at lowest accuracy) | N/A | N/A | Verify binary dependencies and monetization before selecting “not collected” |

Privacy purposes likely include App Functionality and security; optional AI personalizes reflections. Do not claim data is unlinked merely because IDs are opaque. “Tracking” is the store-defined cross-company purpose, not all first-party collection; operator must verify absence of ad SDKs/cross-app data combination. Obtain processor contractual protections. Privacy policy URL must resolve publicly and in-app. Inspect merged native privacy manifests and required-reason API declarations after prebuild; JavaScript inspection is insufficient.

## Google Play Data Safety

| Data type to assess | Collected/transmitted path | Optionality | Sharing classification/evidence |
|---|---|---|---|
| Personal info (name/email/user ID) | Firebase/Auth + backend account | Account required for current experience | Firebase/hosting service-provider handling; evaluate current service-provider exception, do not assume all third-party transfers mean “not shared” |
| Health info / other personal info | Emotional content, labels, derived memory | User-authored content; optional AI separately controllable | Cloudflare/Anthropic paths are disclosed and require explicit AI consent |
| Messages / other user-generated content | Flower messages and reports | Social features optional | Other users receive permitted social content; reviewers access minimal reported social content |
| Photos | Journal cover upload | Optional picker | Stored private; no AI photo analysis path found |
| Audio files | Voice transcription | Optional; typing available | Cloudflare; transient local/request handling does not by itself settle questionnaire exclusion |
| App activity / diagnostics / identifiers | visits, logs, audit/reservations, auth identifiers | Security/operation needed | Verify host/SDK collection, retention, and whether device identifiers are collected |

Review encrypted-in-transit after verifying the signed release API origin, HTTPS/WSS and service configuration. Declare account deletion in-app and supply the separately tested external deletion page. Complete deletion questions with actual exceptions, not deactivation. Review Data Safety against all enabled feature flags and providers, including remote configuration changes. No submission or certification has been performed.

## Evidence and unresolved collection questions

Sources: `prisma/schema.prisma`, `lib/auth.js`, `lib/ai-disclosure.js`, `lib/ai-consent.js`, `lib/ai-cost-gate.js`, `lib/security-log.js`, `lib/security-events.js`, `lib/journal-cover.js`, `lib/speech-transcription.js`, `lib/embedding-provider.js`, `lib/report-narrative.js`, `mobile/src/services/firebase.ts`, `mobile/src/services/auth.tsx`, `mobile/src/components/garden/planting/plantingPersistence.ts`, package lockfiles and deployment docs. Firebase persistence uses AsyncStorage on native and Firebase browser persistence on web. No cookie/analytics blanket claim is made: audit the actual released Firebase/hosting setup and all native SDK manifests.

Owner must establish: exact Firebase and hosting regions; PostgreSQL operator/backup retention; Cloudflare/Gateway logging and account retention settings; Anthropic contract/subprocessors; any crash analytics added in release; age/market eligibility; retention/purge schedule; publisher identity; working policy/support/deletion URLs. Never paste production keys, account data or private logs into this worksheet.
