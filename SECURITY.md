# PetalPal Security

## Sign-in recovery and readable auth errors, 2026-10-26

Owner-reported: accounts from the earliest version could neither sign in (forgotten password) nor
sign up again (Firebase `EMAIL_EXISTS` shown as the generic "We couldn't connect" message), and the
live sign-in page had no working password reset (the link was a preview placeholder).

- **Password reset (new, client only):** "Forgot password?" on the live sign-in page calls Firebase
  `sendPasswordResetEmail`. The reply is identical for every address ("If … has a PetalPal account,
  a link … is on its way"), so the app adds no enumeration signal; with production Email Enumeration
  Protection enabled (user-observed 2026-10-08) Firebase's reset response is also non-disclosing.
- **Sign-up `auth/email-already-in-use` now says the email has an account** (owner decision). This
  does not widen exposure: as recorded under *P1 Account Enumeration — signup follow-up* below,
  Firebase already returns `EMAIL_EXISTS` to any direct sign-up call, so the masked UI message hid
  nothing from an attacker while locking out returning users. Login failures keep one shared message.
- **Backend 4xx reasons are shown** (e.g. verify email, deletion pending, rate limited); 5xx and
  gateway failures keep the general message. Provider diagnostics are still never shown.
- Account Enumeration stays **PARTIAL**; canonical counts unchanged. No backend, provider setting or
  deployment change. Evidence: `mobile/test/authSession.test.mjs` 36/36 PASS, mobile typecheck PASS,
  synthetic Expo web check (reset request sent; duplicate sign-up message shown).

## Fairy Moments captions — default OFF, 2026-10-20

New gateway action `FAIRY_MOMENT` (Haiku 5.5, [lib/haiku-fairy-moment.js](lib/haiku-fairy-moment.js)) writes the
caption of an owner-only Fairy Moment. It is off unless `AI_FAIRY_MOMENT_MODEL=claude-haiku-5-5` and the Anthropic
gateway flags are set, and only for owners on `FAIRY_MOMENTS_OWNER_IDS`. Input is the Fairy's name, place, part of day,
her own mood, the post kind (photo or text-only) and her own five previous captions; no Event, Journal, memory, profile
or other owner content is sent. Because of
that, the cost gate treats it like `EVENT_EMOTION`: AI Processing consent is required, Personalization and Memory are
not (`PROCESSING_ONLY_GATEWAY_ACTIONS` in [lib/ai-cost-gate.js](lib/ai-cost-gate.js)). The authorize policy rechecks
consent and Moment ownership under row locks. One reservation key per Moment (`<momentId>:fairy-moment-caption-v1`),
default daily cap 6 per owner (`AI_FAIRY_MOMENT_DAILY_LIMIT`), and a Moment is claimed before the call, so a failure,
crash or invalid output keeps the preset caption and is never retried. Output is validated (length, language, no
links/mentions/hashtags, not a recent repeat, `assertContentAllowed`). The AI disclosure lists the feature; its
version is unchanged because no owner content is processed. Tests:
[test/back/haiku-fairy-moment.test.js](test/back/haiku-fairy-moment.test.js) (synthetic PGlite and injected fetch only).

## Release workflow error output, 2026-10-19

`cloudflare-production-deploy.yml` now prints the last 20 (was 5) lines of a failed Wrangler command so the real error is
visible in this public repository's logs. Output is still filtered: runs of 32+ token characters become `<redacted>` and any
`name@host` becomes `<redacted-email>`, since Wrangler authentication errors can include the account email or name.

## Web-only production follow-ups through `3bf76527`, 2026-10-18

PRs #87–#90 changed only the mobile/Web client and were released to `petalpal-web-production` with production build
config; the Web now serves version `417ca56c-3af3-42d7-b4f2-bbf094ff0cd0` (source
`3bf7652796167c0ab31c365c882623a60f9047d9`). No API, database, provider credential or Access-policy change.
`app.jastrevia.com` still redirects to Cloudflare Access. The owner-deployed keep-warm Worker only sends an
unauthenticated GET to the API `/healthz` (expected 401) and holds no secrets; its deployment is owner-reported and not
independently verified. See the INTEGRATION_DEPLOYMENT.md checkpoint for run, artifact and version references.

## Coordinated production release `c9bb959d`, 2026-10-17

Production database, API and Web now run `c9bb959d3717d081e5eddb0aa9dea35c702ea337`. The five 2026-10-15 release
migrations were applied once with the API suspended. The deleted-identity trigger and the AI disclosure grant guard
were verified, prior AI grants were revoked and pending jobs were cancelled by migration 003. A short mixed-version window
occurred because Render cannot deploy while suspended: the old API ran against the migrated schema until the new build
went Live, protected by those database-level guards. Render now builds `Dockerfile.backend`. Anonymous postflight
confirmed auth denial, the CORS allow/deny split, foreign-origin Socket.IO denial (closing the deferred Engine.IO P2 in
production) and security headers. `app.jastrevia.com` remains behind Cloudflare Access. No credential values were
recorded; authenticated acceptance is pending. See the INTEGRATION_DEPLOYMENT.md checkpoint.

## Local feedback transport logging — partner branch `updated-flower`, 2026-10-15

The new mobile Help/Feedback local development transport no longer logs submitted
email addresses or feedback subject text; in `__DEV__` it logs only category, message
length, timestamp and route. No backend feedback endpoint exists yet: submissions stay
in memory on the device. No production credentials, player storage or provider
settings were accessed or changed. (Imported from partner commit
`540bb76641fd308dd70767755f986df5993145a3`.)

## Weekly evidence significance — default OFF, offline only, 2026-10-16

`AI_WEEKLY_EVIDENCE_SIGNIFICANCE` is a new server-side opt-in that requires
`AI_WEEKLY_EVIDENCE_SELECTOR_V2=true`. Any other value, or use without V2, fails
with `AI_GATEWAY_CONFIG_INVALID` before retrieval. No client input can set it.
When ON, the existing 32-row Weekly candidate pool is ranked from the already
consent-checked, owner-scoped period rows instead of the last 32 rows (zh) or
retrieval order (en). English retrieval still runs once, and its rows are still
reconciled, with stale or forged content refused.
Ranking reads only summary words, topics, dates, similarity and importance. It
never rewrites text, never adds ranking metadata to the provider packet, and makes
no extra model or API call.
These existing controls are unchanged: source fence, deletion/consent rechecks,
8-source/4,000-character and Gateway limits, one call, idempotency and atomic
persistence. Monthly is unchanged.
Evidence is offline and synthetic. Actual-worker PGlite tests are added but still
need a local run. No flag, deployment or manual-state change. See
[the report](docs/ai/WEEKLY_EVIDENCE_SIGNIFICANCE.md).

## Weekly narrative-thread prompt candidate — default OFF, offline only, 2026-10-16

`AI_WEEKLY_REFLECTION_NARRATIVE_THREAD` is a new server-side opt-in on the Sonnet
Weekly `weekly-reflection-v2` path. Unset or literal `false` keeps the existing prompt
and packet. Any other value, use with v1, or use together with
`AI_WEEKLY_REFLECTION_RETROSPECTIVE` fails with content-free `AI_GATEWAY_CONFIG_INVALID`
before retrieval. No client input can set it. Monthly and Workers AI ignore it.
It replaces only the composition paragraph of the system prompt. Evidence safeguards,
quotation/ref rules, packet contents/privacy allowlist, trimming, Gateway byte
admission (+291 bytes after the 2026-10-16 final selective revision, inside the
existing framing allowance), cost reservation,
one-call/no-replay, consent/owner/source fences and the validator are unchanged.
Evidence so far is offline and synthetic: actual-worker PGlite tests are added but
still need a local run. No provider call, flag activation, deployment or manual-state
change occurred. See [the candidate report](docs/ai/WEEKLY_NARRATIVE_THREAD_CANDIDATE.md).

## Weekly Selector V2 Integration planning — no execution, 2026-10-15

The controlled-test proposal preserves the normal Integration server's manual
execution and three zero shared call limits. Source inspection confirms that
literal selector true alone neither authorizes Claude nor supplies Integration
English embedding bindings. A finite, owner/job-scoped evaluation capability must
be separately implemented/reviewed before any positive process-local budget; no
server guard, provider setting or Production configuration was changed.

Fresh GitHub main metadata differs from the verified selector branch in server,
schema and five migration files; this does not establish the live TEST schema.
Direct deployment of the older full branch is not proposed. The anonymous TEST
metadata probe was unavailable from this host, so no live service/resource binding
or manual status is upgraded. Existing Node 24.21.0 readiness evidence is reused.
The [Integration plan](docs/ai/WEEKLY_EVIDENCE_SELECTOR_V2_INTEGRATION_PLAN.md)
separates zero-inference SQL/owner checks from an optional 4-call pilot and 16-call
continuation, with $0.81920 total Claude reservation, independent call slots and
an OFF rollback. No paid inference, hosted mutation or historical-ledger reuse
occurred. Owner review remains required before implementation/execution scopes.

## Weekly Selector V2 exact-runtime offline verification — 2026-10-15

Candidate runtime `957c6c2de713e1c3b2219ab5d661c14971a747d3` was verified on
Node 24.21.0 / ICU 78.3: complete affected native matrices passed 366 tests each
with the selector OFF and ON; the configured Linux image passed 233 selected
selector/service/worker/Monthly/fence tests per state with networking disabled.
Default-OFF matches the pinned previous Weekly input and packet on all 28 frozen
cases. Actual worker tests retain consent/source/owner fences, exact provenance,
packet privacy headers and count/character/byte limits. Monthly requests, claims
and provenance are unchanged. These are synthetic/mocked results, not hosted
provider or narrative-quality acceptance. Test-only PGlite cleanup fixes resolved
memory kills in the bounded image; application code and configuration are unchanged.
Historical evidence and consumed ledgers remain preserved. See the
[readiness report](docs/ai/WEEKLY_EVIDENCE_SELECTOR_V2_READINESS.md).
Enabling V2 remains pending owner review; no flag, deployment or production state
was changed.

## Weekly Selector V2 integration candidate — default OFF, 2026-10-15

`AI_WEEKLY_EVIDENCE_SELECTOR_V2` is a new server-side opt-in for localized Weekly
input selection under `weekly-reflection-v2`. Unset/`false` uses the existing
selector; only literal `true` opts in, incompatible output contracts and other
flag values fail closed on that path. Monthly and unlocalized Workers AI Weekly
selection ignore this flag. No environment, provider or deployment was changed.

The candidate replaces fuzzy duplicate suppression with exact normalized-text
matching, preserving changes in negation, speaker, quantities and outcomes.
Backfill requires specific lexical overlap within an initial topic group and a
new sentence; this is selection guidance, not semantic verification or permission
to infer identity, emotion or causation. Count, character, byte, locale and
minimum-evidence bounds remain. No scoring service or extra model request is added.

When enabled, retrieved candidates are reconciled against the already consent-
checked, owner-scoped Event/Memory versions before packet construction. Ambiguous
source versions, missing/foreign owners and explicit source opt-out are refused.
Existing consent rechecks, deletion/revision fences, selected/cited provenance,
atomic persistence, idempotency, output validation and privacy allowlists remain.
Only synthetic offline and mocked/in-memory evidence was used. Default-OFF parity
is checked against the pinned previous implementation; no narrative-quality gain
is claimed. Historical evaluations and consumed ledgers are untouched. See the
[candidate report](docs/ai/WEEKLY_EVIDENCE_SELECTOR_V2_CANDIDATE.md). Enabling remains
pending owner review and is outside this preparation task.

## Weekly quotation contract — offline clarification after live stop, 2026-10-15

The approved editorial-freedom batch at runner
`c0661ce3c08bf8541d3e0da3907481a56161851f` consumed one C01/en request and stopped
with `VALIDATION_FAILED / REFLECTION_V2_QUOTE_UNSUPPORTED`; completed 0, dispatched
1, estimated cost US$0.006284. C04 was not dispatched. Rejected prose was not
retained. The private launcher had exited; the owner stopped all live evaluations.
All ledgers/artifacts remain preserved and the batch must never be rerun.

Offline tests found no demonstrated false positive against the existing exact
quotation contract. Every recognized double/Chinese-quoted span is checked as an
exact clause copy, even if intended as emphasis or paraphrase; ordinary punctuation
and English apostrophes pass. Exact failed text/cause is unknown. Weekly now prefers
idiomatic paraphrases without quotation marks and explicitly binds quoted text to
an exact complete cited clause, never a translation/rewording. This addresses a
prompt ambiguity without stripping marks or weakening validation. The prompt is
slightly shorter. No actual model-compliance or quality improvement is claimed.

64 scoped offline cases passed. Monthly, schemas, validator and content-free
diagnostics are byte-identical to `ab523996…`; only Weekly instructions change.
English and Simplified Chinese remain the only future output languages. Existing
privacy, consent, ownership/deletion, references, idempotency and cost controls
remain unchanged; semantic fidelity still requires human review. No additional
provider/Cloudflare AI request, spend, production change or deployment was made.
See [investigation, evidence limits and tests](docs/ai/REFLECTION_QUOTATION_CONTRACT_OFFLINE.md).

## Weekly editorial-freedom evaluation — offline preparation, 2026-10-15

The new isolated runner pins `ab52399656904f4f698c5f2d731f9b98d9b658ff`
without runtime changes. It schedules only C01 English and C04 Simplified Chinese,
one direct Sonnet 5.5 request each, on the unchanged frozen UNV evidence. Its fresh
batch/ledger namespace cannot reuse or resume any historical evaluation. Proposed
maximum US$0.08192 uses the existing US$2/US$10 per-million-token assumptions;
applicable live rates and integration Gateway/credential scope need fresh human
verification. No historical approval carries forward.

20 mocked runner tests and 5 Weekly diagnostic checks passed offline, with native
fetch trapped. New ledger/artifact paths are absent; the shared parent is owned by
the current user, owner-only and not a symlink. Existing strict JSON/grounding,
content-free diagnostics, bounded transport, durable attempt reservations, private
artifact/credential handling and no-replay protections are unchanged. Tests also
refuse unsafe parent permissions and symlinks before dispatch. Saved prose names
and a human comparison worksheet are prepared; no new prose exists or quality
improvement is claimed. No live calls, credentials, spend, deployment or production
change. **OWNER APPROVAL AND FRESH EXTERNAL VERIFICATION PENDING.** See the
[execution plan](docs/ai/REFLECTION_EDITORIAL_FREEDOM_EVALUATION.md).

## Reflection editorial freedom and two output languages — offline only, 2026-10-15

Future Weekly/Monthly v1/v2 output enums, packet admission, service language defaults
and new signup/profile language selections allow English and Simplified Chinese.
Traditional/regional Traditional preferences and explicit configurations containing
the retired output language fail closed for new generation; no fallback or silent
content/profile conversion occurs. Historical report retrieval remains owner- and
consent-checked, bypasses new-generation locale validation and preserves saved
Traditional v1/v2 prose/metadata. Finalized reuse still precedes new input preparation.
No migration, record deletion, generation-key or provider setting changed.

Weekly uses concise understanding/writing/fidelity instructions. Factual grounding,
strict JSON shape, reference/quote/digit/coverage/length guards and content-free
rejection diagnostics remain intact. Native calls, models, budgets, consent,
source/deletion fences, privacy, atomic persistence and no-replay rules are unchanged.
Monthly's supported-language writing code is unchanged; its prompt loses only the
retired-language guidance. Semantics and actual language/script remain human-review
limits, not machine-proven facts.

137 distinct offline cases passed across the scoped runs, including historical
Traditional v1/v2 retrieval, explicit unsupported-locale/config rejection, zero-call
finalized reuse, owner/consent boundaries and existing worker/cost/source fences.
Only synthetic in-memory/stubbed data and loopback HTTP were used. No live inference,
paid evaluation, production change or historical evidence/ledger mutation occurred.
Before any future rollout, review locale configuration and the explicit language
selection required for owners with unsupported stored preferences. See
[scope, compatibility and verification](docs/ai/REFLECTION_EDITORIAL_FREEDOM_TWO_LANGUAGES.md).

## Reflection v2 evaluation validation diagnostics — offline only, 2026-10-15

The R2 evaluation runner keeps `VALIDATION_FAILED` as its stop code and adds a
fixed `validationCode` to stopped-ledger metadata and the CLI result. The new
`scripts/reflection-v2-validation-diagnostics.mjs` classifies the first failed
guard only after the unchanged authoritative validator rejects the response.
It cannot accept, repair, retry or replace output. Production `lib/`, prompt pins,
schemas, model/budget controls, credential/environment gates and consumed-batch
protection are unchanged; no new batch identity or real ledger is created.

Codes are fixed constants. AJV messages/params/instance paths, arbitrary JSON keys,
actual refs, rejected text, source content, exception messages/stacks/causes,
headers, credentials and raw provider responses are never included. Unexpected
internal cases return `REFLECTION_V2_UNKNOWN`. Existing validated synthetic
artifact handling is unchanged; rejected payload retention is not expanded.
Differential offline tests compare diagnostic categories with the real validator
across Weekly/Monthly and all three locales; mocked runner tests verify code-only
persistence, no content/credential/thinking leakage, immediate stop and no resume.
A future validator change requires keeping the diagnostic mirror and parity tests
in sync; UNKNOWN is never permission to proceed.

Both historical batches remain consumed and immutable. The latest run on
`39976d99685198fa91a1a0f50eeba555e127d644` stopped on C01 English previous
Candidate after HTTP 200: one dispatch, zero validated, estimated US$0.00645.
The old payload was not retained; these new diagnostics cannot recover its cause.
This revision is offline only. Another paid batch requires fresh explicit owner
authorization and must not reuse either consumed batch. See the updated
[evaluation record](docs/ai/REFLECTION_V2_R2_EVALUATION.md).

## R2 runner macOS portability correction — offline only, 2026-10-15

The environment gate now permits only the exact `__CF_USER_TEXT_ENCODING` name
on Darwin, where macOS injects text-encoding metadata even after `env -i`.
Other platforms still reject it; no prefix/wildcard exception or environment
stripping is used. All other unlisted names and existing approval, exact-commit,
TTY, `.env`, budget, attestation, ledger and artifact gates remain enforced.
Sixteen offline/mocked tests pass, including the exception on Darwin, rejection on
Linux/Windows, near-match/injection variables and all remaining gates with the
exception present. No output validation or production/provider configuration changes.

Runner `21b87fac94e404d9b86f05854ab627a6d72de23e` stopped before credential
entry or dispatch with `ENVIRONMENT_NOT_ISOLATED`; its sanitized stop record and
all prior evaluation evidence are preserved. No real batch ledger was created.
The corrected commit requires fresh owner approval and fresh Gateway attestations.
No live evaluation or paid request was launched for this correction.

## Weekly Candidate vs R2 evaluation — offline preparation, 2026-10-15

**No paid requests authorized or dispatched.** The separate
`scripts/reflection-v2-r2-evaluation.mjs` pins the previous candidate and R2, only
C01/C04/C05 Weekly cases, six Sonnet requests and the exact US$0.24576 reservation.
It uses a new batch/ledger namespace without reading, resuming or editing the
consumed Stage 1 ledger. The historical runner and evidence remain unchanged.
Default/check modes are network-free and create no real ledger/artifacts.

Live requires a new case-bound owner approval, exact clean runner HEAD on its
dedicated branch, isolated allowlisted environment, no `.env`, private TTY,
integration-only credentials and fresh human no-retry/no-fallback/no-cache/routing
and standard-rate attestations. Each attempt is fsynced before a sequential send;
any existing ledger/artifacts prevent replay, and failure stops without repair or
replacement. Private ledger/artifact permissions, blinded review, output bounds,
20-second deadlines and rejection of invalid output/cache usage are covered by
14 mocked tests with native fetch trapped. Raw failed responses, headers,
credentials and thinking are not saved. Provider-side settings remain human-only
and unverified by this preparation; these are local controls, not cross-clone
replay protection or provider billing certification.

Runtime schemas, validation, consent, ownership, deletion and production settings
are unchanged. No database is used. Existing semantic/script validation limits
remain. See [the new plan](docs/ai/REFLECTION_V2_R2_EVALUATION.md); approval and human
editorial acceptance are still pending.

## Staged editorial evaluation — offline revision, 2026-10-15

The paired executor now requires an explicit stage, exact case-bound approval
and exact reservation: Stage 1 is six Sonnet calls / US$0.24576; Stage 2 is six
Opus calls / US$0.98304 after completed Stage 1 evidence and separate human-review
attestation. Optional Stage 3 accepts only an explicitly approved subset of the
six unused pairs with its exact budget. The original 24-call matrix remains
available offline; the old unscoped live command/approval cannot dispatch.

Each stage has an independent exclusive append-only/fsynced ledger. Empty,
partial, corrupt, wrong-commit or unassessed prerequisite evidence fails closed;
existing legacy batch evidence blocks staged replay. No stage continues, retries,
resumes or repairs automatically. Human editorial review and real Gateway
configuration remain owner-verified attestations, not machine-proven facts.

Twenty targeted mocked tests passed, including separate six-call stages, a
two-call early follow-up, optional full coverage through three approvals,
cross-stage replay/approval/budget rejection and existing transport/durability
failure paths. ZERO real provider calls; no live ledgers or historical evidence
changed. Final prompts and production runtime remain frozen. See the updated
[staged plan](docs/ai/REFLECTION_V2_PAIRED_EVALUATION.md) and
[human decision sheet](docs/ai/REFLECTION_V2_BLIND_SCORE_SHEET.md).

## Paired Reflection v2 editorial executor — offline preparation, 2026-10-15

`scripts/reflection-v2-editorial-evaluation.mjs` prepares 12 paired synthetic
cases (24 calls), with zero real inference during implementation. Default/check
mode has no network or ledger side effects. Live requires separate owner approval
of the exact clean executor commit, a cap between US$2.45760 and US$2.46, private
integration-only credentials and explicit Gateway retry/fallback/cache/routing
attestations. Remote settings are not machine-verified.

The fixed new clone-local ledger uses exclusive creation, O_APPEND and fsync
before each send. A failed/ambiguous/interrupted attempt is never retried or
refunded; a partial or empty ledger cannot be resumed. The first failure stops
the batch. The historical one-call ledger is never reused. Sequential sends keep
the existing 20-second timeout, model/token bounds, schemas and validation.
No database or production code changes are involved; this is not new persistence
or consent acceptance. Protected operator metadata is separate from blinded
synthetic prose. No raw headers, provider errors, thinking blocks or secrets are
saved. Mocked tests cover timeout/late responses, interruption, invalid output,
budget/replay gates and fsync failure before dispatch. See
[the execution plan](docs/ai/REFLECTION_V2_PAIRED_EVALUATION.md).

## Isolated zh-Hans Reflection v2 Weekly acceptance runner — 2026-10-15

**Preparation and offline/mocked validation only; no paid inference, deployment,
migration, credential, provider or production-data change.** Branch
`test/zh-reflection-v2-live-weekly` (based on PR #57) reuses the unmerged
`test/zh-report-acceptance` runner (commits cherry-picked with `-x`) and narrows it
to `weekly-reflection-v2` on `claude-sonnet-5-5`. It calls the real worker, cost gate,
Gateway client, v2 validator and persistence. No `AI_MONTHLY_*` name is set, so no
Opus service exists; a Monthly job is refused before any reservation or dispatch.

Live mode (`live-weekly`) is fail-closed before any database or provider module loads
(`scripts/zh-reflection-v2-weekly-gates.mjs`). It requires all of the following:
- `NODE_ENV=test`, no `.env`, and no inherited `DATABASE_URL`, `AI_*`, Render,
  Anthropic, Gateway, OpenAI, Firebase or Cloudflare variables;
- a fresh loopback `petalpal_acceptance_v2_live_test` database on port 55432 with
  zero users and audit rows;
- no `CI`/`GITHUB_ACTIONS`, and a TTY for hidden secret entry;
- `PETALPAL_ZH_ACCEPTANCE_APPROVAL=APPROVE-1-ZH-WEEKLY-V2-SONNET-CALL`;
- a full approved commit SHA equal to a clean `HEAD`;
- a budget cap ≤ US$0.05 that is at least the US$0.04096 full reservation;
- the human Gateway no-retry attestation (manual checklist §7);
- an unconsumed ledger.

Exactly-one-dispatch controls:
- The in-process dispatch guard allows one exact URL and one call. It creates
  `<git-common-dir>/petalpal-acceptance/zh-weekly-v2-sonnet-live.jsonl` exclusively
  (`wx`) and fsyncs an `attempt` entry before the send, so a crash, timeout or
  unknown outcome still consumes the run. The ledger records only commit, cap,
  model, HTTP status and sanitized cost, never bodies, headers or secrets. It is a
  local control, not cross-machine replay prevention.
- The Gateway client keeps `fallback`/`maxAttempts` replay blocks and sends
  `cf-aig-max-attempts: 1`.
- Single-report database limits allow 2 calls and 1 Weekly action, with all USD
  limits set to the cap, so a second report is refused before dispatch.
- The deterministic cost reservation blocks scheduler re-runs.
- Ungrounded output fails without a repair call.

Gateway-side retry/fallback configuration is **not** machine-verified. This is a
residual risk covered only by the manual attestation.

The offline CI workflow uses a disposable pgvector service, `contents: read` and no
secrets, and never invokes live mode.

## Opt-in Prompt-First reflection v2 — 2026-10-15

**Default off; offline source and mocked tests only; no paid inference, deployment,
migration, credential or provider change.** `weekly-reflection-v2` and
`monthly-reflection-v2` let Claude write the visible prose as evidence-linked
sentences. They are selected only by exact `AI_WEEKLY_REFLECTION_CONTRACT` /
`AI_MONTHLY_REFLECTION_CONTRACT` values; unset keeps v1 and other values fail closed
before retrieval or dispatch. Consent, owner scope, Journal exclusion, source/deletion
fences, job claims/leases, atomic report/evidence/job writes, the no-replay cost
ledger, budgets, timeouts and the unchanged Gateway byte admission all still apply.
Finalized reports are reused and never regenerated by the opt-in.

- The provider packet contains only Event text, topics, local weekday, month-week or
  previous-month labels and aliases: no owner, Event/memory IDs, counts or timestamps.
  Event text is untrusted data. Over-budget packets drop whole optional Events; text is
  never truncated.
- Fail-closed checks cover schema, version/locale echo, supplied aliases, Weekly
  two-Event and Monthly every-week citation coverage, previous-month comparison-only
  use, digit support in cited text, exact clause-aligned quotations, alias/URL/markup
  rejection and existing length bounds.
- **Residual risk:** paraphrased negation, speaker, cause, chronology, uncertainty,
  feelings, spelled-out numbers, invented times/durations and locale script are not
  machine-verified. Valid citations are traceability, not proof. Human editorial
  acceptance of approved live outputs is required before any production use. No
  manual/provider action is added, so MANUAL_SECURITY_CHECKLIST.md is unchanged.

## Phase 4 Opus Monthly integration — 2026-10-13

**Disabled by default; source and mocked acceptance only.** New isolated worktree
based on `main@daba16e5` (PR #45 merge), with verified Phase 3 ancestry. The existing
Monthly route remains selected unless both explicit Monthly provider/model selection
and all existing Gateway/Anthropic configuration and budget gates pass. Invalid
explicit routes fail closed; Weekly/Event production paths are preserved.

- `monthly-reflection-v1` uses a closed structured composition plan, not arbitrary
  prose plus citations. Independently recomputed cards constrain cross-week topic
  patterns, comparisons of selected current/previous record samples, attributed
  chronological moments and a supported closing. Unknown/version/locale/cards, altered counts, extra text, duplicate insight
  kinds, emotional trends, causes, diagnoses, predictions and invented milestones
  fail closed. Fluent wording cannot bypass factual validation. Topic labels are
  attributed exactly, never treated as proof of a personal experience or translated
  by the model. This assessed alternative to Weekly's quotation approach improves
  temporal synthesis, but controlled-language naturalness/depth still need product
  acceptance. Canonical extraction often has no topic metadata, so up to four
  exact-sentence pairs from earliest/latest represented weeks also support ordinary
  Events when no independently grounded topic synthesis exists. These modes are
  exclusive, so quotations cannot displace available verified synthesis and saved
  section order remains faithful to the main reflection. The model selects card IDs, never edits quotes. Sentence candidates retain
  numbers/negation; potentially truncated final fragments are excluded. This hybrid
  is an assessed limited alternative, not a claim that templates or citations alone
  meet the intended final writing quality. No arbitrary paraphrase is accepted.
- English/Simplified/Traditional Chinese output is localized from the saved owner
  locale. Chinese full-pattern/change fixtures target 250–350 grapheme clusters;
  `Intl.Segmenter` includes punctuation/combined emoji and excludes layout whitespace.
  Shorter supported output is preferred to padding. Chinese cap 500 graphemes plus
  the existing 700-character section / 1,800-character total caps remain. No paid
  repair or output truncation. Statistics/trends remain deterministic and unchanged;
  sample topic changes are explicitly not whole-month activity or emotion changes.
- `monthly-cross-week-v1` admits up to 64 candidates fairly across owner-local
  calendar weeks and previous-month comparisons. Mandatory current-week anchors
  (at most six) precede enrichment; all selected evidence shares 16 sources / 8,000
  context characters. This reviewed-policy delta permits anchors above the old
  three-per-theme cap, while enrichment and previous-month selection separately
  retain three-per-theme. Up to three prior-month sources are eligible. Missing a
  required week, fewer than three current sources/two represented weeks, or no
  supported synthesis causes truthful insufficient evidence with no native dispatch.
  English BGE/pgvector semantic ranking remains; owner-scoped chronological anchors
  prevent similarity/recentness concentration. Chinese uses independently tested
  bounded EventMemory selection without multilingual embeddings or vector changes.
- Only eligible owned Events and EVENT memories enter provider input. Request-local
  aliases map to exact provenance; no owner/Event/Memory/job IDs, Journal, Weekly
  prose, server source snapshots or credentials are exported as report data. Prior
  month selection has its own explicit localized Monthly policy; final fences still
  lock and compare full current/previous source snapshots and the exact saved locale,
  timezone, consent epoch and claim. Selected previous evidence is stored in existing
  AiEvidence so existing owner-scoped Event deletion removes affected saved Monthly
  reports. Cost reservations remain after deletion and block paid replay.
- The existing native Opus adapter preserves always-on thinking compatibility,
  low effort and bounded total output, fixed authenticated Gateway egress, no tools,
  logging/cache suppression and one attempt. Configuration is named-key/private-field
  scoped. Existing durable shared-call/native-USD/Cloudflare-query admission occurs
  before retrieval; denial rolls back all admissions. Native timeout remains at most
  20 seconds, including preparation/validation; late noncooperative fetches cannot
  read output, run validation, record late usage or persist. Abort cannot undo
  already-dispatched work. No retry, repair, provider fallback, direct egress or refund.
  Existing billing coverage limitations remain (Gateway ledger is not Workers AI or
  account-wide dollar accounting).
- Report content version is distinct from stable `grounded-narrative-v1` period/job/
  reservation identity. Duplicate processing, provider changes or source deletion
  cannot buy new inference. Saved finalized reports are reused; report, evidence and
  fenced job completion remain atomic. Existing Weekly/Event contracts, private
  readers, memory extraction, consent/deletion behavior and BGE 384d are preserved.

Local validation: **20/20 initial Monthly tests passed** within the complete impact set.
The combined regression reported **155/157 passed**, with two import/setup failures
because this new checkout initially lacked its generated Prisma client. After
credential-free client generation using the synthetic test setting (no DB connection),
the affected consent suite passed **10/10** and private-report reader passed **1/1**,
including both previously blocked cases. All 157 distinct impact cases therefore
have passing evidence across those runs; rerun counts overlap and are not additive.
Coverage includes approved Sonnet behavior, existing report worker/source fences,
consent lifecycle, deterministic foundation, both local/production 384d vector
profiles, owner/Journal/deletion boundaries, idempotency and CI contracts. Monthly
fixtures also cover English/Simplified/Traditional grounding and grapheme limits,
recent-heavy ranking, six-week/timezone coverage, incomplete/sparse evidence,
malformed/refused output, budgets, late preparation/noncooperative fetches, current
and prior-source deletion, revocation/locale changes, safe failure, immutable reports
and atomic evidence/job rollback. Initial fixture-only failures (legacy evidence
uniqueness and an audit-event assertion name) were corrected before the passing run.
Following canonical-extraction review, two additional tests cover topic-free Events
in all three locales, preserved negation/numbers and rejected truncated/altered
sentences. The final affected run passed **28/28** (22 Monthly cases plus 6 CI
contract tests), zero failures/skips/cancellations. Exact-head GitHub CI is recorded
on the Draft PR. The 22-case Monthly suite is a separate bounded invocation in
credential-stripping security CI. Fixtures use injected fetch,
synthetic data and disposable in-memory PGlite only. No live PostgreSQL connection,
migration or provider call. Independent PostgreSQL connection lock scheduling is
not certified by these single-engine transaction tests.

Activation gates remain: exact Opus/Gateway availability/compatibility and capacity,
live writing-quality/coverage/latency acceptance, privacy/processor/retention and
consent disclosure review, approved budgets and explicit release/model-cutover
approval. No deployment, real/paid AI inference, Cloudflare resources/credentials,
production DB/infrastructure changes, PR #37 changes or existing worktree edits.
Phase 5 is not implemented. Manual checklist unchanged: no genuine manual/provider
action or provider status changed. Earlier evidence below is retained verbatim.

## Phase 3 Sonnet Weekly integration — 2026-10-13

**Source implementation only, disabled by default; no live provider acceptance.**
Weekly Sonnet requires explicit `anthropic` / `claude-sonnet-5-5` selection and the
existing Gateway enablement, fixed address/auth validation and explicit USD budgets.
Default Weekly processing and all Monthly processing keep the previous provider.
No new endpoint, dependency, schema/migration, credentials or provider resources.

- `weekly-reflection-v1` is a closed output schema, with locale, two source-quoted
  moments and an optional recurring-topic insight. The model chooses exact supplied
  whole sentence candidates; validation rejects changed/partial quotes, invented
  numbers, missing/unknown citations, duplicate Events, extra prose fields,
  unsupported locale/version and invented topic/conclusion categories. Overview and
  insight citations are mapped to original owned Event/Memory evidence at storage.
  Prose and Event counts are rendered from verified selections and deterministic
  facts, rather than treating citation existence or token overlap as entailment.
- English, Simplified Chinese and Traditional Chinese use localized controlled
  wording; Chinese main reflections enforce 100–180 Unicode characters including
  punctuation/quotes. Exact source quotations preserve negation, dates and numeric
  language, with no arbitrary translation. Recurrence requires at least two distinct
  supporting Events in the current period; it does not assert emotional improvement,
  hidden causes or personal growth. Tone/coverage still need product acceptance.
  Long unbroken or otherwise unquotable evidence may cause truthful abstention.
- English semantic RAG remains BGE 384d/pgvector with its English-only eligibility
  policy. Chinese Weekly context is bounded period retrieval of owned eligible
  EventMemory, with existing count/context/duplicate selection limits. No Chinese
  embedding inference, model/profile switch or multilingual semantic quality claim.
  The Chinese source policy is explicit/versioned and applies only to localized
  Weekly input. Journal, cross-owner, revised/deleted or ineligible sources cannot
  pass the pre-dispatch/final source fences. Saved locale changes also invalidate
  in-flight localized reports; the legacy English and Monthly fences are retained.
- Gateway trusted input preparation reserves shared Weekly calls and worst-case
  input/output USD liability before retrieval, then enforces final serialized byte
  bounds. This avoids double-reservation and paid query work before budget admission.
  `AI_RETRIEVAL_RESERVED` in the existing non-cascading ledger also reserves the
  potential Cloudflare query against its provider daily quota, across new/legacy
  routes. It is provider-only accounting: owner/global totals stay at two calls.
  Both provider limits and USD admission share the same transaction/advisory lock;
  denial rolls back every reservation. Chinese jobs conservatively reserve the
  same query allowance without invoking embeddings. No new schema/table is needed.
  Preparation errors are sanitized; cancellation/deadline checks prevent late
  preparation from dispatching Sonnet. The hardened native-response deadline guards
  remain. The upstream request timeout accounts for time already spent preparing.
  Already-started work/remote charges cannot be undone or disproved by abort.
- Provider input contains short evidence aliases and allowed sentence/topic/count
  fields only. Owner, Event, Memory and job IDs, source snapshots, private reasoning,
  raw errors/responses and unrelated environment values are not logged/exported.
  New service credentials/configuration use private fields and named-key snapshots.
  Existing no-log/no-cache, fixed Gateway egress and single-attempt controls remain.
- Durable `grounded-narrative-v1` job/reservation identity remains stable across
  providers; content version/locale/model live in existing sections JSON. Claim,
  lease, consent epoch and exact source snapshots are checked before dispatch and
  again at atomic report/evidence/job completion. Finalized saved reports remain
  immutable across provider changes. Neither invalid output nor transport ambiguity
  opens a paid retry, repair call or cross-provider fallback. Ledger liability is
  retained even for preparation/insufficient-evidence outcomes. Gateway USD totals
  still exclude Workers AI dollar charges and other billing-account consumers.

New mocked/PGlite tests cover localized schemas/grounding/length, unsupported facts,
insufficient and unquotable evidence, admission before retrieval, owner/Journal
boundaries, malformed output/timeouts/late preparation, consent/source/locale races,
duplicate execution, immutable saved reports, safe errors and atomic rollback/lease
expiry. The suite joins the credential-stripping security CI runner as a separate
bounded invocation. Existing historical security/production evidence below remains.

Local validation: the broad impact-based regression passed **200/200**, including
15 new Weekly tests and two new Gateway preparation cases. After final provider
quota hardening, the **73/73** affected Weekly/Gateway/Cost Gate tests passed again,
with zero failed/skipped/cancelled. Coverage includes both native adapters, retained
Haiku behavior, existing report workers/fences, deterministic foundation, consent
lifecycle, BGE/pgvector ownership/deletion and CI contracts. Changed-file syntax,
local Prisma code generation (no connection/migration) and diff checks passed.
The final worker/lifecycle/private-report-reader/CI-contract check passed **41/41**.
All inference was mocked, with synthetic data and disposable in-memory PGlite.
Independent PostgreSQL lock interleavings and live quality/latency remain unverified;
exact-commit GitHub CI evidence is recorded on the Phase 3 Draft PR separately.
Initial CodeQL flagged a test-only hostname assertion whose regex contained
unescaped dots. The mock now uses an exact URL comparison. Production Gateway
address validation/egress was not affected; no scanning rule was suppressed.
The affected Weekly suite passed **15/15** again after that assertion fix.

Activation blockers: exact Sonnet/Gateway compatibility and entitlement, live
selection/tone/coverage/latency acceptance, approved privacy/processor/retention and
consent disclosures, budgets/capacity, and explicit release/cutover approval.
No deployment, real/paid AI inference, frozen evaluation, Cloudflare provisioning,
credential changes, production database/infrastructure modifications, existing
worktree changes or PR #37 actions. Phase 4 is not implemented or authorized by
this checkpoint. `MANUAL_SECURITY_CHECKLIST.md` is unchanged because no genuine
manual/provider action or provider status changed.

## Phase 2 Haiku Event integration — 2026-10-13

**Source implementation only, disabled by default; no production/provider action.**
The Event route can explicitly select `anthropic` + `claude-haiku-5-5` through the
merged, timeout-hardened Gateway adapter. Both Gateway enable flags and explicit
budgets remain required. Missing provider selection or `workers-ai` preserves the
legacy route; an invalid explicit selection or Haiku failure abstains to empty
without another inference. No new endpoint, schema/migration or credential binding.

- Inputs are exact saved owner-scoped PENDING Event text and canonical Primary.
  Trusted policies recheck source, status and the Event-creation consent epoch
  before reservation, before dispatch and after output validation. Journal,
  memory, report and user metadata are never added to provider input. Preview
  cannot invoke Haiku because it has no durable Event/reservation.
- Strict JSON Schema and canonical Product-18 validation enforce zero to two
  distinct labels and reject excluded, unknown, Primary-redundant or malformed
  values. No primary mood override, experimental taxonomy, raw diagnostics,
  probability vectors or reasoning persistence. Generated labels remain
  `INFERRED_UNCONFIRMED`, with explicit Haiku/Gateway model provenance.
- Event creation passes its consent epoch internally without changing the stored
  schema or exposing it in HTTP. Emotion continues to need AI-processing consent
  only. Revoke/regrant invalidates old work, including before dispatch.
- Final Haiku enrichment locks consent (`FOR SHARE`) then owned Event
  (`FOR UPDATE`), matching revoke/delete order, checks the exact source/PENDING
  state and epoch, and persists Event labels plus the unique source-Event Flower
  in one transaction. Consent changes clear labels but allow an ordinary base
  Flower. Deletion/source changes block stale writes; failure marking is limited
  to matching PENDING Events and cannot clear an already finalized result.
- The original `event-secondary-v1` operation key spans legacy and Haiku, with one
  Gateway reservation, unchanged shared call limits and provider-aware USD ledger.
  Failed/ambiguous calls retain liability; no replay, paid retry, repair call,
  cross-provider fallback or direct provider egress. Inference failure preserves
  Event creation/base Flower and deterministic memory extraction. BGE 384d,
  pgvector retrieval, durable workers, owner boundaries and deletion remain.
- Existing maximum transport/output sizes and timeout continuation checks apply.
  `AI_REQUEST_TIMEOUT_MS` must be an integer from 1 to 3,000 ms for Haiku (default
  3,000); this change does not extend the Phase 1 ceiling. Conservative byte-based
  admission may abstain on long valid Events and is not an exact billing cap.

New synthetic/mock regressions cover route/model/default-off configuration, all
Primaries and Product-18, strict output contracts, consent/source/deletion races,
final-write rollback, shared cost admission/replay restrictions, timeout and
provider failures, authenticated HTTP creation/duplicate/Flower behavior,
deterministic memory, Journal exclusion, preview abstention and legacy routing.
The suite joins the existing credential-stripping security CI runner in its own
bounded invocation. Historical evidence below is preserved.

Local evidence: the initial broad run passed **122/124**, including all **16/16**
new Phase 2 tests. Both failures reproduced on unmodified `b9350a5e` in a separate
temporary source copy: a stale pgvector fixture assumed the old inline profile,
and a deletion mock omitted the existing lock-query method. Fixture-only repairs
now explicitly test both retained local and active Cloudflare BGE 384d profiles,
owner-isolated retrieval/dimension rejection/deletion cascades, and deletion locks;
the affected P0 suite passes **8/8**. The other **117** regression cases passed in
the broad run and their relevant runtime inputs are unchanged. This covers **125
distinct passing cases** after the repairs; no embedding/retrieval/deletion runtime
code was changed. No frozen final evaluation set or model benchmark was run.

Remaining gates are live provider entitlement/exact-model compatibility,
processor disclosure/retention and consent review, approved budgets/capacity,
separately authorized bounded quality/latency acceptance and explicit deployment
and cutover approval. Mocked output constraints do not establish model accuracy.
No real inference, deployment, Cloudflare resources, credentials, production DB
or infrastructure changes, existing worktree edits, PR #37 actions or automatic
merge. `MANUAL_SECURITY_CHECKLIST.md` is unchanged: no genuine manual/provider
action or provider status changed.

## PR #43 timeout hardening review — 2026-10-13

The original Phase 1 `Promise.race` rejected on timeout but left its losing
continuation running. A fetch implementation ignoring `AbortSignal` could return
late and start response validation or application callbacks after rejection.
The transport now checks cancellation and a monotonic deadline after fetch, each
body read, usage recording, grounding validation and final consent/authorization
checks. It also checks before parsing/validation stages. Late response bodies are
cancelled without reading or validating output. Expired continuations cannot
start subsequent application callbacks or return a successful result.

Timeouts remain ambiguous and non-retryable; durable reservations are never
refunded or reopened. Usage recording or a trusted callback already started
before timeout cannot be forcibly undone, but its completion cannot advance to
the next stage. Remote cancellation and absence of provider charges are still
not guaranteed. Existing consent, owner/lease, privacy and default-off controls
are unchanged; no production routing or provider configuration changed.

Two mocked late-fetch regressions (Anthropic and OpenAI) failed against the
original code and passed with the fix. Three additional regressions hold usage,
grounding or consent work past timeout and verify no subsequent callback, while
retaining accounting and replay protection. All fixtures are synthetic, with
mocked fetch and disposable in-memory PGlite; no real inference or production DB.
Local validation: **42/42 Gateway tests and 14/14 Cost Gate tests PASS**, zero
failures/skips/cancellations in those completed suites. The first Cost Gate
invocation could not load without its synthetic `DEV_DATABASE_URL`; the isolated
rerun supplied the repository CI placeholder and passed. Changed-file syntax,
diff checks and the AST-only graph update also passed. Remote CI results belong
to the final published commit and are recorded on PR #43 separately.
Historical implementation and security evidence below remains unchanged.

## Phase 1 AI Gateway abstraction — 2026-10-13

**Local implementation, disabled by default; no production acceptance claimed.**
The standalone `CloudflareAiGateway` building block prepares native Anthropic and
OpenAI adapters without changing server/worker model routing. No new public HTTP
route, credentials, Cloudflare resources, deployment, database schema or migration.
The existing Firebase authentication, Event-only boundary, consent, owner scope,
BGE 384d profiles, pgvector and report write fences remain authoritative.

- Master and per-provider flags default off. Enabled configuration validates fixed
  Cloudflare endpoint components, selected provider/Gateway credentials and explicit
  USD budgets, with static errors that reveal no values. Redirects, arbitrary
  endpoints, caller-selected unsupported models/tasks, retry counts above one and
  fallback requests are rejected. Server-side provider/source authorization and an
  application grounding validator are mandatory dependencies; no client can supply
  those dependencies through an existing route.
- Existing shared Cost Gate reservations retain their original keys and lock.
  Optional provider call accounting and UTC daily/monthly USD reservations use
  non-content `AuditEvent` rows. No deletion/refund or provider switch reopens a
  reserved operation. Missing ledger/budget/consent fails closed. Valid usage is
  recorded without Event content and never decreases reserved liability. Budget
  estimates are conservative admission controls, not guaranteed billing caps or
  coverage of other account consumers. Existing Workers AI call quotas remain.
- Pre-dispatch and post-response checks cover consent epoch, Event owner/existence
  or report job owner/current lease. A trusted source/provider callback is checked
  before reservation, before dispatch and after response. Future report integration
  still requires selected-source validation and the existing final write fence;
  this abstraction performs no report persistence.
- Native responses are bounded, parsed, model/completion/usage checked and validated
  with closed JSON Schema without coercion, then application grounding checks.
  Rejected output, refusal, truncation and ambiguous timeout/transport errors never
  trigger a repair call or fallback. Total transport deadline includes body reads
  and validation; abort cannot prove remote cancellation or absence of charges.
- Native Gateway requests suppress payload and metadata logging, bypass response
  caching, request one upstream attempt and omit arbitrary diagnostic metadata.
  OpenAI requests use `store: false`; this does not promise zero provider retention.
  No raw provider response/errors, reasoning blocks or private input are logged;
  credentials are in private fields and only transmitted to fixed Gateway URLs.
  Live account-level logging/cache/retry/retention settings remain unverified.

**Validation:** Focused regression PASS **131/131**, zero failed/skipped/cancelled,
covering 37 new Gateway tests plus existing Cost Gate, report worker/write fence,
Cloudflare embeddings, consent lifecycle, prompt-injection and CI contract tests.
Eight affected Gateway cases also PASS after final malformed-envelope and config
snapshot hardening. Changed-file syntax, lock consistency, local Prisma generation
and diff checks PASS.
Mocked fetch plus disposable in-memory PGlite only; no real provider requests or
provider databases. New tests join the existing credential-stripping security CI
runner. Historical production/security evidence below is preserved. Provider
activation, processor disclosure/consent, privacy/retention terms, capacity and
exact-model acceptance still require separately authorized later work.
`MANUAL_SECURITY_CHECKLIST.md` is unchanged because no manual/provider action or
provider status was changed by this task.


## Published speech candidate / exact-source CI — 2026-10-08

- [x] **Publication PASS:** clean isolated branch `release-candidate/speech-only-ace8ed1` published at unchanged `4036af3aee6462c916a56fb3eaed7ca9991cff72`; remote exact ref confirmed. Parent remains production logging base `1f8d0f98fb16b9553ae03c474f5952c808928e48`, with the same two source files and admission test only. Candidate worktree and all prior uncommitted evidence preserved; no candidate code changes.
- [x] **Scoped CI wiring PASS:** sole integration commit `697c8031fd458c5b4817cbe16c41dcc75bf32f9a` adds only .github/workflows/speech-candidate-validation.yml, adapted from the proven logging workflow. Trigger is its own file pushed on integration; fixed candidate checkout and two exact-HEAD assertions, pinned checkout/Node actions, contents:read, checkout credentials not persisted, 10-minute job/2-minute step/90-second child deadlines. Synthetic fixture environment, no repository/provider secrets referenced, no real Firebase/production DB/paid AI calls or deployment permissions. Candidate and main are unchanged; existing workflow settings/triggers preserved. YAML/runner syntax/scope/diff checks PASS without rerunning local tests.
- [x] **Actual candidate GitHub CI PASS 7/7:** [run 37882389953](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37882389953), job 113664751960, observed completed/success through run summary and read-only step metadata. **Workflow trigger SHA:** `697c8031fd458c5b4817cbe16c41dcc75bf32f9a`; **tested checkout SHA:** `4036af3aee6462c916a56fb3eaed7ca9991cff72`. Checkout, source assertion, installation, Prisma generation and Seven candidate speech tests all succeeded; runner asserts exactly seven tests/passes and zero failed/cancelled/skipped. This is candidate-source evidence, not substitution of an integration PASS. No raw logs retrieved.
- **Incidental automation disclosure:** unchanged integration push trigger also started broader regression run 37882389836. Cancellation requested promptly through its summary UI to avoid repetition; final workflow status is cancelled, but job metadata shows the test steps completed before cancellation took effect. This unintended automatic extra execution is not candidate evidence; no rerun requested or workflow weakened. No Docker build repeated.

**READY FOR DEPLOYMENT APPROVAL: YES for exact speech candidate and accepted single-instance topology; NOT permission to deploy.** This supersedes the prior missing-candidate-CI readiness blocker only. Accepted local 7/7, logging preservation, unchanged dependencies/schema/startup and base Docker evidence reused. Production peak memory, slow-upload cancellation behavior, Whisper latency and throughput remain UNKNOWN; per-process admission is not distributed protection or guaranteed remote provider cancellation. Production acceptance still requires a separately approved bounded synthetic plan/isolated identity and any paid-call budget. Preserve the replacement credential and exact logging rollback base; DB-resource/monitoring/pagination changes remain excluded. No Render/Cloudflare action, migrations, SQL, provider settings or production request performed.

SECURITY.md alone receives this new verification record, left uncommitted to retain the single CI-only commit/push. Existing documentation edits, history and canonical counts preserved; no new manual/provider or mobile operational change.

## Isolated speech security candidate — 2026-10-08

- [x] **Exact isolated candidate:** `4036af3aee6462c916a56fb3eaed7ca9991cff72`, sole parent/current confirmed production `1f8d0f98fb16b9553ae03c474f5952c808928e48`; branch `release-candidate/speech-only-ace8ed1`, worktree `/var/folders/24/w5jj8rlx4dz065gbyzgv_xx00000gn/T/petalpal-speech-release-hxq6cffq/candidate`. One local commit, clean candidate tree, NOT pushed/deployed. Original integration HEAD remains `2c3d855eae6916f5825294fe8b1cb33e8eed116f`; prior changes/stash retained.
- [x] **Three-file scope PASS:** lib/speech-transcription.js, server.js, test/back/speech-admission.test.js only. Middleware/test exactly match ace8ed16f5ba2ae88a2ed76db2a2878e983c5340; only its speech import/route additions adapted onto production server. No blind cherry-pick. Logging-only protection retained, including all unrelated server lines. DB resources, metrics/monitoring, pagination, mobile, dependencies and CI unchanged/excluded.
- [x] **Candidate-specific tests PASS 7/7:** original four admission regressions plus three existing speech format/Worker/API regressions, zero failed/skipped/cancelled. Covers default four process/one owner cap before parsing/reservation; successful requests; parser/size/validation/config/cost/provider failures and cleanup; partial-upload timeout/disconnect; abort forwarding and retention of occupied slot until noncooperative provider work settles. No historical CI-selector test copied or repeated. Synthetic audio/provider/cost fixtures only, no real authentication/provider/database access.
- [x] **Security/compatibility source PASS:** existing verified-identity authentication and HTTP limits precede admission; admission precedes existing 12 MB JSON parser. Existing 8 MB audio/MIME/signature validation, consent and non-refunded paid reservation remain; Whisper model/payload/90-second provider deadline unchanged. Upload deadline 30 seconds; busy responses remain generic 429/503 with Retry-After. No queue or extra inference added. Client cancellation aborts controllable fetch; remote provider completion/cost cancellation is not guaranteed. Raw audio cleared on handler settlement; no new logs. Process-local caps are not distributed protection.
- [x] **Scoped build/startup/schema compatibility PASS:** changed-file syntax, full server import without starting listener/migrations, diff checks and candidate Prisma generation PASS under explicit credential-free environment in env-free checkout. All 16 installed top-level dependency versions match candidate lock. Dockerfile/ignore, manifests/lock, Prisma config/schema/migrations/adapter, cost/auth/logging libraries, Worker and clients unchanged from production. Existing production-base Docker evidence reused; no new candidate Docker image or direct startup run. Reused dependency link moved outside candidate to sibling review-node_modules; generated client is ignored review output. No dependency upgrade/install or existing container action.
- [ ] **Candidate GitHub CI UNAVAILABLE:** historical integration run 37868402033 is not this SHA. Existing logging validation is pinned to the logging SHA; candidate has no speech regression workflow/runner, so no usable existing exact-SHA speech validation path. No workflow/settings changed and publication is not authorized. Candidate-specific remote CI remains a release gate.
- [ ] **Production capacity/latency UNKNOWN:** caps reduce admitted simultaneous work, but peak RSS, slow-mobile behavior, representative Whisper latency and throughput remain unmeasured. No production speech/upload/load requests authorized. Keep accepted single-instance topology; no scaling or DB-resource-limit release inferred.

**READY FOR DEPLOYMENT APPROVAL: NO.** Local validation complete; next approval is candidate publication plus a narrowly scoped exact-SHA CI validation path. Deployment requires a later separate approval after that gate and current safe service/baseline confirmation. Proposed bounded acceptance should separately authorize synthetic speech with an isolated verified identity, consent, paid-call budget and sanitized failure/cancellation observations; none executed here. Code rollback reference is exact logging base `1f8d0f98fb16b9553ae03c474f5952c808928e48`, with identical schema/configuration and working replacement credentials preserved; rollback would remove the new speech admission cap and requires approval. Do not deploy integration HEAD or combine blocked DB resource candidate 0ffdd3e.

**Logging homepage follow-up — USER-CONFIRMED PASS:** user confirms production homepage opens successfully on the accepted logging deployment. This resolves user-observed homepage availability only; the previous agent GET transport result remains historical UNKNOWN, and homepage header/body automation and production log-redaction acceptance remain uncertified. Canonical counts unchanged. Only original SECURITY.md and the matching manual homepage confirmation updated, left uncommitted; candidate contains no documentation changes. MOBILE.md, AGENTS.md and WARNING.md unchanged.

## Logging-only production acceptance — 2026-10-08

This supersedes earlier candidate-not-found/undeployed statements for exact-code presence only; historical evidence and canonical counts remain unchanged.

- [x] **Exact deployment PASS:** safe Render Deploys metadata for PetalPal_v2 / `srv-d983eguq1p3s73fnk1m0` reports Live `dep-db468kbbc2fs73ap2t70` and Last successfully deployed commit `1f8d0f98fb16b9553ae03c474f5952c808928e48`, matching the approved logging-only candidate. No deployment/retry/restart/rollback or configuration action taken during acceptance.
- [x] **Startup USER-CONFIRMED PASS within supplied scope:** user reports 25 migrations found, none pending, backend listening on port 10000, Mood model loaded and no confirmed startup failure. Exact Live SHA independently checked above; startup details are supplied sanitized evidence, not an agent log inspection or proof of absence of every error. Existing CI 6/6, Docker build, migration fingerprint and scoped schema/startup evidence reused without reruns.
- [ ] **GET / — UNKNOWN:** first bounded HTTPS attempt at 2026-10-09 03:55:03 UTC produced no HTTP response. Root 200/public HTML/header acceptance was not established; no retry. This is an inconclusive transport result, not evidence of application/startup failure.
- [x] **GET /session?view=metadata — PASS:** anonymous request returned 401 with only the expected generic authentication-required JSON. HSTS, CSP frame-ancestors restriction, X-Frame-Options DENY, nosniff, Referrer-Policy and private no-store checks PASS. Correlation `ad968ec2-0a8c-4c67-bc5a-b976178e2cc4`, observed 2026-10-09 03:55:43 UTC.
- [x] **GET /ai/reports — PASS:** deliberately invalid synthetic bearer returned 401 with only expected generic invalid/expired-token JSON; same security-header/no-store checks PASS. Correlation `97d20497-b668-42c4-bc86-0d349b64834d`, observed 2026-10-09 03:55:43 UTC. No real identity/token, private response content or paid AI request used. The two 401 bodies contain no extra diagnostic fields; this does not certify application logs.
- [ ] **LOG REDACTION ACCEPTANCE: UNKNOWN:** no request-correlated sanitized log-verification facility available; no general logs, deployment-detail logs or credential-bearing pages accessed. Runtime absence of token/claim/path/query echoes and provider exception/stack leakage remains unverified. CI/source results are not substituted for runtime acceptance. Root liveness check also remains outstanding; the authorized three request attempts are exhausted.

P0 logging remains PARTIAL: this release proves exact-code presence and two bounded HTTP rejection/header contracts, not production log redaction, retention/access/aggregation/alerting or full P0 certification. Firebase recovery retains USER-CONFIRMED PASS; historical trace retention/unauthorized use remain UNKNOWN. Prior rollback reference `d510b1ff97902704721060b4c1261657be3e4b76` remains separately authorized only and must preserve the replacement credential. No SQL/manual migration, tests/builds, secret access, mobile operational change or unrelated modification. Only this checkpoint and its matching manual evidence are included in the scoped documentation commit; prior uncommitted evidence remains separate.

## Authorized logging deployment attempt — 2026-10-08

**Read-only submission-status follow-up — 2026-10-08:** inspected both recent Render Deploys and deployment Events for the same service. No entry for `1f8d0f98fb16b9553ae03c474f5952c808928e48`; classification: **NO EVIDENCE OF ACCEPTED SUBMISSION**, not an accepted/running/failed deployment. Candidate deployment ID/timestamp unavailable. Current Live remains `d510b1ff97902704721060b4c1261657be3e4b76`, deployment `dep-db4578flot8c73frlk1g`; Events displays started October 8, 2026 at 7:38 PM (Environment updated), Live at 7:39 PM (dashboard display precision; timezone not independently attested). No newer candidate event observed. No deployment controls activated, logs accessed or acceptance GETs issued; candidate acceptance remains UNKNOWN. A new submission requires fresh explicit authorization. Only this evidence note added, left uncommitted; manual checklist unchanged because no provider status transition occurred. Prior records/counts preserved.

- [x] **Safe predeploy gates PASS:** Render Deploys metadata identifies PetalPal_v2 / `srv-d983eguq1p3s73fnk1m0`, Live deployment `dep-db4578flot8c73frlk1g`, exact source `d510b1ff97902704721060b4c1261657be3e4b76`; auto-deploy disabled. Remote release-candidate/logging-only-1f8d0f9 resolves to approved `1f8d0f98fb16b9553ae03c474f5952c808928e48`, whose sole parent is that baseline and whose six changed files match the accepted logging-only scope. No dependency/schema/startup/configuration change is required; accepted CI/build/migration evidence reused. Local rollback commit and historical Render rollback entry remain available. No secret/configuration page or credentials inspected.
- [ ] **Deployment BLOCKED / submission outcome UNCONFIRMED:** selected Manual Deploy → Deploy a specific commit, searched the full approved SHA and verified the matching GitHub commit link, selected it, then clicked Deploy Commit exactly once. Immediately returned to the metadata-only deployment list without inspecting deployment-detail logs. Subsequent list refresh showed no candidate entry and the previous SHA remained Live. No new deployment ID, acceptance confirmation or failure reason was obtained; navigation timing may have interrupted submission, but the cause is UNKNOWN. Do not classify this as a successful deployment or confirmed Render build failure. No second click, retry, substitute commit or rollback performed.
- [ ] **Candidate startup/migrations and acceptance NOT RUN:** correct candidate Live gate was not reached. No new evidence for startup/listening, 25/no-pending migrations or absence of startup errors. Exactly zero of the three authorized production GETs issued; no production log access. **LOG REDACTION ACCEPTANCE: UNKNOWN.** Prior baseline migration evidence is retained, not attributed to the candidate.

User-confirmed Firebase recovery remains PASS within its attested scope; prior trace retention and unauthorized historical use remain UNKNOWN. Next action: obtain sanitized Render confirmation whether this exact candidate submission was accepted; any retry requires fresh explicit authorization because one Deploy Commit click has already been made. Previous known-good/code rollback SHA remains `d510b1ff97902704721060b4c1261657be3e4b76`; preserve the replacement credential and require separate rollback approval. No environment/provider-setting changes, SQL, manual migrations, CI/test/build reruns or mobile changes. Only this checkpoint and its manual counterpart are included in the documentation commit; previous uncommitted evidence and canonical counts remain preserved.

## Firebase credential recovery / logging release checkpoint — 2026-10-08

Historical checkpoint: the replacement-functionality attestation remains valid; its exposed-key deletion conclusion is superseded by the later old-key retirement assessment. Prior release decisions remain historical evidence, not current credential-retirement certification. Canonical counts remain unchanged.

- [x] **USER-CONFIRMED PASS — replacement functionality:** user confirms the replacement Firebase Admin credential works in production. No independent agent credential/runtime inspection performed.
- [ ] **Exposed-key deletion — current UNKNOWN, historical confirmation superseded:** the earlier user statement that the exposed key was deleted is retained as historical evidence. The subsequent October 8 report lists August 25 and September 25 keys still present; no safe metadata maps either to the exposed key. Replacement functionality remains USER-CONFIRMED PASS, but complete old-key retirement and exposed-key deletion cannot currently be asserted. See the old-key retirement assessment below.
- [x] **USER-CONFIRMED production baseline:** Render is Live at source `d510b1f`, resolving to the previously recorded exact baseline `d510b1ff97902704721060b4c1261657be3e4b76`; 25 migrations found, none pending. Reused sanitized user evidence, not a fresh provider query or independent schema/drift certification.
- [ ] **Residual incident uncertainties:** prior tool/session traces and downstream copies/retention remain UNKNOWN; deletion/erasure is not claimed. Any unauthorized historical use remains UNKNOWN. Key deletion does not establish absence of past misuse or revoke previously issued sessions/tokens. Historical database-credential revocation remains a separate unresolved item.
- [x] **Logging-only READY FOR APPROVAL:** exact candidate `1f8d0f98fb16b9553ae03c474f5952c808928e48` remains a direct child of the user-confirmed production baseline. Reuse accepted exact-source GitHub run 37870891575 (6/6), isolated Docker build, 25/25 migration fingerprint, scoped schema/startup/configuration and rollback compatibility evidence. Six-file scope: lib/auth.js, lib/rate-limit.js, lib/security-events.js, server.js, test/back/auth.test.js, test/back/logging-privacy.test.js. No dependency, configuration requirement, database operation, migration or startup contract changes. Nothing here establishes candidate deployment.
- [ ] **Separate deployment approval REQUIRED:** no remaining release-specific predeployment evidence blocker is identified on the supplied baseline and existing accepted evidence. No repeat CI/build/migration test or full-schema inspection is needed for this unchanged logging delta. Preserve the working replacement credential and existing configuration; rollback, if separately approved, is code-only to `d510b1ff97902704721060b4c1261657be3e4b76`, never restoration of the exposed key. Fresh approval must name the exact candidate and existing Render service. The existing bounded synthetic GET/log-redaction acceptance remains pending **after** approved deployment, using sanitized human/provider PASS/FAIL only; no raw logs, private data or secret-bearing UI. Candidate startup, exact deployed code and production logging behavior are not yet verified. Any new baseline/configuration change requires scoped reassessment.

DB-resource candidate `0ffdd3e26ab60e3dc470aa46f725d7b5cd795ec3` remains independently BLOCKED by production capacity/proxy/latency evidence; do not combine it with this release or deploy integration HEAD. Broader App Check, social acceptance, alerts and other PARTIAL statuses are unchanged. No provider/credential access, production SQL, tests/builds, migration or deployment performed; MOBILE.md unchanged. Only this checkpoint and the matching manual confirmation are intended for the scoped documentation commit; earlier uncommitted evidence stays preserved separately.

## Security Status

Last updated: 2026-10-08

This file is the canonical implementation record for **PetalPal Security
Threat Model & Remediation Backlog — v2**. Every P0/P1/P2 item is retained as
an independent entry; no item has been deleted, merged, or reprioritized.
`✅ VERIFIED` requires explicit evidence for the stated completion criterion;
Production exact-code rollout and migration verification occurred on 2026-10-06; the shared-ledger certification below is now PASS FOR CURRENT PRODUCTION TOPOLOGY following read-only Cloudflare verification on 2026-10-07. Historical provider PASS evidence retains its original scope. Latest recorded backend deployment is `d510b1ff97902704721060b4c1261657be3e4b76` (Live on 2026-10-08; HTTP liveness 200); startup found 25 migrations and reported no pending changes. Prior production revision `db933de78a91ba505b06016db716bbf710530d7f` is the schema-compatible rollback target; older `8c3500116acc8a9ba0ee0e03dbd5cdc6b6e33316` evidence remains historical. Expo route policy is code/test PASS at `75cc1cc`; no deployed Expo/native artifact is certified. Atomic social fix `d510b1ff97902704721060b4c1261657be3e4b76` now has production deployment presence: 34 independent PostgreSQL tests and 14 affected regressions PASS; authenticated production social behavior remains unverified. CodeQL Default remains active; Advanced cutover is deferred.

| Priority | ✅ VERIFIED | ✅ TESTED | ✅ IMPLEMENTED | 🟡 PARTIAL | 🔒 MANUAL | ⬜ TODO | ⚪ N/A |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P0 | 0 | 5 | 3 | 19 | 0 | 0 | 0 |
| P1 | 0 | 5 | 1 | 11 | 5 | 1 | 0 |
| P2 | 0 | 0 | 0 | 8 | 2 | 2 | 5 |

Counts cover canonical backlog rows only; delta findings are cross-references, not extra rows. `🔒 MANUAL` includes blocked/manual-action rows; `⚪ N/A` includes not-applicable rows.

## Architecture / Trust Boundaries

```text
Mobile/Web App
    │ Firebase ID token
    ▼
Firebase Authentication
    │ verified claims + server UID mapping
    ▼
PetalPal Node.js / Express API
    │ Prisma / server-side ownership checks
    ▼
PostgreSQL

Backend ── server-only credential ──▶ Cloudflare Worker / AI inference
                                      │ Worker AI binding
                                      ▼
                                  AI provider

GitHub ──▶ GitHub Actions / release controls ──▶ Render ──▶ Production API
   │                                             │
   └── repository/deploy secrets                ├── Firebase Admin
                                                ├── Cloudflare
                                                ├── Storage
                                                └── Monitoring / Logging
```

The client is untrusted. Firebase is the identity boundary; the API is the
authorization, validation, and data-minimization boundary; the Worker is an
inference-only boundary. GitHub, Actions, Render, Firebase, Cloudflare,
storage, logging, database networking, and provider billing are operational
boundaries whose console settings cannot be proved from this repository.

## Authorization Matrix

`A` = Firebase-authenticated. `O` = authenticated owner. `S` = intentionally
social/public data, still behind authentication. Client `userId`, owner,
entitlement, and model fields are not trusted.

| Method/resource | Access rule | Evidence |
| --- | --- | --- |
| GET `/users`, `/users/search` | A; public summaries; bounded result sets | `server.js:584-655` |
| GET `/users/:userId` | A; public summary; own friend IDs only | `server.js:657-684` |
| GET `/users/:userId/friends` | A + O | `requireOwnUser`, `server.js:686-720` |
| GET `/users/:userId/garden` | A + S; private journal/AI only for O | `getGardenResponse`, `server.js:722-736` |
| POST `/auth/session` | Verified Firebase identity; profile fields selected | `server.js:738-843` |
| GET `/session`, check-ins, Fairy, AI consent, subscription | A + O derived from token | `server.js:1225-1551` |
| PUT profile/avatar/Fairy/AI consent | A + O; fields validated/allowlisted | `server.js:1166-1217`, `1436-1539` |
| PUT Fairy active | A; Fairy ownership query required | `server.js:1338-1367` |
| POST reports | A; reporter comes from `req.auth.userId` | `server.js:1553-1605` |
| POST friend request/remove | A; actor comes from `req.auth.userId` | `server.js:1612-1802`, `2075-2112` |
| GET/POST friend requests | A; list is O; accept/reject requires receiver | `server.js:1804-2073` |
| POST flowers / analyze mood | A + O; own consent and data path | `server.js:2114-2387`, `2988-3031` |
| GET/POST social flower support/message | A + S; target owner + resource are queried | `server.js:2389-2647` |
| DELETE flower/account | A + O; owned resources only | `server.js:2650-2696`, `3033-3086` |
| POST visit/move/leave | A; visitor identity is token-derived | `server.js:2698-2986` |
| Socket handshake/user/garden/movement | Token auth; user room and movement actor are token-derived; garden access requires current privacy/friendship authorization; delivery rechecks recipients | `lib/socket-security.js`, `test/back/realtime-security.test.js` |
| POST `/events`, GET/DELETE `/events/:eventId` | A + O; actor derived from token; source lifecycle fenced | `lib/ai-events.js`, Event route tests |
| GET `/ai/memories/:memoryId`, `/ai/reports`, `/ai/reports/:reportType/:reportId` | A + O; metadata discovery and owned detail; consent-gated reads; local lifecycle evidence in DELTA-P1-1 | AI Event/private report route tests |
| POST `/ai/reports/weekly/trigger` | A + O; versioned create-or-return; current claim/consent/source final fence and shared pre-provider quota | Report worker/fence/cost tests |
| POST `/speech/transcribe` | A; bounded audio, paid preflight and no-store response; no Event creation | Speech/cost gate tests |
| Internal AI job discovery/execution | Private service authentication; opaque job IDs; canonical owner/consent/lease checks | Async dispatch/route tests; LONG_TERM_AI.md recorded Queue cutover |

Legacy authentication endpoints return `410`: `/register`, `/login`,
`/auth/email-code/request`, `/auth/email-code/verify`,
`/legacy-register-disabled`, and `/legacy-login-disabled`.

## P0/P1 speech resource admission — 2026-10-08

- [x] **Confirmed local risk / feasible remediation:** the active authenticated speech route allowed multiple 12 MB JSON uploads per owner/process concurrently. Per-window HTTP and daily paid-call quotas do not cap simultaneous parsed bodies, and the provider timeout retains request audio for up to 90 seconds. This is the app-controlled aggregate-resource gap in P0 AI Cost & Resource Abuse Protection / P1 API Flood & DoS, distinct from distributed/provider/capacity blockers.
- [x] **Focused implementation and regressions PASS (4/4):** admission precedes the speech body parser and quota/provider work; at most four requests per process and one per verified owner, with no upload queue. Same-owner saturation returns 429, aggregate saturation 503, both with Retry-After: 1 and generic retry/type guidance. Successful transcription retains its response contract. Parser/validation/config/cost/provider failures and completion clear audio and release admission. Interrupted uploads release admission; incomplete upload processing has a 30-second deadline. Client disconnect cancels provider fetch; a running handler retains its slot until settlement even if the provider ignores abort, preventing cancellation from bypassing the bound. Existing paid reservations are not refunded/replayed.
- [x] **Isolation/evidence:** four new real-loopback Express regressions exercise concurrent distinct owners and same-owner rejection before parsing/reservation, successful transcripts/recovery, failure cleanup, interrupted/deadline uploads, and disconnected provider work/cancellation. Providers/cost gates are synthetic; tracked-source execution uses a disposable env-free copy and the nonconnecting fixture DB URL. No real Firebase/PostgreSQL/provider/production access or accepted matrix rerun.
- [x] **Scoped validation PASS:** four new admission cases and the one affected CI-selector contract pass (5 unique tests); only the two cancellation/deadline cases were rerun after final cancellation handling/test timing changes. Changed JS syntax and diff checks PASS. No TypeScript files changed. All four new cases are selected by existing security CI without workflow/provider changes. No accepted suite rerun locally.
- [ ] **Rollout / broader protection:** not deployed; the new automatic GitHub result is pending at commit preparation and will be reported only if observed. Process-local admission is not distributed enforcement or a production memory/load certification; other large routes, provider currency spend and aggregate worker/instance capacity remain unresolved. Canonical statuses/counts stay unchanged; Enumeration PARTIAL and DB SAFE TO DEPLOY NO remain.

## Next confirmed local fix — feasibility stop, 2026-10-08

- [x] **Scoped backlog selection completed:** canonical P0/P1 entries and their relevant existing follow-ups identify no additional confirmed, untreated app-controlled defect with a demonstrated backward-compatible local fix under this task's exclusions. The four feature P1 findings already have TESTED corrections; accepted speech/auth/logging/monitoring fixes are not repeated. Coverage gaps and uncertified free-prose correctness are not themselves evidence of a new exploitable defect.
- [ ] **Implementation stopped:** remaining recorded actions require excluded provider/manual/runtime evidence, dependency/framework constraints, distributed/capacity work, or legacy/pagination contract changes. A specific reproducer for another app-controlled defect is needed before a new correction; this scoped selection is not a broad audit or security closure.

No application/test/config change, test rerun, commit/push or new CI run. Documentation diff check PASS; historical evidence and canonical counts/statuses remain unchanged. DB SAFE TO DEPLOY stays NO. This feasibility note remains uncommitted; no speculative remediation or diagnostic suite was added.

## Release delta classification — 2026-10-08

- [x] **Exact recorded baseline:** `d510b1ff97902704721060b4c1261657be3e4b76` (last recorded production Live, not freshly reverified) is an ancestor of branch HEAD `ace8ed16f5ba2ae88a2ed76db2a2878e983c5340`; 21 later commits. Deployed atomic social authorization and all baseline ancestors remain the release starting point. No post-baseline runtime change is established as deployed by this analysis.

| Classification | Commits / release meaning |
| --- | --- |
| Locally tested, unreleased runtime fixes; potentially separable | `8046275` authentication/HTTP log privacy (6 affected tests); `ace8ed1` speech admission (4 regressions + 1 CI selector); `8385575` mobile authoritative message refresh (13 affected tests); `c09d269` opt-in Journal pagination and complete-history client (8 affected tests). Existing evidence reused; no new candidate execution. |
| Release-blocked / coupled | `0ffdd3e` pool/query resource configuration remains NO, with 1/4 release gates PASS. `5b87b0a` monitoring directly modifies that commit's new `lib/database-resources.js` and its tests import `createDatabasePool` / `MonitoredDatabaseClient`; the whole monitoring commit cannot be assumed independent. |
| CI/test evidence, no product runtime fix | `01ac98b`, `c3726a2` add CI/script configuration; `6f8dfd8` repairs its Socket transaction fixture. `deaf70b`, `3d2fd55`, `ddb7051`, `ea5640a`, `30d57db`, `a6ed4f6` add acceptance/regression evidence only. These do not mean another application change was deployed. |
| Documentation-only | `8c28d69`, `8847d7a`, `4a56ec1`, `b132134`, `50d9be7`, `550d67e`. Retain their historical scopes; they do not add runtime release dependencies. |

- [x] **Dependency distinction (source only):** blocked resource integration is in `lib/prisma.js`, `lib/garden-access.js`, `lib/http-errors.js` and new `lib/database-resources.js`. Logging privacy adds its own route-class helper to existing security events and does not semantically require new pool limits or metrics. Its server diff context includes the earlier metrics import, so applying a whole commit/file blindly is not certified. Current security-event/log modules also contain monitoring additions; copying HEAD files can silently carry those along. Speech's handler was unchanged between production and its fix's parent; the fix uses the existing cost/consent API and Node 24 facilities, with no new resource-module import. Its server and CI-runner edits still need separate integration review. Mobile refresh touches independent client files whose only post-production runtime commit is `8385575`. Journal's new helper/route/client edits do not call the resource module; root paging retains legacy arrays and older-server client fallback, but remains a larger server/client release scope.
- [x] **Build/schema source boundary:** production-to-HEAD Dockerfile, Docker ignore rules, root lockfile, Prisma config/schema/migrations, Worker code and mobile manifests/locks are unchanged. Root package.json only adds the CI command; web-source delta is a test. This establishes source differences, not a candidate build/startup PASS. Existing startup still invokes migrations and needs a reviewed no-new-migration manifest.
- [ ] **Possible independent scope, not SAFE:** smallest proposed backend candidate is the `8046275` logging fix and its affected regressions over exact production, retaining production DB adapter/resource behavior and excluding `0ffdd3e`/whole `5b87b0a`. Speech may be a subsequent independently reviewed addition. Mobile refresh is a separate mobile/Expo artifact candidate; a backend deployment cannot release it. Journal server/client rollout is optional separate scope. No candidate tree, branch, cherry-pick or release artifact was created, and clean application of commits is not claimed.
- [ ] **Exact missing evidence:** construct/review the eventual exact candidate diff and imports, prove DB files/options remain at production and no blocked code is transitively introduced, then run its affected regressions, candidate-specific CI and clean Docker/startup compatibility checks. Current integration CI PASS includes blocked resource code and cannot certify the recombination. The workflow only auto-pushes on integration; an eventual candidate needs its supported PR/dispatch execution and a complete matching test selection (do not copy selectors referencing omitted test files). Release also needs current deployed-SHA confirmation, schema/config/rollback review and authorized operational acceptance. Existing DB-specific capacity/proxy/deadline/monitoring gates remain NO for the resource candidate; do not transfer that configuration into this smaller scope.

**Disposition:** source-level separation is feasible to pursue, deployment readiness is unproven. Recommend a separately authorized candidate-preparation task for logging privacy first. Analysis-only: no tests/builds, provider requests, code changes, branch changes, commit or push. Documentation diff check PASS; prior uncommitted feasibility evidence, history and canonical counts remain intact. No new routine CI PASS entry or manual-provider status change.

## 🔴 P0 — Critical / Launch Blockers

Each row preserves the canonical project name exactly. Evidence is limited to
what was inspected or tested; “manual” means platform/account action remains.

| Canonical item | Status | Evidence / finding / next action |
| --- | --- | --- |
| Secrets Management & Leakage Prevention | 🟡 PARTIAL | Current tracked live-secret findings: 0. Historical Firebase Web config is public client configuration; a historical `DATABASE_URL` exists in Git history, while current source no longer references that credential. `.env` is ignored and `.env.example` contains safe placeholders/public configuration only. Current provider-side configuration was reviewed, but revocation of the historical database credential is not independently verified; repository evidence therefore remains partial. |
| Production Control-Plane Account Security | 🟡 PARTIAL | GitHub, Cloudflare, Firebase/Google account and access reviews are PASS. Render monitoring remains PARTIAL / PLAN-LIMITED; no paid upgrade is required for P0 closure. |
| API Authorization / IDOR / BOLA | 🟡 PARTIAL | Historical HTTP mutation inventory and owner/forged-field regressions retained. Current Event/memory/report paths are owner-scoped; report final writes and Socket joins/actions/recipient delivery now have explicit negative and revocation coverage (DELTA-P1-2/3). No longer missing Socket coverage. Complete current-route/Firebase E2E and independent PostgreSQL/distributed deployment validation remain; historical 21-route inventory is not a current total. |
| Privilege Escalation / Mass Assignment | 🟡 PARTIAL | HTTP allowlists and server-controlled identity/entitlement guards retained. Strict unknown-field checks now cover profile locale, private Journal text/photo, Garden privacy, AI consent and speech bodies; owner authorization ordering preserved. Current report claims/evidence and Socket movement identity cannot come from client actor fields; forged/cross-owner negatives pass (DELTA-P1-2/3). Broader current field-by-field runtime coverage and live-provider verification remain. |
| Client Token Storage & Leakage Prevention | ✅ TESTED | Web token handling regressions remain TESTED. iPhone uses Firebase JS 12.19.0 / @firebase/auth 1.13.6 with getReactNativePersistence(AsyncStorage 2.2.0), not native Firebase Auth/Keychain. SDK persists serialized user metadata plus ID/refresh tokens; inspected PetalPal auth/session paths neither manually persist nor log them. AsyncStorage requests iOS backup exclusion by default, but is not an encrypted credential store. Effective file protection, exclusion success and release backup/restore remain PARTIAL; see credential review below. PetalPal-owned cache runtime remains 7/7 PASS. |
| Service-to-Service Authentication | ✅ TESTED | Environment-only Worker bearer and fail-closed Worker input/output controls retained. Queue/private executor carries opaque job IDs; canonical owner/consent/claim checks stay on the backend (`lib/ai-async-dispatch.js`, async route/dispatch tests). The 2026-09-29 production Queue contract is recorded in LONG_TERM_AI.md; latest fences/cost controls are locally tested, not newly production-verified. Manual deployment/rotation remains separate. |
| AI Cost & Resource Abuse Protection | 🟡 PARTIAL | Daily Grow replay/20-concurrent-request evidence, input bounds, timeouts and fallback retained. Commit `8cf1a6e` adds shared PostgreSQL owner/action/day quotas, global/provider call ceilings, zero-limit shutdown, durable non-replay reservations and pre-provider gates for reports/retrieval, remote embeddings, Event emotion/preview and speech (DELTA-P1-4; 125 scoped tests PASS). These are call-attempt ceilings, not currency budgets; two isolated independent-connection cost races PASS and deployed shared-ledger enforcement is PASS FOR CURRENT PRODUCTION TOPOLOGY. Provider/direct-credential currency spend, broader queue/aggregate capacity, future multi-instance live certification and crash-after-reservation availability remain unresolved. |
| Multi-Dimensional Abuse Prevention | 🟡 PARTIAL | User/IP HTTP limits remain process-local; Socket per-socket/user/action/packet/inflight bounds are tested (DELTA-P1-3). Paid AI adds durable owner/action/global/provider allowances (DELTA-P1-4). Combined IP/account anomaly detection, registration abuse and distributed realtime enforcement remain incomplete. |
| Trusted Proxy / Client IP Configuration | ✅ TESTED | Express `trust proxy` defaults false; explicit hop/address configuration is validated in `lib/security-config.js` and `test/back/security-config.test.js`. Verify the Render/Cloudflare chain manually before enabling a value. |
| Request Size / JSON Body Bomb | ✅ TESTED | General Express JSON limit remains 32 KB with bounded fields/depth/keys/arrays. Route-specific exceptions include authenticated speech (12 MB parser, 8 MB validated audio) and bounded preview input; the generic limit is not universal. Speech signature/format/base64/size and Socket packet bounds have scoped test evidence. Production aggregate resource limits remain separate. |
| Sensitive Logging & Observability Security | 🟡 PARTIAL | Structured errors/events omit stacks, bearer-like values and private text; worker failure persistence/results/logs now allow only safe codes and generic messages (DELTA-P1-4). Workers Logs invocation/persistence and recorded 3-day Free-plan retention retained. 2026-10-08 local logging review fixes two active gaps: rejected Firebase diagnostics no longer emit unverified JWT claims/provider error text, and HTTP security events use registered route patterns or a fixed pre-routing fallback instead of client-controlled paths. Four new checks and two affected auth regressions PASS; not deployed. Reviewed raw timing output contains only elapsed milliseconds and Socket errors use the existing redacted logger. Third-party telemetry and deployment-wide retention/redaction remain operational follow-ups. |
| Debug / Admin / Internal Endpoint Exposure | 🟡 PARTIAL | Legacy auth remains 410; API docs are development-public and production fail-closed unless explicitly enabled, with unit evidence. Manual checklist records production API_DOCS_ENABLED=true absent (PASS at that review). DELTA-P2-3 adds an authenticated-root production route allow-policy and targeted production-mode tests; deployed Expo/native release artifacts remain unverified. No blanket production-exposure certification. |
| Software Supply-Chain Security | 🟡 PARTIAL | Historical `npm audit --omit=dev` (2026-09-14): 10 transitive advisories, 4 high / 6 moderate / 0 critical. 2026-10-08 compatible root/web/mobile lockfile remediation removes 31 unique advisories across those locks (2 critical / 15 high / 11 moderate / 3 low); 13 unique advisories remain (8 high / 4 moderate / 1 low). Engine.IO public transport flaw fixed; Express proxy-trust fix verified for vulnerable subnet configurations. 53 affected tests, isolated installs, web build and dependency checks PASS; no deployment or GitHub alert closure claimed. See dependency evidence below and SDK-57 router follow-up: active URLSearchParams path verified, one moderate decoder advisory now locally MITIGATED by a bounded CommonJS upstream backport compatible with query-string 7; registry/GitHub alert closure is not claimed. Framework constraints, upstream patches, SBOM/lifecycle review and remediation SLA remain open. |
| CI/CD & Release Security | 🟡 PARTIAL | Historical repository inspection found no workflow file. Read-only GitHub evidence (2026-10-08) now confirms managed CodeQL on main; scoped JS/TS workflow uses pinned official actions, contents:read / security-events:write, no build/install/deploy or application secrets. CodeQL Default remains active; Advanced cutover is deferred, with its activation/execution unverified (SAST evidence below); branch/release gates and credential settings remain manual. |
| Production / Development Environment Isolation | 🟡 PARTIAL | Client/public and Admin/Worker secrets remain separated. Manual Render/Cloudflare isolation reviews are PASS for their recorded scope; LONG_TERM_AI.md records separate production Queue dispatch and disabled staging reconciliation Cron (2026-09-29). Whole-environment DB/storage/credential isolation and current release artifact settings are not inferred from those checks. |
| Database Network Isolation & Least Privilege | 🟡 PARTIAL | Prisma uses `DATABASE_URL`; no separate migration credential is configured, so runtime/migration currently share the credential. `AuditEvent` Level 1 application-side create-only implementation and real local PostgreSQL validation are PASS. Level 2 is **PROVIDER-LIMITED / NOT VERIFIED**: current environment cannot verify production PostgreSQL role/grant capabilities, and Prisma pooled/direct URLs from one credential pair do not create role separation by themselves. This is not a repo P0 blocker; verify provider role/grant support and configure separate roles manually. |
| Backup, Restore & Ransomware Resilience | 🟡 PARTIAL | Backup existence and isolated restore drill are PASS. Provider-specific retention, encryption, and access-restriction metadata remain not independently verified. This is retained as provider-limited follow-up, not a repo P0 blocker. |
| Security Monitoring & Anomaly Detection | 🟡 PARTIAL | Existing redacted events retained; 13 fixed application counters and bounded periodic aggregate logs now cover DB resource failures, AI failures/retries/lease/quota denials and auth/security rejections. Four focused instrumentation tests PASS; NOT deployed. No private labels, per-request metric DB writes or speculative thresholds. Aggregation, retention, alert routing and production thresholds remain operational follow-ups; historical Cloudflare monitoring evidence retained. |
| Tamper-Resistant Security Audit Logging | 🟡 PARTIAL | `LEVEL_1`: durable selected `AuditEvent` persistence and application create-only repository are implemented and real local PostgreSQL validation is PASS. `LEVEL_2` is **PROVIDER-LIMITED / NOT VERIFIED**: DB-enforced runtime/migration role separation and INSERT-only grants remain unverified; do not claim INSERT-only grants or ALTER/DROP protection were verified. |
| Incident Response Runbook | ✅ IMPLEMENTED | Runbook is below and covers containment, disable/revoke, rotate, investigate, recover, verify, notify, and each named compromise scenario. No timed exercise was performed. |
| Systematic Threat Modeling | ✅ IMPLEMENTED | Trust-boundary/data-flow model and matrix are above. Formal review/sign-off remains outstanding. |
| Security Regression & Business Logic Test Suite | 🟡 PARTIAL | Historical auth/body/Worker/logging/Daily Grow suites and local AuditEvent Level 1 PostgreSQL validation retained. Request-object hardening: 25 scoped tests PASS, covering dangerous keys, strict fields, owner identity, prototype invariance and existing mutation/consent behavior. Report fences: 98 scoped tests/33 added; realtime revocation/flood: 43 scoped tests/22 added; AI cost: 125 scoped tests/13 added (overlapping suites, not additive totals). The initial stubs/PGlite are complemented by 16 isolated real-PostgreSQL cases (14 report, 2 cost; four independent connections) documented in DELTA-P1-2/4. Live Firebase propagation, production alerting and load capacity remain unverified. Exact-code rollout and current-topology shared-ledger enforcement are recorded PASS below; other runtime scopes remain separate. September production Queue evidence is separately scoped in LONG_TERM_AI.md. |
| LLM Trust Boundary & Prompt Injection Defense | 🟡 PARTIAL | Inference Worker schema/enum/bounds and malicious input/output regressions retained. Active owner-private RAG uses fixed instructions, serialized evidence, bounded aggregates and citation allowlists; final persistence rechecks owner/consent/source/lease (DELTA-P1-2). DELTA-P2-1 now validates exact Event totals in supported count grammar against the supplied aggregate and required citation, and rejects recognized unsupported numeric claims. Arbitrary free-prose truth remains uncertified. |
| LLM Secret Leakage Prevention | ✅ TESTED | Credentials remain in Worker/backend environment and are not model messages; Worker tests prove secret/provider/input details are not logged or returned. Cloudflare Workers AI Customer Content handling documents no model training or service improvement without explicit consent; applicable DPA terms are documented. Exact ordinary inference retention remains unspecified. |
| AI Memory / RAG Tenant Isolation | 🟡 PARTIAL | Journal excluded from emotion/long-term AI; Event owner derives from Firebase identity. Composite owner FKs, owner-scoped pgvector/profile/revision/eligibility checks, canonical evidence and Event/account deletion controls exist. September production Queue/BGE/vector retrieval smoke is recorded in LONG_TERM_AI.md. Current atomic report source/consent/claim fence is tested (DELTA-P1-2); isolated independent-connection report interleavings now pass (DELTA-P1-2); revoked-consent read/cleanup and no-resurrection regrant policy now have TESTED controls (DELTA-P1-1); deployed/broader database validation remains unresolved. No external vector store is introduced. |
| Sensitive Data Classification & Minimization | ✅ IMPLEMENTED | Existing classification, metadata allowlists and manual production metadata/no-store evidence retained. Firebase SDK-owned refresh tokens, ID tokens and serialized auth records are Highly Sensitive; PetalPal does not create an additional durable auth-token cache in the inspected auth/session transport paths. Ordinary file storage, historical backup retention and unverified release restore remain separate from the accepted placement-cache lifecycle. Existing broader metadata/retention limitations remain open. |
| AI Provider Data Exposure | 🟡 PARTIAL | Existing Cloudflare no-training-without-consent and DPA v6.4 evidence remains PASS. Data contracts now include selected private Event evidence/bounded report aggregates, embedding inputs and request-scoped speech audio; credentials and unrelated actor/profile fields stay server-side. Speech audio is not written/logged by the handler and is cleared after provider handling. Ordinary inference retention duration remains unspecified; new-flow provider policy/logging confirmation and Canada-only/single-region guarantees are NOT VERIFIED. See manual §7/§10. |

## 🟠 P1 — High Priority

| Canonical item | Status | Evidence / finding / next action |
| --- | --- | --- |
| Credential Stuffing / Brute Force | 🟡 PARTIAL | Backend session probes are throttled before parsing/token verification; IPv6 subnet and verified-UID session budgets resist address rotation, successful responses refund the shared IP budget, and active limits survive cache pressure. 31 targeted tests PASS (2026-10-08; evidence below). Direct Firebase password/signup attempts bypass backend limits; App Check is not yet configured based on user-observed onboarding UI (2026-10-08), with setup deferred until Expo/native release compatibility is validated; provider quotas, reCAPTCHA enforcement and distributed abuse remain unverified. Backend account deletion now requires verified sign-in within five minutes (13 targeted tests PASS; provider-verification follow-up below). |
| Account Enumeration | 🟡 PARTIAL | App-controlled web/mobile login and registration feedback is sanitized; unauthenticated session errors omit provider diagnostics even when the diagnostic flag is enabled. 70 targeted auth tests PASS (2026-10-08; evidence below). Production Firebase Email Enumeration Protection is ENABLED (user-observed Console screenshot, 2026-10-08); direct Firebase signup still exposes EMAIL_EXISTS even with protection enabled, and success/failure differences remain. No active reset or credential-linking UI/API; verified-own-email legacy profile linking remains authenticated. |
| Account & Session Lifecycle Security | 🟡 PARTIAL | Prior production-login and owner-delete/Socket lifecycle evidence retained. Seven isolated physical-iPhone placement-cache scenarios PASS. PetalPal awaits Firebase JS signOut; successful SDK persistence removal clears the current local auth record, not provider-wide refresh sessions or historical backups. Failed storage/sign-out is not verified erasure. Deleted-user refresh tokens are invalidated; cached ID JWTs require relying-party revocation/account checks or expiry. Broader lifecycle/propagation and release restore remain unverified; see credential review below. |
| SQL / ORM Logic Injection | ✅ TESTED | Structured Prisma filters; new pgvector/lease SQL uses constant statements with bound parameters despite `$queryRawUnsafe` naming. Owner/profile/revision predicates reviewed in `lib/semantic-retrieval.js`; real PostgreSQL isolation matrix not rerun in this delta. |
| API Flood / DoS | 🟡 PARTIAL | Socket payload/action/user/inflight bounds and shared paid-AI call ceilings are TESTED (DELTA-P1-3/4). Speech now has pre-parser owner/process concurrency admission and disconnect cleanup (four new local regressions PASS, not deployed; checkpoint above). General HTTP limits remain process-local; other queue/aggregate bounds and deployment capacity/deadlines remain incomplete. |
| Database Connection Exhaustion | 🟡 PARTIAL | Application pool now caps 10 connections / 20 waiters, acquisition at 2s, server statements at 10s and lock waits at 1.5s; interactive transactions explicitly use maxWait 2s / timeout 5s. Four new isolated real-PostgreSQL checks PASS (evidence below). Not deployed; production connection budget, latency, aggregate worker/instance capacity and monitoring remain unverified. |
| Race Conditions | 🟡 PARTIAL | Daily Grow 20-request evidence retained. Report source/consent/claim/lease final fencing and shared non-replay cost reservations are tested (DELTA-P1-2/4); Socket paused-work revocation is tested (DELTA-P1-3). Report fencing now additionally passes isolated PostgreSQL independent-connection interleavings with observed lock waits and no deadlock/retry in the exercised schedules (DELTA-P1-2). Two shared cost reservation/quota races also pass (DELTA-P1-4). Broader schedules, deadlock/retry recovery policy and multi-instance deployment verification remain unresolved. Atomic HTTP social authorization now has independent PostgreSQL evidence below; production/realtime limitations remain. |
| XSS / HTML / URL Injection | 🟡 PARTIAL | Four focused active-sink checks and five new negative tests PASS (2026-10-08; evidence below). Reviewed journal/social/AI content remains React/RN text; current external links are fixed HTTPS and visitor navigation uses a fixed route with parameters. No confirmed exploitable injection path in this scope. Dynamic external URL/WebView/HTML rendering would require separate validation; deployed browser/native behavior is not certified. |
| CORS Misconfiguration | ✅ TESTED | Explicit `CORS_ALLOWED_ORIGINS` allowlist protects HTTP and Socket.IO; evidence: `lib/security-config.js`, `server.js`, `test/back/security-config.test.js`. Production origin list requires review. |
| Cache / CDN Cross-User Leakage | 🟡 PARTIAL | Central private no-store implemented/tested before authentication, CORS and parsing, including session/Garden/AI/report/speech paths. Clean revision 219b7ef is Live and anonymous production AI 401 now returns no-store; public root remains public max-age=0. User-reported manual authenticated /session HTTP 200 verification: two fresh requests both no-store/CF DYNAMIC, no Age, distinct CF-Ray; scoped PASS. Global CDN and cross-account isolation remain unverified (DELTA-P2-4). |
| DNS / Domain Account Hijacking | 🔒 BLOCKED / MANUAL ACTION REQUIRED | Enable registrar/Cloudflare MFA, restrict DNS members, and enable DNSSEC where supported. |
| Malicious Model Output / AI JSON Injection | ✅ TESTED | Worker schema/enum/bounds and backend citation allowlists tested. DELTA-P2-1 numeric grounding/type/schema regressions now reject contradictory totals and citation laundering before persistence. Citation membership alone still does not certify arbitrary prose. |
| Cloud Configuration Review | 🔒 BLOCKED / MANUAL ACTION REQUIRED | Existing GitHub/Render/Cloudflare/Firebase account and configuration reviews retain their recorded PASS scopes. New feature deployment policy, shared AI ledger/quotas, runtime grants, live revocation and private caching need manual checks (§10); provider/plan limitations are not blanket failures or new verification. |
| SAST / Static Security Analysis | 🟡 PARTIAL | Historical local inspection found no scan workflow. Public origin supports official CodeQL; existing managed JS/TS scan on main succeeded. Added scoped, pinned CodeQL security-extended workflow/config; local syntax/config checks PASS. CodeQL Default remains active; Advanced cutover is deferred and its variable gate must remain disabled. The gate prevents duplicate default/advanced scans; integration coverage/results and finding triage remain unverified. No mandatory branch check configured. See evidence below and manual §2. |
| DAST / API Fuzzing | 🟡 PARTIAL | Historical: no staging fuzz/security-scan job or release gate found. Added credential-free `npm run test:dast`: actual loopback Express requests, bounded deterministic negative corpus, mocked Firebase identity and fail-closed persistence/network isolation. 159 requests / 8 new tests PASS; 6 affected HTTP-security tests PASS. Three boundary defects corrected (dotted private API auth bypass, inherited report-type dispatch, malformed route encoding 500). Social/content-type extension: 102 additional loopback requests / 10 tests PASS; direct Flower Garden-policy bypass and unsupported-body/encoding defects corrected. Full route/transport coverage, real-provider/database behavior and release gates remain unverified; see isolated DAST evidence below. Atomic HTTP social authorization now has independent PostgreSQL evidence below; production/realtime limitations remain. |
| Runtime Security Headers | ✅ TESTED | Clean revision 219b7ef is deployed Live; fresh root/static 200 and anonymous AI 401 retain HSTS, CSP/frame-ancestors, nosniff, DENY and Referrer-Policy. Diagnostic marker is removed. Targeted regressions PASS; scope is inspected hosting/response paths. |
| Encryption at Rest & Key Scope | 🔒 BLOCKED / MANUAL ACTION REQUIRED | Verify PostgreSQL/object storage/snapshot/backup encryption and least-privilege keys. |
| Developer Endpoint / Device Compromise | 🔒 BLOCKED / MANUAL ACTION REQUIRED | Require OS updates, passkeys, disk encryption, reduced local production secrets, and tested revoke/recovery. |
| App Reverse Engineering | ✅ IMPLEMENTED | Client bundle, endpoints, Firebase web config, and UI rules are treated as public; authorization is backend-only. |
| App Attestation / Direct API Automation | ⬜ TODO | Firebase App Check/device attestation is not configured; evaluate as an abuse signal, never as sole authorization. |
| Prototype Pollution / Unsafe Object Merge | ✅ TESTED | No untrusted deep merge/mass-assignment vulnerability identified in inspected HTTP paths. Existing bounded parsed-body traversal now rejects exact own keys `__proto__`, `prototype`, `constructor` at any supported depth, including objects in arrays. Standard JSON parser and early speech/Journal-photo paths covered; opt-in strict mutation-body fields tested. Future features/libraries and non-HTTP object boundaries are not universally certified. |
| Privacy API Enumeration | 🟡 PARTIAL | Authentication/owner/social authorization evidence retained. Opt-in Journal keyset pages now bound root reads and verify owner-scoped anchors; Bookhouse loads all pages without truncating legacy arrays. Four Journal slice checks / 8 affected tests PASS, not deployed. Legacy unpaged Journals, Garden Flower lists/metadata and nested messages remain unbounded; no full enumeration remediation claimed. Existing directory/search/friend/request/check-in/report caps retained. Legacy retirement, remaining pagination/policy and read-volume anomaly detection remain open; original compatibility checkpoint is preserved below. |
| External Security Review | 🔒 BLOCKED / MANUAL ACTION REQUIRED | Commission scoped independent pentest/bug-bounty review and remediate high/critical findings before release. |

## 🟡 P2 — Medium / Feature-Triggered Hardening

| Canonical item | Status | Evidence / trigger |
| --- | --- | --- |
| SSRF | ⚪ NOT APPLICABLE | No user-influenced server URL fetch. Trigger: URL preview, AI fetch, or import. |
| Path Traversal | ⚪ NOT APPLICABLE | No filesystem-path upload/download API. Trigger: file/object retrieval. |
| Malicious File Upload | 🟡 PARTIAL | Authenticated speech ingestion is now present: bounded M4A/WebM/Ogg base64/signature/size validation, request-only audio and safe output/error handling are tested (`test/back/speech-transcription.test.js`). Paid speech preflight is covered by DELTA-P1-4. No general attachment/file storage API; deployed provider handling/resource limits remain unverified. |
| Regex DoS / Event Loop Blocking | 🟡 PARTIAL | Only bounded simple ID regexes; audit future custom patterns. |
| Slow Query / Expensive Search | 🟡 PARTIAL | Bounded `take` values and user timeline indexes exist; timeouts/pagination/result policy incomplete. |
| Indirect Prompt Injection | 🟡 PARTIAL | Active private Event retrieval now crosses the report-model boundary. Fixed system instructions, serialized user evidence and citation allowlists tested; DELTA-P2-1 adds deterministic Event-total checks and a fail-closed policy for recognized numeric language. Open-ended semantic truth remains uncertified. |
| RAG Poisoning / Source Integrity | 🟡 PARTIAL | Owner-private retrieval/embedding revisions and atomic report final source existence/owner/currentness/period/consent/lease checks are now tested (DELTA-P1-2). Deletion ordering, row-lock waits and rollback now also pass isolated PostgreSQL independent-connection tests (DELTA-P1-2). DELTA-P2-1 exact Event totals are now deterministically checked; broader/deployed DB races and open-ended semantic claim correctness remain separate limitations. |
| Scraping / Bot Management / WAF | 🔒 BLOCKED / MANUAL ACTION REQUIRED | App limits exist; Cloudflare WAF/managed rules/bot signals are not verified. |
| Push Notification Privacy | ⚪ NOT APPLICABLE | No push feature. Trigger: locked-device notifications. |
| Root / Jailbroken Device Risk | 🟡 PARTIAL | Firebase JS session credentials use ordinary AsyncStorage files, with iOS sandbox/Data Protection rather than Keychain access classes. AsyncStorage 2.2.0 requests backup exclusion by default; actual release attributes/restore remain unverified. PetalPal-owned cache runtime remains 7/7 PASS. No rooted-device confidentiality, Secure Enclave credential isolation or cryptographic deletion is certified. App Check is complementary abuse/attestation enforcement, not protection against local token extraction. |
| Payment / Subscription Forgery | ⚪ NOT APPLICABLE | No payment/receipt/webhook activation; current entitlement is read-only. |
| Deep Link / Firebase Action-Link Hijacking | 🟡 PARTIAL | Passwordless callback uses current origin `/finish-sign-in`; Expo production pathname denial is tested at the authenticated root before routed content mounts (DELTA-P2-3). Approved-domain/universal-link, hostile-redirect and native release-artifact tests remain. |
| WebSocket / Socket.IO Authorization | 🟡 PARTIAL | Current identity/privacy checks at joins, actions and recipient delivery; bilateral revocation, paused-work fencing and flood bounds pass deterministic HTTP/Socket runtime tests (DELTA-P1-3). Real Firebase propagation/latency and distributed deployment remain unverified. |
| Webhook Forgery / Replay | ⚪ NOT APPLICABLE | No external webhook. Trigger: payment/store webhook. |
| Attack Surface Monitoring | ⬜ TODO | No scheduled domain/service/port/public-endpoint inventory found. |
| Honeytokens / Canary Secrets | ⬜ TODO | No canary or alert sink found; design only after alerting exists. |
| Periodic Pentest | 🔒 BLOCKED / MANUAL ACTION REQUIRED | Re-test after auth/RAG/payment/major architecture changes and add to release policy. |

## Dependency Vulnerability Remediation — 2026-10-08

**Evidence and scope.** GitHub previously reported 27 default-branch dependency alerts (14 high / 8 moderate / 5 low); those historical counts remain separate. Alert API access returned 401, so integration manifests/lockfiles and installed affected-package versions were checked with targeted npm audit and package metadata. Across three lockfiles the initial unique direct advisory set was 44 (2 critical / 23 high / 15 moderate / 4 low); 31 are now absent from all three locks, leaving 13 (0 critical / 8 high / 4 moderate / 1 low). These are advisory IDs, not GitHub alert counts or npm's propagated vulnerable-package counts. All findings are transitive; direct Firebase/Expo/Prisma/Transformers entries are aggregate audit findings, not additional independent vulnerabilities. No direct dependency/framework version, GitHub setting, CodeQL setup or deployment changed.

| Surface / classification | Compatible lockfile changes | Reachability / verification |
| --- | --- | --- |
| Backend production HTTP | `proxy-addr` 2.0.7 → 2.0.8; `engine.io` 6.6.9 → 6.6.11; `ip-address` 10.7.0 → 10.7.3 | [Critical proxy-trust spoofing](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) depends on vulnerable IPv6 trust subnet configuration; default trust is off and production configuration was not accessed. [High Engine.IO protocol mismatch](https://github.com/advisories/GHSA-2gc4-cqfq-p2gv) is reachable before Socket.IO authentication with default transport upgrades. Isolated regressions fail on old versions and pass with patched dependencies, including valid proxy trust and valid upgrades. IP parsing is used by auth rate limiting; existing rate/session/socket regressions pass. No live exploitation performed. |
| Backend other production-declared transitive packages | `@grpc/grpc-js` 1.14.4 → 1.14.5; `brace-expansion` 2.1.4 → 2.1.7; `fast-uri` 3.1.6 → 3.1.8 | High/moderate/low advisory fixes within parent ranges. Active Firebase Admin imports use Auth, not Firestore/gRPC server handlers; arbitrary brace/URI input reachability is unconfirmed. These preventive patches are not evidence of an exploited production path. |
| Web dev/build/test only | `baseline-browser-mapping` 2.10.43 → 2.11.27; `brace-expansion` 5.0.7 → 5.0.12; `browserslist` 4.28.6 → 4.29.3; `nanoid` 3.3.16 → 3.3.20; `postcss` 8.5.19 → 8.5.29; `source-map-js` 1.2.1 → 1.2.2; `undici` 7.29.0 → 7.30.0 | Lockfile dev flags confirmed. Browserslist's required compatible metadata dependencies also update: caniuse-lite, electron-to-chromium, node-releases, update-browserslist-db. Web AuthFlow/session tests and Vite production build pass offline with no environment files. Node transport/build-tool advisories are not automatically browser-runtime vulnerabilities. |
| Mobile tooling (some production-declared by Expo/RN) | `brace-expansion` 5.0.9 → 5.0.12; `compression` 1.8.1 → 1.8.2; `http-cache-semantics` 4.2.0 → 4.3.0; `shell-quote` 1.10.0 → 1.12.0; `source-map-js` 1.2.1 → 1.2.2 | [Critical shell quoting](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) patched in RN devtools dependency; app-runtime exploitability not demonstrated. Cache package is dev-only; other paths are Metro/CLI/devtools rather than proven app-runtime exposure. Six isolated API/security assertions pass, including rejection of the vulnerable comment/newline quote input; no shell command, Expo server, native build or device run. |

**Remaining risks / compatible-fix constraints (no suppression or overrides).**

| Affected locked dependency / advisory severity | Exact impact and remaining constraint | Workaround / next remediation |
| --- | --- | --- |
| Backend `deepmerge-ts` 7.1.5 — high | Recursive object graphs exhaust merge stack; Prisma config pins 7.1.5. Patched 8.x changes major API and is outside the vendor constraint. | Keep Prisma configuration trusted/static; do not merge attacker-supplied recursive objects. Await compatible Prisma dependency update; no forced downgrade/override. |
| Backend `mysql2` 3.15.3 — high + moderate | Authentication downgrade can disclose MySQL credentials; compressed protocol can exhaust memory. Prisma CLI pins this version; patched 3.24.x is outside that exact vendor pin. | Current backend uses PostgreSQL adapter; no active MySQL route found in the inspected dependency boundary. Keep CLI away from untrusted MySQL servers/compressed protocol. Compatible Prisma integration validation remains necessary before overriding its driver. |
| Backend `sharp` 0.34.5 — three high | Image/SVG/HEIF native decoder flaws. Transformers 3.8.1 requires ^0.34.1; patched 0.35.5 is outside that range. | Inspected local pipeline is text feature extraction, not image decoding. Keep untrusted images/SVG/HEIF out of that pipeline; broader reachability is unconfirmed. Await compatible Transformers/native-decoder update rather than an untested framework major change. |
| Backend `sprintf-js` 1.1.3 — moderate | Unbounded precision in attacker-controlled format strings can exhaust resources; newest published compatible version remains affected. Dependency is roarr/global-agent/ONNX tooling. | Use fixed trusted format strings and bounded values; no arbitrary format endpoint identified. Upstream patch needed; no claimed complete mitigation. |
| Backend `uuid` 9.0.1; mobile 7.0.3 and dev ngrok 3.4.0 — moderate, one shared advisory | v3/v5/v6 output-buffer bounds defect; vendor major constraints exclude fixed ≥11.1.1. | Avoid attacker-selected output buffers/offsets; v4 without custom buffers avoids the affected API. Caller reachability unconfirmed; compatible Google/Expo tooling updates required. |
| Web/mobile `@grpc/grpc-js` 1.9.16 — high + low | Unauthorized certificate auth context / handler-error disclosure in Node gRPC server paths. Firebase Firestore pins ~1.9.0; patched 1.13.6+ exceeds that range. | Inspected clients use Firebase Auth only; no gRPC server or active Firestore client flow identified. Do not expose those server paths; await compatible Firebase update. No forced Firebase downgrade or transport override. |
| Mobile `braces` 3.0.3 — high | Deep glob nesting exhausts stack in Metro's micromatch path; latest published release still affected. | Build trusted source with bounded/fixed globs; avoid exposing development tooling to untrusted input. Upstream patch needed; dev-tool reachability is not certified. |
| Mobile `node-forge` 1.4.0 — high | [RSA signature forgery](https://github.com/advisories/GHSA-86w9-cpqp-85rv); no patched release. Expo CLI/certificate tooling dependency. | Treat untrusted certificates/signatures as unsafe, especially low-exponent RSA; do not rely on this verifier for new trust decisions. Await upstream/compatible Expo fix; production signature-verification reachability remains unconfirmed. |
| Mobile `decode-uri-component` 0.2.2 — moderate | [Malformed URL decoding can freeze the app](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr); Expo Router query-string requires ^0.2.2, fixed 0.5.0 is outside its range. Router path/query helpers import query-string, so an app-runtime path is possible and not dismissed. | Historical ff25d8f result: mitigation was not implemented; decoder 0.5.0 was incompatible. Latest follow-up below: local CommonJS upstream backport now bounds malformed fallback decoding for all resolved consumers; advisory is MITIGATED, not an upstream package upgrade or claimed alert closure. |

**Final npm package counts (include propagated parent findings):** backend 16 (6 high / 10 moderate), web 4 (4 high), mobile 36 (24 high / 12 moderate). Omit-dev is identical for backend/web; mobile is 35 (24 high / 11 moderate). Expo/RN tooling declared as production dependencies remains in omit-dev, so that flag alone does not prove app-runtime exposure.

**Validation / limits.** Fresh `npm ci --ignore-scripts --no-audit --no-fund` succeeds for all three locks in temporary fixtures; every changed package version matches its lock entry, and direct manifest constraints are unchanged. Existing workspace dependency trees/symlinks were preserved, so their old installed versions are not represented as patched. Fixtures contain no `.env` files; copied generated Prisma client is reused without generation/migration. Backend affected tests **36/36 PASS** (including two new dependency regressions), web tests **17/17 PASS**, web build PASS, six mobile-tool assertions PASS; final full and omit-dev audits plus `git diff --check` checked. Remaining npm package counts are recorded separately above; registry results and installation do not certify deployed fixes or close main-branch GitHub alerts. Software Supply-Chain remains PARTIAL; canonical P0/P1/P2 counts unchanged. No manual-checklist or MOBILE.md change is required.


## Dependency refresh: Prisma 7.10.1 — 2026-10-17

**Change.** Root lockfile only (`package.json` ranges unchanged): `prisma`, `@prisma/client`,
`@prisma/adapter-pg` 7.10.0 → 7.10.1. This moves Prisma's pinned `deepmerge-ts` 7.1.5 → 8.0.2 and
`mysql2` 3.15.3 → 3.24.4, closing the two remaining-risk rows above (recursive-merge stack
exhaustion; MySQL auth downgrade / compressed-protocol memory). Root `npm audit`: **16 → 12**
(high **6 → 2**, moderate 10). Remaining high: `@huggingface/transformers` 3.8.1 → `sharp` 0.34.5
(the fix needs Transformers 4.x, a major change to the embedding path; the inspected pipeline is text-only).
Mobile is unchanged at 36 (24 high / 12 moderate); every remaining fix there needs an Expo / React
Native / Firebase major upgrade.

**Compatibility fix found by the real-PostgreSQL suite.** 7.10.1 reports a unique violation's
constraint as `{ index: "<name>" }` instead of `{ fields: [...] }`. `isEventIdempotencyRace`
(`lib/ai-jobs.js`) matched fields only, so two concurrent `POST /events` with one Idempotency-Key
and different payloads would have surfaced a raw P2002 (500) instead of `IDEMPOTENCY_CONFLICT`
(409). It now also accepts exactly `Event_ownerId_idempotencyKey_key`; any other index name is still
not treated as the race, and the 7.10.0 field form keeps working.

**Validation (local, $0).** Backend unit suite 975 tests: 922 pass / 21 fail / 32 skipped, with the
**identical** failing set on 7.10.0 and on 7.10.1 (pre-existing, environment-dependent: no local
database or IANA 2026b tzdata, eval-branch runners). Real PostgreSQL (disposable pgvector, one fresh
database per suite): every suite gives the same result before and after, except
`ai-p0.postgres` concurrent idempotency, which failed on 7.10.1 without the fix and passes with it
(17/17 twice). The Weekly zh boundary, en local-BGE, Fairy advisory lock and embedding migration
suites pass. Not deployed.

## Compatible Journal Pagination — 2026-10-08

**Journal vertical slice: 4/4 checks PASS, NOT deployed.** The earlier 1/4 Privacy API Enumeration checkpoint below is historical evidence from before this explicitly authorized opt-in transition. Garden, nested messages and other endpoints are unchanged. Overall Privacy API Enumeration remains PARTIAL.

- [x] **Endpoint / ownership / validated bounds:** `/users/:userId/journals?view=page` opts into `{journals,nextCursor}`. Default limit 50, accepted integer range 1–100; root reads use limit+1 (maximum 101) and return at most limit. Owner authorization precedes parsing/anchor/list reads. Paged queries allow only view/limit/cursor and reject duplicated/array values, oversized/fractional/negative limits, offsets and forged owner filters. Anonymous/cross-owner rejections cannot return entries, counts or cursor metadata. Existing entry fields, timezone/local-date handling and private no-store are preserved.
- [x] **Stable owner-scoped cursor pages:** order is `createdAt DESC, id DESC`, using keyset predicates under the authenticated userId and the existing owner/date index; no migration or offset scan. Bounded base64url JSON cursors accept exactly owner/id/ISO createdAt. Foreign-owner cursors, foreign IDs relabeled as this owner, changed timestamps, invalid/extra fields and oversized inputs receive the same generic 400. A one-row owner/id/date anchor check precedes page queries; cursors are not signed authorization capabilities, and every read independently enforces owner isolation. Tests traverse 123 owner records with tied timestamps, verify no duplicates/omissions, default/max pages, last/empty pages and absence of foreign text. If an anchor disappears, restart/refresh history; no cross-request snapshot is promised. New writes appear on refresh, rather than a held transaction spanning client requests.
- [x] **Complete-history client / navigation / refresh:** active consumer is Expo Bookhouse via `mobile/src/services/bookhouse.ts` (native and Expo web); no React web Journal-list consumer was found in the scoped endpoint search. `readJournals` follows pages and returns the same complete array to existing year/month/day navigation. It fails rather than publishing a partial history when a later page fails or repeats a cursor, is malformed/oversized, or loading is cancelled. Refresh starts at page one. The screen aborts superseded/unfocused loads and retains its existing request-version state guard. Focused service tests retain older-year/month/day access, empty history and retry behavior; changed service/screen typecheck PASS. No native/browser device runtime result is inferred.
- [x] **Backward-compatible transition:** requests without view still return the original complete array with unchanged entry fields; no silent default cap, field removal or legacy truncation. Older clients need no change. New Bookhouse also accepts an older server's initial complete-array response when that server ignores view; it never treats an unexpected legacy array during continuation as a completed paged history. Tests preserve 123 legacy records and nested message fields. Preferred rollout is approved server support first, then the updated client; neither was deployed here. MOBILE.md records the changed request/cancellation behavior; no provider/manual setting changed.
- [ ] **Retire legacy / finish enumeration:** before removing the unbounded default, inventory supported released/unknown consumers, deploy and verify paged server/client versions, explicitly define the supported-version or versioned-endpoint transition, and demonstrate older-year/navigation/refresh/empty/error behavior without legacy requests over the agreed support window. Only then separately authorize retirement with an explicit compatibility/error contract; absence of calls in current source is insufficient. Current legacy/fallback paths remain unbounded. Garden/full-session/metadata Flower lists, nested messages (including in these Journal pages) and other prior checkpoint limitations remain unchanged. Root page bounds do not bound each Journal's related messages or total client-memory history. Production authenticated acceptance remains NOT VERIFIED and DB SAFE TO DEPLOY stays NO.

**Validation:** 4 new isolated loopback HTTP tests with mocked Firebase/Prisma, 3 new client service tests and 1 directly affected Bookhouse contract regression — **8 unique tests PASS**. One new limit-boundary implementation mistake and one VM-array assertion fixture issue were corrected; only the two failed cases were rerun. New/changed JavaScript syntax, changed Journal service/screen scoped TypeScript diagnostics and diff checks PASS. No existing security matrix, real database/provider request, identity action, build or deployment was run. Existing deployment/checkpoint/history and canonical P0/P1/P2 statuses/counts are preserved; MANUAL_SECURITY_CHECKLIST.md is unchanged. Original checkpoint edits are included in this scoped change.

## Compatible Garden Pagination — compatibility stop, 2026-10-08

**BLOCKED before implementation; no Garden pagination PASS or remediation claimed.** Journal 4/4 and commit c09d269 remain accepted and were not rerun. Targeted source tracing establishes the following boundaries; it is not runtime acceptance.

- [x] **Consumer trace PASS (source only):** React web `client/src/App.jsx` hydrates Garden through both `GET /session` and `GET /users/:userId/garden`; `GardenScene.jsx` consumes the entire Flower array, messages, positions, Calendar selection and social interactions. Expo native/web `services/garden.ts` uses owner metadata or visitor full responses; `gardenHydration.ts` feeds PlantingContext, Garden History and Bookhouse placement loading, with backend QA and PlantingContext detail refresh also calling loadGarden. `services/events.ts` independently filters full Garden Flowers for Event Journal. Mobile sessionExperience uses `/session?view=metadata`, which omits Garden entirely. Direct Flower detail/support/message routes remain separate policy-protected consumers. Graphify was unnecessary: targeted imports and route/symbol searches resolved these relationships.
- [ ] **Unchanged layering compatibility — BLOCKED:** full Garden and metadata currently order only by `createdAt DESC`. React web renders `liveFlowers.map` directly and `getFlowerPosition` supplies only left/top. A deterministic id tie-breaker can change DOM paint/hit order for overlapping Flowers with equal timestamps; the existing query defines no stable tie order to preserve. Mobile fallback hydration already sorts by id, but that does not establish React web equivalence. No approved tie-order compatibility contract or runtime overlap evidence exists. Do not silently change visuals by adopting the Journal order everywhere.
- [ ] **Unchanged performance — NOT VERIFIED:** tracked Flower schema has primary/unique keys but no owner/garden plus date/id pagination index. Repeating scoped sorted reads, social lock/admission, owner/support lookup and network round trips for every page can increase complete-load work and latency. A bounded take alone proves neither bounded database scan/sort work nor unchanged Garden load performance. No existing DB/container, index, limit or provider was inspected or modified; no speculative migration is proposed as completed work.
- [ ] **Complete publication / privacy / cancellation — NOT VERIFIED:** future pages must authorize before anchor/data reads under existing social locks, validate owner/viewer/view plus real owner-scoped anchors, retain all Flower and related fields, and assemble before publishing. Preserve PlantingContext's request/lifecycle guards and Garden History's focus guard; extend cancellation/session identity across the complete traversal and superseded React web Garden/session loads. Mobile apiRequest currently guards identity per request, which alone does not pin a multi-request traversal to one session. Independent page transactions do not guarantee a coherent snapshot across concurrent Flower creation/deletion/updates; exhausting a cursor is not snapshot certification. No cross-request snapshot or revocation guarantee has been implemented or tested.
- [ ] **Retirement prerequisites / remaining exposure:** retain complete unpaged Garden, metadata and full-session responses for released/unknown clients. Before retirement, inventory supported consumers/versions, deploy and verify opt-in server then clients, establish the compatibility/error contract and support window, and demonstrate every Flower/placement/layer, Fairy, Calendar/Visit, refresh, empty/error, cancellation and revocation path without legacy requests. Root Garden/metadata/full-session Flower lists and nested messages remain unbounded; total assembled client memory also remains unbounded. A paged endpoint would not close reachable legacy reads.

**Disposition:** stopped under the requested compatibility safety gate. Only this unresolved record changed; no API/client/rendering change, tests, typecheck, deployment or provider/manual action. MOBILE.md and MANUAL_SECURITY_CHECKLIST.md are unchanged because mobile behavior and manual actions are unchanged. Canonical statuses/counts, historical evidence and DB SAFE TO DEPLOY stay unchanged. Commit/push remains conditional on implementation PASS and was not performed for this blocked slice. Next slice must first resolve the tied-Flower rendering contract and performance/completeness acceptance boundary before implementing pages.

### Garden compatibility follow-up — 2026-10-08

The preceding blocked record is preserved. **Implementation gate remains BLOCKED.** Focused follow-up outcomes below are source/model evidence, not Garden API acceptance; Journal c09d269 and accepted matrices were not rerun.

- [x] **Actual ordering/z-order source contract PASS:** `getGardenResponse` and owner metadata specify only `createdAt DESC`; no id/placement/layer tie-breaker is present. React web imports both index.css and App.css. `getFlowerPosition` supplies left/top, and `liveFlowers.map` retains response order. Base `.flower-card` is absolute with sway animation and no explicit z-index, inside `.flower-layer` (z-index 4). Equal stacking levels depend on DOM order; Calendar matches have z-index 90, and CSS also defines active cards at 80. The tracked backend `layer` field does not set this web card's z-index. Equal timestamps have no guaranteed database order, so there is no existing deterministic tie-order contract that keyset pages can safely reproduce. This is a contract finding, not a production ordering observation.
- [ ] **Overlapping tied-Flower browser acceptance — BLOCKED:** an isolated temporary headless Chrome fixture using both actual stylesheets, two identically positioned/timestamped cards, reversed DOM orders and Calendar highlighting timed out after 25 seconds before emitting results. No overlap/hit-test PASS is claimed. Only its temporary profile was used; no existing browser profile, DB or provider was changed. Smallest next validation is this same isolated four-case overlap fixture in a functioning local browser. Even a passing DOM-order test would demonstrate the hazard, not establish the database's unspecified tie order.
- [x] **Stage-once boundary trace PASS (source assertions):** garden service completes mapping before returning; gardenHydration awaits Flower/local-placement data before one hydration pass; PlantingContext gates setPlacements on request/lifecycle identity. React web awaits its Garden response before setGardenData. The smallest candidate assembly boundary is inside the service: stage all validated pages, then return once to these existing transformations. Do not rebuild scenes, resolve assets or publish page fragments. This boundary avoids introducing per-page render/asset/per-frame work by design; paged execution/cancellation and latency remain untested. Web session hydration must likewise await complete Garden assembly before publication, retaining Fairy/Daily Check-in fields.
- [x] **Concurrent-mutation insufficiency counterexample PASS (isolated executable model):** first page reads a/b, then a changes position, c is deleted and a new Flower is inserted ahead of the b cursor. b's id/date anchor and total count remain unchanged; continuation returns d. Assembled a/b/d has unique IDs but differs from both complete before/after states, omits the new Flower and retains a's stale position. Count + anchor + deduplication is therefore not a snapshot fence. This model tests a proposed algorithm only, not actual routes or DB interleavings. Tracked mobile movement is owner-scoped local placement persistence, a separate consistency boundary; the synthetic position update is not evidence of a backend move endpoint.
- [ ] **Provable snapshot/restart — BLOCKED:** no Garden-wide mutation revision or held cross-request snapshot exists in the tracked model. Per-page social locks serialize admission with participating revocations but end at each transaction; Flower deletion uses separate Prisma calls, and local placement writes are independent. No selected bounded-read/no-migration strategy currently certifies ordered membership plus all mutable Flower/message/support fields and local placement identity throughout assembly. Full-snapshot materialization could capture a particular legacy response order but would retain unbounded initial reads/server memory; a long-lived transaction or shared revision protocol introduces additional lifecycle/writer coordination and performance obligations. Neither is silently adopted. A refresh/retry alone cannot certify completeness without detecting intervening changes. Final privacy checks alone cannot prevent already-authorized responses arriving after revocation; historical HTTP guarantee remains unchanged.
- [ ] **Performance equivalence — BLOCKED:** staging once protects the render boundary but does not prove equal load latency/work. Source still lacks owner/garden-date pagination indexes; pages would repeat network/admission/support work. No database query plan, benchmark, FPS or device evidence was obtained. Do not upgrade this to performance PASS or claim that opt-in take bounds scan/sort work.

**Follow-up validation:** staging source assertions and mutation counterexample PASS; browser overlap check timed out; documentation diff check PASS (**3/4 focused checks**, not 3/4 implementation guarantees). No API/client/test file changed; no typecheck was necessary. Previous evidence and canonical counts/statuses remain intact. MOBILE.md and MANUAL_SECURITY_CHECKLIST.md remain unchanged. Existing SECURITY.md edits remain uncommitted; no commit/push because implementation was not validated. Smallest next action: establish a compatible tied-Flower order contract (or approve a deliberate tie-policy transition) and select a bounded consistency fence covering actual writers, then obtain targeted overlap/concurrency/load evidence before implementing pagination. Legacy Garden/metadata/full-session Flower lists and nested messages remain unbounded.

## Compatible Nested Messages Pagination — safety stop, 2026-10-08

**BLOCKED before API/client implementation.** Accepted Journal c09d269 4/4 and the uncommitted Garden evidence above are preserved; no accepted investigation/matrix was repeated. Enumeration remains PARTIAL.

- [x] **Message-specific consumer/authorization trace PASS (source assertions):** Flower detail GET uses requireSocialGardenAccess followed by getFlowerDetail's transaction-scoped withSocialAuthorization before Flower/message reads. Message creation rechecks owner/viewer privacy/friendship under those same social locks; owner access remains permitted. FLOWER_DETAIL_INCLUDE orders messages by createdAt ASC; no deterministic tied-message id order currently exists. React web GardenScene renders selectedFlower.messages in response order and also consumes full Flower payloads from detail/support/message/socket updates. Expo FlowerDetailModal consumes PlantingContext's loadFlowerSource; Bookhouse FlowerHistory independently loads the same source and formats all messages. Journal list/page responses still include nested Flower.messages, but Bookhouse's displayed Flower message history comes from detail GET; mobile Garden metadata mapping does not retain messages. Full Garden/session, Journal, detail, support/message and realtime payloads remain legacy complete-message consumers. No nested array was capped or removed.
- [x] **Deletion/writer boundary identified PASS (source only):** Message creation is social-lock protected. Owner Flower deletion separately deletes messages then Flower without that transaction; author account deletion additionally deletes all messages by userId, including messages on other owners' Flowers. That account transaction does not acquire each affected Garden owner's social lock. Message has no revision/updatedAt field, and no tracked message-update route was found in the scoped writer search. Existing privacy admission is not a cross-page membership fence. No provider/database mutation or privacy regression test was run.
- [x] **Proposed cheap fence rejected PASS (isolated executable model):** all four messages have tied timestamps; page one reads a/b. Between pages, author deletion removes a and a tied-time insertion aa sorts before b. Continuation reads c/d. Original/remaining anchor, upper anchor, total count, assembled count and unique IDs all still match, but assembled a/b/c/d retains deleted text and omits aa. Thus a cutoff + count + anchor + deduplication is insufficient to certify current complete membership. This is a counterexample to an algorithm, not evidence that specific generated CUIDs/DB scheduling reproduced the modeled insertion. No actual Message pagination exists to certify.
- [x] **Existing refresh incompatibility reproduced PASS (actual helper, existing module fixture):** mergeFlowerSource(current, incoming, 'refresh') unions old and new messages. A two-message current source refreshed with an authoritative one-message source retains the absent/deleted author's message. PlantingContext uses this refresh path. A paged service that fails/restarts and returns a fresh complete list would still leave deleted text in the UI unless authoritative complete refresh replaces message membership while preserving separately pending/realtime updates and owner/session guards. This new negative ran alone; prior Flower tests were not rerun. No application helper was changed.
- [ ] **Bounded, mutation-safe pages — BLOCKED:** no selected mechanism binds complete message membership across requests and detects both author-account deletion and additions while returning bounded root pages. Validating owner/viewer/Flower/date/id cursors and reauthorizing every page is necessary but does not resolve that invariant. A whole-list membership digest/materialized snapshot would reintroduce unbounded scan/materialization work; a new durable revision must participate atomically in create, Flower deletion and cross-owner author deletion. Neither was silently added under the no-migration/minimal-architecture scope. Fail-safe refresh requires an actual invalidation signal and authoritative client replacement; merely exhausting nextCursor must not publish a falsely complete list.
- [ ] **API/client privacy/cancellation/compatibility acceptance — NOT IMPLEMENTED:** no page endpoint, cursor protocol or client migration was added. Needed checks remain owner/nonfriend/privacy-OFF, current revocation between pages, foreign owner/viewer/Flower cursor reuse, malformed/duplicate bounds, anchor deletion, tied-time order, later-page failure/cancellation, superseded session/selection, authoritative refresh and older-server complete-response fallback. Do not count the source/model checks as these API acceptance tests.
- [ ] **Retirement / remaining unbounded reads:** legacy nested messages in Garden/full session, Journal (including accepted root pages), detail, support/message mutation responses and realtime payloads remain unbounded. Preserve those contracts until supported/unknown consumer inventory, verified server-first/client rollout, explicit version/support window, chronological complete-history/error/refresh/revocation evidence and separate retirement approval. A new opt-in route alone would not fix these legacy reads or bound total assembled client memory.

**Validation:** three focused executable checks PASS (source assertions, algorithm counterexample, actual helper negative); documentation diff check PASS — **4/4 diagnostic checks, not implementation PASS**. No API/client/test file changed, so no scoped typecheck/syntax suite was needed. SECURITY.md alone changed; previous uncommitted Garden records and historical evidence remain intact. MOBILE.md/manual checklist and canonical P0/P1/P2 counts/statuses remain unchanged. No deployment, provider action, existing DB/container mutation or limit change. No commit/push because the vertical slice is blocked. **Smallest next action:** select an atomic membership-invalidation mechanism covering Message creation, Flower deletion and author-account deletion without silently restoring unbounded work; then implement/test authoritative refresh replacement and bounded pages together. If that requires a schema or broader writer protocol change, resolve that scope before implementation.

## Message Refresh Safety — 2026-10-08

**Confirmed mobile fix PASS, not deployed.** Previous uncommitted Garden/Message diagnostics above remain historical checkpoints; their pagination blockers remain open. Journal c09d269 was not rerun. Enumeration remains PARTIAL and canonical P0/P1/P2 counts/statuses are unchanged.

- [x] **Authoritative complete refresh PASS:** mergeFlowerSource refresh now replaces known server-message membership with the returned complete array, including an empty array. Messages deleted with an author account disappear from every refreshed Flower, across Gardens. A missing/non-array message field is not treated as authoritative empty membership. Broadcast/action merging, received support-count monotonicity and personal daily Support state retain their existing behavior. Bookhouse FlowerHistory already directly replaces its detail response; the corrected merge affects PlantingContext/FlowerDetailModal, shared by native and Expo web. No Flower positioning, Garden ordering, rendering/asset path or navigation changed.
- [x] **Pending/live overlap PASS:** complete GET captures its starting source. Replacement retains pending local sends and messages received after that baseline while GET is in flight; already-known nonpending records omitted by the server are removed. Subsequent complete refresh can remove those previously new records too. Existing live-GET/Support regression retains realtime additions, deduplicates IDs and preserves counts. These are concurrent local-state protections, not a server snapshot or network-arrival-order guarantee; post-start payloads can still predate server deletion, and this fix does not provide distributed deletion broadcasts or immediate erasure without a subsequent authoritative refresh.
- [x] **Failure/cancellation/identity PASS:** failed GET retains current messages and exposes the existing error state. Existing effect cleanup/request versions reject late selection/GET responses. Account or Garden-owner identity changes invalidate detail actions and clear selection/source; same-account refresh retains legitimate pending work. New provider tests resolve two overlapping complete GETs in reverse order, switch accounts with GET/send pending, and switch Garden owner. Only the current selection/account publishes; failed sends remove their own pending item. No extra network request, automatic retry, scene reconstruction or per-frame work was added.
- [x] **Focused validation PASS:** 13 unique affected tests PASS in flowerDetail.test.mjs, including six new regressions. Two new tests and the live-overlap regression were added to the initial focused selection; final adjustments preserving incomplete-response compatibility and internally resolved session transitions justified rerunning only the seven directly affected cases. Changed test syntax, scoped changed-file TypeScript diagnostics (zero), and final diff check PASS. Cross-Garden author-deletion cases supply the authoritative post-deletion payload; no actual account/provider/database deletion or DB concurrency test was performed. No prior Garden/Journal matrix was rerun.
- [x] **Minimum writer fence design identified (source only):** existing tracked Message insertion is sendFlowerMessage's tx.message.create. Deletions are owner Flower DELETE's prisma.message.deleteMany; deleteAccountDataInTransaction's owned-Flower message deletion; and its userId author deletion across other Gardens. Message relations currently do not declare cascading deletion; Flower's User/DailyCheckIn/Event relations do cascade Flower deletion, so future schema/cascade behavior must also be covered. A conservative single global monotonic Message membership revision, advanced by a database INSERT/DELETE trigger in the same transaction as every affected statement, can cover all these writers without relying on enumerating affected owners in application code. Rollback must roll back both data and revision. Empty/no-op statements may conservatively invalidate. Include UPDATE of membership/content fields if updates are introduced. This is a proposed minimal global fence; its serialization/contention costs are not validated and unrelated Gardens would invalidate each other.
- [ ] **Revision implementation/proof — BLOCKED pending separately scoped migration:** add a singleton bigint revision row/table and atomic Message INSERT/DELETE statement triggers (and relevant UPDATE coverage), then test rollback, concurrent inserts/deletes, cross-Garden author deletion, parent deletion/cascades and contention in an isolated disposable fixture. Pages must read revision and bounded data from one consistent statement/transaction snapshot after current owner/viewer/Flower authorization. Scope cursors to owner/viewer/Flower/revision, reject a changed revision and discard staged data for refresh; validate revision even on the terminal/empty page. A change after the final read remains outside the certified read interval; do not promise network-arrival freshness. Existing READ COMMITTED multi-statement admission/data reads alone cannot certify this protocol. No migration, trigger, revision counter, cursor or pagination API was implemented/executed. No count/cutoff/anchor approach was revisited.

**Docs/scope:** MOBILE.md records actual refresh and account/owner-reset behavior; MANUAL_SECURITY_CHECKLIST.md is unchanged because no provider/manual action changed. All legacy nested message paths remain unbounded. Previous checkpoint edits are included in the scoped commit; historical dispositions describe those earlier blocked attempts, not this verified refresh fix. No production deployment, provider change, existing DB/container mutation, DB-limit change, visual downgrade or unrelated-file change.

### Stale-message refresh resume — 2026-10-08

- [x] **Existing fix verified in current source:** commit `8385575` is an ancestor of current HEAD; `flowerDetailData.ts`, `PlantingContext.tsx` and `flowerDetail.test.mjs` have no changes since that verified fix. Complete refresh replacement, pending/post-start preservation, failed-refresh retention and stale account/owner response guards above already implement this request. No duplicate implementation or larger API contract change is needed.
- [x] **Requested regressions already present:** six focused message-refresh regressions cover cross-Garden author deletion, empty/incomplete responses, local sends/live arrivals, failed fetch, account switching and reversed/superseded requests with owner switching. Reuse the recorded 13-test PASS and scoped TypeScript evidence above; accepted tests were not rerun. Source verification is not a new executable-test result.
- [x] **Documentation preserved:** include the uncommitted exact-SHA run 37867494911 PASS checkpoint with this documentation-only commit. Existing MOBILE.md describes the implemented mobile behavior; no new mobile/provider/manual behavior means no additional MOBILE.md or manual-checklist edit. Garden visuals/navigation, legacy responses and canonical counts remain unchanged.
- [ ] **Remaining boundary:** Garden/Message pagination and atomic membership fencing remain blocked as previously documented. This task adds no pagination, revisions or migration. Newly pushed commit's GitHub result must be observed separately; the accepted 6f8dfd8 run is not evidence for a new SHA.

- [x] **New GitHub CI observed PASS:** [run 37867790751](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37867790751), push event, exact SHA `550d67ecce8363a88d82bf3505b00db9a3f327f8`, completed `success`. This backend CI run is not mobile regression execution. Post-push result is retained locally after the requested single normal-push commit.

## Privacy API Enumeration — Compatibility Checkpoint, 2026-10-08

**Historical checkpoint, before the Journal opt-in work above: BLOCKED before changing API behavior.** Scoped source/client review found confirmed unbounded private reads, but a default cap would break existing complete-snapshot consumers. No speculative cap, ignored-parameter sanitizer or opt-in-only pagination is presented as remediation of those legacy reads. Earlier bounded search/social/report and accepted isolated authorization evidence is retained; no accepted matrix was rerun.

- [x] **Active boundary inventory — source verified:** authenticated directory `/users` takes 100 public discovery projections, `/users/search` takes 20, owner `/users/:userId/friends` takes 500, owner `/friends/requests/:userId` takes 100 per direction, and owner `/users/:userId/check-ins` takes 366. `/ai/reports` defaults to 20, rejects limits outside 1–50 and reads at most limit+1 per weekly/monthly model; no counts are returned. Event/memory/report detail routes are identity-scoped single-resource reads, not new listing endpoints. Owner Journal lists, owner Garden metadata, full Garden and full session Garden hydration have no Flower/Journal page cap. Flower detail and nested Journal/check-in/Garden Flower messages have no message cap. `/api/fairies` is owner-scoped and uses the existing controlled unlock catalog; its list query has no explicit cap. Garden visit history takes 30. The earlier canonical “bounded” statement applied only to bounded subsets and is corrected above.
- [ ] **New pagination authorization acceptance — NOT VERIFIED:** source places owner checks before Journal/check-in/friend/request queries, scopes Garden metadata to the authenticated owner, and uses accepted atomic friendship/privacy authorization before full Garden and Flower detail reads. Report discovery reuses the owner/consent boundary and owner predicates before ordering/filtering. Its cursor is a validated client-supplied timestamp/id/type cutoff, not an owner-bound capability; a foreign cutoff does not remove the owner predicate, but cross-owner cursor reuse is not explicitly rejected. No unauthorized-record/count disclosure was established in this review. New cross-owner/forged-cursor/privacy-disabled pagination acceptance is deferred until the actual pagination contract exists; accepted social/realtime/atomic evidence is not upgraded or rerun.
- [ ] **Bounded reads / deterministic pages — BLOCKED:** root Journal and Garden/metadata Flower queries, plus nested messages, are unbounded. Root check-in caps do not bound nested message volume. Several existing lists order by a nonunique date/name, and the friend list has no ordering; this is not a demonstrated authorization bypass, but those orders cannot define deterministic future pages without a stable tie-breaker. Adding client limits or capping only an opt-in endpoint would leave the current unbounded routes reachable. No DB resource settings, indexes, schema or migrations changed.
- [ ] **Compatible client/legacy transition — BLOCKED:** `mobile/src/services/bookhouse.ts` requests one Journal array; Bookhouse derives available years/months/days from that complete array. `mobile/src/services/garden.ts` requests one complete Flower array (owner metadata or social Garden), while `client/src/App.jsx` replaces the Garden snapshot with one response and also consumes the full session Garden. Neither follows a next-page cursor for these reads. Report reflections already follow the existing opaque cursor contract and must retain it. A bounded default would silently omit older Journal dates, Garden Flowers and messages, affecting navigation/refresh even if JSON shapes stay unchanged. Required next implementation scope: define paged history/Garden/message contracts and stable owner-scoped cursor rules, migrate these consumers with empty-page/refresh/revocation tests, and explicitly settle support for legacy complete-snapshot clients before enforcing bounds. Do not truncate or discard fields silently.

**Checkpoint:** 1/4 checks PASS (source inventory); three remain unchecked. No app/client/test code changed, and no tests/typecheck/build were run because review stopped at the incompatible-default boundary. Documentation diff check PASS. Canonical Privacy API Enumeration remains PARTIAL; P0/P1/P2 counts are unchanged. Production authenticated acceptance remains NOT VERIFIED and DB SAFE TO DEPLOY remains NO. No production/provider request, account action, database operation or deployment occurred. MANUAL_SECURITY_CHECKLIST.md and MOBILE.md are unchanged. At this checkpoint the edits remained uncommitted for exact resume; no commit/push was made while that requested default-cap hardening was blocked. The subsequent authorized Journal opt-in slice above preserves and includes this evidence.

## Active Authentication / HTTP Log Privacy — 2026-10-08

Selected locally actionable P0 **Sensitive Logging & Observability Security**. Earlier account-enumeration evidence established client-safe errors, not complete server-log privacy; that history is retained. Two confirmed app-controlled leaks were reachable without valid authentication: rejected JWT `iss`/`aud` strings and regex-redacted provider messages entered diagnostic logs, while HTTP authentication/rate-limit events copied arbitrary request paths. Short tokens and alternate credential formats were not reliably removed by message redaction.

- [x] **Firebase diagnostics — PASS:** logs now retain only the configured public project identity and a fixed failure reason. Unverified claims, token expiry, provider code/message/stack and echoed short credentials are omitted. Adversarial synthetic JWT/provider errors preserve 401 invalid-token and 503 Admin-unavailable responses; two affected historical diagnostic tests also pass. Claims remain available internally only for fixed failure classification.
- [x] **HTTP path privacy — PASS:** all current HTTP event call sites use the registered Express route pattern; global middleware uses `unmatched` before route matching. Three anonymous loopback HTTP requests and an owner-denial check verify raw owner IDs, email-like path components and query tokens are absent from event route fields, while 401/403 contracts and correlation metadata remain intact. Existing authorized actor/audit identifiers are preserved; this is not a claim that all audit records are anonymous.
- [x] **Rate-limit privacy — PASS:** deterministic loopback HTTP tests exercise budget exhaustion and full-key-map rejection with different private path parameters. Both remain 429 with the existing generic body and Retry-After; logs contain only `/limited/:id`. No limiter budgets, DB resource settings or metrics definitions changed.
- [x] **Logging failure isolation — PASS:** throwing diagnostic and event sinks do not prevent either 401 or 503 authentication rejection. Reviewed active server timing output is numeric elapsed time; current Socket error handling already uses the redacted logger. Dormant legacy-auth comment blocks are not active logging paths and are unchanged.
- [ ] **Deployment / third-party operations:** this correction is local and not deployed. Production authenticated behavior remains NOT VERIFIED; provider/telemetry retention, access and effective deployment-wide redaction still need authorized operational evidence. DB readiness remains 1/4 PASS and SAFE TO DEPLOY remains NO; no blocked capacity/proxy/latency investigation was repeated.

**Validation:** four new focused tests in `test/back/logging-privacy.test.js` plus two directly affected tests selected from `test/back/auth.test.js` — **6 unique tests PASS**. The initial HTTP fixture included a public static-page path; it was corrected to a protected `/users/.../garden` path and only that failed case rerun. No app authorization change was required for that fixture correction. Tests used synthetic Firebase verification and loopback HTTP with no database/provider request or mutation. Scoped JavaScript syntax and diff checks PASS. Existing accepted matrices were not rerun. Canonical status remains PARTIAL and P0/P1/P2 counts are unchanged; historical deployment, dependency inventory and other evidence remain intact. MANUAL_SECURITY_CHECKLIST.md and MOBILE.md are unchanged.

## Privacy-safe Application Monitoring — 2026-10-08

**4/4 scoped checks PASS; four new tests PASS.** `lib/security-metrics.js` holds exactly 13 allowlisted counters; unknown names are ignored, values saturate at MAX_SAFE_INTEGER, snapshots are copies and no metric persists per-request data. No dependency, database-limit, schema, provider or mobile change.

- [x] **DB resource failures:** the existing bounded pool counts local/server exhaustion and connection/acquisition deadlines. Its configured pg client counts statement timeouts, other query cancellations, lock timeouts and deadlocks across the active Promise/callback query APIs, including transaction clients. Tests assert original arguments/results/error identities are preserved, both call styles count once and limits stay unchanged. SQLSTATE 57014 counts as `db_query_timeout` only when the driver reports statement timeout; other cancellations use `db_query_cancelled`. Prisma-engine-only transaction expiries, streaming Query objects and unrecognized/localized driver messages are not claimed covered.
- [x] **AI worker / quota:** failure attempts increment `ai_job_failed`; only persisted PENDING reschedules increment `ai_job_retry_scheduled`. Heartbeat errors and detected lost leases increment `ai_lease_failure` once per observed failure. Backend cost-gate quota denials increment `ai_quota_denied`. Tests use isolated repositories, fake heartbeat time and a failing quota transaction; no provider/DB call. Existing retry/lease/reservation behavior is preserved. Worker failure logs now retain only the safe code, omitting job/worker IDs; metrics do not count external provider billing or certify all crashed/expired jobs.
- [x] **Auth/security rejections:** existing event emission increments fixed authentication, authorization and general security-rate-limit counters, independently of console availability. A real in-memory limiter rejection and event hooks pass focused tests; no login/provider request. Counters have no identity, IP, path, job/action/error-code label, SQL, credential or user text. Existing detailed audit-event behavior is retained separately.
- [x] **Bounded operational emission / privacy tests:** backend and standalone worker start one unreferenced 60s timer. The existing security logger emits at most one changed aggregate `security_metrics` JSON snapshot per tick; idle ticks emit nothing. Logging failures are swallowed and the next successful flush retains cumulative counts. Tests verify fixed cardinality, saturation, snapshot isolation, exact output schema, no duplicate idle emission and idempotent timer startup. No public metrics endpoint, new infrastructure or alert threshold is introduced.
- [ ] **Production operations:** NOT deployed. Collect existing authorized logs by `eventType=security_metrics`; `counters` are cumulative per process, so use differences within the same platform log stream and treat decreases/restarts as resets, not negative usage. Do not sum cumulative snapshots as event totals. Counters are not durable, may be lost before the next tick on crash/short-lived shutdown, and do not aggregate instances. Pool gauges, workload latency distributions, queue/backlog/spend metrics, retention, alert destinations/thresholds and delivery verification remain open. Historical `0ffdd3e` readiness observations about absent counters are superseded for current code only; its production budget/proxy/latency gates remain unresolved and **SAFE TO DEPLOY stays NO**.

**Validation:** `DOTENV_CONFIG_PATH=/dev/null node --test test/back/security-metrics.test.js` — **4/4 PASS**, one run. Changed JavaScript syntax and diff checks PASS. No prior PostgreSQL/social/auth/native matrix, blocked provider investigation, production request, deployment or configuration change was repeated. Canonical statuses/counts remain unchanged; dependency inventory and historical deployment evidence preserved. Manual checklist adds only the genuine aggregate-log operational requirement; MOBILE.md is unchanged.

## GitHub Security CI and Safe Release Gates — 2026-10-08

**SAFE TO DEPLOY: NO.** This section adds regression automation and a release evidence checklist. It does not nominate integration HEAD for deployment. Last recorded production backend is d510b1ff97902704721060b4c1261657be3e4b76; this task has not reverified Render. DB candidate 0ffdd3e remains NOT DEPLOYED, production DB readiness remains 1/4 PASS, Journal c09d269 remains not deployed, and Garden/Message pagination remain blocked. Prior checkpoints, including those committed in 8385575, are preserved.

- [x] **Workflow/runner contract PASS:** new `.github/workflows/security-regression.yml` runs pushes to integration/mobile-backend-test, PRs targeting that branch or main, and workflow_dispatch when available on the default branch. Existing managed CodeQL Default and the guarded Advanced workflow are untouched. Three focused runner/YAML contract tests PASS: explicit scripts/files resolve; environment allowlisting removes supplied provider/DB/NODE_OPTIONS values; failures/signals/timeouts remain nonzero; exact triggers, permissions and workflow commands match. Official checkout/setup-node commits were checked against their upstream Git refs. Node 24.7.0 matches the backend Docker major and Prisma's declared Node support. Per-ref/PR cancellation, a 15-minute job timeout and bounded child commands limit CI cost.
- [x] **Clean install/generation PASS:** isolated temporary root-lockfile npm ci with scripts disabled installed 541 packages; explicit Prisma generation produced client 7.10.0 without connecting to a DB or running migrations. Existing workspace dependencies were preserved. Three selected auth/header/proxy regressions PASS; full accepted matrices/DAST were not rerun locally. Import tracing found natural's direct dotenv.config() bypasses DOTENV_CONFIG_PATH, so the CI entrypoint now refuses a checkout containing .env and never removes it. The initial local selection emitted dotenv load notices without values; no provider operation was made. Fresh GitHub checkout has only tracked example env files. Corrected clean-checkout guard and final YAML/runner contract revalidation PASS; final diff check PASS. Four focused local checks PASS (workflow/runner contract, clean installation/generation, three selected regressions, syntax/diff); GitHub execution is recorded separately.
- [ ] **GitHub runtime at commit preparation:** NOT VERIFIED until an actual run on the pushed exact SHA is observed. Local checks are not GitHub execution evidence. No secrets, deployment environment, security-events/id-token write permission, artifact upload, provider settings or branch-protection change is configured. Only contents:read; checkout does not persist credentials. Root lockfile installation ignores lifecycle scripts, followed by explicit Prisma client generation only; no migration/start command is run.

- [x] **Post-push GitHub runtime PASS:** read-only GitHub Actions API observed [run 37866127057](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37866127057) completed with success for exact SHA `01ac98bda9d4ec2320d9b1c344217feb3dd12424`. The Isolated security baseline job and every installation/generation/contract/baseline step succeeded, with no skipped regression step. This is actual GitHub execution evidence, separate from local 4/4 checks. Existing guarded Advanced CodeQL run 37866126967 was skipped as intended; that skip is not a CodeQL scan PASS and does not change Default setup. No deployment or provider change occurred. SAFE TO DEPLOY remains NO. This evidence was initially retained after push and is included in the CI reliability checkpoint below.

### CI reliability and focused coverage checkpoint — 2026-10-08

- [x] **Accepted GitHub evidence preserved:** run 37866127057 and exact 01ac98b SHA/result above, plus the corresponding manual-checklist record, are included with this checkpoint. No accepted baseline/DAST/security matrix was rerun locally. SAFE TO DEPLOY remains NO; CD, CodeQL, settings and canonical counts/statuses are unchanged.
- [x] **Failure/missing-command/timeout behavior PASS:** four changed workflow/runner config tests PASS, including real child processes in disposable temporary fixtures. An intentionally failing node:test, nonexistent test file, missing executable (ENOENT), and a non-terminating child killed by an isolated 150ms timeout all produce nonzero CI status and stop before the next group. Only temporary fixtures fail; no deliberately failing shared-branch code is committed. Production child limit remains 90 seconds, nested DAST 30 seconds, job 15 minutes; default TERM/signal/error handling is checked. Existing synthetic second-group failure confirms later failures also propagate. Checkout env guard/secret stripping and SHA-pinned read-only workflow assertions remain validated.
- [x] **Trigger configuration/readiness PASS within observed scope:** YAML contract verifies integration push and PR target branches integration/mobile-backend-test and main, manual dispatch, per-ref/PR cancellation, and absence of continue-on-error/pull_request_target or privileged permissions. Read-only GitHub content API confirms the workflow exists on integration (blob 51feea8ff72caa130fd2b8e2ea1e5c337611e425); main returns 404 for this path. Accepted run 37866127057 proves the push trigger. No workflow/settings/branch-protection change was required.
- [ ] **Actual PR trigger execution — NOT VERIFIED:** the workflow's pull_request run query returned zero runs. No PR was created for testing. Observe the next legitimate PR targeting each branch and record the actual event/merge SHA/result; do not infer a PR run from a push run or assume declaring main proves main-target execution. Main workflow-file propagation remains part of the normal reviewed integration process; no merge is authorized by this check. Manual dispatch on the default branch remains unverified/unavailable there until the workflow is present.
- [x] **High-value missing deterministic coverage added to CI:** seven existing named cases are now selected explicitly: per-user AI quota with owner independence; revoked AI-processing denial before reservation/provider work; same-millisecond consent epoch advance (3 AI cases); Socket invalid/expired handshake, token-derived room/actor isolation, and paused movement privacy-revocation fencing (3 Socket cases); private Journal read/write/cover ownership and historical entries (1 Journal case). Source fixtures use in-memory PGlite/WASM for AI transactions, mocked Prisma/Firebase plus ephemeral loopback HTTP/Sockets for Journal/Socket. No external PostgreSQL server, real Firebase, secret or paid call is used. Case-selector validation verifies exact matching counts so a typo cannot silently select zero tests. Existing test implementations are reused; local validation ran only changed config tests/syntax/diff. Their inclusion/runtime compatibility is subject to the new exact-SHA GitHub run, separate from historical fixture evidence.
- [ ] **Remaining coverage boundaries:** real PostgreSQL independent-connection AI/social races, distributed/provider revocation, physical native behavior, production DB capacity/proxy/load and full client/static-asset HTTP acceptance remain separately opt-in. Journal cursor/completeness tests remain outside this narrowly scoped addition; accepted c09d269 evidence is retained. No claim of full security coverage or production readiness is made.

**Validation:** 4/4 changed workflow/config tests PASS, changed JavaScript syntax and diff checks PASS. The new checkpoint's GitHub runtime is NOT VERIFIED at commit preparation; report any subsequently observed exact-SHA run/result separately. Prior run PASS is not reused as a new-SHA PASS. MOBILE.md is unchanged; the manual checklist retains accepted evidence and records observed PR readiness only. Existing env files/stash/untracked assets/DBs/containers and main 2 are preserved.

**Post-push result — coverage acceptance BLOCKED:** [GitHub run 37866923724](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37866923724) on exact c3726a29d06ff8557a42809eb3a4417486bfe10e completed with failure. Installation, generation and all four config tests passed. The existing baseline/DAST and the three added AI cases plus Socket handshake/token-room case passed before the newly selected paused-privacy case failed: its PATCH returned 500 instead of 200. The runner stopped; the final Journal case was not executed. This is actual failure propagation evidence, not a regression PASS. Accepted 01ac98b/run 37866127057 remains historical PASS only.

- [x] **Narrow failure diagnosis (read-only source/logs):** realtime-security.test.js's transaction mock exposes a deletion-only object; it lacks withSocialLocks' required $queryRawUnsafe and user.update, and its friendship.deleteMany is a no-op. The paused privacy route therefore raises TypeError before exercising the intended fence. The preceding room-isolation case passes despite a /friends/remove TypeError because it asserts only non-delivery, not revoke success. These findings concern fixture compatibility and assertion quality; they do not establish a production authorization defect. No failing test was suppressed or removed and no app/DB/provider change was made.
- [ ] **Minimum next correction:** update only that fixture's transaction adapter for the current lock/user/friendship methods; assert successful revoke in the chosen room test, retain the paused privacy denial assertion, and validate the changed fixture in a disposable credential-free environment. Then obtain a normal-push exact-SHA run covering all seven additions, including Journal. This requires a further scoped correction commit beyond the single commit already pushed for this task; none was made or force-pushed. These observed post-push failure notes remain uncommitted for the next correction. New coverage is not yet accepted as a dependable CI slice. The warning about pinned actions using the deprecated Node 20 action runtime is non-fatal; Actions ran them on Node 24. Official action-version refresh is a separate maintenance item.

### Security CI fixture correction — 2026-10-08

- [x] **Failure reproduced:** the unchanged paused-privacy case fails locally with the same TypeError and HTTP 500 vs 200 as run 37866923724. Execution used a disposable tracked-source copy without env files, an explicit synthetic environment, mocked providers/database and loopback sockets; no accepted matrix was rerun.
- [x] **AI additions 3/3 PASS locally:** per-owner shared quota, revoked consent before cost/provider work, and same-millisecond consent epoch advance, using isolated in-memory fixtures.
- [x] **Socket/Journal additions 4/4 PASS locally (total 7/7):** invalid/expired handshake, actor/room isolation, paused privacy revocation, and the previously unreached private Journal case all execute successfully. Owner privacy OFF returns 200 with persisted false; in-flight movement and later movement/rejoin/reconnect are denied with no owner delivery, while owner access remains. Friendship removal now requires 200 and both directed rows removed, retaining outsider non-delivery.
- [x] **Fixture-only root cause corrected:** the transaction adapter now accepts only current timeout/parameterized row-lock queries, stages user updates and actual friendship deletions until successful completion, and returns selected user fields. Existing account-deletion predicates are supported. No endpoint responses are faked; assertions are strengthened. No product-code defect was reproduced, and no application/workflow/CI-selection change is needed. This in-memory fixture does not prove PostgreSQL row-lock concurrency.
- [x] **Scoped validation PASS:** all seven selected additions pass with zero skipped/cancelled tests; changed JavaScript syntax and diff checks pass. No TypeScript or application code changed, so no unrelated typecheck/matrix was run.
- [ ] **New remote acceptance pending at commit preparation:** obtain an exact-SHA GitHub run after normal push. The earlier failed-run and uncommitted-checkpoint wording above records the historical state; those original notes are included in this correction commit. No provider/manual procedure or mobile operational change; MOBILE.md is unchanged. Canonical counts, Enumeration PARTIAL, SAFE TO DEPLOY NO and deferred CD remain unchanged.

- [x] **Actual post-push GitHub PASS:** read-only Actions API observed [run 37867494911](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37867494911), event `push`, exact SHA `6f8dfd846973ce6d0ed8e6a658e23e07140dce10`, completed `success`. The Isolated security baseline job and every setup/install/generation/contract/regression step succeeded; no step was skipped. The unchanged runner executes all seven additions, including Journal, before returning success. This resolves the fixture/coverage blocker recorded for c3726a2; historical failure evidence is retained. Actual PR execution remains NOT VERIFIED. This post-push observation remains a local documentation checkpoint to preserve the requested single commit; no second commit, amend, force-push or deployment occurred.

**Automated coverage:** `node --test test/security-ci.test.js` verifies the CI contract; `npm run test:security:ci` runs auth.test.js (mocked Firebase identity, owner/recent-auth boundaries), security-config.test.js (CORS/proxy policy), five explicitly named cases in http-security.test.js (HTTPS/HSTS/CSP/private-cache policy and Socket.IO polling), then the existing `scripts/api-security-fuzz.js` default corpus. That corpus includes api-fuzz.test.mjs and social-content-fuzz.mjs: anonymous/invalid identity, owner/resource isolation, malformed JSON/object/byte/depth/key/array/query inputs, rate limits, valid controls, friendship/privacy/revocation, Flower/Garden visits and message/support access, and HTTP media/framing cases. DAST restricts sockets/fetch to its ephemeral loopback server and asserts zero unexpected DB/external calls; identity and Prisma are mocked. The separate public-SPA HTTP case requires built client assets and is explicitly excluded from this backend-only job, which does not build the client. The general backend wildcard, prior full P0 matrices, mobile/native suites and load benchmarks are not added to ordinary CI.

**Separate opt-in acceptance:** real Firebase/authenticated social or realtime suites, physical iPhone scenarios, Docker/PostgreSQL concurrency, provider/proxy checks, migrations, destructive account fixtures and load tests require their existing isolation/runbooks plus separate task authorization. This workflow exposes no target/secret inputs or opt-in deployment path. Known dependency advisories remain recorded; ignoring install scripts and passing regressions do not close them.

### Production release evidence checklist (all gates required)

- [ ] **Exact candidate and scope:** record the full proposed SHA, last verified live SHA, `git diff --stat LIVE_SHA CANDIDATE_SHA` and reviewed file/migration inventory. Explain every included change since live, including resource bounds and undeployed feature changes. A green moving branch or current integration HEAD is never an implicit candidate.
- [ ] **Exact CI evidence:** link the successful PetalPal security regression run, event, conclusion and head SHA for that candidate; inspect all required jobs for failures/cancellation/skips. Record existing CodeQL Default results separately. A PR merge-ref run alone does not certify a later different release SHA; require the exact released SHA's run. Do not enable Advanced or change branch protection as a shortcut.
- [ ] **Compatibility and rollback:** attach scoped application/API/client, build/start and runtime evidence relevant to the entire candidate diff. Name an exact approved rollback SHA and demonstrate schema/data compatibility and behavior lost on rollback. Earlier isolated tests or d510b1ff rollback evidence for 0ffdd3e alone do not certify a later integration SHA. Do not invoke npm start as a read-only check: it executes prisma migrate deploy.
- [ ] **Schema and DB readiness:** review pending/applied migration inventory and checksums, backward compatibility, deploy overlap/locking and rollback implications using separately authorized read-only evidence. Resolve Prisma Postgres effective capacity/shared usage/headroom, startup timeout/proxy support, acquisition/query/lock latency and monitoring/alert gaps in the DB readiness section. Require all readiness gates; current 1/4 is insufficient. No cap/timeout relaxation is approved.
- [ ] **Known blockers:** explicitly disposition DB capacity/proxy/latency/monitoring, Garden ordering/snapshot/performance, Message revision/migration/pagination, legacy unbounded reads and any candidate-specific provider/native compatibility limitations. Record scope exclusions without calling the underlying risks fixed. Any unresolved release-critical invariant keeps SAFE TO DEPLOY at NO.
- [ ] **Separate deployment/smoke approval:** record approval for only the exact SHA, target service, rollback criteria and a bounded non-destructive smoke plan. The approved plan should identify anonymous public/auth-denial/header/no-store checks and their limits; authenticated checks require separately authorized disposable identities and read-only scope. No paid AI, account deletion or private-data mutation is implied. Record actual deployed SHA and smoke result after a separately authorized rollout. CI PASS alone never authorizes deployment.

## DB Resource Release Readiness — 2026-10-08

Candidate `0ffdd3e26ab60e3dc470aa46f725d7b5cd795ec3` is pushed, NOT deployed. Read-only Render metadata still identifies `d510b1ff97902704721060b4c1261657be3e4b76` as Live; Compute confirms Free compute with scaling unavailable, consistent with accepted single-instance topology. Accepted 4/4 resource checks / 5 PostgreSQL test records are reused without reruns. **SAFE TO DEPLOY: NO while the following release gates remain unresolved.**

- [ ] **Production connection budget — UNKNOWN:** 10 connections per backend/worker process preserves the former pg default maximum, but neither the effective Prisma Postgres database/proxy connection allowance nor current shared usage/reserved headroom is recorded or exposed in available Render metadata. The live datasource is Prisma Postgres, not a Render-managed database. Budget for `10 × simultaneously alive backend/worker processes + migration/admin/other clients`, including possible deployment overlap; do not infer provider capacity from Render's one-instance plan. No authorized database-console session is currently available in the existing browser tabs. Effective proxy acceptance of the candidate's startup timeout options also remains unverified; ordinary PostgreSQL fixture PASS does not certify this provider boundary.
- [ ] **Deadline compatibility — PARTIAL:** social lock waits already use 1.5s and transaction-local statements 4s, with accepted PostgreSQL atomicity evidence. Explicit 2s maxWait / 5s interactive timeout retains Prisma's existing defaults. Reviewed report narrative generation (20s provider deadline) and embedding inference run between database preparation/reservation and persistence, so their provider deadlines are not themselves 10s SQL deadlines. Report aggregation/evidence persistence, consent/job locks and lease renewal still compete for database capacity. Jobs default to a 60s lease with approximately 20s heartbeat cadence; this is not proof of sufficient acquisition/SQL headroom. Production cold connection/queue waits, representative report queries and lock contention have no recorded latency distribution. New 2s acquisition, global 10s statements and global 1.5s locks therefore lack production compatibility evidence. A failure after durable inference reservation can strand a report without safe automatic replay; accepted reservation semantics are preserved.
- [x] **Docker/startup source contract / migration / rollback — PASS:** production-to-candidate diff changes only `lib/database-resources.js`, `lib/prisma.js`, `lib/garden-access.js` and `lib/http-errors.js` at runtime; remaining changes are tests/docs. Dockerfile, ignore rules, Node 24 contract, package/lockfiles, Prisma schema/configuration/migration tree and web source are identical. Final `COPY . .` includes the new library before startup; existing early install/generation inputs remain sufficient. Test/mobile/artifact/environment/native-security material exclusions remain intact. Normal startup still runs `prisma migrate deploy` then the backend; no new migration is introduced. Current recorded live startup reports 25 migrations with none pending. Rollback to exact `d510b1ff97902704721060b4c1261657be3e4b76` is schema-compatible and preserves deployed atomic social authorization, but removes the new resource bounds. Accepted Linux/amd64 build evidence is reused for the unchanged build contract; candidate production proxy handshake remains the unresolved provider gate above, not a newly verified build/startup run.
- [ ] **Monitoring readiness — PARTIAL:** current read-only Render Metrics shows network metrics and requires paid compute for application CPU/memory metrics. It provides no evidenced database saturation/deadline thresholds. Candidate code logs sanitized idle-pool errors and emits safe resource responses, but exposes no pool active/idle/waiting gauges, acquisition/query latency distributions, distinct exhaustion/timeout counters or alerts. Accepted worker lease/cost controls are not database monitoring. Effective Prisma Postgres usage/limits, provider proxy timeout/error metrics and existing alert destinations are unknown; no upgrade, instrumentation or provider setting was added speculatively.

**Result: 1/4 release gates PASS; two PARTIAL, one UNKNOWN.** Only documentation changed. No tests/build were repeated, no production SQL/load/authenticated request or mutation occurred, and no environment/configuration value was printed. Canonical Database Connection Exhaustion remains PARTIAL; P0/P1/P2 counts and production-authenticated NOT VERIFIED remain unchanged. **Next action:** obtain already-authorized read-only Prisma Postgres capacity/proxy metadata and existing latency/timeout telemetry: effective connection allowance and shared usage, migration/deploy-overlap headroom, support for startup timeout options, cold acquisition and report/job query/lock durations, and saturation/timeout alert coverage. If these cannot be evidenced, retain NO release approval; do not infer capacity or relax limits to make the gate pass. Manual checklist records the specific unresolved provider verification; MOBILE.md is unchanged.

### Authorized Read-only DB Readiness Follow-up — 2026-10-08

**Readiness remains 1/4 PASS; SAFE TO DEPLOY: NO.** No candidate values were adjusted, no prior tests/builds rerun and no production SQL or application request performed.

- [ ] **Capacity / pool / proxy constraints — UNKNOWN:** the known root `.env` and process environment currently provide only a development database URL, with no production inspection URL matching the previously recorded endpoint. No Prisma/Postgres metadata connector or existing authenticated Prisma Console tab is available. Stop this check without opening new access or inferring tenant capacity from PostgreSQL defaults/Render compute. The earlier successful production read-only migration session remains historical evidence, not evidence of currently available inspection access.
- [ ] **Actual production timeout/startup compatibility — UNKNOWN:** existing authenticated Render deployment metadata still shows exact `d510b1ff` Live; its startup logs identify the recorded PostgreSQL endpoint, 25 migrations and no pending changes. This establishes ordinary connectivity for the old configuration, not direct-versus-pooled proxy mode or support for the candidate's startup parameters. No authorized provider metadata establishing startup-option support is available; do not send a new-options connection as a speculative production probe.
- [ ] **Workload latency compatibility — PARTIAL:** existing Render Application logs were read within the selected Last 24 hours window, including a report search. No structured acquisition/query/report latency fields were present in the currently loaded views. This is a bounded visible-log observation, not exhaustive history, p95/p99 evidence or proof of zero timeout incidents. Deployment/CLI/model startup timing cannot stand in for individual SQL or connection-acquisition latency. Thus 10 connections / 20 waiters, 2s acquisition, 10s statements and 1.5s locks still lack representative production headroom evidence; accepted isolated bounds do not close this gate.
- [ ] **Saturation / timeout / alerting evidence — PARTIAL:** the inspected log views contained no pool gauges or recognized resource-error codes. Absence there does not prove absence of saturation. Previously observed Render Free metrics limitations and candidate instrumentation gaps remain; provider usage, proxy counters and alert thresholds/destinations are unavailable. No monitoring upgrade/configuration change was attempted.

**Exact blocker / next action:** access to already-authorized Prisma Postgres capacity/proxy metadata and existing workload telemetry is not currently established through the known local configuration/connectors/browser sessions. Obtain that read-only evidence (connection allowance/shared usage/headroom, actual pooling/startup-option constraints, acquisition/query/lock latency and alert coverage) before changing limits or authorizing deployment. Prior Docker/schema/rollback PASS is retained. No new [x] safety claim, canonical count/status change, manual/mobile requirement or authenticated-production verification arises from this follow-up; history and accepted matrices remain intact.

## Database Resource Protection — 2026-10-08

**4/4 focused checks PASS; five Node test records PASS (four cases plus fixture parent).** Previously the installed pg pool defaulted to 10 connections but unlimited waiters and no acquisition/server-statement deadline. Non-social lock waits also lacked an application deadline. No production connection or provider configuration was inspected or changed. Existing 34 PostgreSQL social concurrency PASS evidence is reused, not rerun.

- [x] **Pool configuration / saturation:** `lib/database-resources.js` supplies the existing Prisma PostgreSQL adapter with an owned pg pool: 10 active/connecting clients, at most 20 queued acquisition callbacks, 2000ms acquisition/connection timeout. A real saturated pool rejected further Promise/callback admissions and installed Prisma query/transaction calls, expired all admitted waiters, then recovered after release. The existing connection maximum is preserved; no automatic replay or new database architecture is introduced.
- [x] **Transactions / long-held locks:** explicit Prisma defaults retain maxWait 2000ms / interactive timeout 5000ms. Server startup sets lock timeout 1500ms and idle-in-transaction timeout 10000ms; unrelated startup options remain intact and conflicting URL timeout options cannot disable these defaults. Real PostgreSQL lock-wait cancellation rolled back an earlier insert; expiry of an idle interactive transaction rolled back its insert and rejected later use. The existing social transaction-local statement limit 4000ms, lock ordering and rollback/deadlock evidence remain unchanged. Idle-in-transaction server setting was checked with `current_setting`, not a separate idle-disconnection schedule.
- [x] **Query deadlines / bounded database concurrency:** the server enforces a 10000ms statement timeout for shared-pool queries, including non-social operations. An installed Prisma raw query executing `pg_sleep(11)` was cancelled in approximately 10.05s; an independent observer confirmed no remaining active sleep query, and the next query succeeded. This cancels server work rather than merely abandoning a caller. The connection/waiter bounds are per process; they do not bound total query count, result size or upstream HTTP/worker promises. A running statement can outlast the 5s interactive-client deadline until its server deadline; transactions may override limits explicitly (existing social scope is stricter).
- [x] **Recovery / safe errors:** terminating only an owned disposable idle backend triggered the adapter's idle-error handler; a subsequent query reconnected successfully. Resource-error normalization retains existing social deadlock/timeout codes and adds pool exhaustion. Social errors and errors reaching the shared HTTP error middleware return generic 503 / `Retry-After: 1`, without SQL/credentials; existing route-local generic 500 handlers are retained. No write retry is performed after ambiguous failure; production availability under outages is not certified.
- [ ] **Production/provider capacity and monitoring:** this candidate is NOT deployed. Before release, confirm the existing PostgreSQL connection budget accommodates 10 connections per backend/worker process plus migration/admin headroom, and check representative query/transaction latency against these deadlines. Production database/proxy settings, fleet-wide admission, sustained load, network-blackhole recovery and alerting remain NOT VERIFIED. Existing manual pool/worker/deadline verification requirement remains open; no new provider action was performed.

**Validation:** `PETALPAL_DB_RESOURCE_ISOLATED=1 DOTENV_CONFIG_PATH=/dev/null node --test test/back/database-resources.postgres.test.js` — **5/5 PASS**, one run. A newly created loopback-only cached `postgres:17` fixture verified its exact database identity before table creation; only its own connections, table/container were used and removed. No existing database/container restart, application migration, provider/authentication call or previous acceptance rerun. Changed JavaScript syntax and `git diff --check` PASS; no TypeScript/schema/package/lockfile change or build required. Database Connection Exhaustion remains PARTIAL; canonical P0/P1/P2 counts, prior deployment/history, dependency inventory and manual/mobile requirements are unchanged. Production authenticated behavior remains NOT VERIFIED.

## Active XSS / HTML / URL Injection Checks — 2026-10-08

**4/4 scoped checks PASS; five new tests PASS; no confirmed vulnerability or application change.** Existing social/realtime/native/route-policy/decoder acceptance evidence was retained without reruns. This is active-sink review and isolated rendering evidence, not authenticated production acceptance.

- [x] **Raw HTML / DOM injection:** no `dangerouslySetInnerHTML`, HTML assignment or DOM insertion sink found in the inspected active client/mobile rendering paths. Backend SPA fallback sends the fixed built `index.html`, not interpolated user HTML. The actual web Flower component renders hostile journal, AI meaning, author and message markup literally in jsdom; no injected script/iframe/SVG/anchor or event-handler attributes appear. Untrusted Flower image input resolves to an existing local asset.
- [x] **Links / URL schemes:** current `ExternalLink` callers in Explore/web tabs pass fixed HTTPS literals; a focused AST regression guards these call sites against dynamic hrefs or non-HTTPS schemes. The dev-only web link is a fixed `/`. No user/social/AI URL reaches these external-navigation sinks. The generic `ExternalLink` itself has no scheme allowlist; do not connect untrusted hrefs without a validated boundary.
- [x] **External navigation / redirects / deep links:** no active browser WebView/HTML source or user-controlled external redirect was identified. CanvasKit's `WebView` type is a graphics view, not an HTML renderer. Friend IDs reach `router.push` only as `ownerId` parameters under the fixed `/visit/[ownerId]` pathname; a hostile scheme/traversal/query/fragment fixture preserves that boundary. Feature redirects similarly use fixed internal paths. Existing decoder backport and production route-policy evidence remain separate; neither suite was rerun.
- [x] **Journal / social / AI rendering:** actual native Flower, measured Journal pages and saved Reflection components keep HTML, event handlers, `javascript:` and `data:text/html` payloads as `Text` children. Journal characters and legitimate HTTPS text are preserved; AI summary and narrative fallback plus topic labels are covered. Native source tests use the existing loader/hook harness and mocked RN primitives, not a device or browser-native runtime.
- [ ] **Deployed browser/native runtime and future dynamic URL/HTML surfaces:** not verified by these isolated tests. No production request, device action or new renderer was introduced. Recheck before enabling untrusted external links, HTML/Markdown rendering or a browser WebView; no speculative sanitizer/library was added.

**Validation:** `npm test -- src/Garden/GardenScene.injection.test.jsx` in `client` — 1 PASS; `node --test mobile/test/renderingInjection.test.mjs` — 3 initially PASS, with one test-locator failure; corrected the locator to the actual visit button and reran only that case — 1 PASS. Total **5/5 distinct new tests PASS**. Mobile test syntax and `git diff --check` PASS; no TypeScript application file changed, so no broad typecheck/build was needed. No prior matrix or dependency scan was repeated. XSS remains PARTIAL; canonical P0/P1/P2 statuses/counts, dependency risk inventory, deployment records and manual/mobile requirements are unchanged. Production authenticated behavior remains NOT VERIFIED.

## Remaining HIGH Dependency Triage — 2026-10-08

**8 reviewed / 0 fixed / 8 unresolved; Supply-Chain remains PARTIAL.** A targeted npm security bulk request covered only the six affected package names/locked versions, confirming eight unique HIGH advisory IDs. Root/web/mobile lock entries and their immediate parent constraints were checked; already-fixed Engine.IO/proxy/other advisories and the accepted decoder backport were skipped. Public registry release metadata confirms no compatible patched resolution currently available within these parents. No forced override, framework upgrade, package/lockfile change or alert suppression was attempted.

- [ ] [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj): backend `sharp` 0.34.5, libvips flaws; patched >=0.35.0. Untrusted image decoding is required; inspected Transformers use is bounded text feature extraction / local tokenization, not `RawImage` decoding. Transformers 3.8.1 (latest stable 3.x) requires ^0.34.1; no patched 0.34.x release exists. Blocker: compatible parent/native-decoder update; do not introduce untrusted image decoding meanwhile.
- [ ] [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c): backend `sharp` 0.34.5, libheif flaws; patched >=0.35.4. HEIF decoding required; same text-only inspected path and incompatible parent range. Blocker: compatible Transformers/native-decoder release, not an unvalidated 0.x override.
- [ ] [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w): backend `sharp` 0.34.5, librsvg flaw; patched >=0.35.5. Attacker-controlled SVG decoding required; same parent blocker. Current Transformers 4.x accepts newer sharp but is an out-of-scope major upgrade, not a validated fix.
- [ ] [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): backend `deepmerge-ts` 7.1.5; recursive/cyclic object merge exhausts stack, patched >=8.0.0. Prisma config is static trusted schema/migrations/datasource configuration, not a request-body merge. Latest stable Prisma 7.10.0 / @prisma/config 7.10.0 still pins 7.1.5. Blocker: supported Prisma config dependency update; do not pass untrusted recursive objects to configuration.
- [ ] [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr): backend `mysql2` 3.15.3; malicious MySQL authentication-plugin downgrade can disclose credentials, HIGH fixed >=3.22.0 (separate moderate compression advisory is not part of this eight-item count). Prisma 7.10.0 still pins 3.15.3. Actual schema/adapter are PostgreSQL; no active MySQL connection path identified. Blocker: supported Prisma driver update; avoid untrusted MySQL servers/CLI targets.
- [ ] [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j): web/mobile `@grpc/grpc-js` 1.9.16; certain Node gRPC TLS-server getAuthContext configurations accept unauthorized certificate context, patched >=1.13.6. Inspected shipped Firebase imports use Auth; no gRPC server handler identified. @firebase/firestore 4.17.1/4.17.2 pins ~1.9.0; latest 4.18.0 retains that constraint. Blocker: compatible Firebase transport update; no forced transport override. Already-remediated root gRPC is excluded from this HIGH item.
- [ ] [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): mobile `braces` 3.0.3 via micromatch 4.0.8 (^3.0.3), deeply nested untrusted glob stack exhaustion. Latest release remains 3.0.3 and affected. Metro/build-tool input is the relevant boundary, not a demonstrated app API path. Blocker: no published patch; use trusted bounded globs and do not expose development tooling to untrusted input.
- [ ] [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): mobile `node-forge` 1.4.0 via Expo CLI 57.0.21 / @expo/code-signing-certificates 0.0.6 (^1.3.3). Crafted PKCS#1 v1.5 DigestAlgorithm structure can forge signature verification when that verifier is a trust boundary. Latest 1.4.0 remains affected; no patched release. Blocker: upstream/compatible Expo signing-tool fix; do not treat untrusted certificates/signatures as verified by this code. Production release-signature reachability is not certified.

**Validation / limits:** eight targeted advisory/version/parent-compatibility checks PASS; `git diff --check` PASS. No application/dependency change, so no code test, build/install, previous acceptance matrix or provider/native suite was run. Backend-installed sharp (three HIGHs) and startup Prisma CLI dependencies (deepmerge/MySQL: two HIGHs) remain production-declared; no public-request exploit path was confirmed in the inspected entry points. This narrow non-reachability evidence is not full mitigation or advisory closure. Expo tooling is production-declared in npm but that flag does not establish shipped app-runtime reachability. All eight checkboxes remain open; historical 13 unique advisories (8 HIGH / 4 moderate / 1 low, including locally mitigated decoder) and default-branch GitHub counts are preserved. Stop at unresolved upstream/parent compatibility; no speculative changes. Canonical P0/P1/P2 statuses/counts, deployment state and manual/mobile requirements unchanged.

## SDK 57 Router URL Decoder Follow-up — 2026-10-08

- **HISTORICAL pre-backport — Advisory / chain:** [GHSA-vcc3-ghjq-m6fr / CVE-2026-45822](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), moderate CPU/availability DoS; `decode-uri-component` ≤0.4.2 affected, 0.5.0 patched. SDK-57 app uses Expo 57.0.19 alongside Router; lockfile and installed dependency chain agree: Expo Router 57.0.18 → query-string 7.1.3 (^7.1.3) → decoder 0.2.2 (^0.2.2). React Navigation parsing is bundled inside Expo Router; no independent navigation dependency change is needed. Previous dependency findings/counts remain historical evidence.
- **Reachability:** active `getLinkingConfig` → `link/linking` → `fork/getStateFromPath` → `fork/getStateFromPath-forks.parseQueryParams` uses `new URL(...).searchParams`, not query-string's decoder. Outbound path helpers use query-string.stringify. Bundled legacy `react-navigation/core/getStateFromPath` still calls query-string.parse → decoder. Exploitability is **CONDITIONAL** on reaching that legacy parser/other decoder consumers; a current PetalPal incoming-link decoder exploit is not confirmed. AuthGate/ProductionRouteGate run after routing and are not a pre-decoder DoS mitigation. No live URL, native/device or provider experiments were performed.
- **HISTORICAL pre-backport — Compatibility / blocker:** [SDK 57 Router documentation](https://docs.expo.dev/versions/v57.0.0/sdk/router/) and registry metadata checked before modification. Published Router 57.0.18–57.0.25 still require query-string ^7.1.3; latest 7.x remains decoder ^0.2.2. Patched decoder 0.5.0 is ESM with a default export, while query-string 7 requires a directly callable CommonJS export. An isolated candidate override resolving **0.5.0** reproducibly throws `TypeError: decodeComponent is not a function` for ordinary `word=hello%20world`; no override was applied to PetalPal. No compatible published CJS backport or supported SDK-57 chain update was found. Vulnerability **NOT FIXED**, dependency/advisory counts unchanged; no speculative framework upgrade/backport or export build.
- **HISTORICAL pre-backport — Feasible application mitigation (not implemented):** before any decoder, bound raw URL/query length and reject malformed percent sequences without recursive decoding. Native `+native-intent.redirectSystemPath` can screen initial/subsequent links but has no [web counterpart](https://docs.expo.dev/router/advanced/native-intent/); web requires a separate ingress guard before router evaluation. A guard only in root `_layout` is too late. Cross-platform ingress coverage and legitimate navigation/encoded-value semantics must be proven before introducing this mitigation; existing production route policy is retained.
- **HISTORICAL pre-backport — Validation:** 24 targeted router/route-policy tests PASS: bounded malformed percent inputs, invalid UTF-8 runs, encoded separators, duplicate query values, path-owner precedence, traversal-like/unexpected path denial, legitimate Garden/Fairy navigation, existing production-preview/AuthGate restrictions, and explicit legacy-parser boundary. Query-string.parse is made to throw during active parser checks to detect reintroduction. Scoped routePolicy/featureCatalog TypeScript check and git diff check PASS; installed/lock versions and manifest constraints unchanged. SDK/node fixtures do not certify native/web release behavior or all URL consumers. Supply-Chain and canonical P0/P1/P2 statuses/counts remain unchanged; no manual/provider or mobile operational change. Tests/documentation only; no compatible fix to commit/push under this task's condition.

**Latest result — MITIGATED (2026-10-08).** Native/web ingress hooks cannot prove coverage of every library consumer. `mobile/vendor/decode-uri-component` instead backports the official [single-pass UTF-8 fix](https://github.com/SamVerschueren/decode-uri-component/commit/fa479dafeede7bedf04e5c89aa78f2a78c664005) with MIT license and recorded provenance. Only adaptations: callable CommonJS export, retained 0.2.x plus-as-space semantics, and a 4096-UTF-16-code-unit cap before the malformed-input fallback. Native decoding remains linear and preserves valid values of any length; oversized malformed components remain plus-normalized encoded literals. The upstream scanner removes recursive exponential decoding; the cap also bounds its retained replacement-map passes. This is a decoder boundary, not a post-routing UI filter.

**Resolution / compatibility.** A committed local file dependency and lockfile make clean installs resolve every query-string caller to this backport without installation scripts, forced overrides, ESM or SDK/Router upgrades. Version 0.2.2 intentionally satisfies the existing dependency range; it does not claim upstream 0.5.0. Active SDK URLSearchParams routing and production route ownership/restrictions are unchanged. Bundled legacy query-string parsing is protected at its actual decoder call.

**Validation / residual risk.** 33 targeted decoder/router/route-policy tests PASS, plus 122 official upstream vectors with the legacy plus contract retained. Coverage includes exact 4096/4097 limits, malformed UTF-8/percent encodings, encoded separators, duplicate values, active path-owner precedence, Garden/Fairy navigation, preview/traversal denial, isolated adversarial subprocess deadlines and >1 MiB inputs. Instrumentation confirms oversized malformed inputs make only the native decoder call and never enter fallback. Clean isolated `npm ci --ignore-scripts`, dependency resolution, decoder syntax, scoped routePolicy/featureCatalog typecheck and diff checks PASS. Focused SDK-57 Expo Metro web decoder bundle and execution PASS (six modules, isolated synthetic entry). No full application export, native build or deployed/runtime verification is claimed. Existing workspace node_modules were preserved and may still contain the legacy decoder until normal installation. The 13 previously identified unique advisories remain recorded (8 high / 4 moderate / 1 low), including this one locally MITIGATED moderate advisory; 12 others remain unremediated. Backport maintenance and oversized-malformed-value literal behavior are residual obligations; registry audit omission, if any, is not advisory closure. Supply-Chain remains PARTIAL; canonical P0/P1/P2 statuses/counts unchanged. No manual/provider change.

## P1 Isolated DAST / API Fuzzing — 2026-10-08

**Historical initial corpus — commit `887b2a2`.** The original evidence and runner bounds below are preserved; the follow-up extends this command.

**Repeatable command:** `npm run test:dast`. The runner starts a fresh credential-free test process, disables dotenv loading, uses a synthetic unreachable development DB URL, and accepts no target/arguments. Tests reuse the existing Firebase-verifier hook and Prisma fixture pattern against the actual Express app on an ephemeral IPv4 loopback port. All database delegate methods default to rejection; only explicit in-memory fixture operations are allowed. Fetch/socket guards permit only that listener. No Firebase/AI calls, real database connection, migration, external scan or deployment occurs. Each run is sequential and capped at 256 requests, 64 KiB per generated body, 3-second request deadlines and a 30-second process deadline.

**Boundaries / findings.** Seven corpus groups exercise session authentication, owner profile/Journal/consent/account/Flower boundaries, private Event/memory/weekly/monthly/yearly report access, speech admission and internal AI executor admission. Cases include anonymous/invalid/unverified identities, forged path/body ownership and roles, cross-owner read/delete canaries, revoked consent/recent-login denial, malformed/non-object JSON, escaped/nested dangerous keys, byte/depth/key/array bombs, duplicate/invalid query limits and cursors, prototype-like report types, malformed percent-encoded paths, and exact general/AI/auth-IP/verified-account quota boundaries. Rejections assert no private canary disclosure, no server errors and no unauthorized mutation; valid owner controls retain profile/Journal writes and all supported report-type reads. The fixture reports zero external attempts and unexpected database calls.

Three defects were reproduced before correction: dotted private API paths skipped global authentication (existing ID validation limited observed exposure); report dispatch accepted inherited object members (`__proto__` caused 500); Express malformed route encodings became generic 500 responses. The smallest corrections reuse private-response classification when deciding public-file authentication exemptions, require an own report-dispatch key, and map Express status-400 URIError to sanitized 400. Static/public response compatibility remains covered. No private-data disclosure or unauthorized persisted mutation was demonstrated.

**Validation / limits:** 8 new tests (seven corpus groups plus parent) / 159 requests PASS; 6 directly affected existing HTTP-security tests PASS; changed JavaScript syntax and `git diff --check` PASS. Deterministic fixture limits prove local middleware boundaries, not distributed quotas, real Firebase verification/revocation, PostgreSQL semantics, provider capacity, every route, full speech/cover byte limits, Socket.IO fuzzing or deployed behavior. Historical security evidence remains intact. Only DAST changes canonical status, TODO → PARTIAL: P1 PARTIAL 10 → 11 and TODO 2 → 1; other P0/P1/P2 statuses/counts unchanged. No manual/provider action or mobile operational change; MANUAL_SECURITY_CHECKLIST.md and MOBILE.md remain unchanged. Next scope: expand isolated fuzz coverage to remaining mutation/social routes and transport/content-type boundaries, retaining these isolation guards.

### Social Routes & Content-Type DAST Follow-up — 2026-10-08

**Execution:** `npm run test:dast -- --social` runs only the new isolated corpus; the default `npm run test:dast` includes both corpora. The existing credential-free process, mocked verifier, fail-closed Prisma delegates and loopback fetch/socket guards are reused. Deterministic social fixtures implement query projection and mutation ledgers without connecting to any database. Combined request budget is now 512 (previous 256 preserved above); body/wire budget remains 64 KiB, request deadline 3 seconds, process deadline 30 seconds. No arbitrary target is accepted.

**Confirmed corrections:** direct Flower detail/support/message endpoints lacked the Garden friendship/privacy admission policy. A nonfriend read returned 200, and a message still committed after privacy was disabled. All three routes now check the same owner/friendship/privacy policy as Garden access before entering their handlers. Separately, a nonempty body without a supported Content-Type was ignored and a friend-accept action still mutated; JSON media admission now rejects non-JSON/missing types with 415 and repeated Content-Type headers with 400 before parsing. Truly bodyless actions and valid JSON parameters/UTF-8 remain supported. Unsupported charset/Content-Encoding errors previously returned 500; these now return sanitized 415. The media guard covers general JSON parsing and the existing authenticated speech/Journal-cover parser exceptions without changing their limits.

**New evidence:** 10 tests (nine corpus groups plus parent), **102 loopback requests PASS**, zero external attempts/unexpected database calls. Coverage: anonymous social APIs; request send/accept/reject/remove with receiver-only authorization and token-derived actors; stale/malformed IDs; owner-only friend/request lists and public search projections; nonfriend, privacy-OFF and actual subsequent friendship/privacy revocation; Garden visit/movement; private-field canaries and direct Flower access, support idempotency and messages. Forged actor fields retain the established ignore-and-derive contract; valid controls prove the authenticated actor performs only permitted mutations. Content cases include missing/invalid MIME, form-urlencoded/multipart/text, JSON parameters/UTF-8, unsupported charset/encoding, malformed JSON/non-object shapes, duplicate Content-Type, conflicting Content-Length/Transfer-Encoding and exact 32768/32769-byte parser boundaries. Rejections preserve mutation-ledger counts and expose no private canaries or unexpected 500s. Changed JavaScript syntax and diff checks PASS. The initial 159-request evidence is retained; completed unrelated suites were not rerun.

**Limits:** this is local deterministic DAST, not provider/deployed certification or a complete transport/route scan. The Flower admission check does not prove atomic enforcement against concurrent privacy/friendship revocation during a database write; transaction/race behavior and independent PostgreSQL/Socket.IO fuzzing remain open. Full speech/cover byte limits, every encoding/framing combination and production infrastructure remain unverified. DAST remains PARTIAL; canonical P0/P1/P2 statuses/counts unchanged. No manual/provider or mobile operational requirement changed; MANUAL_SECURITY_CHECKLIST.md and MOBILE.md remain unchanged. Next focused scope: atomic social authorization across concurrent revocation and writes, using disposable local persistence fixtures.

## Backend/Web Security Release Preparation — 2026-10-08 (HISTORICAL; rollout recorded below)

**Historical production precheck, read-only (superseded by db933de rollout below):** [Render service](https://dashboard.render.com/web/srv-d983eguq1p3s73fnk1m0) still identifies `8c3500116acc8a9ba0ee0e03dbd5cdc6b6e33316` as Last successfully deployed commit / Live. Settings confirm root `./Dockerfile`, root build context, no Docker command override, configured branch main and auto-deploy Off. Visible service environment key names contain no native-security test/credential keys; values were not read. Candidate `a7718cacce4765c1d79ec31a5da08aeb927b4d2b` includes still-undeployed Flower friendship/privacy checks, DAST auth/path/content-type fixes, backend auth abuse limits, recent-login deletion checks, safe auth feedback and Engine.IO/proxy dependency patches. No unrelated feature commit was identified in this delta; mobile, native harness and CI security changes also exist, so backend/web release does not certify a mobile release.

**Confirmed build correction:** the candidate Docker install stage copied `lib/database-isolation.js` without its new `lib/native-security.js` import, breaking Prisma configuration loading. The exact missing-import failure was reproduced in an isolated Linux/Node 24 stage. Dockerfile now copies that module before installation and uses `npm ci` in both stages. Build-context exclusions cover root/nested `.env*`, mobile, tests, artifacts, native harness scripts and alternate root dependency folders; seven negative fixture controls and one positive control PASS. Required guarded backend harness source remains available to existing imports; no isolated configuration or credentials are supplied.

**Release validation PASS with this correction:** isolated tracked backend/web source, clean lockfile installs, Prisma generation and the actual two-stage Linux/amd64 Docker build, with only a synthetic public Firebase build-key placeholder. Runtime Node 24.21.0 resolves Socket.IO's Engine.IO 6.6.11, Express's proxy-addr 2.0.8 and ip-address 10.7.3. Final image excludes environment/native test material and contains the built web entry point. Credential-free/network-disabled image regressions: 17 DAST tests / 261 loopback requests (zero external attempts/unexpected DB calls), plus 25 affected auth, abuse-limit, recent-login deletion, dependency and HTTP-security tests PASS; four scoped JavaScript syntax checks PASS. Separately isolated Node 24 web auth/session tests: 31 PASS. Historical counts and limitations remain unchanged. Lockfile reproducibility is verified; floating Node 24 base tags are not a claim of bit-identical future images. Production Firebase build configuration and deployed behavior were not exercised.

**Startup / rollback gate remains open:** candidate and live revision have identical tracked Prisma schema, migration tree and configuration; this delta requires no new migration. Default `npm start` still runs `prisma migrate deploy` before starting the server and would apply any pending migration. Current production migration history/pending state was not queried; initial October rollout evidence is preserved rather than refreshed. Before approving a release, compare production migration records read-only with the tracked history and confirm no pending/failed/unknown entries. Rollback target is the currently live `8c3500116acc8a9ba0ee0e03dbd5cdc6b6e33316`; code rollback is schema-compatible for this unchanged-schema delta, conditional on no intervening database changes. Retain its existing deployment artifact. No deploy, migration, production/provider write, mobile release or service/container restart occurred. DAST, supply-chain limitations and canonical P0/P1/P2 statuses/counts remain unchanged; no new manual/provider requirement or mobile operational change was introduced.

### Read-only Release Blocker Follow-up — 2026-10-08

**Migration gate PASS for candidate `db933de78a91ba505b06016db716bbf710530d7f`.** The existing local production connection was compared with Render's configured DATABASE_URL without exposing either value and matched exactly. One TLS-verified PostgreSQL session began a READ ONLY transaction and confirmed `transaction_read_only=on` before any SELECT. All 25 candidate migration names and SHA-256 SQL checksums match the 25 completed production entries: zero pending, incomplete/failed, unknown, duplicate-applied, rolled-back or checksum-drift entries. The transaction was rolled back and connection closed; no migration, DDL or data write ran. The previously documented EventMemoryEmbedding.updatedAt database default difference remains present; this scoped history/default check does not claim a new full-schema audit. The earlier unqueried-history release blocker above is superseded by this evidence.

**Public Firebase build configuration PASS.** Existing Render VITE_FIREBASE_API_KEY is nonempty and has the expected real Firebase key format; no placeholder was substituted and no value was printed or recorded. The service's production project identity matches the candidate's project default; no VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_AUTH_DOMAIN override is configured, and the default auth domain matches that project. Candidate `client/src/firebase.js` is identical to the live revision. Docker's required VITE_FIREBASE_API_KEY build argument and nonempty-key build gate are unchanged from the successful live build, establishing existing build-time availability without a repeat build or provider request. No native test keys are configured in the inspected service environment. This verifies configuration compatibility, not a new live Firebase authentication test.

**Release decision:** the two remaining backend/web preparation gates are closed for the pinned candidate. Dockerfile/.dockerignore fixes are committed in that exact SHA; tracked working tree was clean before this evidence-only documentation update. Accepted Linux/amd64 build, 73 security tests and native-material exclusions were reused, not rerun. Live rollback revision `8c3500116acc8a9ba0ee0e03dbd5cdc6b6e33316` has identical tracked Prisma schema/migrations/configuration and matching applied history, so code rollback is compatible for this delta; retain its deployment artifact and do not roll back schema. Safe to proceed to a separately authorized specific-commit backend/web deployment using existing production public build configuration, not the placeholder validation image. No deployment, restart, provider/secret change, commit or push occurred in this follow-up. Historical evidence, canonical statuses/counts, manual checklist and mobile documentation remain unchanged.

### Authorized Production Security Release — 2026-10-08

**Exact revision Live:** one explicitly authorized Render Manual Deploy → Deploy a specific commit deployed `db933de78a91ba505b06016db716bbf710530d7f`. [Deployment dep-db405u67bikc73ak9sag](https://dashboard.render.com/web/srv-d983eguq1p3s73fnk1m0/deploys/dep-db405u67bikc73ak9sag) identifies that full source revision and “Deploy succeeded | Live”; checkout logs match it. Started 13:54:17 PDT; Docker build/image push completed, and Render reported service Live at 14:02:10 PDT (21:02:10 UTC). Existing production environment/public Firebase build configuration was reused, with no placeholder substitution, configuration change, mobile release or additional manual deployment.

**Startup / migrations:** application logs at 14:01:31–32 PDT report `25 migrations found in prisma/migrations` and `No pending migrations to apply.`; server listening on port 10000 at 14:01:47 PDT. An earlier logged process ended with SIGTERM at 13:56:56 PDT before reporting a migration result; its cause/relationship to rollout is unconfirmed. The subsequent successful startup is explicit evidence, not an inference from build success. A pg connection-string warning concerns SSL-mode semantics in a future major version; no current TLS downgrade is claimed. No apparent post-startup runtime failures were observed in the scoped log window. No manual database writes or separate migration command ran.

**Safe production acceptance PASS within anonymous scope:** seven credential-free GETs at approximately 14:03:42 PDT: `/` and its built `/assets/index-DcilK66t.js` returned 200; `/login`, `/session?view=metadata`, `/ai/reports` and the nonexistent-ID Flower path returned 401; dotted `/users/security-release-nonexistent.json` returned 400 (identifier validation), never SPA content or private data. All six non-asset responses carried CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin`; all five rejected private requests carried `Cache-Control: no-store`. `/login` is a protected backend path, not a public SPA-login acceptance claim. No authenticated, mutating, AI, Firebase or user-data requests were made.

**Security fix presence / limits:** exact deployed source plus successful production Docker build/start establishes deployment presence of Flower friendship/privacy admission, DAST auth/path/content-type corrections, backend auth-abuse limits, recent-login deletion protection and the pinned Engine.IO 6.6.11 / proxy-addr 2.0.8 fixes. Accepted isolated 73-test/Linux build evidence is reused, not rerun; installed dependency versions were not independently queried in the live process. Authenticated Flower/privacy, stale-token deletion, abuse thresholds and content-type rejection are not runtime-certified by these anonymous GETs. Remaining DAST concurrency/revocation risks, Firebase/provider limitations and canonical PARTIAL statuses remain unchanged. No rollback was needed; reverting to `8c3500116acc8a9ba0ee0e03dbd5cdc6b6e33316` would restore the older security vulnerabilities. NATIVE_SECURITY_TEST remains unset/disabled; native test materials remain excluded by the pinned Docker context. Existing read-only preparation evidence and all historical records are retained. Only SECURITY.md changed; canonical P0/P1/P2 counts, manual checklist and mobile documentation are unchanged. Next verification requires separately authorized isolated authenticated fixtures; next focused code task remains atomic social authorization during concurrent revocation/writes.

## Atomic Social Authorization — 2026-10-08

**Confirmed race:** historical Flower middleware and Garden/visit admission checked friendship/privacy before separate reads/writes. Independent PostgreSQL fixtures reproduce both privacy-OFF and friendship-removal interleavings: admission succeeds, revocation commits, then the former unfenced message create still commits. Earlier anonymous production acceptance and 102-request social DAST evidence did not prove atomicity; they retain their original scope.

**Correction / guarantee:** covered HTTP Garden metadata/content, Flower detail/support/messages and visit/move paths now authorize against current policy inside READ COMMITTED transactions. Both existing User rows are locked in database `COLLATE "C"` order with `FOR NO KEY UPDATE`, before policy and data access. Privacy updates and bilateral friendship removal/grants use that same order; grants additionally lock/recheck the pending request. Locks last through commit: an admitted operation commits before revocation can become effective, or a committed revocation is observed before any protected read/write and returns 403. Message plus visit record and Support plus counter commit/roll back together; notifications follow commit. Cached HTTP visitors are published under locks and cleared on revocation or failed visit/move commit. Owners retain their existing permissions; actor IDs remain authentication-derived. This serializes participating HTTP transactions, not network response arrival: an already-authorized response can arrive after revocation commits.

**Bounded failure:** transaction-local lock timeout 1500ms, statement timeout 4000ms, Prisma maxWait 2000ms / transaction timeout 5000ms. Actual PostgreSQL deadlock and lock-timeout errors roll back and return generic 503 / Retry-After: 1 without automatic write replay. Real testing found Prisma adapter wrapping of lock-timeout SQLSTATE; normalization now covers the observed wrapper. Other persistence failures preserve generic 500 and rollback. No migration or framework/dependency upgrade is required.

**Independent PostgreSQL PASS:** `npm run test:social-atomic` creates only its own disposable, loopback-bound cached official PostgreSQL 17 container; no existing database/container is restarted or removed. Actual Prisma client and Express routes, mocked Firebase identity, independent operation/revocation connections and a third observer prove distinct backend PIDs and observed PostgreSQL lock waits. 34 tests PASS (33 cases plus parent), 43 loopback HTTP requests, zero external attempts: 24 schedules cover six operations (Support, message, Flower read, Garden read, visit, move) × two revocations × both commit orders; two legacy race reproductions; message/counter/commit rollback; safe timeout; opposite actor/owner ordering; deliberately induced real deadlock rollback; and revocation route/cache eviction with owner access preserved. Fixture scalar layout follows the tracked Prisma schema with relevant real FKs/unique constraints, including a deferred-FK commit-failure control; this is not full production-schema/migration certification. Fixture startup/schema issues were corrected before the final passing run, and only its created container was cleaned up.

**Affected regressions / scope (historical implementation checkpoint; undeployed state superseded by rollout below):** 13 affected persisted Support/privacy regressions PASS after adapting their single-connection fixtures; the affected social HTTP/socket payload regression PASS is retained. Existing 10-test / 102-request isolated social/content-type DAST PASS is reused and was not rerun in this follow-up. Scoped JavaScript syntax, manifest/lock dependency consistency and diff checks PASS. The single-connection PGlite/mocked tests are supplementary, not atomicity evidence. Production remains `db933de78a91ba505b06016db716bbf710530d7f`; atomic candidate `d510b1ff97902704721060b4c1261657be3e4b76` is pushed, NOT deployed and authenticated production social behavior remains unverified. Socket/process-local visitor propagation, distributed realtime revocation, external database writers that bypass the participating lock protocol, broader contention schedules and production load/latency remain separate limitations. Canonical Race Conditions / DAST / authorization statuses remain PARTIAL; P0/P1/P2 counts unchanged. Deployment evidence and all historical records are preserved; manual checklist/mobile operational requirements unchanged. Next task: independent multi-instance realtime revocation/visitor consistency, followed by separately authorized authenticated release verification.

### Authorized Atomic Social Production Release — 2026-10-08

**Exact source / deployment PASS:** read-only Render service metadata first confirmed `db933de78a91ba505b06016db716bbf710530d7f` was still Live. One authorized Manual Deploy → Deploy a specific commit selected only `d510b1ff97902704721060b4c1261657be3e4b76`, not the later documentation commit `8c28d6981ac1e368be2f0b7054b98290a157f675`. [Render deployment dep-db40qshsrm7s73agbdn0](https://dashboard.render.com/web/srv-d983eguq1p3s73fnk1m0/deploys/dep-db40qshsrm7s73agbdn0) identifies the full approved SHA and “Deploy succeeded | Live”. Started 14:38:58 PDT; production Docker build succeeded, rollout duration 3m04s, service Live log at 14:42:03 PDT (21:42:03 UTC). Existing environment/build configuration was retained; no provider/credential change, native test activation, mobile release or other deployment occurred. NATIVE_SECURITY_TEST remains unset/disabled under the unchanged accepted configuration.

**Startup / migrations PASS:** new instance cfjcc reports `25 migrations found in prisma/migrations` at 14:41:39 PDT, `No pending migrations to apply.` at 14:41:40, and `Server running on http://localhost:10000` at 14:41:56; model initialization completed at 14:41:58. Normal startup alone ran Prisma migrate deploy; no pending migration was applied or separate database command executed. Prior-instance SIGTERM entries at 14:37:25 predate this deployment and are not evidence of a candidate startup failure. No new-instance startup/runtime errors or unexpected 503s appeared in the inspected sanitized window. Prisma's major-update notice is informational; no update was performed.

**Scoped anonymous production acceptance PASS:** three credential-free, non-mutating GETs at 21:42:24–25 UTC: `/` returned 200 with the web root HTML; `/session?view=metadata` and `/users/security-release-nonexistent/flowers/security-release-nonexistent` returned 401. All three responses carried HSTS/CSP, nosniff, X-Frame-Options DENY and Referrer-Policy strict-origin-when-cross-origin. Both private rejections carried Cache-Control no-store; public root remained public/max-age=0. No 500/503 occurred in these checks; no load, authenticated social mutation, Firebase/AI request or user-data operation was generated.

**Presence / remaining limits:** exact Live SHA plus successful production build/start proves the atomic HTTP social locking correction is deployed. The accepted 34 independent PostgreSQL tests, 14 affected regressions and previous 102 social DAST requests were reused, not rerun. Authenticated production Flower/privacy/Garden behavior, production concurrent interleavings and distributed realtime revocation remain NOT VERIFIED; anonymous rejection is not atomicity certification. Canonical statuses/counts remain unchanged. No rollback was needed or attempted; rollback to `db933de78a91ba505b06016db716bbf710530d7f` is schema-compatible but restores the old social race and requires further approval. Historical rollout/predeployment evidence remains intact. This follow-up changes only security documentation; its separate documentation commit must not be deployed. Next acceptance gate is separately authorized isolated authenticated social verification; next code-security scope is distributed realtime revocation/visitor consistency.

## Authenticated Social Acceptance — Batch 1 — 2026-10-08

**Isolated Batch 1 PASS; production-authenticated status remains NOT VERIFIED.** One targeted run of `node --test test/security/authenticated-social-batch1.test.mjs`: 4 tests / 4 authenticated loopback GET requests PASS. Reused existing isolated Firebase A/B in `petalpal-native-security-test` and existing loopback PostgreSQL `petalpal_native_security_test` on 5433. Owned, Git-ignored 0600 configuration/Admin/account files passed the existing isolation guard; a READ ONLY transaction confirmed read-only mode before checking exact live database identity, existing A/B profiles/Gardens, privacy ON, absent bilateral friendship and empty owner Garden. Live registered Firebase app/project/API-key/auth-domain matching preceded sign-in; real Admin verification checked issuer/audience, verified email, UID/profile linkage and revocation. No mocked authentication was used. Backend ran current social code from a private empty temporary cwd on an ephemeral loopback listener; post-import guard and actual Prisma database identity passed before writes.

- [x] Owner A Flower read: 200, own disposable fixture/private canary and owner state present; no-store PASS.
- [x] Owner A Garden read: 200, exactly the disposable Flower under its existing owner Garden; no-store PASS.
- [x] Nonfriend B Flower read: 403 safe denial, no private canary/fixture response leakage; no-store PASS.
- [x] Nonfriend B Garden read: 403 safe denial, no private canary/fixture response leakage; no-store PASS.

**Mutation / cleanup evidence:** one uniquely identified synthetic Flower was created only after isolation/provider/profile gates. Every acceptance read preserved its complete persisted row, message count and owner-Garden visit count. Cleanup reverified database identity and deleted only that batch ID + owner + synthetic marker; absence confirmed PASS. No profile/Garden/friendship/account was created, edited or deleted. A/B accounts were preserved; C was neither queried nor recreated/deleted. Existing containers/databases/services were not restarted or removed. Real isolated sign-in may update normal provider sign-in metadata; no production target, authenticated production request, paid AI, migration, provider-setting change, deployment or native scenario occurred. No code defect was confirmed; added only this focused acceptance test and checklist. The prior 34 concurrency tests / 14 regressions / 102 DAST requests were not rerun. Test syntax and documentation diff checks PASS; canonical P0/P1/P2 statuses/counts unchanged; manual checklist/mobile documentation unchanged.

**Historical Batch 1 handoff (not executed then; completed by Batches 2–5 below):**
- [x] Subsequent Batch 2: legitimate confirmed-friend Flower/Garden reads and revoked-friend read denial using disposable isolated relationships — PASS below.
- [x] Subsequent Batches 3–5: isolated authenticated privacy OFF / support / message / Garden visit acceptance and cleanup — PASS below; no production concurrent/runtime certification is inferred.

Production remains exact Live `d510b1ff97902704721060b4c1261657be3e4b76`; this isolated evidence does not upgrade authenticated production Flower/privacy/Garden or distributed realtime status. Batch 1 stops here.

## Authenticated Social Acceptance — Remaining Isolated Matrix — 2026-10-08

Batch 1 4/4 remains accepted. Nonfriend Flower/Garden denial and owner/privacy-ON reads are reused, not rerun. Production remains Live `d510b1ff97902704721060b4c1261657be3e4b76`; production authenticated behavior remains NOT VERIFIED. Prior 34 real PostgreSQL concurrency tests / 14 regressions / 102 DAST requests / native 7/7 are reused without reruns.

- [x] Batch 2: Confirmed-friend Garden read with private fields excluded.
- [x] Batch 2: Confirmed-friend direct Flower read with private fields excluded.
- [x] Batch 2: Friendship removal revokes Garden access.
- [x] Batch 2: Previously authorized Firebase token cannot read revoked Flower.

**Batch 2 evidence:** PASS; 4/4 new cases, 5 authenticated loopback requests. Real isolated Firebase A/B tokens and PostgreSQL identity gates passed; owned fixture cleanup PASS. Same real tokens were retained across revocation; no mocked auth or concurrency rerun. Production authenticated status remains NOT VERIFIED.

- [x] Batch 3: Privacy OFF denies confirmed-friend Garden access.
- [x] Batch 3: Privacy OFF denies previously authorized direct Flower access.
- [x] Batch 3: Privacy OFF preserves owner Garden access.
- [x] Batch 3: Privacy ON restores confirmed-friend sanitized Garden access.

**Batch 3 evidence:** PASS; 4/4 new cases, 6 authenticated loopback requests. Real isolated Firebase A/B tokens and PostgreSQL identity gates passed; owned fixture cleanup PASS. Same real tokens were retained across revocation; no mocked auth or concurrency rerun. Production authenticated status remains NOT VERIFIED.

- [x] Batch 4: Cross-owner Flower identity mismatch denied without disclosure.
- [x] Batch 4: Friend Support commits once and repeated same-day Support is idempotent.
- [x] Batch 4: Friend Message persists token-derived author and one history row.
- [x] Batch 4: Friendship and privacy revocation reject Support and Message without writes.

**Batch 4 evidence:** PASS; 4/4 new cases, 11 authenticated loopback requests. Real isolated Firebase A/B tokens and PostgreSQL identity gates passed; owned fixture cleanup PASS. Same real tokens were retained across revocation; no mocked auth or concurrency rerun. Production authenticated status remains NOT VERIFIED.

- [x] Batch 5: Confirmed friend can visit and move with token-derived identity.
- [x] Batch 5: Friendship revocation denies new visit and stale visitor movement.
- [x] Batch 5: Privacy revocation denies new visit and previously active movement.
- [x] Batch 5: Privacy regrant cannot resurrect a stale visitor without a new visit.

**Batch 5 evidence:** PASS; 4/4 new cases, 11 authenticated loopback requests. Real isolated Firebase A/B tokens and PostgreSQL identity gates passed; owned fixture cleanup PASS. Same real tokens were retained across revocation; no mocked auth or concurrency rerun. Production authenticated status remains NOT VERIFIED.

**Completed isolated matrix:** Batches 2–5 each 4/4 PASS; 16 new acceptance cases / 33 authenticated loopback requests in one focused run (Node reports 17 tests including the orchestration wrapper). Batch 1 remains 4/4 from its separate accepted run: total 20/20 isolated cases. Batch checkpoints were written immediately after each batch passed and its cleanup succeeded; no accepted batch was rerun. Zero confirmed app-controlled defects; no application changes. Full A/B profile and Garden rows matched pre-run snapshots after every cleanup; all batch Flower/message/visit/friendship rows were removed with owned identifiers/markers, and original privacy was restored. No active unchecked cases remain. Future command execution skips completed cases before authentication/setup. Syntax and diff checks PASS. Next security scope: distributed realtime revocation/visitor consistency; authenticated production behavior requires separate authorization.

Repeatable missing-case command: `PETALPAL_SOCIAL_CHECKPOINT=1 node --test test/security/authenticated-social-remaining.test.mjs`. Fixed isolated project/database only; one fresh ephemeral loopback backend and one real A/B authentication setup across batches. Each batch independently rechecks READ ONLY/database identity before its disposable fixture and before mutations, requires absent pre-existing A/B friendship and empty owner Garden, and restores original privacy/profile state. Cleanup is limited to randomly identified batch Flowers/relationships and exact matching synthetic message/visit markers. C is neither queried nor used. No production request, provider setting, account creation/deletion, migration, native rerun, container restart or deployment. Single-process HTTP revocation acceptance does not certify production or distributed realtime behavior; accepted concurrency evidence is separate. Canonical statuses/counts and manual/mobile requirements unchanged.

## Isolated Realtime Visitor Consistency — 2026-10-08

Production remains Live `d510b1ff97902704721060b4c1261657be3e4b76`, single Render instance per accepted evidence; production authenticated behavior remains NOT VERIFIED. Prior authenticated HTTP 20/20, PostgreSQL concurrency 34, native 7/7 and existing deterministic Socket account/session/pending-work regression evidence are reused, not rerun.

- [x] RT1: Friend joins and receives permitted Garden movement with HTTP visit identity.
- [x] RT1: Permitted message delivery is sanitized and isolated from unrelated user rooms.
- [x] RT1: HTTP privacy OFF immediately fences Socket actions and further Garden delivery.
- [x] RT1: Reconnect with the same real token cannot restore privacy-revoked subscription.

**RT1 evidence:** PASS; 4/4 feasible new cases PASS; 5 loopback HTTP requests / 8 acknowledged Socket actions. Real isolated Firebase tokens, live project/app matching and PostgreSQL used; cleanup PASS, full A/B profile/Garden snapshots restored. Production authenticated status NOT VERIFIED.

- [x] RT2: HTTP unfriend removes active visitor and rejects stale Socket actions and delivery.
- [x] RT2: Real-DB pending join cannot survive privacy revoke and regrant.
- [x] RT2: Real-DB paused visitor movement cannot publish or restore access after unfriend.

**RT2 previous checkpoint (superseded):** BLOCKED — no later batch run; 2/3 feasible new cases PASS; 7 loopback HTTP requests / 11 acknowledged Socket actions. Real isolated Firebase tokens, live project/app matching and PostgreSQL used; cleanup PASS, full A/B profile/Garden snapshots restored. Production authenticated status NOT VERIFIED.

**RT2 evidence:** PASS; 3/3 feasible cases checked PASS (1 missing cases executed in this run; earlier PASS cases skipped); 3 loopback HTTP requests / 7 acknowledged Socket actions this run. Real isolated Firebase tokens, live project/app matching and PostgreSQL used; cleanup PASS, full A/B profile/Garden snapshots restored. Production authenticated status NOT VERIFIED.

- [x] RT2: Real Firebase refresh-token revocation rejects original ID-token handshake/actions/delivery and idle sessions.

**Historical provider blocker (superseded by authorized D-only verification below):** BLOCKED under the previous preservation scope: disabling/deleting A/B or revoking their refresh tokens persistently changes preserved account/session state; unlinking existing profiles also changes pre-existing data. No such action was attempted; accepted deterministic mock account/session revocation evidence was reused, not rerun. A separately authorized disposable identity/session or read-only already-revoked test token is needed.

**Historical pre-D result (superseded below): isolated PARTIAL, 7/8 new checks PASS; live Firebase account/session-revocation check was unchecked.** RT1 4/4 and RT2's three feasible cases PASS with real verified Firebase A/B, PostgreSQL and Socket.IO WebSocket transport. First run checkpointed six PASS cases and stopped at the paused-movement observer; the harness now waits for the preceding permitted HTTP visit publication before observing the revocation interval. A focused resume ran only the remaining case (1/1 PASS), restoring its subscription prerequisite in a fresh owned fixture; no earlier PASS case or accepted suite was rerun. Historical blocked checkpoint above is retained and superseded by the successful resume. Across both runs: 15 isolated HTTP requests / 26 Socket actions; all three batch-fixture cleanups PASS, original privacy and complete A/B profile/Garden rows preserved, owned social fixtures removed. No confirmed application vulnerability or application-code fix; only fixture-helper reuse, new acceptance tests and documentation. No production/provider settings or Firebase account/session state changed; C untouched. The live-provider check is deliberately blocked rather than inferred from real valid-token verification or accepted mock revocation tests. No further batch was started. Syntax and `git diff --check` PASS; canonical statuses/counts unchanged; existing manual Firebase/runtime verification requirements remain open and unchanged.

New-case command: `PETALPAL_REALTIME_CHECKPOINT=1 node --test test/security/authenticated-realtime.test.mjs`. Reuses the existing guarded A/B + PostgreSQL fixture helper with no completed tests registered on import; one isolated authentication/setup and ephemeral loopback HTTP/Socket.IO instance. Live registered project/app/key matching, real Firebase Admin revocation-aware token verification, READ ONLY database identity and restored full profile/Garden snapshots are required. Each batch uses uniquely owned Flower/friendship/message/visit fixtures and cleanup markers. Pending cases pause an actual Prisma PostgreSQL result after retrieval solely to control interleaving; authentication and returned data are not mocked. No Firebase account/provider-setting mutation, production authenticated traffic, migration, deployment or container/service restart.

**Realtime isolated completion: PASS 8/8.** Repeatable eighth-case command: `PETALPAL_REVOCATION_CHECKPOINT=1 node --test test/security/firebase-realtime-revocation.test.mjs` (completed case skips before setup). One new focused real Firebase/PostgreSQL/Socket.IO test PASS; seven prior checked cases were skipped. Only disposable D was created, authenticated, refresh-token revoked and deleted in the exact isolated project/database. Backend uses real Admin verifyIdToken(token, true) on handshake, actions, recipient delivery and the 5-second idle timer. Original ID token remains signature/expiry-valid with checkRevoked=false (3595s remaining at observation), but checkRevoked=true rejects it as auth/id-token-revoked; auth_time precedes tokensValidAfterTime by 2s. Observed from revocation request start: existing action disconnect 353ms, original-token handshake rejection 553ms, recipient disconnect 1682ms, idle disconnect 3399ms (idle socket left its user subscription before revocation and received no post-revocation client actions or targeted delivery). Old-token HTTP session returned 401; no old-session private events or stale permissions restored. A fresh post-revocation D sign-in was accepted and received the control message, distinguishing revocation of old sessions from account disablement/ID-token expiry. D Firebase identity and exact owned PostgreSQL profile/Garden/Flower/message/visit rows deleted and absence confirmed; owned ignored 0600 credential journal removed, A/B Firebase records and full PostgreSQL profile/Garden snapshots unchanged, C untouched, no active test socket or armed auth/data hook. No application code fix, provider setting, production traffic, migration, deployment or accepted-suite rerun. Scoped test syntax and `git diff --check` PASS. Production authenticated/distributed statuses and canonical P0/P1/P2 counts remain unchanged. The previous preservation blocker is historical and superseded by this specifically authorized D-only evidence. Token expiry/disabled-account cases retain prior deterministic evidence, not new live-provider claims; timing is this isolated observation, not a production propagation/SLA guarantee.

**Prerequisite before scaling:** current visitor map, revocation gates/generations, inflight identity verification and movement/control budgets are process-local. There is no shared Socket adapter, cross-instance visitor ownership/expiry or revocation invalidation. Local recipient revalidation skips adapter-visible remote sockets rather than trusting remote identity; merely adding an adapter would not establish delivery authorization. Before more than one instance, design shared visitor/session ownership, cross-instance revocation fencing and per-recipient authentication/policy checks, consistent abuse budgets, and certify multi-instance pending/reconnect/delivery/outage schedules. No Redis/adapter/infrastructure was added. Single-instance results do not certify distributed behavior or production load/latency. Canonical statuses/counts remain unchanged.

## Production Authenticated Acceptance Readiness — 2026-10-08

**Readiness only; production authenticated acceptance NOT VERIFIED.** No existing explicitly authorized disposable production social-test identity/fixture inventory is recorded in the reviewed evidence. Availability is UNKNOWN; filename metadata indicates only isolated native-security configuration and cannot establish production identity or authorization. No credential contents were opened, authentication attempted or production endpoint contacted. Isolated social 20/20 and realtime 8/8 remain complete; no accepted case was rerun. Isolated A/B are not production identities.

- Smallest initial smoke: four allowlisted HTTPS GETs using three explicitly approved production test identities P/Q/R and existing synthetic fixtures. P owns privacy-ON Garden/Flower; Q is P's confirmed reciprocal friend and owns a privacy-OFF Garden/Flower; R is neither owner's friend. P reads its Flower (200); Q reads P's Garden (200, sanitized); R reads P's Flower (403, safe denial); P reads Q's Flower (403 despite friendship). Require private no-store/security headers and no private Flower/Journal/profile fields in friend/denial responses; retain only redacted outcomes, not bodies/tokens. This is a scoped smoke, not global production certification.
- Before requests: separately authorize named production identities/resource IDs and read-only project/profile/relationship/privacy/fixture metadata checks; confirm approved Firebase project, exact deployed revision/HTTPS origin and token issuer/audience/verified-email/UID linkage. Every Garden/Flower must already exist under its approved owner: `getGardenResponse` falls back to `ensureGarden`, which creates a Garden if missing, so GET alone is not a non-mutation guarantee. Fail closed without pre-existing fixture evidence; do not invoke `/auth/session` profile setup or repoint the isolated harness at production.
- Use securely supplied existing valid ID tokens; sign-in requires separate explicit authorization because Firebase may update sign-in metadata. No production token/credential was inspected during this assessment. Missing identities, confirmed friendship, privacy-OFF fixtures or usable tokens block the corresponding check; do not alter real-user privacy/relationships to obtain coverage.
- Separate mutation scope: production test-account/fixture creation, friendship/privacy changes, visits/movement, support/messages, Socket joins/actions, refresh-token revocation, account deletion and cleanup require explicit additional identity/action/fixture authorization. Existing isolated tests do not grant that permission.
- Read-only cleanup: remove only acceptance-owned local token/response artifacts; no production rows/accounts/session revocation to clean up. Stop immediately on origin/project/UID/fixture mismatch, unexpected status/5xx, unauthorized success/private disclosure, missing required cache protections or any mutation indication; no retries, fallback account, deployment or automatic rollback. Fixture provisioning, if needed, must be separately authorized with an owned-record cleanup inventory before writes.

Assessment changed only this readiness record; manual/provider status and canonical P0/P1/P2 counts unchanged. Next action: obtain non-secret approved P/Q/R role/fixture inventory and explicit permission for the metadata preflight and four GETs (plus sign-in only if existing tokens are unavailable). No production action is currently authorized by this plan.

## Garden Verification Reads — 2026-10-08

**Existing solution confirmed; no application change.** Ordinary `GET /users/:userId/garden` can call `ensureGarden` and persist a missing Garden. Existing owner-only `GET /users/:userId/garden?view=metadata` reads Flower metadata without Garden hydration/creation; existing authenticated `GET /users/:userId/garden-access` returns `{ allowGardenVisits, canVisit }` from User/confirmed-friendship reads under bounded social locks without creating a Garden. These are metadata/policy probes, not full Garden content acceptance; policy denial is `200` with `canVisit=false`, while cross-owner metadata is `403`. Normal Garden creation behavior is unchanged.

- [x] Owner metadata with no Garden/Flowers returns empty; no Garden lookup or record write.
- [x] Cross-owner metadata with no Garden is rejected before content lookup or record write.
- [x] Missing-Garden policy probe covers owner/friend/nonfriend with privacy ON/OFF; no Garden lookup or record write.
- [x] Ordinary full Garden GET still invokes lazy creation when missing.

**Evidence:** only new `node --test test/back/garden-verification-read.test.js` ran: four focused cases / five Node tests including wrapper PASS. Actual Express routes with synthetic Firebase/Prisma fixtures; all model mutations and unexpected reads/SQL trapped, verification record-write count zero; ordinary-route control observed exactly one simulated Garden create. Empty temporary cwd and unusable loopback test-only database URL prevented real environment/provider/database access. An initial configuration-gate failure occurred before any case and was corrected in the test setup; no accepted suite was rerun. Syntax and `git diff --check` PASS. This is deterministic route/mock evidence, not new live Firebase/PostgreSQL or production certification.

The previous uncommitted production readiness record above is preserved. Authorized production identities/tokens are still missing; no production request or account/fixture provisioning occurred. Metadata/policy probes can avoid lazy creation for preliminary verification, but full Garden content acceptance retains its existing-fixture prerequisite. Production authenticated status remains NOT VERIFIED; canonical counts and manual/mobile requirements unchanged.

## P1 Static Security Analysis — 2026-10-08

- **Current accepted setup:** CodeQL Default remains active; Advanced cutover is deferred. Keep `PETALPAL_CODEQL_ADVANCED` unset/false; do not disable Default setup or change branch protection. Historical main JS/TS/Python PASS below is retained; current integration coverage/results are not newly verified by this reconciliation.
- **Availability / prior evidence:** [origin repository API](https://api.github.com/repos/JX-Technologies-Inc/Petalpal) confirms public visibility, so [official CodeQL JS/TS](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning) is supported without a paid upgrade. Read-only Actions evidence shows active managed CodeQL and [successful run 37264614823](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37264614823) on main (`f2cde253aa1992c509d1497faf7750f5415eea5c`), with successful JavaScript/TypeScript and Python jobs. This is historical main evidence, not an integration scan or proof of no vulnerabilities. Default-setup configuration and alert details require authenticated access and were not inspected.
- **Implementation:** `.github/workflows/security-codeql.yml` and `.github/codeql/codeql-config.yml` retain default security queries plus official `security-extended`. Scan maintained root JS/TS, backend `lib`/`data`/`scripts`, web `client/src`, mobile `mobile/src`/bootstrap entry files, and Worker source. Sparse checkout and source allowlists omit archived experiments/resources/large assets; declared ignores exclude dependencies, generated/build outputs and test fixtures/training utilities. No finding-specific suppression or query severity filter is added.
- **Isolation / cost:** one JS/TS job, relevant integration pushes and PRs targeting main/integration, concurrency cancellation, 20-minute timeout; no schedule. Only pinned official checkout/CodeQL actions, contents read and result-upload permission; checkout credentials are not persisted. Build mode `none`: no application install, scripts, migrations, deployment, environment secrets, database or provider access; no `pull_request_target`. No mandatory protection check is configured.
- **Deferred cutover / limitations (conditional instructions, not a current action):** job runs only when repository variable `PETALPAL_CODEQL_ADVANCED` equals `true`, which must be set only after the administrator switches off managed default setup. [GitHub documents default/advanced setup conflicts](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/results-different-than-expected); no provider/repository settings were changed. Existing main scan remains intact. New integration scan is **NOT VERIFIED**; PR execution requires this workflow on the target branch, and rollout to main is outside this change.
- **Validation / findings:** actionlint v1.7.7 and YAML/config safety checks PASS; `git diff --check` PASS. CodeQL CLI is not installed locally, so no focused local CodeQL scan was run. New-scope finding count/severity **UNKNOWN**; zero confirmed defects from this configuration work, no source fixes. Review actual GitHub findings for severity and reachable exploitability before remediation; scanner success alone does not establish security or enforce a merge gate. SAST TODO → PARTIAL; P1 PARTIAL 9 → 10 / TODO 3 → 2; P0/P2 unchanged.

## Incident Response

Target: first containment actions within 30–60 minutes, followed by evidence
preservation, recovery, verification, and legally required notification.

1. **Contain:** declare the incident, record UTC scope/timestamps, pause the
   affected deployment or AI capability, block abusive traffic, and preserve
   immutable logs. Do not copy secrets or journal content into chat channels.
2. **Disable/revoke:** disable compromised GitHub/Render/Cloudflare/Firebase
   accounts, revoke tokens/sessions, remove exposed members, and isolate the
   Worker/API/database path.
3. **Rotate:** rotate Firebase Admin, database, Worker, deploy, and other
   affected credentials in platform secret stores. Do not assume rotation.
4. **Investigate:** determine initial access, affected identities/resources,
   unauthorized reads/writes, AI spend, persistence, and available logs.
5. **Recover:** restore only a verified clean backup into isolation first;
   patch the entry point; redeploy from a reviewed ref; verify migrations,
   ownership, secret loading, and monitoring.
6. **Verify:** run auth, BOLA, secret/logging, body-limit, Worker-auth, and
   regression tests; review platform access; obtain independent review for
   high-impact incidents.
7. **Notify:** involve the incident owner, providers, legal/privacy lead, and
   affected users/regulators when required. Record decisions and owners.

Scenario-specific first actions:

- **Credential leak:** revoke/rotate the exact credential, search current and
  historical logs, identify access, and invalidate dependent sessions.
- **GitHub compromise:** suspend account/token, review commits/workflows,
  protect main, invalidate deploy credentials, and redeploy a reviewed ref.
- **Firebase compromise:** restrict the account, rotate Admin keys, review
  Auth activity, and force risk-based reauthentication.
- **Cloudflare/Worker compromise:** pause/restrict the Worker, rotate the
  server-to-Worker credential, review routes/secrets/AI spend, and redeploy.
- **Database compromise:** isolate network access, revoke runtime credentials,
  preserve evidence, assess reads/changes, and restore/repair after integrity
  review.
- **User-data exposure:** stop the flow, identify users/fields, prevent more
  disclosure, preserve evidence, and follow approved privacy notification.

## Sensitive Data Classification & Minimization

| Class | Data | Handling rule |
| --- | --- | --- |
| Public | Flower display metadata, public profile name/avatar, approved social messages, Firebase web config | Client-visible only when product-approved; still validate and omit internal fields. |
| Internal | Firebase UID mapping, account IDs, model/version metadata, hashed AI input, error codes, aggregate metrics | Backend/platform access; minimize retention; never use as client authorization. |
| Private | Email, friend/request relationships, visit history, subscription state, user Fairy/check-in metadata | Authenticated responses with server-side ownership/relationship checks. |
| Highly Sensitive | Journal/emotion content, AI input/output derived from private content, ID/refresh tokens and serialized Firebase auth records, service credentials, DB URLs, private keys, raw security evidence | Approved protected systems only; no unnecessary logs/analytics/model context; explicit retention and rotation. |

Journal and emotion are Private/Highly Sensitive depending on whether raw
content or derived inference is involved. Tokens and credentials never enter
model context or this file. Firebase UID is Internal unless intentionally
exposed as a public product identifier. Backups inherit the most sensitive
class they contain.

## Advanced Security Items

These eight items are additional review items supplied with the backlog. They
do not replace or merge any P0/P1/P2 item.

1. **Hardware-key / Passkey 级管理员保护** — 🔒 BLOCKED / MANUAL ACTION
   REQUIRED: enable and test passkeys/security keys for production admins.
2. **Account recovery 安全** — 🔒 BLOCKED / MANUAL ACTION REQUIRED: review
   recovery, MFA reset, support override, identity proofing, and bypass tests.
3. **Short-lived service credentials / workload identity** — 🟡 PARTIAL:
   Worker bearer is server-only but static; evaluate short-lived signed
   requests or workload identity.
4. **Production admin access isolation** — 🔒 BLOCKED / MANUAL ACTION REQUIRED:
   separate deploy, migration, Firebase, and Cloudflare roles; prohibit shared
   accounts and require audited elevation.
5. **Database second-layer tenant isolation / PostgreSQL RLS feasibility** —
   🟡 PARTIAL: application ownership checks exist; RLS feasibility and policy
   design are not implemented or verified.
6. **Outbound egress restriction + data-exfiltration detection** — ⬜ TODO:
   define allowed API/Worker egress and alert on anomalous destination/volume.
7. **Production / backup credential isolation** — 🔒 BLOCKED / MANUAL ACTION
   REQUIRED: separate principals, storage, and recovery paths; test that app
   compromise cannot read/delete backups.
8. **真正的 independent red-team / pentest** — 🔒 BLOCKED / MANUAL ACTION
   REQUIRED: commission independent scoped testing and track high/critical
   remediation to closure.

## New Findings / Proposed Additions

Canonical backlog items remain unchanged in identity/priority. The 2026-10 delta records feature-specific findings and tested follow-ups; it does not add those findings to canonical summary counts or certify release readiness.

## Final Security P0 Closure Summary

The **2026-09-16 historical P0 closure** was repo-complete with documented limitations. This reconciliation finds no new P0 in the reviewed delta; it does not assert all current backlog rows are complete or grant release approval. New feature P1/P2 gaps and deployment checks remain below.

Provider/manual unresolved items:

- Historical `DATABASE_URL` revocation proof remains **ACTION REQUIRED / UNCERTAIN** because the old endpoint was unreachable; neither revoked nor still-valid is claimed.
- Database runtime/migration role separation and grants remain **PROVIDER-LIMITED / NOT VERIFIED**. AuditEvent Level 2 is not a repo P0 blocker.

Optional/compliance hardening:

- Clarify exact Workers AI inference retention duration.
- Define regional/data-residency requirements if PetalPal later needs them.
- Retain plan-limited provider controls as **PARTIAL / PROVIDER-LIMITED**; no plan upgrade is a P0 requirement.

Historical P0 closure is preserved; current feature readiness still depends on the unresolved delta and deployment checks.

## Final Global Security P0 Checkpoint

- Historical repository P0 checkpoint: **PASS (2026-09-16 scope)**. Existing HTTP/Daily Grow/logging/audit evidence retained. Current report-write and Socket revocation/flood code is deployed/TESTED, with remaining live runtime scopes unverified. Shared AI-cost enforcement is **PASS FOR CURRENT PRODUCTION TOPOLOGY**; canonical partial statuses and feature limitations remain.
- GitHub: **PASS**. Render: **PARTIAL / PLAN-LIMITED**. Cloudflare: **PASS**. Firebase/Google: **PASS**. Backup/restore: **PARTIAL**; backup existence and isolated restore drill PASS, while provider retention/encryption/access metadata remain incomplete.
- Workers AI data handling and DPA: **PASS**. Workers AI inference retention: **PARTIAL / EXACT INFERENCE RETENTION NOT SPECIFIED**. Data residency: **NOT VERIFIED / OPTIONAL HARDENING**.
- AuditEvent Level 2: **PROVIDER-LIMITED / NOT VERIFIED**. Historical `DATABASE_URL`: **ACTION REQUIRED / UNCERTAIN**.
- No new repo P0 identified in the reviewed delta. Historical P0 closure does not close current feature P1/P2 gaps or pending provider/deployment checks.
- Final classification: **P0 CLOSED WITH DOCUMENTED LIMITATIONS**.

## 2026-10 Feature Security Delta Review

Scope: Security closure `2a4eb0b` (2026-09-16) → `8cf1a6e69f9f96bbbee8310c947b045b210e8972` (2026-10-06 HEAD), plus restored feature work in `c60a90d`; branch `integration/mobile-backend-test`. Reviewed changed Calendar/mobile auth/navigation, report/AI/pgvector/consent/dispatch and Garden privacy/realtime boundaries only. No rendering/performance re-audit, implementation changes, migrations, local DB/container access, provider calls or deployment review. Historical P0 closure remains historical; this section is not a release approval.

**Result:** no new repo P0 found in this scope; 4 new/changed P1 and 4 new/changed P2 findings. All four P1 findings have TESTED follow-ups with explicit deployment/availability limitations; independent isolated PostgreSQL verification of the new consent lifecycle now passes for the 18 schedules in DELTA-P1-1; deployment verification remains pending. Canonical backlog rows above point here rather than duplicating findings.

| ID / priority | Finding and evidence | Exact next code/test action |
| --- | --- | --- |
| DELTA-P1-1 | **TESTED follow-up: consent-revocation derived-data lifecycle implemented.** `lib/ai-consent.js` centralizes the token-owner consent transaction. Disabling any memory prerequisite cancels PENDING/RUNNING jobs and deletes owner Weekly/Monthly/Yearly reports, evidence and EventMemory; existing FKs cascade both embedded-vector representations. Source Events/Journal/non-AI data and durable job/paid-attempt tombstones remain. Private memory get/list/search and report discovery/detail/finalized reads hold the consent SHARE lock and reject before reading when consent is inactive; API denials are generic 403. Regrant advances a monotonic consent epoch and never restores deleted rows or replays tombstoned paid work. Extraction now locks a current worker/attempt/lease claim and commits memory/embedding intent plus guarded completion atomically; existing report and embedding final fences remain. Paid speech/Event emotion require active processing consent before reservation and recheck the captured epoch before releasing their result. | **130 unique scoped tests PASS across targeted runs; 12 added cases** (10 lifecycle, 2 processing/speech). New `test/back/ai-consent-lifecycle.test.js` uses fresh PGlite SQL/cascades plus actual local HTTP with deterministic identity: legacy rows still denied, all report kinds/memory/vector/evidence cleanup, Event and second-owner preservation, repeated revoke, rollback at every cleanup stage, stale report/extraction/embedding rejection before/after regrant, fresh eligible memory and same-millisecond epoch progression. Existing Event/private-report/foundation/report-worker/fence/semantic/speech/emotion/job-lifecycle/cost regressions pass; cost suite 14/14 PASS, changed JS syntax/diff checks PASS. No schema migration/provider or existing DB/container action. **Independent isolated PostgreSQL follow-up PASS (2026-10-06):** 18 cases on a disposable PostgreSQL 16/pgvector database with tracked migration constraints/triggers and four distinct backend connections (two single-connection Prisma clients and two PostgreSQL clients). Actual consent, report persistence, extraction worker, memory/report read and legacy/profile embedding repository code ran without external inference. Both revoke-first and writer-first Weekly/Monthly finalization, extraction and both vector-storage schedules pass; stale report/extraction/embedding work cannot resurrect derived data after revoke/regrant. Independent read/revoke ordering passes: an already-authorized reader serializes before revoke, a reader waiting behind revoke is denied, and all tested private memory/report reads after commit are denied. Cleanup removes memories, both vector representations, evidence and all three report kinds while retaining source Events and the other owner; injected failures after each of five cleanup stages roll consent, job changes and deletions back. Concurrent repeated revoke, monotonic same-time regrant and fresh eligible extraction also pass. `pg_blocking_pids` confirmed real row-lock waits; no deadlock or retry occurred in these schedules, not a general deadlock-freedom or load/capacity claim. Temporary clients/container/volume/scripts removed; existing databases/containers untouched. **Not VERIFIED:** deployment/provider enforcement, runtime-role deletion privileges, broader concurrency/recovery and capacity. Phase 0 evidence remains separately scoped to the prior report fence/cost schedules. Existing client copies/backups/provider retention are not erased by an application transaction; manual retention/deployment checks and DELTA-P2-2 durable cache policy remain. Local tests are not production verification. |
| DELTA-P1-2 | **TESTED follow-up: atomic report final-write fencing implemented (2026-10-06).** `lib/report-write-fence.js` locks the consent epoch, current RUNNING claim (owner/type/period/version + worker/attempt/claim timestamp + live DB-clock lease), source Events/memories and owner period settings. Current/prior-period source snapshots and selected evidence are rechecked; report/evidence writes and guarded SUCCEEDED completion share one transaction. Final lease expiry rolls everything back. `lib/ai-events.js` takes the same owner/source locks before report discovery/deletion; worker heartbeat/failure/cancellation also carry claim generation. No schema migration, provider call or local DB/container change. | **98 unique scoped tests PASS; 33 added tests.** `test/back/report-worker.test.js` covers Weekly/Monthly revoke/regrant, deletion/revision/ineligibility/period changes, expired/reclaimed/same-ID leases, competing paused workers, rollback, retry/replay and forged owners. `test/back/report-write-fence.test.js` executes fence SQL in fresh in-memory PGlite tables and checks DB-clock expiry/atomic rollback and delete-lock ordering. AI foundation/lifecycle, async dispatch, Event/private report routes and account deletion regressions pass; changed JS syntax/diff checks pass. **Isolated real PostgreSQL follow-up PASS (2026-10-06):** disposable PostgreSQL 16/pgvector, tracked migration SQL applied only to the new test database, four distinct backend connections, actual GroundedReportPersistenceService and PrivateEventRepository deletion paths. Fourteen Weekly/Monthly cases cover both finalization/deletion orderings, consent revoke-first/finalize-first serialization, source revision while waiting, lease expiry after report/evidence writes with atomic rollback, reclaimed/competing generations, and duplicate completion rejection. Finalize→delete lock order repeated three times per report type; pg_blocking_pids confirmed real waits. No deadlock or retry occurred in these schedules; this is not general deadlock-freedom, load/capacity or production/provider verification. Synthetic retrieval/narrative inputs only; no external AI calls. Temporary clients/container/volume/scripts removed; existing DBs/containers untouched. That Phase 0 run retained reports after a later revoke; the subsequent DELTA-P1-1 cleanup/read fix now has separate independent isolated PostgreSQL evidence, not part of that earlier run. Deployed triggers/policy, broader concurrency schedules and production verification remain unverified. |
| DELTA-P1-3 | **TESTED follow-up: realtime revocation and flood fencing implemented (2026-10-06).** `lib/auth.js` retains private token context and revalidates Firebase identity/current profile for actions and delivery; no completed authorization cache. `lib/socket-security.js` rechecks Garden privacy/confirmed friendship for sender and each recipient. `server.js` wraps privacy OFF, bilateral unfriend and account deletion in pending-revocation gates and socket generations, evicting rooms/disconnecting users before and after mutation; paused/stale joins or movements cannot restore revoked access. Idle sessions recheck every 5 seconds; reconnect uses fresh authentication. JSON-only packets are capped at 8 KiB; movement schema is capped at 2 KiB with finite/bounded coordinates and token-derived actor/display identity. | **43 scoped tests PASS, including 22 new realtime cases.** `test/back/realtime-security.test.js` uses actual ephemeral HTTP/Socket.IO WebSocket and polling transports with deterministic Prisma/Firebase stubs: authorized/forged/cross-owner joins/actions, privacy/unfriend revoke and revoke→regrant paused joins, paused movement/session revocation, latest-join ordering, revoked private recipients, idle/account deletion/reconnect, malformed/oversized/binary payloads, flood/reconnect/shared-user/concurrency bounds. All 60 movement actions/events at 60 Hz pass. Movement buckets: 90/s per socket (burst 90), 180/s per user (burst 180); control per action: 5/s (burst 10), user 10/s (burst 20); total packet and inflight/connection bounds also apply. Existing auth/config/HTTP limiter/account/Garden/Socket/Flower social regressions pass; stale social transaction fixture corrected to remain DB-free. **Not VERIFIED:** live Firebase disabled/revoked/expired-token propagation and movement latency remain untested; in-flight verification is coalesced, already-sent frames cannot be recalled. Budgets/revocation generations are process-local; remote adapter snapshots fail closed, and shared-store/distributed delivery is not implemented or certified. No migrations, local DB/provider calls or capacity claim. |
| DELTA-P1-4 | **TESTED follow-up: shared AI call ceilings and durable non-replay reservations (2026-10-06).** `lib/ai-cost-gate.js` uses the existing non-cascading `AuditEvent` table, its primary key and one short PostgreSQL transaction advisory lock shared by all instances. It checks the current owner and, for job work, active memory consent/current RUNNING claim generation/live DB-clock lease; atomically checks UTC-day owner/action/global/provider allowances and commits a reservation before external work. Logical owner/action/period-or-resource/version reservations survive retry, reclaim, midnight, job deletion and account deletion; no failure refunds. Reports reserve an upper bound of two calls (one retrieval + one narrative); production narrative attempts remain one. Remote embedding, Event emotion/preview and speech each reserve one call. Existing unique job create-or-return, SKIP LOCKED/leases, report final-write fences and finalized replay remain; worker failures persist/log only safe codes/messages. | **125 scoped tests PASS; 13 added tests.** `test/back/ai-cost-gate.test.js` executes actual SQL in fresh in-memory PGlite tables: duplicate/concurrent triggers and reservations, independent gate objects sharing one ledger, per-user/action isolation, global/provider bounds, retry/reclaim/deletion/midnight, expired/forged claims, consent denial, missing owners, zero/invalid configuration, DB fail-closed, paid embedding/speech preflight and failure redaction. Worker/route regressions cover normal reports, safe pre-inference retry, finalized replay, blocked competing/ambiguous inference, atomic report rollback/final fences and Event save without paid work on quota denial; auth/Socket/dispatch/HTTP limiter tests pass. **Isolated PostgreSQL follow-up:** two independent Prisma connections race duplicate Event-emotion reservations and distinct operations against an owner/action quota of one; exactly one succeeds in each case, the other receives AI_INFERENCE_ALREADY_RESERVED or AI_QUOTA_EXCEEDED. Both PASS, no retry/provider call. This confirms only these shared reservation/quota schedules, not every cost-gate interleaving. Live providers, production/multi-instance deployment, other independent-connection lease/revoke/global/provider-limit schedules and capacity remain unverified; earlier PGlite tests still serialize transactions. Counters bound server-authorized external call attempts, not currency or provider-internal retries/direct credential use. All instances must share the same PostgreSQL primary and policy; ledger rows must not be pruned/reset to re-enable old operations. A crash/timeout or persistence failure after reservation can leave a report unavailable: automatic inference replay is deliberately blocked; safe recovery needs provider idempotency or durable results. Historical queue/period aggregate bounds and production pool/query deadlines remain separate unfinished controls; general HTTP limits remain process-local. No schema change/migration, environment file, provider plan/billing or local DB/container change. |
| DELTA-P2-1 | **Scoped deterministic grounding implemented, tested and deployed.** Supported English Event-total sentence forms must match the exact nonnegative safe-integer `eventCount` supplied to the model and cite `eventCount`; selected evidence or other aggregate citations cannot launder a contradiction. Other recognized numeric claims and unsupported structured claim fields fail closed. Number-free subjective prose retains existing citation/schema policy. | 73 targeted tests PASS; exact implementation `485b3adde8fd83bd69845e2bae1aa6a3998aab91` confirmed Live; production HTTP liveness 200. No general entailment/fact checker or universal hallucination-prevention claim. |
| DELTA-P2-2 | **PARTIAL: durable owner-cache erasure code/test and seven isolated physical-iPhone scenarios PASS.** Historical memory-only logout behavior is superseded by placement-namespace erasure on logout, confirmed account deletion, owner changes and activation/reload. Session generations fence stale writes; queued erasure follows already-started native writes. Storage failures gate cache access/auth activation and retained erasure work is retried. Safe global preferences and Firebase SDK keys are preserved. | **43 targeted tests PASS** as earlier scoped evidence; **84 targeted native-security tests PASS** as final regression evidence, with scoped TypeScript/helper syntax and diff checks PASS (finalization below). PetalPal-owned durable cache lifecycle completed: isolated physical iPhone **7/7 PASS**, including Scenario 1 persisted logout witness PASS; failure injection disarmed. Firebase JS credentials use AsyncStorage 2.2.0 files with default backup-exclusion requests; effective file-protection/backup success and release restore remain PARTIAL (credential review below). Seven isolated Expo Go physical-iPhone scenarios now PASS (evidence below); only disposable isolated C was deleted and A/B remain present. Production mobile artifact/release behavior remains NOT VERIFIED; no production/provider configuration change. |
| DELTA-P2-3 | **Production route policy implemented and tested.** AuthGate remains outermost; centralized allow-policy denies unintended direct/deep-link pathnames before route/navigator content mounts, with a generic unavailable state. Real `/garden-test` Fairy alias, `/feature/fairy`, Garden/Journal/Calendar/history, Bookhouse/Reflection and existing product feature/visit paths remain allowed. Development previews remain usable behind authentication. | 15 targeted tests PASS with production/development modes, actual root/AuthGate composition, alias/back navigation and production catalog checks. Expo/native release artifact runtime NOT VERIFIED; Render backend deployment is not evidence for this client-only fix. |
| DELTA-P2-4 | **Calendar/history wire minimization implemented and tested; production acceptance PARTIAL.** Owner-only `?view=metadata` on Garden/session uses explicit Prisma selections and response allowlists. Mobile history/placement/session adapters use the reduced contract. Raw Journal/Event text, inference intensity/confidence/evidence, messages, full check-in/Garden detail and account IDs are excluded; consumed display labels/date/navigation IDs remain. Legacy detail/social routes remain intact. Header/private-cache evidence remains PASS as previously scoped. | Exact implementation 187701de1fd810127b4b25b998af3a23bf0c8a3c confirmed Deploy succeeded / Live on Render. Manual authenticated `/session?view=metadata` shape/no-store PASS; owner Garden metadata, Calendar/history loading and navigation remain NOT VERIFIED. Global CDN, cross-account isolation and other authenticated routes remain separate. |


AI cost gate defaults (UTC-day windows, server-only): `AI_USER_DAILY_CALL_LIMIT=300`, `AI_GLOBAL_DAILY_CALL_LIMIT=10000`, `AI_PROVIDER_DAILY_CALL_LIMIT=10000`; `AI_WEEKLY_REPORT_DAILY_LIMIT=4`, `AI_MONTHLY_REPORT_DAILY_LIMIT=2`, `AI_EMBEDDING_GENERATION_DAILY_LIMIT=200`, `AI_EVENT_EMOTION_DAILY_LIMIT=100`, `AI_SPEECH_TRANSCRIPTION_DAILY_LIMIT=20`. Action limits count logical reservations; user/global/provider limits count reserved maximum external calls (reports 2, other actions 1). Nonnegative integers up to 1000000 only; zero disables that allowance and malformed configuration fails closed. Rejected reservations do not consume quota; attempted/ambiguous reservations remain charged. No input text, audio, model result, secret or provider credential is stored in this ledger.

### Reconciled history and limits of evidence

- `2a9a9fc` (2026-09-17): owner-scoped AI foundations, evidence/jobs and Worker contracts; `4235b31` / `05c065c` (2026-09-28): consent gates and worker shutdown/heartbeat/lease renewal; `a0bc4e5`: active Cloudflare embedding profile. `LONG_TERM_AI.md` → “Production Queue cutover and observation” records the 2026-09-29 authenticated opaque-job dispatch, duplicate/revoke/reconciliation and owner-scoped BGE/pgvector production smoke. It does not verify later October fences/cost gates, full report-provider grounding or long-run capacity.
- `03e719e`, `a9efcf8`, `8cf1a6e` (2026-10-06): report final-write fencing, Socket revocation/flood bounds and shared AI-cost reservations. Their separate test totals below overlap; none is a production/provider attestation. This documentation task ran no tests or provider actions.

- Calendar `calendarToday(..., false)` ignores simulated date; UI simulation is component-local/DEV-only and never sent by reflection browsing. Server `new Date()` and owner timezone derive default today/closed periods. Weekly `localDate` is an explicit historical-period selector, not server clock override; future/open periods rejected. Monthly generation is worker/service wiring, not a new public monthly trigger. UI historical browsing is GET-only.
- Reviewed semantic SQL: owner/Event/embedding joins and consent, eligibility, locale, profile/input revision and period predicates precede `ORDER BY`/`LIMIT`; constant SQL uses bound parameters. Composite schema FKs bind owner provenance. Owner memory/report reads and forged-owner trigger inputs tested. Production query plans/runtime races were not exercised in the initial review; later isolated real-PostgreSQL report/consent/cost schedules PASS as separately recorded, without certifying production races.
- Worker → model boundary uses bounded whitelisted aggregates/evidence, fixed system instructions, serialized user data and output schema/citation allowlists; no raw Journal, credential or actor-control fields in the tested model contract. Provider calls in this pass were stubs; semantic truth is not certified.
- Consent row locks and embedding consent-epoch/source revision checks, extraction rechecks, job claim/lease/idempotency and finalized replay are covered by unit/stub tests. Report delete/regrant/revision/expired-lease final writes now use atomic fencing with scoped test evidence in DELTA-P1-2; isolated independent-connection report interleavings now pass as documented in DELTA-P1-2. Event deletion cascades memory/vector/evidence/jobs in schema and deletes known affected reports; account deletion stub/rollback tests pass. That original delta review did not repeat real FK/concurrency execution; the later disposable PostgreSQL follow-up used tracked migration constraints/triggers and real report/evidence writes/deletes for the explicit schedules above.
- Token-derived Socket identity, private/social serialization and owner metadata-only report discovery pass. The original failing unfriend probe is addressed by the TESTED DELTA-P1-3 controls; 43 scoped HTTP/Socket regressions cover revocation, paused work, delivery privacy and flood bounds. No real Firebase/provider or DB-based privacy suite was run; distributed enforcement remains unverified.
- **Initial feature-delta review: 125 existing scoped tests PASS** (AI foundation/lifecycle/report worker, Event/report routes, socket/prompt boundary, async dispatch, account deletion, social serialization, Calendar/reflection/mobile auth). **5 additional synthetic probes** checked revoked read, unsupported claim, missing final-write freshness, unfriend broadcast and retrieved-text placement. No real DB/provider/production verification in that feature-delta pass; no load-capacity certification. This is separate from the September production Queue smoke and DELTA-P1-4’s later 125-test run.

Feature-release gates: repository consent-derived-data lifecycle is TESTED (DELTA-P1-1); independent isolated PostgreSQL lifecycle schedules pass as documented there; exact-code production deployment presence now passes as recorded below; runtime validation remains pending. DELTA-P1-2 report fencing, DELTA-P1-3 realtime revocation/flood controls and DELTA-P1-4 shared paid-AI call ceilings are TESTED with the explicit PostgreSQL, live-provider, distributed-enforcement and billing/availability limits above; no capacity or currency-spend certification. Existing provider/manual uncertainties remain in [MANUAL_SECURITY_CHECKLIST.md](MANUAL_SECURITY_CHECKLIST.md). The isolated report fence/deletion/revoke/reclaim follow-up now PASSes above; new consent-lifecycle independent-connection verification now passes for the explicit DELTA-P1-1 schedules; production runtime enforcement and broader race/recovery schedules remain unverified. Exact-code rollout evidence below does not certify provider or multi-instance runtime behavior.


### Production/deployment observations — 2026-10-06 (initial read-only observations superseded by rollout below)

- **Historical pre-rollout deployment observation:** authenticated Render metadata for PetalPal_v2 shows live commit `3fef15d474ebe0d56c2406dba1a9dd894a8cc2a0` (Queue reconciliation), repository branch `main`, and auto-deploy disabled for a pinned commit. It is an ancestor of the verified integration HEAD `68dfd98da5b98de06005bcba8a724b7d0156ec3a`; the recorded deployed revision lacks `lib/ai-consent.js`, `lib/ai-cost-gate.js` and `lib/socket-security.js`. At that pre-rollout observation, October DELTA-P1-1/3/4 follow-ups were not deployed; the successful exact-code rollout below supersedes this version finding. The production read-only migration gate and separately approved exact-code rollout now passed below; unsafe runtime/provider checks remain unresolved. Evidence: [Render service](https://dashboard.render.com/web/srv-d983eguq1p3s73fnk1m0), live-revision link and read-only Git object metadata.
- **Historical pre-rollout AI ledger/configuration observation (updated by shared-ledger follow-up below):** inspected service environment key names only; DATABASE_URL and existing dispatch/executor/Worker settings are present, no `AI_*_DAILY_LIMIT` / `AI_*_DAILY_CALL_LIMIT` keys are configured, and no environment groups are linked. No values, credentials or database endpoints were inspected or recorded. This does not prove valid quota policy, shared-primary identity, reservation-before-provider execution, runtime ledger privileges, tombstone retention, zero/malformed-config behavior or staging isolation. The old observed revision lacked the durable gate; the new revision presence is now established below. Local/isolated PostgreSQL tests remain distinct from deployed runtime certification.
- **Socket topology:** Render Compute shows Free, one instance, autoscaling off and scaling unavailable on that compute plan. The recorded deployed server/package have no configured shared Socket adapter or adapter dependency; distributed Socket enforcement is not present in this inspected path. The initial revision lacked new revocation/flood controls; their exact-code deployment is now established below; Firebase propagation, reconnect/privacy/unfriend/account-deletion and idle revalidation runtime checks were not exercised. No dedicated safe test account was established, and no user/session/privacy data was mutated.
- **Historical anonymous HTTP observations (superseded):** verified HTTPS GET `/` returns 200 HTML with `Cache-Control: public, max-age=0`; `/ai/reports` and `/ai/memories/security-verification-nonexistent` return 401 without Cache-Control. All three responses lack HSTS, nosniff, X-Frame-Options, CSP/frame-ancestors and Referrer-Policy. This records missing headers on these exact responses, not authenticated private-response cache/CDN behavior or a separate hosting origin. No authentication/private content or paid inference was sent or read. The observed header/anonymous-cache gaps are superseded below; DELTA-P2-4 wire minimization and authenticated/CDN checks remain open.
- **Monitoring PARTIAL / PLAN-LIMITED:** Render service settings show workspace-default failure notifications and no explicit HTTP health-check path. The Metrics page exposes network metrics and states CPU/memory application metrics require paid compute; no plan was changed. Dedicated database pool, job backlog/lease/attempt or spend thresholds were not verified. Cloudflare dashboard access requires authenticator MFA; Worker deployment/queue settings, current alerts and retention were not reverified. Prior scoped provider evidence remains historical, not refreshed.

During the initial read-only observation, no implementation, production configuration/data, grants, quotas or provider plan changed. The later approved rollout applied only the four expected migrations as recorded below. Historical DATABASE_URL uncertainty, AuditEvent Level 2, backup metadata, Workers AI exact retention/residency and consent client-copy/external-retention limitations remain unresolved. No canonical status upgraded to VERIFIED.

**Migration safety follow-up — SAFE TO DEPLOY for the migration gate (2026-10-06):** isolated upgrade evidence below was followed by an approved production Direct connection using existing pg tooling. One session set default_transaction_read_only=on and confirmed on before SELECT/SHOW verification. No migration, deployment or production write occurred. PostgreSQL 17.2; latest successful migration `202609280001_multi_profile_event_memory_embeddings`; all four target migrations pending, none failed/incomplete. Applied tracked checksums match, no unknown applied or missing prerequisite migrations, valid pending order and no target-DDL/history mismatch.

- `202609280001_daily_flower_support`: VisitRecord gains nullable flowerId/localDate/timezone; a unique (visitorId, flowerId, localDate) index and validated Flower FK (delete SET NULL/update CASCADE). Legacy rows retain NULLs, allowing duplicate legacy visits and avoiding new orphan references; no historical Support-to-flower backfill/transformation or aggregate reset. Plain CREATE UNIQUE INDEX blocks writes while building; FK validation scans/locks VisitRecord and Flower, and ALTER TABLE needs a strong lock. Production duration/traffic impact is unmeasured. If columns/index/FK were manually created or a migration partially failed, state/drift must be checked first.
- `202610010001_garden_visit_privacy`: User.allowGardenVisits is NOT NULL with constant default true, preserving legacy access. PostgreSQL 16 isolated verification confirms all existing users get true; constant-default addition avoids a data rewrite on modern PostgreSQL but still needs an ALTER TABLE lock. Verify production engine/version and lock budget.
- `202610020001_standalone_private_journals`: Journal.dailyCheckInId becomes nullable; existing links, uniqueness/indexes and FKs remain. No data rewrite/transformation; ALTER TABLE still requires locking. New standalone NULL rows prevent a simple rollback to NOT NULL without a separate data policy; do not delete/relink production Journals automatically.
- `202610020002_private_journal_cover`: nullable Journal.coverImage TEXT, no default/backfill, existing rows remain NULL. Metadata addition with ALTER TABLE locking; no rewrite of existing content. It depends on normal migration ordering, not an empty Journal table.

**Isolated upgrade PASS:** disposable PostgreSQL 16/pgvector, tracked pre-four migrations installed with the actual Prisma migrate deploy CLI, synthetic owners/Garden/Flower/duplicate legacy Support visits/check-in/Journal seeded, then all four applied by the same CLI. Existing records/content/Support counts and links preserved; defaults/nullability, valid FK/index, duplicate and orphan rejection, standalone Journal/cover writes and completed migration entries pass. Second migrate deploy has no pending work. Prisma clients generated from recorded deployed schema and current schema confirm old linked-check-in/Journal reads and nested writes coexist with new standalone Journals in the inspected flows; no broad rolling-deployment/runtime certification. No DROP/rename or destructive data transformation in these four SQL files.

**Schema comparison caveat:** both baseline and upgraded databases differ from their corresponding Prisma schemas only in the pre-existing EventMemoryEmbedding.updatedAt database default (now versus no Prisma default). No new schema drift was introduced by the four migrations; strict full-schema equivalence is not PASS. Production read-only follow-up confirms PostgreSQL 17.2 compatibility and pre-migration target schema: new columns/index/FK absent, existing Journal linkage non-null with valid unique index. Pending additions initialize NULLs or true and the linkage change relaxes a constraint; no content/duplicate/orphan scan is needed for these new fields. Touched User/VisitRecord/Flower/Journal relations are each under 107 KB. Full activity-stat visibility was available: zero transactions older than 60 seconds, zero blocked sessions and no other-session locks on these tables at observation time. Production EventMemoryEmbedding.updatedAt retains CURRENT_TIMESTAMP: the separately known default difference is unrelated/non-blocking; no new drift attributable to the four migrations. This is a point-in-time migration gate, not a guarantee against new locks or production runtime certification. Prisma records migrations independently; it provides no automatic multi-migration down/rollback. Retain backups and migrated-schema compatibility during code rollback. Both isolated containers/volumes, clients and temporary files removed; existing containers/data untouched.

**Approved production rollout PASS — 2026-10-06:** existing Render Manual Deploy → specific commit deployed exactly `68dfd98da5b98de06005bcba8a724b7d0156ec3a`, replacing `3fef15d474ebe0d56c2406dba1a9dd894a8cc2a0`. Render reports Deploy succeeded/Live and the active service's Last successfully deployed commit resolves to the exact approved SHA. Build/start completed; normal npm startup ran Prisma migrate deploy and reported all migrations successfully applied. A separate one-connection production pg postcheck set and confirmed read-only before SELECT: all four target migrations are successfully applied, latest `202610020002_private_journal_cover`, no failed/incomplete entry. Local uncommitted documentation was not part of the deployed artifact.

Exact-code/version evidence establishes deployment presence of DELTA-P1-1 consent read/cleanup/extraction safeguards, DELTA-P1-2 report final-write fencing, DELTA-P1-3 Socket revocation/flood hardening and DELTA-P1-4 durable shared AI cost gate across its report/retrieval/embedding/emotion/speech paths. No production consent revocation, user deletion, quota exhaustion, paid inference or Firebase disable/revoke test was performed. Shared-primary/policy/runtime ledger privilege and multi-instance enforcement certification remain unverified; distributed Socket enforcement remains absent.

Historical observation before HTTP hardening (superseded for headers/anonymous caching by final clean verification below): Post-rollout HTTPS GET root returned 200 HTML; anonymous /ai/reports returned 401. Root Cache-Control remains public, max-age=0; the private-route rejection lacks Cache-Control. HSTS/CSP/nosniff/frame headers remain absent on these responses. This establishes service response/public health, not authenticated feature or paid-AI behavior. No environment/grant/credential/plan change or manual production data mutation was performed; approved startup migrations are the only intentional production DB changes. Unchanged provider retention/residency/billing, historical credential uncertainty, AuditEvent Level 2, client copies/backups, live Firebase propagation and monitoring limitations remain. This records deployment presence separately from runtime/provider certification.

### Production shared AI ledger follow-up — 2026-10-06 (historical; superseded by live certification on 2026-10-07)

**Certification: PARTIAL.** Exact application revision `68dfd98` remains deployed; current Render Compute confirms one instance, autoscaling off. Production project inventory shows PetalPal_v2 and a separate legacy c-lite benchmark, but no separately listed PetalPal executor service. The backend constructs its HTTP cost gate and report/job executor workers from the same imported Prisma singleton/production DATABASE_URL, so these inspected in-process reservation paths use one configured database. This does not establish that the approved Direct inspection connection or every external executor points to that same primary. Same production PostgreSQL ledger across all execution components: **NOT VERIFIED**. Cloudflare currently requires authentication; current Queue/reconciler executor target and inference Worker deployment settings were not read. Repository production dispatcher configuration points back to the backend; that is deployment intent, not newly verified live Worker configuration. The separate benchmark's reachability/provider entitlement and any direct-credential invocation remain outside certification.

**Effective quota policy: PASS for the inspected Render service only.** Environment key-name inspection finds no owner/global/provider/action daily quota overrides and no linked environment groups; deployed gate code intentionally falls back to the existing documented defaults for all five supported actions. Absent overrides are not a configuration failure. HTTP and in-process executor use the same process environment/default policy. Policy consistency across any other executor/service remains NOT VERIFIED. Malformed policy/zero allowance, DB failure, quota denial, duplicate operation and stale claim fail-closed controls are **DEPLOYED CONTROL PRESENT**, supported by existing scoped tests and exact-version evidence; no production configuration/outage test was performed.

**Durable ledger present PASS:** one approved Direct PostgreSQL session set default_transaction_read_only=on and confirmed on before SELECT metadata/aggregates. AuditEvent is a permanent logged table with valid primary key and all required reservation columns; current AI_COST_RESERVED count is zero. This confirms storage shape, not successful runtime reservations or provider execution. No owner FK, noninternal table triggers or installed pg_cron were observed. Targeted backend/library code contains no reservation deletion/refund path. **Retention/replay protection PARTIAL:** code preserves paid-attempt tombstones, but external provider/operator pruning and direct DB deletion permissions remain unverified.

**Runtime privileges NOT VERIFIED:** the inspection identity has SELECT, INSERT, DELETE, TRUNCATE and advisory-lock-function EXECUTE permission; no lock was acquired and no write privilege was exercised. Its equivalence to the Render runtime identity was not established. These observations cannot prove runtime reservation privileges or Level 2 erase prevention; AuditEvent Level 2 remains unresolved. No credential, URL, username or fingerprint was recorded.

**Reservation-before-provider: PASS FOR DEPLOYED BACKEND EXECUTION ORDER**, for report retrieval/narrative, remote embedding worker, Event emotion/preview and speech paths. Code reserves/commits before invoking the external provider; report workers reuse the backend Prisma singleton. Cloudflare inference is separately bearer-authorized and does not itself implement the PostgreSQL gate; current remote dispatch/settings, other callers with the secret and direct provider credentials are not certified. No live paid inference, multi-instance race or outage certification is claimed. Current application topology is one inspected Render instance; true multi-instance live certification remains NOT VERIFIED and is not a requirement to describe that one-instance topology.

Only documentation changed. No production rows/configuration, grants, quotas, credentials, provider plans or deployments changed; no paid AI calls made. Temporary verification script removed. Historical credential uncertainty, provider billing/retention/residency, distributed Socket, Firebase revoke propagation, cache/headers, backups/client copies and monitoring limitations remain. Application allowances are call-attempt ceilings, not currency budgets.


### Targeted caller/runtime certification continuation — 2026-10-06 (historical; superseded by live certification on 2026-10-07)

**Shared-ledger certification: PARTIAL for current production topology.** Prior rollout, migrations, health, backend ordering/storage/policy and isolated PostgreSQL concurrency evidence were accepted without rerunning them. Current production topology remains one Render application instance with autoscaling off; multi-instance live certification is future scaling verification, not a current-topology prerequisite.

| Component | DB reservation capability | Paid-provider capability | Evidence / limit |
| --- | --- | --- | --- |
| Render backend and its in-process HTTP/job/report executor | Create/check, same imported Prisma singleton | Invoke inference Worker | Previously deployed boundary/order evidence retained |
| Cloudflare inference Worker | Neither create nor check in inspected source | Workers AI binding | Bearer-only inference endpoints; backend reservation is sufficient for normal traffic if no other production caller bypasses it; current deployed caller inventory unverified |
| Cloudflare Queue consumer | No direct DB access; delegates execution | Indirect via configured backend executor | Inspected queue handler sends opaque job IDs to authenticated backend execute route; no direct AI call |
| Cloudflare reconciliation Cron | No direct DB access; delegates discovery | No direct provider call; enqueues jobs | Inspected handler discovers at most five jobs and enqueues IDs; no reservation cleanup |
| c-lite benchmark | Neither in inspected source | Neither paid-provider client nor binding in inspected source | Separate Render Image web service; local ONNX inference; experimental and outside customer integration |
| Other active PetalPal paid callers | NOT VERIFIED | NOT VERIFIED | Live Cloudflare inventory inaccessible |

**Cloudflare runtime boundary NOT VERIFIED:** dashboard is at sign-in; existing Wrangler credential received HTTP 403 on read-only account metadata. No credential refresh/config change was attempted. Current Worker version/bindings, Queue consumer, Cron schedule and executor destination could not be verified. Source Queue/Cron use the backend reservation boundary and never directly invoke AI; this is code evidence, not live Queue gating certification. Inference bearer holders can invoke the inspected Worker without a ledger check, so normal production bypass cannot be excluded until actual callers/destinations are established. The Worker need not gain DB access to close this item. Inspected Cloudflare and benchmark files are unchanged between deployed application revision 68dfd98 and repository HEAD; this does not establish the separately deployed Worker/image revision.

**c-lite isolation evidence:** Render production project lists the benchmark as a separate deployed Image web service with a public address and Free compute. No request was sent to it. Its Environment page shows no configured environment variables, secret files or linked environment groups, including no configured production provider/DB credential. Inspected source uses local ONNX; exposes manual POST /benchmark and defaults to a startup benchmark thread, not a recurring Cron. Targeted application server/library/package inspection found no c-lite reference. It cannot bypass paid application quota in that source. The deployed image's contents/baked credentials and any external scheduler are unverified; image label alone does not prove source equivalence. Production-configured/public address is verified; actual HTTP reachability was intentionally not exercised because startup can run the benchmark.

**Shared PostgreSQL primary: NOT VERIFIED. Runtime DB identity/primary: NOT VERIFIED. Runtime least-privilege grants: PARTIAL.** Accepted single-Prisma backend evidence establishes one configured application ledger; inaccessible live external executor metadata and absent runtime-to-inspection identity/primary evidence prevent all-component certification. No DB verification was repeated and no grants were changed. Prior inspection-role privileges do not establish runtime least privilege.

**Tombstone retention: PARTIAL:** inspected Queue/Cron source contains only transport/discovery, no reservation pruning; accepted backend retention evidence remains. Active deployed external cleanup/Cron inventory remains unavailable, so replay-enabling active cleanup cannot be excluded. No new tests, provider calls, deployment/restart, production writes or provider/config/secret/grant changes occurred. Only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md were edited; recovery stash remains present.

**Next blocker:** authenticated read-only Cloudflare deployment/caller/Queue/Cron metadata and executor destination, followed by safe runtime PostgreSQL identity/primary comparison. Deployed c-lite image equivalence/credential isolation remains a narrower verification limit. Current decision remains PARTIAL, not FAIL.


### Read-only Cloudflare topology audit attempt — 2026-10-06 (historical; superseded by live certification on 2026-10-07)

**Certification remains PARTIAL.** The authorized Keychain lookup for service `PetalPal Cloudflare Readonly Audit` returned no nonempty credential (exit status 0, empty output); the exact-service fallback also returned no credential. No credential value was printed, logged or persisted. No authenticated Cloudflare inventory could be obtained. This does not establish token validity, scope or live component topology.

Live versions/bindings/callers of `petalpal-ai-dispatch-production` and `petalpal-emotion-ai`, producers/consumers of `petalpal-ai-jobs-production`, active reconciliation/cleanup triggers and other production AI callers remain NOT VERIFIED. Previously inspected source delegation to the gated Render executor, inference-only Worker design and local-ONNX c-lite isolation evidence are retained without repeating code/test/DB/Render checks. Queue gating and c-lite deployed-image isolation remain PARTIAL; same-ledger requirement and normal production gate bypass remain NOT VERIFIED; tombstone retention remains PARTIAL. Pure inference/transport Workers do not need PostgreSQL access when the Render executor reserves before provider calls; the live destination must still be established.

Next blocker: make a nonempty temporary read-only credential retrievable by the current macOS user, then obtain authenticated Worker/Queue/Cron metadata and executor destination. No external configuration, production data, provider, deployment or secret changes were made. Only the two security documents were edited; recovery stash retained.


### Authenticated Cloudflare retry — 2026-10-06 (historical; superseded by live certification on 2026-10-07)

The temporary Keychain credential is now nonempty and Cloudflare token verification succeeds with status `active`. The earlier empty-credential blocker is resolved. Account discovery (`GET /accounts`) returns HTTP 403 / error 9109; targeted local deployment metadata supplies no account ID. No account-scoped Worker/Queue/Cron inventory was reached, so this denial does not establish whether those read permissions work when the correct account ID is supplied. The non-secret PetalPal Cloudflare account ID has been requested; no permission expansion is required merely to bypass account discovery.

Certification remains PARTIAL. Active production AI caller/binding inventory, Queue producers/consumers, reconciliation/cleanup triggers and executor destination remain NOT VERIFIED. Prior source-only Queue gating and c-lite isolation are retained as PARTIAL; same-ledger requirement/normal production bypass remain NOT VERIFIED and tombstone retention remains PARTIAL. No repo analysis, tests, deployment/Render/DB checks or paid AI calls were repeated. No token value was printed or persisted; no production configuration/data changed. Only these security documents were updated.

Next blocker: supply the non-secret Cloudflare account ID, then retry account-scoped read-only topology endpoints with the existing active token.


### Account-scoped Cloudflare retry — 2026-10-06 (historical; superseded by live certification on 2026-10-07)

The supplied account ID resolves the account-discovery prerequisite. Using the nonempty temporary Keychain credential, account-scoped Worker inventory and Queue inventory both return HTTP 401. Direct settings reads for `petalpal-ai-dispatch-production` and `petalpal-emotion-ai` also return HTTP 401 / Cloudflare error 10000. Token verification concurrently succeeds with status `active`: token validity is established, but authorization to the supplied account's topology metadata is not. No token value was printed or persisted, and permissions/configuration were not changed.

**Shared-ledger certification remains PARTIAL.** No live Worker/Queue topology metadata was returned; production callers/bindings, Queue consumers/producers, Cron/cleanup inventory and executor destination remain NOT VERIFIED. Prior source evidence is unchanged: Render backend/executor reserves; inference Worker invokes Workers AI; source Queue delegates to backend. Queue gating, c-lite deployed-image isolation and tombstone retention remain PARTIAL; normal production bypass and same-ledger requirement remain NOT VERIFIED. No repo analysis, tests, deployment checks, Render/DB checks or paid inference were repeated. Only the two security documents were updated.

**Next blocker:** an existing read-only credential authorized to read Worker/Queue/Cron metadata for the supplied account, or correction of the account/credential pairing. The agent made no token-permission or production configuration changes. The earlier missing account ID and empty credential blockers are resolved.


### Live Cloudflare shared-ledger certification — 2026-10-07

**Decision: PASS FOR CURRENT PRODUCTION TOPOLOGY.** This supersedes the earlier Cloudflare-access/topology PARTIAL decisions. Read-only authenticated account-scoped metadata and live deployed Worker source are now accessible. Accepted backend rollout, reservation-before-provider, policy, durable ledger and single-instance evidence were not repeated. No paid inference, tests, Render/DB checks or production changes occurred.

| Live component | PostgreSQL reservation capability | Paid-provider capability | Production boundary |
| --- | --- | --- | --- |
| Render backend / in-process job executor | Create/check via accepted shared Prisma ledger | Invokes inference Worker | Sole reservation-capable production executor |
| petalpal-emotion-ai | Neither; no DB/Hyperdrive binding | Workers AI binding present | Fetch-only; live source denies inference unless server bearer matches configured RENDER_SHARED_SECRET; no Cron/Queue |
| petalpal-ai-dispatch-production | Neither directly | No active AI binding; no inference shared secret | Queue and Cron delegate to the existing gated Render backend |
| petalpal-ai-jobs-production | Neither | Neither | Sole listed producer and consumer are production dispatcher |
| petalpal-ai-dispatch-staging / staging Queue | Neither directly | No AI binding | Separate staging Queue; no active Cron; outside normal production flow |
| c-lite benchmark | Neither in accepted inspected source | No Cloudflare Worker/provider binding in this account inventory | Separate local-ONNX benchmark, outside normal customer integration; accepted startup/manual behavior retained |

**Live topology PASS:** the account Worker inventory contains exactly the production dispatcher, staging dispatcher and inference Worker. Queue inventory is complete (two queues, one page): production Queue producer/consumer both use petalpal-ai-dispatch-production; consumer batch size 1, concurrency 1, three retries. Staging Queue uses only staging dispatcher. Production reconciliation has one active */20 * * * * Cron; inference and staging Workers have no Cron schedules. No additional Cloudflare Worker AI caller or c-lite Worker is listed.

**Queue/executor gating PASS:** production dispatcher binds only its dispatch/executor secrets, executor URL and production Queue. Its live configured HTTPS executor exactly matches the previously inspected production Render deployment target (comparison only; no URL recorded). Live Queue source sends opaque job IDs to authenticated /internal/ai-jobs/{jobId}/execute; Cron only discovers /internal/ai-jobs/dispatchable and enqueues IDs. Neither Queue nor Cron directly invokes AI or accesses PostgreSQL. Although the dispatcher bundle retains inference code, missing AI and inference bearer-secret bindings make that code unavailable as a production paid-provider path.

**Normal customer bypass: NO in the inspected current topology. Same-ledger requirement: PASS.** Accepted normal backend paths reserve before invoking the inference Worker, and all live Queue work returns to that same gated backend/in-process executor. Only that backend creates/checks reservations; pure inference/transport Workers do not need DB access. The inference Worker requires its server-only bearer before provider invocation. Direct invocation by a bearer/provider-credential holder remains a credential-access boundary outside normal customer flow; this certification does not claim a cryptographic reservation proof at the inference endpoint.

**c-lite production isolation PASS for normal customer flow:** accepted separate Render/local-ONNX benchmark evidence plus complete Cloudflare inventory shows no c-lite Worker, provider binding, Queue or Cron integration. Accepted startup/manual benchmark triggering is not a customer production paid-AI path. Deployed benchmark image equivalence/baked credentials and external manual/operator scheduling remain unverified; no benchmark was invoked or re-inspected.

**Tombstone retention PASS for active inspected application/Cloudflare cleanup paths:** the only active Cloudflare Cron performs job discovery/enqueue, with no reservation/tombstone deletion. Queue execution uses backend gating; accepted backend no-pruning evidence remains. This does not certify operator deletion prevention, external retention policies or least-privilege grants.

**Limits retained:** exact Render-runtime-to-inspection DB identity/primary equivalence remains NOT VERIFIED; runtime least-privilege grants remain PARTIAL. Same-ledger PASS concerns the sole reservation-capable production execution boundary, not a new SQL identity/grant check. Accepted current topology is one Render instance/autoscaling off. Multi-instance live certification remains NOT VERIFIED and N/A for current topology; verify before scaling. Broader security/provider issues retain their existing statuses.

Only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md changed. No token value was printed/persisted; no provider/configuration/secret/grant/deployment/production-data changes. Recovery stash retained. Next blocker for this topology certification: none; future scaling and independent runtime identity/grant verification remain separate follow-ups.


### Initial HTTP header/private cache hardening — 2026-10-07 (historical; superseded)

**Historical initial observation: implementation PASS; HTTP acceptance FAIL (superseded by the later marker diagnosis and final clean verification below).** Implementation commit `afa26ab20c9b775f1e0c7dd3e491ac952edf7f31` contains only server middleware/Socket.IO header integration, reusable lib/http-security.js and three targeted test files. Branch remains integration/mobile-backend-test; normal push completed. No schema/migrations, auth/CORS semantics, response payloads, provider settings, credentials or grants changed. Existing recovery stash/unrelated untracked files preserved.

**Policy:** nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin centrally; production CSP uses frame-ancestors none, object-src none, same-origin bundled scripts/assets/API, exact Firebase Auth API/iframe and Google API script origins, explicit same-host wss for Socket.IO. No wildcard or unsafe-eval; production bundle scan found no eval/new Function use. React inline styles require style-src unsafe-inline; scripts do not allow unsafe-inline. Local imagery/data/blob and the specific Google avatar origin are allowed; fonts remain local. Current Docker frontend build supplies only the Firebase API-key argument, with inspected default project/auth domain and same-origin API/socket fallbacks. CSP/HSTS are not enforced in dev. Production HSTS max-age=15552000 requires a secure socket/request or Render's HTTPS ingress signal with RENDER=true; Express trust-proxy is not broadened. No includeSubDomains/preload for this shared hosting domain.

**Private caching:** no-store applied before origin rejection, JSON parsing, authentication and rate limits for API/private namespaces, including dotted/case-insensitive IDs, session, owner Garden/Journal, consent/subscription, memories/report discovery/detail, speech, service job paths and the auth callback. Public root/static assets retain normal public caching. Socket.IO transport receives the same security policies plus no-store without changing auth/CORS/transport controls. Calendar/history still receives owner-authorized Garden/Journal content needed by legacy flows; wire minimization remains open and is not claimed fixed.

**Targeted verification PASS:** 18 tests across http-security, ai-event.route, daily-grow.route, cors-preflight and security-config suites; the six middleware/transport tests rerun after host/classification refinements pass. Actual authenticated fixture responses (including session/private memory/report) assert no-store; anonymous 401, CORS 403, allowed preflight, public/static caching, production/dev HSTS, Firebase/WebSocket CSP and Socket.IO polling are covered. Syntax checks for server/helper/new test and git diff --check pass. No broad/mobile/Fairy or production DB tests run.

**Deployment evidence:** normal Render Manual Deploy → specific commit selected exactly `afa26ab20c9b775f1e0c7dd3e491ac952edf7f31`; deployment reports Deploy succeeded|Live (5m17s), and service Last successfully deployed commit resolves to that exact SHA. Auto-deploy remains disabled; configured root Dockerfile/build context match the inspected entry point. The task introduces/requires no migration; normal npm startup retains the existing migrate-deploy command. No production DB verification or user-data mutation was performed.

**Historical HTTP acceptance FAIL (superseded):** after the initial rollout, safe anonymous HTTPS GET root returns 200/public max-age=0; /ai/reports returns 401 without Cache-Control; /favicon.svg returns 200/public max-age=0. All omit HSTS, CSP, nosniff, frame protection and Referrer-Policy. A second cache-busted/no-cache request set and an independent curl root check reproduce the omissions; sampled CF cache status is DYNAMIC (not proof of general CDN policy). Responses include the existing X-Request-ID but not the new controls. Initial rollout requests timed out; subsequent requests succeeded with the above failures. No safe existing authenticated production session was available; authenticated runtime no-store is NOT VERIFIED, and no session/user state was created. Exact deployed revision is established by Render metadata; HTTP serving behavior is inconsistent with the locally tested committed middleware and was not certified as repaired at that observation; later marker and clean-revision verification PASS.

**Historical blocker, now resolved:** the initial runtime/header discrepancy is superseded by the marker and clean-revision production PASS evidence below. No repeat deployment/restart, environment/configuration change or speculative implementation patch was made after the failed acceptance checks. CDN/cross-user leakage, authenticated runtime caching, wire minimization, Firebase revoke propagation, distributed Socket, provider retention/residency, backups/client copies, runtime DB least privilege, monitoring/alerts and advanced hardening remain scoped open items. Existing shared-ledger topology certification is retained.


### HTTP middleware marker diagnosis — 2026-10-07 (historical; temporary marker removed in clean deployment)

**Production security headers PASS; anonymous private no-store PASS.** Diagnostic commit `688a5f2110f19be57526a09d9609cfe3996caac1` adds only static X-PetalPal-HTTP-Security: v1 at entry to the existing middleware and two response-marker assertions. Security policy, CSP, auth and cache logic are unchanged. Six targeted HTTP-security tests PASS; diff --check PASS. Normal push and Render specific-commit deployment completed; the exact revision is Deploy succeeded|Live (2m50s).

Fresh cache-busted/no-cache anonymous HTTPS GET / returns 200 and GET /ai/reports returns 401. Both contain marker v1, HSTS max-age=15552000, CSP including frame-ancestors none, nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin and an application request ID. Root retains public, max-age=0; private 401 returns Cache-Control: no-store. These observations supersede the earlier HTTP acceptance failure for the current serving revision.

**Case D: prior live observation was stale/old-deployment evidence relative to the now-serving controls.** The marker proves current middleware execution. The specific earlier mechanism (old artifact/runtime versus cached/stale response) remains unproven; no policy correction or downstream configuration change was needed. No further implementation change followed the result, and no diagnostic endpoint was added.

Historical marker-diagnosis limitation (superseded for `/session` by the manual evidence below): authenticated private-route runtime caching was NOT VERIFIED; no authenticated user data or safe session was used at that time. CDN/cross-user leakage and Calendar/history wire minimization remain separate open items, as do existing unrelated security limitations. No paid inference, production data/configuration/grant changes or new migration requirement. Recovery stash and unrelated files preserved. Only these two docs were updated after the marker diagnosis PASS; that diagnosis task created no docs commit. Final cleanup/documentation is recorded below.


### Final clean production HTTP security verification — 2026-10-07

**PASS for security headers, anonymous private no-store and intentional public/static caching.** Cleanup commit `219b7ef09ab74c3f781b013f307ee8f2f62f6632` removes only X-PetalPal-HTTP-Security: v1 and its two test assertions; HSTS/CSP/nosniff/frame/referrer and cache policy are unchanged. Six targeted HTTP-security/cache tests PASS without the marker; diff --check PASS. Branch remains integration/mobile-backend-test; normal cleanup push completed. Render Manual Deploy → specific commit reports this exact SHA Deploy succeeded|Live (2m35s).

Fresh cache-busted HTTPS requests with Cache-Control: no-cache observe: root / = 200, /favicon.svg = 200, anonymous /ai/reports = 401. All three retain HSTS max-age=15552000, CSP including frame-ancestors none, X-Content-Type-Options nosniff, X-Frame-Options DENY and Referrer-Policy strict-origin-when-cross-origin. Diagnostic marker is absent on all three. Private AI 401 returns Cache-Control: no-store; root/favicon retain public, max-age=0. The temporary marker diagnosis is complete and the clean production implementation passes. Earlier FAIL observations were stale/earlier-deployment observations and are superseded; the specific earlier staleness mechanism is not claimed proven.

**Historical limits at this clean-header verification (superseded for /session by later manual evidence):** authenticated owner-private no-store was then NOT VERIFIED because no existing safe test session was available; no production user/session state was created or private data accessed. Accepted authenticated fixture regressions remain valid. CDN/cross-user leakage is not certified from these request samples. DELTA-P2-4 Calendar/history wire-data minimization remains open; no payload/API redesign occurred. Runtime DB least privilege, future multi-instance verification and unrelated Firebase/Socket/provider/backup/monitoring limitations remain separate.

No paid AI, production-data or provider/configuration/grant changes; no schema/migration changes or new migration requirement. Recovery stash and unrelated files preserved. Final documentation reconciles the prior uncommitted marker-PASS evidence and clean deployment; only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md belong in the documentation commit.


### Authenticated private-cache runtime follow-up — 2026-10-07 (historical; /session blocker superseded by manual evidence)

**BLOCKED — MANUAL SESSION REQUIRED.** No existing safe authenticated production test session was available: no open application browser session, no local .env.auth-e2e.local test credential file and no configured auth-test credential/token/session in the process or inspected local .env key names. No credential values were printed. The existing central private no-store implementation and prior scoped production anonymous/header PASS evidence are retained; anonymous 401 was not reused as authenticated evidence and already completed verification was not repeated.

Authenticated routes checked: none. Authenticated Cache-Control no-store, repeated-request cache behavior, CDN/proxy HIT status, CF-Cache-Status, Age/reuse and cross-account runtime isolation remain NOT VERIFIED. No second safe test account/session was available. Global CDN behavior is not certified; missing session evidence is not an observed caching defect or proof that provider configuration must change.

No authenticated production request, private response body read, account creation, user/session mutation, paid AI, implementation/test change, deployment or provider configuration change occurred. No tests run. Only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md updated; diff --check performed, no staging/commit/push. Recovery stash retained. DELTA-P2-4 Calendar/history wire-data minimization remains separate.

Next blocker: provide an existing safe test account/session through the normal authenticated test workflow, with credentials handled in-process rather than pasted into chat. Then perform two header-only requests to a read-only owner-private GET route (prefer consent/settings or report discovery; avoid /session's existing upsert), and optionally test a second existing safe account. No new production account/state is authorized by this follow-up.


### Manual authenticated production cache evidence — 2026-10-07

**Authenticated private-route no-store PASS; repeated-request cache behavior PASS for GET /session only.** Evidence is the user's completed manual production observation, recorded without repeating tests or repo analysis: two fresh authenticated GET /session requests returned HTTP 200, each with Cache-Control: no-store and CF-Cache-Status: DYNAMIC. Neither had an Age header; CF-Ray values were distinct, and production security headers remained present. No tokens, cookies, IDs or private response bodies are recorded.

**CDN/shared-cache HIT observed: no. Age reuse: none observed.** These are scoped observations from two requests, not proof of global CDN policy or origin execution on every request. Distinct CF-Ray values identify separate edge requests; they do not prove cross-account isolation. Cross-account cache isolation remains NOT VERIFIED. /ai/reports authenticated cache behavior and other routes were not supplied as evidence. Earlier manual-session blockers and /session runtime NOT VERIFIED statements are superseded for this route by this evidence.

**Historical pre-minimization note (superseded by DELTA-P2-4 implementation/session evidence below):** Global CDN/provider rule coverage and cross-account behavior remain separate limitations. DELTA-P2-4 Calendar/history wire-data minimization remained open at this earlier step; no payload/API or implementation change had yet occurred. Only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md updated, no test/production request repeated and no staging/commit/push.

### DELTA-P2-4 owner metadata minimization — 2026-10-07

Implementation `187701de1fd810127b4b25b998af3a23bf0c8a3c`: owner Garden placements/history request `/users/:userId/garden?view=metadata`; mobile session hydration and flower-session identity request `/session?view=metadata`. Verified-token ownership is enforced; forged owner/extra parameters are rejected. Explicit Prisma projections and serializer allowlists exclude raw Journal/Event text, AI evidence/intensity/confidence, messages, generation seeds, full check-in/Garden relations and account IDs. History retains consumed flower display fields/secondary label strings, dates and navigation IDs; session retains profile/onboarding/check-in identity and status. Metadata reads do not create Garden/Fairy state. Existing full-detail and social responses remain intact.

Targeted regressions PASS: 20 test executions covering metadata exclusion/authorization/no-store, Garden serialization, saved report discovery, affected Daily Grow/legacy session/Garden behavior, calendar dates and mobile adapters/session callers. Changed JavaScript/TypeScript syntax and diff checks PASS. Central private-cache middleware remains in use; public/static cache policy unchanged.

Exact implementation `187701de1fd810127b4b25b998af3a23bf0c8a3c` confirmed Deploy succeeded / Live on Render; deployment presence PASS. Manual authenticated `/session?view=metadata` production shape/no-store PASS is recorded below. Owner Garden metadata shape/cache acceptance and Calendar/history screen/navigation runtime remain NOT VERIFIED on the Expo/mobile consumer. Existing user-supplied authenticated legacy `/session` cache evidence remains PASS for those two observations only. Global CDN rules, other authenticated routes and cross-account isolation remain NOT VERIFIED. Previous DELTA-P2-4 open-wire statements are superseded for these implemented mobile metadata paths; no claim covers every private endpoint or other clients. No DB/schema/migration change, paid AI, production user mutation or provider configuration change. Recovery stash retained.

### Manual production session metadata evidence — 2026-10-07

User-reported authenticated `GET /session?view=metadata`: HTTP 200, `Cache-Control: no-store` PASS, required session metadata present. Raw Journal text, AI inference/evidence and private messages absent; no unnecessary internal/account IDs observed. `CF-Cache-Status: DYNAMIC` observed for this response only. Production metadata-shape verification PASS for this session metadata route; its earlier runtime NOT VERIFIED status is superseded by this evidence. No response values, credentials or private content recorded; no requests or tests repeated.

Owner Garden `GET /users/:userId/garden?view=metadata` production shape/cache acceptance, Calendar/history screen loading and intended-item navigation remain NOT VERIFIED. Overall DELTA-P2-4 production acceptance remains PARTIAL. Global CDN behavior, cross-account cache isolation and unrelated routes remain unverified. No production data modified; no implementation/configuration change. Documentation only; not staged, committed or pushed.

### DELTA-P2-1 deterministic report grounding — 2026-10-07

Implementation `485b3adde8fd83bd69845e2bae1aa6a3998aab91` adds post-model checks at the existing parsed-output validation boundary in `lib/report-narrative.js`. The accepted numeric grammar is a complete Event-total sentence: “You recorded N Events”, “The period/week/month included N Events” (week/month must match report type), or “There were N Events”, optionally ending with “during this period”/“in this period” and a period. Singular Event is accepted too. N must be canonical ASCII nonnegative integer syntax, a safe integer equal to the snapshotted server aggregate `eventCount`, and supported by that exact aggregate citation. The input total itself requires a numeric nonnegative safe integer; numeric strings, NaN, infinity, objects and negative/unsafe values are rejected without coercion. No independent DB/evidence lookup is added; existing owner checks remain.

Outside that grammar, Unicode numeric characters and an explicit finite English number-word/token list trigger rejection. Other numeric totals/topic counts/date statements in those recognized forms are unsupported and rejected rather than guessed. Extra output/section fields are rejected. This is a bounded language policy, not fuzzy semantic fact checking; it can reject legitimate numeric prose outside the grammar. Number-free prose and unrecognized quantifier/paraphrase forms retain the existing citation policy and are not semantically certified. Other topic/trend/enum/date facts are not generally validated. No universal hallucination prevention or subjective/open-ended truth certification is claimed.

Grounding failure returns static `REPORT_NARRATIVE_GROUNDING_FAILED`, null narrative, empty sections/cited provenance, and ends the narrative attempt without another provider call even if retry attempts were configured. The worker safe-code allowlist recognizes this code and its existing FAILED-result branch prevents successful report/evidence persistence. Existing job claim/lease/final-write fencing, reservation-before-provider boundary and non-replay cost controls are unchanged; no new automatic inference loop is introduced. No raw model output or private evidence is added to errors/logs.

Targeted tests PASS: 73 across prompt-injection.security, report-worker, report-write-fence, and filtered grounded/narrative report cases in ai-foundation. Coverage includes contradictory/matching totals, unsupported numeric/structured claims, wrong/multiple citations, malicious evidence, subjective prose, zero/one/safe-integer boundaries, type confusion, owner isolation/no DB lookup, immutable expected total, valid reports and Weekly/Monthly rejection before report/evidence persistence. Changed JavaScript syntax and diff checks PASS.

Exact implementation confirmed Render Deploy succeeded / Live. Fresh anonymous GET / returned HTTP 200 for HTTP liveness; no DB health or live-model semantic test is claimed. No paid AI/provider call, production data mutation, schema/migration or provider configuration change. No new manual/provider verification requirement is introduced. Recorded manual `/session?view=metadata` PASS evidence is preserved; owner Garden/Expo Calendar/history acceptance remains separate and unverified. Recovery stash and unrelated files/refs retained.

### Parsed HTTP request-object hardening — 2026-10-07

No untrusted deep merge or whole-request-body spread into trusted/Prisma state was found in the inspected HTTP paths; this is defensive hardening, not a demonstrated exploit. `lib/http-errors.js` extends the existing iterative JSON complexity traversal with exact, case-sensitive own-key rejection for `__proto__`, `prototype` and `constructor`. Nested objects and objects within arrays are covered without stringify/reparse or prototype mutation. Null-prototype objects remain supported; ordinary string values containing these words are allowed. Existing depth 20, object-key 1000 and per-array 1000 limits remain; complexity failure stays 413 and unsafe keys return a static 400 without request contents. Parsed bodies on all methods are scanned before downstream route logic; root object requirements/defaults retain the existing POST/PUT/PATCH behavior.

The standard 32kb JSON parser boundary and early authenticated speech (12mb) / owner Journal-photo (700kb) parsers use this guard. Explicit top-level field allowlists apply only to profile (`preferredLocale`), private Journal creation (`content`), Journal photo (`coverImage`), Garden privacy (`allowGardenVisits`), AI consent (`aiProcessing`, `personalization`, `memoryEnabled`) and speech (`audio`, `mimeType`). Nested security-sensitive values keep existing scalar/audio/boolean validation. Unknown ownership, privilege, subscription, job/lease, provenance and audit fields are rejected on these strict bodies before mutation. Owner-only checks precede the strict body check; cross-owner 403 behavior remains. Other legacy routes retain server-selected fields and existing authorization; no global unknown-field policy or API redesign is claimed.

Query/parameter objects in inspected flows are used as selected scalar values, not merged into trusted objects. No equivalent object-key sink was identified, so no new query/parameter rejection was added. Regression probes confirm a query key named constructor cannot affect profile update data, and a constructor path value cannot bypass owner authorization. This does not certify all future query parsers, third-party merges, Socket/model objects or libraries.

25 targeted tests PASS across request-object-security, security-baseline, security-p0-http-coverage, security-p0-matrix, security-p0-social-account, profile.route, private-journals, speech-transcription and ai-consent-lifecycle. Malicious raw JSON fixtures cover top-level/nested/array dangerous keys, global Object.prototype descriptor invariance, unknown/server-controlled fields, valid writes, depth/key/array/byte limits and null-prototype processing. Existing matrix/Journal tests now require rejection of forged extras followed by successful valid writes; consent transaction fixture includes its current owner lock. Changed JavaScript syntax and diff checks PASS. No provider/manual action is introduced; MANUAL_SECURITY_CHECKLIST.md unchanged. Existing metadata/runtime evidence, recovery stash, unrelated files and refs preserved. No production malicious request, data mutation, paid AI or configuration change.

### DELTA-P2-3 Expo production route policy — 2026-10-07

Route inventory from actual consumers: `/garden-test` is a legitimate production Fairy/Garden alias (`/feature/fairy` imports the same screen; native tabs also use it). Its existing Density Sandbox / Production Growth QA controls remain DEV-only. `/treehouse-test`, `/swing-test`, `/moon-bed-test`, `/water-test`, `/waterfall-test`, `/tea-set-test` are standalone development preview/debug screens; `/dev/backend-qa` is development QA. `/explore` is the Expo starter/demo surface formerly registered in native tabs, now development-only. No obsolete deletion or unclear route classification is claimed. Catalog profile/settings previews and coming-soon product panels are intentional user-facing surfaces, distinct from developer fixtures, and retain their catalog routes.

`mobile/src/services/routePolicy.ts` explicitly allows `/`, `/journal`, `/garden-history`, `/bookhouse`, `/mailbox`, `/reflection`, `/garden-test`, curated product feature routes and single-segment `/visit/:ownerId` paths in production. Unlisted paths fail closed. `ProductionRouteGate` is inside AuthGate at the root layout and renders only a generic unavailable state for denied pathnames; routed children/providers/navigators do not mount. No redirect loop or alternate auth path is added. This enforcement uses the active pathname, including initial direct/deep-link entry, rather than button visibility. Development leaves routes available behind existing authentication. Preview Stack registrations and the starter Explore tab are additionally DEV-only; route files may remain in bundles/manifests, so this is reachability/render policy rather than physical bundle exclusion.

15 targeted tests PASS: routePolicy (14) and the existing filtered Friends/sidebar/deep-link/Return-to-Garden integration case (1). Root-layout/AuthGate component execution is tested with `__DEV__` false/true, all inventoried preview pathnames, unknown/nested paths, unauthenticated entry, real production routes, actual Fairy alias wiring (visual modules stubbed), Back to Garden, and production catalog/tab absence of developer fixtures. Changed TypeScript syntax and diff checks PASS. These are deterministic component/route-policy tests, not browser/native deep-link end-to-end or store-release evidence.

No established deployed Expo production artifact was found in the current task context. Client deployment/runtime/export/native-store verification remains NOT VERIFIED; backend deployment is NOT APPLICABLE to this fix. No new mobile release, backend change, paid AI, production data mutation, environment/provider configuration change or new provider/manual workflow. MANUAL_SECURITY_CHECKLIST.md unchanged. Existing metadata/runtime evidence, unrelated files/refs and recovery stash preserved.


### DELTA-P2-2 durable owner-cache lifecycle — 2026-10-07

**Implementation/local test PASS; platform acceptance PARTIAL.** Continued the existing Phase 1 working-tree edits after the already committed Phase 0 reconciliation. `plantingPersistence.ts` removes only the legacy placement key and its owner-prefixed namespace, including orphaned keys discovered after restart. Every activation starts with an empty private cache. Logout invalidates auth/API/cache generations immediately and awaits queued physical erasure; confirmed account deletion uses the same cleanup. Failed remote deletion leaves the current account/cache intact. Old deletion controls cannot target a new account. A→B and A→B→A transitions reject old-generation saves, updates, removals and resets; an already-started native write completes before queued erasure. Planting callbacks capture their cache generation before asynchronous work.

**Targeted evidence: 43 tests PASS** (28 auth/session including deletion lifecycle, 12 browser/native persistence cases, 3 selected provider owner/delete cases). Coverage includes durable logout/terminal-401 erase, successful/failed deletion, account isolation, stale provider deletion, delayed native setItem, fresh-module reload absence, orphan/legacy cache removal, preserved theme/background/mask preferences and synthetic Firebase SDK keys, and read/write/erase/key-enumeration failures. Errors contain no adapter payload; failed storage has no in-memory fallback and retries retained owner cleanup before activation. Extracted hook helper removes the auth suite's accidental import of the broader flower test suite; auth fixtures now use the existing metadata session endpoint. Changed-scope TypeScript typecheck: zero errors; changed test/helper syntax and git diff --check PASS. No broad Garden/Fairy/render/backend tests run.

Firebase internal persistence is untouched by application cleanup (normal Firebase signOut remains the SDK lifecycle operation). These adapter tests do not certify native secure credential storage, OS backups, multi-tab coordination or a deployed Expo/native artifact. Physical deletion cannot be guaranteed while the storage adapter fails; the app closes access and retries rather than claiming successful erase. No production/provider access, migration, environment change, deployment or Expo production release. MANUAL_SECURITY_CHECKLIST.md unchanged; canonical statuses and P0/P1/P2 counts unchanged. Prior evidence/history retained; earlier missing-erasure claims are superseded only for this implemented/tested placement-cache lifecycle.

### Physical-iPhone ordinary login — 2026-10-07

**User-observed runtime login PASS:** the user successfully signed into PetalPal on a physical iPhone using Expo Go/Metro port 8107 and the Render HTTPS backend. A minimal read-only follow-up confirmed the running Expo process uses `https://petalpal-v2.onrender.com` and its existing log contains an iOS bundle completion. The current AuthProvider completes backend session validation and metadata-session hydration before entering signed-in state; successful login is consistent with that flow, but individual authenticated HTTP responses/headers were not independently captured in this follow-up.

This is ordinary-login evidence for the local Expo Go development runtime, not a deployed native release certification. DELTA-P2-2 logout/account-delete/account-switch/late-write/reload/storage-failure runtime tests remain NOT VERIFIED; the existing 43 targeted test results are unchanged. Native credential storage/OS backup limitations and other lifecycle/cache scopes remain open. Login already occurred against production and may have performed normal account-related writes; zero production writes are not claimed. This follow-up initiated no login, account deletion, authenticated API request, restart or implementation change. Canonical statuses/counts and MANUAL_SECURITY_CHECKLIST.md remain unchanged; previous evidence/history retained.

### Native persistence test-environment preparation — 2026-10-07

**Isolated database preparation PASS; native runtime acceptance remains BLOCKED.** A dedicated empty `petalpal_native_security_test` database was created on the existing development PostgreSQL port 5433. Only tracked migrations were applied from a temporary copy, excluding empty duplicate checkout folders without changing them. An explicit READ ONLY postcheck confirmed the intended database/primary and zero User rows. No existing database was reset or migrated. Owner-only (0600), Git-ignored `.env.native-security.local` prepares a separate development backend on 3108 and a planned non-production Firebase project; that backend has not been started and Firebase provisioning/identity isolation is not yet verified. No production/provider credentials were copied into this configuration.

A dedicated test Firebase environment and approved protected HTTPS transport are still required before preparing synthetic identities A/B/C or a separate native Expo runtime. No cloud project, tunnel, externally accessible endpoint or test account was activated; account C deletion will require separate explicit approval. Working production-connected Expo 8107, other Metro instances, backend 3107, existing containers, Firebase internal storage and recovery stash remain untouched. None of the seven native scenarios ran; prior 43 targeted tests, user-observed iPhone login evidence and canonical statuses/counts remain unchanged. MANUAL_SECURITY_CHECKLIST.md retains its existing platform limitations.

### Isolated Firebase provisioning handoff — 2026-10-07

The user reports creating `petalpal-native-security-test` on Spark (free) with Email/Password enabled. This is user-reported setup evidence, not independently verified provider/runtime isolation. The automation browser's exact project page reports that the project does not exist or the signed-in account lacks permission to list its apps. Test app configuration and isolated Admin credentials are therefore unavailable; backend/mobile activation and HTTPS exposure remain blocked. Synthetic A/B/C credentials are prepared only in an owner-only Git-ignored local file; no Firebase users have been created and C deletion is not authorized. No production Firebase, database, Expo configuration or existing process was changed. Native persistence tests and canonical counts/statuses remain unchanged; the approved tunnel has not been activated.

### Isolated Firebase app registration — 2026-10-07

The isolated project's Firebase Console became accessible and a Web/JS app named PetalPal Native Security Expo was registered without Hosting. Its displayed SDK configuration was saved directly to Git-ignored `mobile/.env.native-security.local` with 0600 permissions; all four required fields are present and projectId matches `petalpal-native-security-test`. This verifies configuration selection, not native authentication or persistence acceptance. Production Expo 8107 and mobile `.env` were not changed.

Subsequent Console navigation lost access and now reports a terms-of-service acceptance-status loading error. Isolated Admin credentials and A/B/C account provisioning remain blocked; no Firebase users or tunnel were activated. Dedicated test-database evidence and all earlier records are retained. Seven native persistence scenarios, canonical statuses/counts and manual platform limitations remain unchanged.


### DELTA-P2-2 isolated native readiness preparation — 2026-10-07

**Environment PARTIAL; runtime acceptance still BLOCKED / NOT VERIFIED.** The explicit owner-only/Git-ignored test configuration now opts into fail-closed backend startup checks at DB/Admin boundaries. Startup rejects production or ambiguous Firebase/credential/DB targets, missing required settings, ambient provider fallback and paid-AI enablement. An allowlisted isolated launcher performs DB/Admin/client-app checks, discovers separate free ports and binds the test backend to loopback before any limited HTTPS exposure. Client guards require test Firebase and the verified temporary HTTPS origin; a distinct Firebase app name and placement namespace prevent test cleanup/resume from using the normal preview's SDK session/cache. Normal production/dev startup/configuration is preserved without the opt-in flag.

A fresh explicit READ ONLY check confirms `petalpal_native_security_test` on existing PostgreSQL 5433, 25 applied migrations and zero User rows. No DB migration/reset/fixtures/account mutation occurred. Free-port bind probes found 3108/8108, not reserved/activated. Existing 8107/8081/3107/5433 listeners retained their PIDs; containers and recovery stash were untouched.

**Local preparation/regression checks PASS: 66 tests** (21 backend isolation/database, 5 new client/instrumentation-availability, 12 existing mocked placement, 28 existing mocked auth/session), changed-scope TypeScript including Expo's ambient declarations (zero diagnostics), backend/script syntax and diff checks. Test-only native instrumentation exposes sanitized key-presence/record-count/owner-match/generation/cleanup metadata, an ordered real-write completion hold, a harmless global-preference sentinel and one-shot placement-only storage rejection. No production diagnostic route/global exists; no real-device fault/hold/sentinel/scenario was executed. Existing mocked regressions are not native acceptance evidence.

**Exact blocker:** the authorized isolated `.env.native-security-admin.local.json` is missing; no local ADC/ambient credential path was available. A/B/C remain unprovisioned, protected HTTPS and separate Metro are not activated, registered-client API-key provenance/live Admin and intended-iPhone transport are not confirmed. The helper/operations and required test-project credential handoff are documented in MOBILE.md section M; no provider authentication/terms/billing/configuration action was attempted. No production request/data/configuration mutation, deployment, commit/push or account deletion. Seven native runtime scenarios and C-deletion authorization remain unchanged. Canonical DELTA-P2-2 status and P0/P1/P2 summary counts are unchanged; prior evidence and unrelated document edits retained. MANUAL_SECURITY_CHECKLIST.md unchanged because no real provider/manual status/action changed.


### DELTA-P2-2 isolated native activation continuation — 2026-10-07

**Environment PARTIAL; native scenario acceptance NOT VERIFIED.** The user-provided owner-only/Git-ignored Admin credential passed the exact isolated project/type boundary. Live test-project Auth access, Email/Password configuration and all four registered client-app fields (including API-key provenance) PASS. Only A/B/C were provisioned in `petalpal-native-security-test` and linked to empty profiles/gardens/Fairy/AI-disabled/free-entitlement relations in `petalpal_native_security_test`. Saved credentials, test-project token/UID mapping and each account's HTTPS POST `/auth/session` plus metadata GET `/session?view=metadata` linkage PASS. All three have zero Journal/Event/Flower fixtures; C is intact and reserved for later explicitly authorized deletion. No production identity/data was read or modified; no production configuration changed.

The isolated backend is active on loopback 3108; the limited temporary HTTPS endpoint and separate Expo 8108 are active. Effective backend/client/project/API/flag boundaries and exclusion of Admin/account secrets from Metro are checked. Mac TLS/health identity/anonymous 401 and the generated iOS bundle's inlined test settings/diagnostic availability PASS. **Intended-iPhone HTTPS health remains NOT CHECKED (user reply); environment must not be marked READY.** All seven physical-device lifecycle scenarios remain NOT EXECUTED; test fault/hold/sentinel hooks remain unarmed/uninvoked.

Live activation uncovered third-party `natural` adapters loading root `.env` through direct default `dotenv.config()`, adding an ambient credential path after startup. The existing guard rejected authentication; no fallback Admin access or production connection occurred. A narrow isolated-launcher correction runs the absolute server entry from a fresh empty private temporary cwd while keeping the explicit isolated dotenv path. Only the newly created test backend was replaced; original 8107/8081/3107/5433 PIDs are preserved. A changed-scope post-import/default-dotenv isolation regression and subsequent A/B/C HTTPS session checks PASS; launcher syntax and diff checks PASS. Prior 66 tests/typecheck were not rerun. No normal production/dev startup, provider billing/config, containers, recovery stash or unrelated files/refs changed; no commit/push.

MOBILE.md N records current ports/endpoint/reuse/restart instructions and the exact remaining anonymous phone check. MANUAL_SECURITY_CHECKLIST.md records the genuine new isolated provider/account evidence, without changing prior production/provider limitations. Canonical DELTA-P2-2 status and P0/P1/P2 counts are unchanged; historical failed/blocked evidence is retained and superseded only within this scope.


### DELTA-P2-2 isolated environment ready gate closed — 2026-10-07

**Preparation environment READY; seven native runtime scenarios remain NOT EXECUTED / NOT VERIFIED.** The user confirms the anonymous test-backend HTTPS page on the intended iPhone/network shows all three isolated identity fields without a certificate warning: **USER-OBSERVED PASS**. This supersedes the preceding NOT CHECKED/PARTIAL phone-transport gate only. Existing isolated Admin/provider/client-app provenance, DB/A/B/C linkage, active HTTPS/Expo/iOS bundle, fail-closed guards and unarmed instrumentation preparation evidence are retained.

Fresh anonymous HTTPS identity and anonymous session 401 rechecks PASS; isolated backend 3108/Expo 8108 and original service PIDs remain live/unchanged. This follow-up performs no authentication, provisioning, native storage/lifecycle scenario, fault/hold/sentinel action or production request/data/configuration change. No tests/typecheck repeated; documentation diff checks PASS. MOBILE.md N and the manual record are updated. Canonical DELTA-P2-2 acceptance remains unchanged, so P0/P1/P2 counts remain unchanged. Recovery stash, branch and unrelated edits preserved; no commit/push. C deletion still requires separate explicit authorization.

### DELTA-P2-2 authorized physical-device attempt — 2026-10-07

**Runtime BLOCKED / NOT VERIFIED; isolated environment READY retained.** The user reports the isolated 8108 project open, A signed in and DevTools open. Agent-observed Metro intermittently lists the native iPhone target, but connected debugger sockets provide no Runtime response in bounded attempts; the earlier apparent missing global is superseded by a USER-OBSERVED native diagnostic snapshot after preserving the double underscores and avoiding unsupported top-level await. It reports zero durable keys/records and memory records, active owner matching expected, ready/successful cleanup state and unarmed hooks. This is instrumentation availability evidence; no fixture/logout scenario has executed. Read-only isolated provider/DB checks confirm all A/B/C exist with matching linkage. Exact phone identity/product auth-context runner initialization is pending. The isolated HTTPS health identity remains correct. No lifecycle/cache scenario, C deletion, failure injection, hold, sentinel or production request was executed. C-only deletion is now explicitly authorized subject to exact isolated/native preconditions, superseding the earlier pending-authorization record.

Existing DEV/test-only diagnostics now include memory-cache presence/count so required physical memory erasure can be directly observed alongside durable cache counts. Six focused instrumentation tests and changed-file TypeScript PASS; mocked evidence does not certify native storage. Previous 66 tests were not rerun. MOBILE.md O records all seven scenarios BLOCKED / NOT EXECUTED and the next device inspection step.

DELTA-P2-2 remains PARTIAL. Client Token Storage & Leakage Prevention, Account & Session Lifecycle Security, Root / Jailbroken Device Risk, and Sensitive Data Classification & Minimization receive no new native acceptance claim. Firebase SDK secure credential storage, OS backup exclusion, root/jailbreak protection, release artifacts and cryptographic deletion remain unverified. Canonical P0/P1/P2 statuses/counts are unchanged. MANUAL_SECURITY_CHECKLIST.md is unchanged; no provider/platform verification status changed. A/B/C and production data/config were not modified by this attempt; recovery stash and unrelated changes preserved.

### HISTORICAL / SUPERSEDED — DELTA-P2-2 scenario-1 interruption — 2026-10-07

**Historical record only:** the Scenario-1 interruption, failure, readiness and preparation entries through identified Scenario-1 preparation below are superseded by persisted Scenario-1 logout witness PASS and isolated physical-iPhone scenarios 1–7 PASS. Only authorized disposable C was deleted; A/B were preserved, failure injection was disarmed and production was untouched. Original evidence and point-in-time instructions are retained; these investigations are closed and must not be reopened.

**Scenario 1 INCONCLUSIVE / POSSIBLE RUNTIME FAILURE; scenarios 2–7 stopped/not executed.** USER-OBSERVED read-only runner initialization verifies exact isolated A and product auth context. Invoking the scenario-1 fixture/normal-logout runner then closes/disconnects the native runtime/DevTools without final evidence. Reopening isolated 8108 returns a signed-out, empty durable/memory cache with successful startup cleanup and fault/hold unarmed. That is recovery-state evidence, not proof that the interrupted logout erased the cache before restart. No PASS or native acceptance upgrade is justified. The user expressly stops scenario 2/C deletion; C remains untouched.

No intentional Expo reload/exit/close is found in the inspected runner, logout/cache lifecycle or immediate auth-gate transition. Post-logout module inspection/current React-context lookup has JS error handling; a native failure still needs the device crash/termination report. No speculative product fix, broad test rerun, other scenario, provider mutation or production request occurred. MOBILE.md O records the incident and read-only evidence request. Canonical DELTA-P2-2 and related security statuses/P0/P1/P2 counts remain unchanged.

The user finds no matching iPhone crash/JetsamEvent report; native termination remains unconfirmed and the cause unresolved. Recovery cleanliness does not replace pre-restart logout evidence. No scenario result/status/count upgrade or further runtime action follows from the absence of a report.

Scenario-1 clarification — 2026-10-07: the user explicitly observed the iPhone Home Screen and Expo Go exit. Native-app exit is USER-OBSERVED; its cause remains **F / insufficient evidence**, with no matching crash/Jetsam report or timestamped fatal log. No product or runner/instrumentation defect is confirmed. The current isolated Expo log read returns no new output. Scenario 1 remains INCONCLUSIVE; later scenarios/C deletion remain stopped. No incident code fix/tests, production access, service restart or canonical status/count change. Existing clean post-startup state is not original logout-erasure evidence. MOBILE.md records the next read-only system-diagnostic step.


### HISTORICAL / SUPERSEDED — DELTA-P2-2 automated native harness implementation — 2026-10-07

At the user's direction, historical scenario-1 diagnosis is closed with **INCONCLUSIVE / F: insufficient evidence**; no sysdiagnose process-exit result has been provided. Its prior evidence is retained. A separate authorized automated native test harness now replaces the DevTools-heavy workflow. Implementation checks PASS; physical-device scenarios 1–7 have not been run by this harness and C remains undeleted. DELTA-P2-2 remains PARTIAL; canonical statuses and P0/P1/P2 counts are unchanged.

DEV/native/isolated-only layout and per-scenario live backend environment/project/database/identity checks gate execution. Credentials stay out of the bundle and diagnostic journal; exact A authorizes the test-only HTTPS/no-store credential bridge, with a short-lived resume capability separately held in SecureStore. Isolated deletion is restricted to exact designated disposable C through the normal product lifecycle; A/B cannot be substituted. Normal production logout/deletion semantics are unchanged.

A strict separate sanitized checkpoint journal persists real logout-path cleanup witnesses before restart. Startup cannot create those witnesses; reload verification also checks native keys captured before startup erasure and requires a fresh runtime. Ambiguous interrupted deletion/logout stops without retry. Completed C deletion resumes idempotently with provider/DB confirmation. Hooks always disarm; final success requires resume-access revocation/local cleanup. The test controller survives auth-gate transitions and resumes after reopening without DevTools.

Nineteen focused harness/bridge tests PASS, covering sequencing, guard boundaries, checkpoint integrity/privacy, restart/idempotence, failed journal writes, startup false-PASS prevention, genuine reload gating, access cleanup and fault disarming. Changed-scope TypeScript/JavaScript syntax checks PASS. This is implementation/mocked-adapter evidence, not native acceptance, secure Firebase SDK credential-storage/backup exclusion, root/jailbreak, release or cryptographic-erasure evidence. Only isolated backend 3108 was replaced to activate the bridge; anonymous live HTTPS access is denied/no-store. No scenario/provider mutation or production access; C and A/B remain untouched. Existing services, branch, stash and unrelated work are preserved; no commit/push. MOBILE.md P and the manual workflow record are updated.


### HISTORICAL / SUPERSEDED — DELTA-P2-2 automated Scenario-1 failure diagnosis — 2026-10-07

USER-OBSERVED phone checkpoint history confirms one A fixture persisted in durable/memory cache, followed by `logout-pending` and scenario-1 FAIL, without the required `logout-completed` witness. The old FAIL snapshot was synthetic and does not certify native cleanup results. Scenarios 2–7 remain NOT STARTED; C remains untouched. The historical DevTools incident remains INCONCLUSIVE and is not reopened.

A directly relevant regression reproduces a harness timing race: the Firebase sign-out observer's queued scope cleanup leaves storage unready, cleanup result null and erasure pending during immediate witness inspection. This makes classification B the most likely cause; the phone's exact failed subproperty was not retained, so no product logout/cache defect is confirmed. The test-only witness now waits within the original logout callback for bounded native quiescence, rejects false erasure results, and preserves allowlisted failed-check names/actual snapshot metadata. Startup remains unable to manufacture a witness. The adapter waits for signed-out React auth state as well. Product logout/cache behavior is unchanged.

One separate Scenario-1-only retry is prepared behind an explicit on-device button, preserving the original diagnostic journal. Its terminal result cannot advance to scenario 2 or trigger C deletion; it has not been executed. Seven focused regressions and changed-scope type/diff checks PASS. No broad tests, account/provider mutation, production access, service restart or commit/push. DELTA-P2-2 remains PARTIAL and canonical P0/P1/P2 statuses/counts are unchanged. MOBILE.md records evidence, limits and the bounded retry workflow.


### HISTORICAL / SUPERSEDED — DELTA-P2-2 Scenario-1 rerun access readiness — 2026-10-07

Read-only live isolated environment/project/database health, anonymous session rejection and Expo 8108 checks PASS after runtime restoration. The corrected Scenario-1 rerun is not ready: the backend restart discarded its in-memory resume authorization map, while the phone adapter has no renewal path for its saved obsolete capability. This is a code/restart-derived test-access blocker, not a newly observed native cache defect or scenario result. Exact-A reauthorization is required before rerun. No scenario, credential bootstrap or account/provider mutation was performed; C and production remain untouched. Earlier historical INCONCLUSIVE and automated FAIL evidence are retained. DELTA-P2-2 remains PARTIAL; canonical statuses and P0/P1/P2 counts are unchanged. MOBILE.md records the blocker; no genuine manual/provider verification changed.

### HISTORICAL / SUPERSEDED — DELTA-P2-2 explicit Scenario-1-only authorization renewal — 2026-10-07

**Exact-A access renewal PASS on the isolated physical iPhone; corrected Scenario 1 remains unexecuted.** This supersedes the preceding access-readiness blocker, not either historical scenario result. The existing ignored saved A credentials were authenticated only against `petalpal-native-security-test`; the running isolated bridge verified exact provider/DB linkage and `petalpal_native_security_test`. Native live scope/boundary checks and SecureStore readback confirmed the encrypted handoff without product login/logout, fixtures or a scenario action.

A test-only loopback companion holds the upstream capability in Mac RAM and issues a separate A-only, Scenario-1-only grant with a 15-minute maximum lifetime. It offers no identity substitution, B/C credentials, deletion or general proxy route. Every authenticated request revalidates the original backend's process-local authorization and isolation; backend restart invalidates access without fallback/rebootstrap. A new explicit operator renewal is required. Native grants stay in a separate SecureStore key, outside bundle/environment values and sanitized journals, and are revoked/removed at a terminal Scenario-1 outcome. One-use encrypted inspector transport plus a polled sanitized persistence acknowledgement avoids exposing the bearer or mistaking a Promise handle for successful installation. No manual DevTools commands were required.

Fifteen unique focused authorization/encrypted-handoff/Scenario-1-only tests PASS; changed-scope TypeScript and JavaScript syntax checks PASS. Guards reject normal/production mode, wrong project/database and substituted identities; expiry, backend restart, malformed handoff and scope escalation fail closed. Live companion HTTPS denies anonymous access with no-store; normal services/product auth behavior were not restarted or changed. These are access/workflow implementation and native handoff evidence, not logout-cache acceptance or Firebase SDK credential-storage/backup/root/release evidence.

Historical manual Scenario 1 remains INCONCLUSIVE; original automated Scenario 1 remains FAIL; the corrected single retry awaits its explicit phone button. Scenarios 2–7 remain NOT STARTED; C and production remain untouched. DELTA-P2-2 remains PARTIAL, with canonical statuses and P0/P1/P2 counts unchanged. MOBILE.md records the operator workflow; MANUAL_SECURITY_CHECKLIST.md is unchanged because no genuine manual/provider acceptance or configuration status changed. No commit/push.

### HISTORICAL / SUPERSEDED — DELTA-P2-2 reported retry failure and missing start evidence — 2026-10-07

Automatic read-only native storage inspection finds the original Scenario-1 FAIL journal unchanged (last timestamp 2026-10-08T03:29:55.047Z), **no retry journal/key**, and a mounted screen displaying that original final timestamp. The original sequence remains ready → fixture → logout-pending → failed, without logout-completed/pass. Current scoped native authorization independently returns HTTP 200 with exact isolation and Scenario-1-only scope; current auth is signed out. These current facts do not recover the unrecorded preparation failure or prove a new logout occurred.

**Classification C is confirmed for the harness checkpoint/reporting gap; the underlying preparation error remains F / insufficient evidence.** Fallible auth settlement and authorization ran before the retry engine's first durable checkpoint; the screen's error catch left the old FAIL history displayed. The test-only fix moves preparation after persisted ready and records an allowlisted BLOCKED preparation stage without private error payloads. Existing logout cleanup semantics, genuine pre-restart witness requirements, terminal no-retry behavior and later-scenario/C restrictions are preserved. No product cleanup bug is established and no new native cleanup acceptance is claimed.

Six directly affected Scenario-1 regression tests and changed-scope TypeScript PASS. No physical scenario, renewed grant, deletion, production access, service restart, broad tests or further phone-rerun preparation occurred. Historical manual INCONCLUSIVE and automated FAIL remain retained. DELTA-P2-2 remains PARTIAL; canonical statuses and P0/P1/P2 counts are unchanged. MOBILE.md records the evidence limits and harness fix; MANUAL_SECURITY_CHECKLIST.md is unchanged because no manual/provider acceptance/configuration status changed. No commit/push.

### HISTORICAL / SUPERSEDED — DELTA-P2-2 identified Scenario-1 preparation — 2026-10-07

**A separate physical-device attempt is prepared, not executed:** generation 1, non-secret ID `s1-dcd05ab770d85d4748202cd9d7232518`, persisted phases `preparing → ready`. A dedicated index marks legacy attempts historical/superseded without modifying their evidence. Current reporting selects only its own ID-derived journal; stale/mixed-generation rows, changed selections, corrupt reads and overwritten history are rejected. The original FAIL is never used as the current generation's result.

The required success sequence includes preparing, ready, fixture, logout-pending, logout-completed, verification and final PASS. Preparation errors receive their own sanitized BLOCKED stage; failed durable writes cannot acknowledge readiness. PASS requires the clean witness persisted from the original logout callback, and startup cleanliness cannot substitute for it. Screen mounting performs no automatic execution/resume. Current engine/UI paths stop at Scenario 1, permit only A and reject C deletion/all-scenarios execution. Product logout/cache semantics are unchanged; only stale in-memory test execution hooks/state are reset.

The existing isolated backend/Expo/main HTTPS environment and guards remain active. The expired scoped authorization companion alone was replaced; exact-A provider/DB authorization and encrypted native SecureStore handoff succeeded again with the same A-only, Scenario-1-only, 15-minute/backend-restart boundaries. No production request, account provisioning/deletion, scenario execution or normal-service restart occurred.

Fourteen unique targeted engine/checkpoint/generation tests and targeted TypeScript PASS. This is workflow and preparation evidence, not native logout acceptance. Historical manual Scenario 1 remains INCONCLUSIVE; original automated Scenario 1 remains FAIL; this new generation awaits its single explicit phone action. Scenarios 2–7 remain NOT STARTED, C and production untouched. DELTA-P2-2 remains PARTIAL; canonical statuses and P0/P1/P2 counts remain unchanged. MOBILE.md records the replacement workflow. MANUAL_SECURITY_CHECKLIST.md is unchanged; no genuine manual/provider acceptance/configuration status changed. No commit/push.

### DELTA-P2-2 physical generation-1 Scenario-1 PASS — 2026-10-07

**Scenario 1 VERIFIED PASS on the real isolated iPhone.** Generation 1's persisted seven-stage sequence is preparing → ready → fixture → logout-pending → logout-completed → verification → PASS. The fixture contains one durable/memory record; the original logout callback persisted clean durable/memory erasure at 2026-10-08T04:39:18.647Z, followed by verification and PASS at 04:39:18.659Z. Startup cannot call the one-shot witness writer, and missing witness phases cannot validate. This upgrades only the new generation's native logout acceptance. Historical INCONCLUSIVE and automated FAIL evidence remain preserved/superseded.

A separately authorized continuation now requires this immutable source PASS, a distinct encrypted native bridge grant and persisted activation before scenarios 2–7 can run. Exact C-only deletion, A/B preservation, live isolated provider/database validation, one-shot deletion recovery, genuine reload evidence and failure-stop rules remain enforced. Scenario 1 cannot rerun through continuation. The shared sign-out-observer timing guard now covers normal logout witnesses for scenarios 2–6 without changing product cleanup behavior. Fourteen focused continuation/harness tests, targeted TypeScript and helper syntax PASS.

At this entry the native authorization connection is unresponsive, so continuation is not activated; scenarios 2–7 remain NOT STARTED and C is untouched. No production access/config/data change or commit/push. DELTA-P2-2 remains PARTIAL; canonical statuses and P0/P1/P2 counts are unchanged. MOBILE.md and the genuine physical-device acceptance record in MANUAL_SECURITY_CHECKLIST.md are updated.
### DELTA-P2-2 dedicated iOS automation infrastructure — 2026-10-07

**Historical abandoned experiment:** dedicated iOS sources/generated files were removed during finalization. This entry retains its original evidence; Expo Go/on-device 7/7 acceptance below is current.

The isolated development-build/XCUITest path is generated but **physical verification is BLOCKED: full Xcode is unavailable**. The new readiness mode cannot execute scenarios, prepare/rerun Scenario 1 or activate continuation. Focused tests verify compiled-boundary validation before Firebase, live isolated database rejection, exact-A-only readiness, one-use encrypted credential handoff, grant revocation, source-copy integrity and existing continuation evidence protections. Generated target structure and Swift syntax parsing are checked; native compilation, signing, physical launch, UI automation, relaunch and artifact redaction have not been physically verified.

The dedicated sandbox imports only the actual accepted generation-1 report through the isolated UI, preserves the original Expo Go evidence and records that it is copied provenance. No report was transferred or fabricated during this preparation. Copying cannot certify a new dev-client logout PASS. Plaintext credentials are excluded from XCUITest inputs/output and build settings; developer network inspection and automatic retained screenshots are disabled. These are implemented/tested controls, not completed real-device acceptance. MOBILE.md contains prerequisites, readiness/execution separation and the fail-closed operator commands.

Scenario 1's original persisted PASS remains accepted; historical INCONCLUSIVE/FAIL evidence is unchanged. Scenarios 2–7 remain NOT STARTED, C and production untouched. DELTA-P2-2 remains PARTIAL; canonical statuses and P0/P1/P2 counts are unchanged. MANUAL_SECURITY_CHECKLIST.md is unchanged because no Apple/device/provider step has been completed. No commit/push or recovery-stash modification.

### DELTA-P2-2 Expo Go scenarios 2–4 accepted; reload recovery pending — 2026-10-07

Persisted real-iPhone continuation proves Scenario 2 account-delete erasure PASS (2026-10-08T06:19:13.698Z), Scenario 3 A-to-B isolation PASS (06:19:15.762Z), and Scenario 4 late-write fencing PASS (06:19:16.901Z). C-only deletion has its original clean logout witness and remote-deleted checkpoint. Independent exact isolated provider/database checks confirm C absent and A/B present. Scenario 1's accepted generation and historical superseded failures are unchanged.

Original Scenario 5 stopped BLOCKED after reload-requested when isolated service restoration invalidated prior authorization. Its journal is retained, not converted to PASS. A separately authorized recovery journal preserves accepted 1–4 and permits only fresh 5–7. Test-only instrumentation now persists the first post-reload namespace count before startup cleanup and never replaces that observation on subsequent startups. Missing/dirty/non-durable observations fail closed. Thirteen targeted tests and scoped type/syntax checks PASS; no product logout/cache defect is confirmed.

Recovery was activated once, but its reopened Expo runtime currently fails bootstrap with missing native ExpoAsset. Its final checkpoint and fault state cannot yet be read; scenarios 5–7 are not accepted. Full process reopening is pending to inspect/resume saved evidence. No production activity or canonical status/count change: DELTA-P2-2 remains PARTIAL, including remaining native scenarios and previously unverified credential-store/backup/root/release claims. Dedicated-build work is deferred by user choice.

### DELTA-P2-2 seven isolated native runtime scenarios PASS — 2026-10-07

The existing Expo Go recovery resumed after a full process reopen. Persisted Scenario 5 PASS at 2026-10-08T06:32:31.817Z follows its original clean logout witness (06:30:10.610Z), reload request and independently verified durable first-startup pre-cleanup observation of zero. Scenario 6 PASS at 06:32:33.416Z proves the global preference survived the original clean logout; the harness then removed that test preference. Scenario 7 PASS at 06:32:35.270Z follows injected failure-observed, failure-safe and recovered checkpoints. Final native inspection confirms no armed failure, no held write, zero placement/memory records, ready storage and completed cleanup.

Together with unchanged Scenario 1 and verified 2–4, all seven scoped isolated physical-iPhone placement-cache runtime scenarios PASS. Final independent provider/DB verification confirms only disposable C absent and A/B preserved. Historical INCONCLUSIVE/FAIL and original Scenario-5 BLOCKED journals remain unchanged; the recovery has a separate key. No production account/data/configuration was touched. Thirteen focused recovery/observation tests and scoped type/syntax checks PASS.

Canonical DELTA-P2-2 remains PARTIAL and P0/P1/P2 counts stay unchanged: this accepts the isolated Expo Go placement-cache runtime matrix, not secure Firebase credential storage, OS backup exclusions, rooted-device protection or a production release artifact. Documentation and the actual manual/provider acceptance record are updated; no commit/push.

### DELTA-P2-2 finalization — 2026-10-07

The completed security change retains the successful Expo Go/on-device harness and removes only abandoned Xcode/dev-client experiment code, dependencies and generated build files. Final focused regression validation: **84 native-security tests PASS**, scoped TypeScript zero diagnostics, relevant Node syntax/diff checks PASS. No physical scenario was repeated. The seven accepted persisted runtime results, C-only deletion, A/B preservation and disarmed failure injection remain accepted; all historical/superseded evidence remains retained. No production activity.

Affected canonical rows retain their existing status: Client Token Storage & Leakage Prevention TESTED; Account & Session Lifecycle Security PARTIAL; Root / Jailbroken Device Risk PARTIAL. DELTA-P2-2 remains PARTIAL. Canonical P0/P1/P2 counts are unchanged. The next native-security blocker is Firebase SDK credential-storage/OS-backup policy; production-release artifact verification also remains open. Placement erasure does not certify those platform controls.

### Firebase JS iOS credential persistence and backup review — 2026-10-07

**Classification B / PARTIAL; documentation-only.** The mechanism and source-level default are established; release-device file attributes, backup inclusion and restore are not physically verified. No accidental app-controlled persistence/logging defect was found in the inspected initialization/auth/session/API paths. Ordinary AsyncStorage is not asserted equivalent to a secure credential vault or acceptable for a stronger credential-extraction threat model. No architecture change is justified by an unobserved platform outcome. The DELTA-P2-2 PetalPal-owned placement-cache lifecycle remains CLOSED at 7/7 physical runtime PASS; historical/superseded journals and C-only deletion evidence remain unchanged.

**Actual stack and ownership.** Lockfile and installed packages agree: Firebase JS **12.19.0**, `@firebase/auth` **1.13.6**, AsyncStorage **2.2.0**, Expo **57.0.19**, React Native **0.86.3**. `mobile/src/services/firebase.ts` initializes the non-web path with `initializeAuth(app, {persistence: getReactNativePersistence(AsyncStorage)})`; Firebase's React Native export is selected. `AuthProvider` calls this singleton and awaits `authStateReady()` before restoring session metadata, refreshing claims and configuring API transport. This is not React Native Firebase native Auth or Expo AuthSession. Product API tokens come from the current Firebase user's `getIdToken()`; inspected auth/session/API code has no manual token/password persistence or logging and never edits Firebase's internal keys. SecureStore holds separate DEV/test harness grants, not production Firebase session credentials.

Installed `@firebase/auth/dist/rn/index.js` serializes persistence values as JSON into the supplied adapter. Its core `UserImpl.toJSON` includes user/provider metadata and `StsTokenManager`'s refresh token, access/ID token and expiration time, plus app configuration; it does not serialize the email/password sign-in password. These records are **SDK-owned Highly Sensitive credentials**, despite living in app-selected storage. Firebase may fall back to memory when the adapter is unavailable; durable login is not guaranteed under storage errors.

**Storage and controls.** Installed `@react-native-async-storage/async-storage/ios/RNCAsyncStorage.mm` writes small values into `manifest.json` and larger values into files under `Library/Application Support/<host bundle identifier>/RCTAsyncLocalStorage_V1`. This version is file/JSON storage, not SQLite, NSUserDefaults or Keychain. It applies no custom credential encryption and sets no explicit `NSFileProtection` attribute. iOS sandbox and [file Data Protection](https://support.apple.com/en-in/guide/security/secb010e978a/web) still apply; actual inherited protection attributes/locked-device accessibility were not observed. Unencrypted at the library layer does not mean iOS stores raw unencrypted disk sectors. No Keychain accessibility class, biometric gating, device-only migration guarantee or direct Secure Enclave credential protection applies to this adapter.

Setup reads native `RCTAsyncStorageExcludeFromBackup`, defaults to YES when absent, and requests `NSURLIsExcludedFromBackupKey` for the whole storage directory. PetalPal's `app.json` supplies no override. The library logs exclusion failure and proceeds without checking its return value, so source intent is not proof of effective exclusion. This is a dependency/platform evidence limit, not a reproduced PetalPal defect. A future standalone binary can configure the native Info.plist flag and select a supported persistence adapter through public Firebase initialization; Firebase JS exposes no file-protection/Keychain-class knob for this adapter. Expo Go's host binary/Info.plist cannot be changed by this project's JavaScript. Do not manually edit SDK keys, wrap SDK internals in custom crypto or claim a native config change affects already installed Expo Go.

| Surface | Established behavior / limit |
| --- | --- |
| Ordinary iCloud device backup | Directory exclusion is requested by AsyncStorage 2.2.0; if honored, its auth files should not be restored from that backup. Effective host flag/success and actual backup inclusion are unverified. Apple explicitly treats exclusion as [guidance, not a guarantee of absence](https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup). |
| Finder/iTunes encrypted backup | The same exclusion request is intended to omit the directory; not physically verified. If included, backup encryption protects the file copy under the backup password/keybag, not an app-controlled device-only credential key. |
| Unencrypted local backup | Exclusion is intended but unverified. If auth files are included, their contents are not encrypted by file Data Protection in that backup; do not treat an unlocked-device protection class as backup encryption. [Apple backup keybags](https://support.apple.com/en-ca/guide/security/sec6483d5760/web). |
| Restore / new-device migration | Honored exclusion implies no restored SDK auth record and fresh sign-in. If a historical backup or other transfer contains the record, metadata/tokens can reappear; these ordinary files have no Keychain device-only binding. Direct device-to-device transfer is not established by a backup-exclusion hint. Online provider validity and app/backend authorization still govern access. No restore/migration experiment was performed. |
| iCloud Keychain sync | This AsyncStorage auth adapter creates no Keychain item and therefore supplies no iCloud Keychain sync behavior. Separate user password-manager/AutoFill choices are outside this SDK record. |

[Keychain](https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web) storage is different: accessibility and synchronizable/device-only classes govern availability, sync and migration. The test harness uses a separate WHEN_UNLOCKED_THIS_DEVICE_ONLY SecureStore grant; those properties cannot be attributed to Firebase's AsyncStorage tokens. Expo Go contains the project in Expo's host sandbox/native modules; its exact compiled storage implementation, attributes and backup policy were not measured here. A standalone/dev/release app using the same JavaScript selects the same adapter, but its own compiled library, sandbox, Info.plist and entitlements must be checked independently. Prior 7/7 Expo Go cache acceptance does not certify SDK credential storage or release backups. [Expo native-build boundaries](https://docs.expo.dev/develop/development-builds/introduction/).

**Logout, historical copies and provider validity.** Public Firebase JS `signOut` clears the current user through its persistence manager, which removes the auth record via AsyncStorage; PetalPal awaits that call. A successful call removes current logical session persistence and stops active refresh, not every previously handed-out token object or physical recoverable byte. An adapter failure can reject sign-out; PetalPal reports that failure, and erasure must not be claimed. Sign-out does not call Admin global refresh-token revocation. PetalPal's confirmed account-delete path then calls normal logout; [Firebase account deletion invalidates refresh tokens](https://firebase.google.com/docs/auth/admin/manage-sessions). Existing signed ID tokens can remain cryptographically valid for their approximately one-hour lifetime unless a relying service checks revocation/user existence. Current verifier behavior was not re-audited. Backups made before logout/delete cannot be erased by current app cleanup; a restored refresh token after sign-out alone may still work, while a deleted/disabled/revoked account cannot obtain a fresh token. Offline cached identity is not proof of current provider authorization.

**Compromised-device limit and next gate.** A rooted/jailbroken device or attacker controlling the running process can read accessible files/memory and use credentials; neither this adapter nor the accepted cache erasure provides rooted confidentiality or cryptographic deletion. [App Check](https://firebase.google.com/docs/app-check) can require attestation tokens at enforced endpoints and limit some stolen-token use outside attested clients; it does not encrypt local Firebase credentials, replace user authorization/revocation or prevent extraction/replay through a compromised legitimate runtime. No App Check/provider change was made.

Next native-security gate: verify the intended shipped iOS artifact's effective library/Info.plist, directory exclusion and file-protection metadata, then isolated backup/restore/new-device behavior against the declared credential-extraction threat model. Retain only safe presence/status results, never auth files/tokens or a full backup. This task ran **7 focused existing auth/session regressions PASS** and **5 package/source verification checks PASS**, plus documentation diff checks. No product code, provider/config, phone scenarios, commit or push. Canonical statuses and P0/P1/P2 counts remain unchanged.


### P1 Account Enumeration — 2026-10-08

**PARTIAL; scoped app-controlled disclosures fixed.** Web password login previously echoed raw Firebase errors; web/mobile registration explicitly confirmed an existing email, and mobile login distinguished a disabled account. Public feedback now uses fixed allowlisted messages: unknown-user, wrong-password, invalid-credential and disabled-user login failures share the same text; duplicate registration uses the generic fallback without echoing provider codes, messages or email. Valid login, new registration, email verification/recovery and profile completion remain intact. Registration success versus failure still differs; message sanitization does not eliminate the direct Firebase signup oracle.

PetalPal session routes authenticate before profile lookup. Missing/invalid-token probes for known/unknown supplied emails return identical responses without any profile lookup. Verified users may discover/create/recover their own profile; legacy email linking uses the verified token email/UID, not client-supplied identity. No unauthenticated app account-lookup disclosure was confirmed. The diagnostic flag previously exposed raw Firebase verification details; these are now server-only regardless of the flag. Service-unavailable remains 503 and token failures remain 401. Web session setup also stops echoing backend/provider diagnostic fields. Earlier diagnostic evidence is historical; authorization and internal diagnostic logging are preserved.

**Historical Firebase configuration assessment (superseded by the user-observed confirmation below); provider limitations retained:** no existing record establishes `emailPrivacyConfig.enableImprovedEmailPrivacy`, and no provider/production access was performed. An authorized operator must inspect Authentication → Settings → User account management → User actions → Email enumeration protection and record only enabled/disabled status (no change authorized here). If disabled, enabling it and isolated provider acceptance require separate authorization. Google's [Email Enumeration Protection documentation](https://docs.cloud.google.com/identity-platform/docs/admin/email-enumeration-protection) describes uniform invalid-login responses and non-disclosing password-reset responses, but signup continues returning `EMAIL_EXISTS` even with protection enabled. Direct signup abuse controls and success/failure/timing differences therefore remain unresolved; no provider-level or timing equivalence is certified.

No active password-reset, sign-in-method lookup or Firebase credential-linking flow is present in the web/mobile app or backend. Reset known/unknown behavior consequently remains a provider-only acceptance gap; no reset email was sent or reset feature added. Retained Google/passwordless helper exports have no active sign-in UI/caller. Verified-token legacy profile linking is active and covered separately; it is not Firebase credential linking.

**Validation:** 70 targeted tests PASS: 33 web auth UI/session/verification tests, 29 mobile auth/session tests, 6 backend identity middleware tests and 2 actual session-route tests with stubbed Firebase/Prisma. Coverage includes known/unknown invalid logins, wrong passwords, disabled identities, duplicate/new registration, verification resend/rate limits, session diagnostics/errors, own-profile setup and verified legacy linking. The changed TypeScript error helper passes strict scoped typecheck; syntax and diff checks PASS. These are local synthetic tests, not live provider/reset/native-runtime acceptance. No production access, provider mutation, deployment, broad audit or native scenario rerun occurred.

Only Account Enumeration changes canonical status (TODO → PARTIAL): P1 PARTIAL 8 → 9, TODO 4 → 3; all other canonical statuses/counts and historical evidence remain unchanged. MANUAL_SECURITY_CHECKLIST.md is unchanged because no manual/provider action was performed or provider acceptance status changed; MOBILE.md is unchanged because no mobile operational workflow changed. Next blocker: verify Firebase Email Enumeration Protection and address the remaining direct signup enumeration boundary under separately authorized provider work.


### P1 Account Enumeration — signup follow-up, 2026-10-08

**Production Email Enumeration Protection ENABLED — USER-OBSERVED.** The user reports a Firebase Console screenshot confirming the enabled setting on 2026-10-08. This supersedes the earlier NOT VERIFIED configuration assessment and configuration-check blocker only; the agent did not independently inspect Console or change any provider setting. It is not live known/unknown login/reset/signup acceptance or blanket provider verification.

**Account Enumeration remains PARTIAL.** Active web/mobile signup calls Firebase directly. Enabled protection still permits signup `EMAIL_EXISTS` responses ([Firebase guidance](https://docs.cloud.google.com/identity-platform/docs/admin/email-enumeration-protection)); callers can bypass PetalPal UI sanitization. New-user verification success and duplicate-registration failure remain distinguishable. App-side message masking or client-only throttling cannot remove that provider oracle. Provider-enforced signup abuse controls or a separately designed signup flow requiring mailbox ownership remain the next blocker; neither is claimed implemented or authorized for production changes here.

Signup regression coverage now checks duplicate-account, raw `auth/internal-error` and uncoded provider failures: identical safe feedback, no echoed code/email, no successful-registration transition, no false email-sent claim and no backend session. Valid new-user registration and verification recovery remain covered. Runtime code is unchanged: no additional app-controlled disclosure requiring a safe local fix was confirmed. Nine targeted signup tests PASS (4 web, 5 mobile; synthetic Firebase/email adapters); test syntax and diff checks PASS. The earlier 70-test evidence remains historical and is not an additive total. Manual checklist records the genuine new provider-setting evidence; canonical statuses/counts, MOBILE.md and all historical evidence remain unchanged. No live emails, provider access/mutations, production mutations, deployment or native scenario rerun.


### P1 Credential Stuffing / Brute Force — 2026-10-08

**PARTIAL; backend-controlled gaps fixed.** Active web/mobile password sign-in and signup call Firebase directly; only authenticated session setup reaches PetalPal. Backend limits therefore do not throttle password guesses, password spraying or Firebase account creation. Safe `auth/too-many-requests` feedback is preserved; no automatic password retry or app-managed email/account lockout was introduced.

Previously `/session` rejected tokens before its general limiter, allowing unbounded failed verification; raw auth IP keys allowed IPv6 rotation, full limiter maps evicted active budgets, and `/auth/session` had no cross-IP verified-identity budget. `/auth` and `/session` now share a pre-parser/pre-verification failure IP budget using the installed limiter library's IPv6 /56 and IPv4-mapped normalization. Successful responses refund that budget and empty buckets are removed, preserving successful shared-NAT sign-ins. Session setup, including Express case/trailing-slash variants, adds a separate budget keyed only by verified Firebase UID before profile lookup/creation. Submitted emails/UIDs cannot consume another account's budget. Existing defaults remain 20 auth failures per IP per 15 minutes; new `RATE_LIMIT_AUTH_ACCOUNT_MAX` defaults to 20 session setups per verified UID in the same `RATE_LIMIT_WINDOW_MS`. Generic temporary 429 responses include Retry-After and do not revoke credentials. Full maps reject new keys until expiry rather than evicting active budgets. These are bounded process-local controls; restarts, distributed IPs/identities, concurrent shared-NAT traffic and saturation availability remain limitations. Effective proxy topology and thresholds require manual validation; no deployment behavior is certified.

**Firebase/manual remainder:** [Firebase Auth limits](https://firebase.google.com/docs/auth/limits) currently document 100 new accounts/hour/IP and warn that quotas/abuse protections can change. This is not a verified project setting or a distributed/per-account stuffing defense. Review effective quotas, override history, abuse metrics/alerts, legitimate recovery and high-risk re-auth. Evaluate Identity Platform eligibility and actual enforcement of [App Check for Auth](https://docs.cloud.google.com/identity-platform/docs/admin/app-check-integration) and [reCAPTCHA email/password protection](https://docs.cloud.google.com/identity-platform/docs/recaptcha-enterprise), including all shipped web/native SDKs and missing/invalid-token negatives in an authorized isolated environment. Audit-only mode is not enforcement. No provider setting, account, email or production request was changed/performed.

**Validation:** 31 deterministic targeted tests PASS: 18 backend rate-limit/config/identity/session-route tests, 10 web login tests and 3 selected mobile auth tests. Coverage includes pre-verification rejection, IPv6/mapped-address rotation, verified UID across IPs, untrusted submitted identity, successful shared-NAT users, fixed-window expiry, map saturation, provider throttle feedback and mobile 429 without retry/token refresh/session invalidation. Scoped auth-helper typecheck, changed JS syntax and diff checks PASS; no native scenario rerun or broad suite. SECURITY.md and required manual checks updated; MOBILE.md unchanged because mobile workflow is unchanged. Credential Stuffing remains PARTIAL; canonical statuses/counts and all prior evidence are preserved. Next blocker: effective provider-side password/signup abuse enforcement and authorized isolated acceptance, plus high-risk re-auth verification.


### P1 Auth Abuse — provider evidence and recent-login gate, 2026-10-08

**Provider evidence remains limited.** Web/mobile `signInWithEmailAndPassword` and `createUserWithEmailAndPassword` call Firebase before backend session setup; PetalPal limits cannot constrain those direct attempts. Existing provider evidence establishes only user-observed Email Enumeration Protection ENABLED, not effective signup/login quotas, quota overrides, App Check enforcement, reCAPTCHA password-provider mode or risk thresholds. No authenticated provider session/config export was supplied or inspected; no effective setting is inferred from published limits or successful historical login. The previously recorded signup/provider limitations and canonical PARTIAL statuses remain intact.

**Confirmed app-controlled issue fixed:** owner account deletion uses Firebase Admin `deleteUser`, outside the [client SDK recent-login requirement](https://firebase.google.com/docs/auth/web/manage-users#re-authenticate_a_user). The backend previously accepted an old signed-in session without checking original authentication time. It now retains only the verified token's `auth_time` and requires a positive integer timestamp no more than five minutes old, rejecting missing/malformed/future/stale values before deletion audit, revocation, transaction or provider deletion. Five minutes is PetalPal policy, not a claimed provider threshold. Refreshed `iat` and submitted timestamps cannot bypass it. Generic 403 `auth/requires-recent-login` instructs explicit sign-out/sign-in; no automatic deletion retry or session/cache invalidation occurs. Fresh owner deletion and Firebase-failure rollback remain covered. Active profile locale/avatar, privacy and AI-consent operations remain owner-authorized; no active password/email-change or Firebase credential-linking flow was found. Other high-risk policy and shipped/provider acceptance remain PARTIAL.

**Compatibility:** web uses Firebase JS 12.x, above the [documented reCAPTCHA password-auth minimum](https://docs.cloud.google.com/identity-platform/docs/recaptcha-enterprise#configure_the_client_sdk); its SDK can fetch provider configuration automatically, so absence of explicit reCAPTCHA initialization does not prove protection is disabled. App Check initialization is absent from the inspected app auth setup. Native currently uses the React Native JS export in Expo Go; its browser reCAPTCHA implementation requires browser globals, and native App Attest/Play Integrity is not a drop-in Expo Go integration. Firebase documents [React Native App Check via a custom native-attestation provider](https://firebase.google.com/docs/web/environments-js-sdk); [Expo native Firebase modules require a development/release build](https://docs.expo.dev/guides/using-firebase/#using-react-native-firebase), not Expo Go. A future native/custom-provider architecture needs client, registration, entitlement and SDK verification before enforcement; no speculative integration or debug-token production workaround was added. App Check and password-provider reCAPTCHA are separate controls, with separately unknown enforcement.

**Historical manual action (current UI result recorded below):** open Firebase Console → Security → App Check → expand Authentication's metrics/enforcement view and report its displayed enforcement status (or that Authentication is absent). Read only; do not click Enforce. [Console guidance](https://firebase.google.com/docs/app-check/enable-enforcement). Remaining required evidence includes actual Identity Platform password-provider reCAPTCHA mode (`recaptchaConfig.emailPasswordEnforcementState`), effective signup quotas/temporary overrides and abuse metrics; no setting change or live attack experiment is authorized here.

**Validation:** 13 directly affected deterministic tests PASS: 7 auth middleware/claim-boundary tests, 1 account-deletion route test, 2 selected deletion/Socket-revocation tests and 3 selected mobile deletion/recovery tests. Mocked provider/database only; stale/missing/malformed/future claims produce no deletion side effects, fresh sign-in allows deletion, owner checks/rollback and mobile cache preservation/recovery remain intact. Scoped auth-helper typecheck, changed JS syntax and diff checks PASS. SECURITY.md, required manual checks and MOBILE.md deletion-operation instructions updated; canonical counts/statuses and all historical 31-test/7-scenario evidence unchanged. This is a verified code correction, not an inconclusive-only investigation; no provider changes, production requests, real emails, deployment or native rerun.


### P1 Auth Abuse — App Check onboarding evidence, 2026-10-08

**USER-OBSERVED: App Check not yet configured based on current production Console UI.** The user reports the initial “Get started” onboarding screen, with no registered app or Authentication enforcement status visible. This records the requested read-only UI check; no agent Console access or independent enforcement verification is claimed. App Check enforcement is not verified. The observation does not establish password-provider reCAPTCHA mode or effective Firebase quotas.

Credential Stuffing remains PARTIAL; canonical statuses/counts and prior backend/recent-login/native evidence remain unchanged. App Check setup is deferred until Expo/native release compatibility is validated. No onboarding, app registration, enforcement, provider-setting change, production modification or runtime code change was performed or authorized.


## Isolated logging-only release candidate — 2026-10-08

Candidate `1f8d0f98fb16b9553ae03c474f5952c808928e48` is a local detached commit directly on exact recorded production `d510b1ff97902704721060b4c1261657be3e4b76`, retained for review at `/var/folders/24/w5jj8rlx4dz065gbyzgv_xx00000gn/T/petalpal-logging-release-z8zlq9uo/candidate`. No candidate branch was pushed; original integration branch/HEAD, stash, protected main 2 file and prior uncommitted documentation were preserved.

- [x] **Check 1 — exact isolated scope PASS:** four runtime files (`lib/auth.js`, `lib/rate-limit.js`, `lib/security-events.js`, `server.js`) and two affected tests (`test/back/auth.test.js`, `test/back/logging-privacy.test.js`) only. Their added/deleted lines exactly match the six-file `8046275` logging delta. Ordinary patches applied to five files; the five server-line edits were adapted by exact whole-line matching to retain production's existing log import. No whole-file HEAD copy or whole-commit cherry-pick was used. DB adapter/social/error modules, monitoring, AI code, speech, Journal and mobile/web/Worker changes remain excluded. Neither database-resources.js nor security-metrics.js is present.
- [x] **Check 2 — candidate-specific local tests PASS (6/6):** four logging-privacy regressions plus the two changed auth diagnostics cases, no skips/cancellations. Actual candidate modules run with synthetic Firebase verification and ephemeral loopback Express; denial/status/rate-limit contracts and log-sink failure isolation pass. Credential-free explicit environment, no env files or real database/provider requests; no accepted broad matrix rerun. This validates the recombination locally, not production.
- [x] **Check 3 — imports/dependencies/syntax PASS:** all six changed JS files pass syntax checks; affected tests load the candidate server/import graph. Seven relevant installed packages match the production lockfile; no new dependency or manifest/lock update. Local test dependencies/generated client are review-only, untracked/ignored artifacts and are not in the candidate commit.
- [x] **Check 4 — build/startup/schema/rollback source contract PASS:** Dockerfile/ignore rules, package/start script, lockfile, Prisma config/schema/migration tree, and DB runtime files are identical to production; start remains `npx prisma migrate deploy && node server.js`. No migration is added or executed. Rollback to exact production restores only the prior logging code, with no schema/DB-limit transition. Diff checks PASS. This is source compatibility and reused baseline evidence; no fresh clean-install/image build or actual production startup was performed.
- [ ] **Candidate CI/build gate — NOT VERIFIED:** exact local candidate SHA has no GitHub execution and does not include the later security-regression workflow/runner. Integration run 37868402033 includes excluded DB changes and is not candidate evidence. A separately approved publication/review and candidate-specific test/CI execution path is needed, plus reproducible clean install/image build/startup validation without production writes; adding validation-only CI would require an explicitly reviewed new candidate SHA.
- [ ] **Release/production gate — NO:** current production SHA/config/schema/rollback and operational log-redaction acceptance require authorized current evidence; last recorded production is not freshly certified. No Render/provider action or deployment authorization is supplied. DB resource release remains independently NO with its existing gates unchanged; this candidate does not solve or import that scope. **SAFE TO DEPLOY: NO.**

Only original SECURITY.md receives this uncommitted evidence; candidate code/tests are committed locally. No manual/provider or mobile operational change, canonical count/status upgrade, routine CI PASS duplication, push or deployment. Exact next approval step: authorize candidate publication and scoped CI/build validation, with deployment approval remaining a separate decision.


## Published logging-only candidate validation — 2026-10-08

- [x] **Exact candidate/publication PASS:** `1f8d0f98fb16b9553ae03c474f5952c808928e48` has sole parent `d510b1ff97902704721060b4c1261657be3e4b76` and only the six logging/privacy code/test files listed above. Published only new branch [release-candidate/logging-only-1f8d0f9](https://github.com/JX-Technologies-Inc/Petalpal/tree/release-candidate/logging-only-1f8d0f9); remote ref verified at exact SHA. Original integration/main refs were not pushed. Candidate worktree is clean; its local dependency symlink was preserved beside it as `review-node_modules`. Existing 6/6 accepted local regressions reused, not rerun.
- [ ] **Exact-SHA GitHub CI — UNAVAILABLE:** GitHub content API returns 404 for security-regression.yml at the candidate SHA; exact-SHA Actions query returned no runs. The candidate's only source workflow, security-codeql.yml, filters pushes to integration, has no workflow_dispatch and retains its deferred Advanced gate. No repository settings/gate changed, PR created or wrong-ref dispatch attempted. Stop this verification path: integration CI is not candidate evidence. Smallest safe next step is separately approved validation-only CI wiring that explicitly checks out/verifies this exact candidate SHA, or a reviewed CI-only successor commit whose new SHA is validated; neither is performed here.
- [x] **Isolated Docker build PASS:** Linux/amd64 image `petalpal-logging-candidate:1f8d0f9-5_bzaadf`, image ID `sha256:b3dea392a1e3d5665d70861e96e52713f9e6f050f8dbd40566efa15eecb8904c`, built successfully from a git archive of exact committed candidate (no local env/dependency/generated files). Unchanged Dockerfile used only synthetic public VITE_FIREBASE_API_KEY and its existing localhost build-only database placeholder. Backend npm clean install/Prisma generation and web build completed; no migration or application CMD ran. Network-disabled ephemeral container with entrypoint overridden to `node --version` confirmed `v24.21.0`; that owned container was removed automatically. Existing containers/images were not targeted for mutation; the new image is retained. Detailed build log: `/var/folders/24/w5jj8rlx4dz065gbyzgv_xx00000gn/T/petalpal-logging-release-z8zlq9uo/docker-build.log`. This is build evidence, not application startup/runtime/provider acceptance.
- [x] **Schema/startup/rollback contract PASS:** Docker/start command, dependency manifests/locks, Prisma config/schema/migrations and DB runtime files remain byte-identical to production. Image CMD remains npm start; that command still includes migrations, so it was deliberately not executed. No new migration/schema/DB-limit change; rollback to exact base is schema-compatible.
- [ ] **Operational release gates remain:** candidate-specific GitHub CI, current production SHA/config/schema/rollback confirmation, controlled operational log-redaction/telemetry acceptance and explicit production deployment approval. DB resource release remains independently NO; candidate build success does not certify provider capacity, private production behavior or release approval. **SAFE TO DEPLOY: NO.**

Original SECURITY.md alone receives this uncommitted validation evidence; all prior checkpoints/history and canonical counts preserved. Manual checklist/MOBILE.md unchanged because no provider/manual or mobile operational change occurred. No routine CI PASS duplication, deployment, production connection/write, migration, CD, branch protection or existing container action. Next approval: authorize only candidate-specific CI validation wiring/execution; production approval remains separate.


## Exact logging-candidate CI wiring — 2026-10-08

- [x] **Existing workflow limitation resolved by scoped validation wiring:** the existing regression workflow cannot explicitly select another ref; the published candidate contains no regression workflow. New integration-only `logging-candidate-validation.yml` runs solely when its own workflow file is pushed on integration. It uses pinned official checkout/Node actions, contents:read, disabled persisted checkout credentials, a fixed candidate ref `1f8d0f98fb16b9553ae03c474f5952c808928e48`, 10-minute job / 2-minute test-step / 90-second child deadlines, no target inputs, provider secrets or deploy permissions. Candidate and main branches are not modified.
- [x] **Focused CI validation PASS (3/3 contract tests):** YAML trigger/ref/install/generation/permission contracts; selectors match exactly the four candidate logging tests and two changed auth diagnostics tests; runner rejects mismatched HEAD, env-file contamination, failures/timeouts/signals and zero/partial/skipped execution. Child environment strips inherited credentials/targets/NODE_OPTIONS and sets only synthetic test configuration with localhost:1 fixture DB and manual AI execution. Guard verifies checkout before installation and again before tests; logs distinguish workflow-trigger SHA from candidate source SHA. These are config/runner checks, not a local rerun of accepted application tests.
- [x] **Scoped syntax/diff PASS:** changed CI contract JavaScript and documentation diff checks pass (fourth focused check). Accepted six application tests and Docker build were not rerun locally.
- [x] **Real candidate execution PASS:** read-only GitHub Actions API observed [run 37870891575](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37870891575), triggered by integration workflow commit `dc6a9a253accdebc4c2e30ed69feb770e8a99470`. Its pinned source checkout is `1f8d0f98fb16b9553ae03c474f5952c808928e48`, independently asserted before installation and inside the test runner. Job 113628482346 and every checkout/verification/install/generation/test step completed success with no skipped step. The successful runner asserts exactly six tests/pass, zero fail/cancelled/skipped, so this is actual candidate-source 6/6 evidence, distinct from an integration test PASS. No migration or deployment. The preparation-pending state is superseded by this observed result; post-push evidence remains uncommitted to retain the requested single commit/push.
- [ ] **Release approval remains NO:** accepted isolated Docker build/schema/rollback evidence above is reused; current production SHA/config/schema/rollback confirmation, controlled operational log-redaction acceptance and separate deployment approval remain unresolved. DB resource candidate still independently NO. SAFE TO DEPLOY remains NO.

Original uncommitted release-classification/publication/build/CI records are preserved in this scoped workflow commit. Only workflow/config-test/documentation files change; no mobile/provider/manual procedure change or canonical count/status upgrade. Candidate-specific runtime result will be recorded separately after observation.


## Logging-only production preflight — 2026-10-08

- [x] **Check 1 — current Render metadata/settings PASS:** already-authenticated, read-only Render dashboard confirms PetalPal_v2 Last successfully deployed commit `d510b1ff97902704721060b4c1261657be3e4b76`, Live deployment `dep-db40qshsrm7s73agbdn0`. Service is Docker / Free, source main, Oregon; root directory blank, Dockerfile `./Dockerfile`, context `.`, Docker Command blank (uses image CMD), pre-deploy command unavailable/blank, auto-deploy Off and PR previews Off. No edit/deploy/credential control was activated. This confirms current service metadata, not application/DB health or candidate deployment.
- [x] **Check 2 — configuration/schema/startup source compatibility PASS within scope:** candidate and current confirmed live base have identical Dockerfile/ignore rules, manifests/locks, Prisma config/schema/migration tree and DB runtime integration. No new runtime variable is required. Environment page key-name-only read confirms existing FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_JSON, NODE_ENV and DATABASE_URL names; values were neither revealed nor recorded. Current startup remains npm start with the existing migrate-deploy command, which was not executed. Accepted image build, candidate CI 6/6 and schema-compatible rollback to exact base are reused without reruns.
- [ ] **Check 2 limitations — live state UNKNOWN:** masked secret/config values and linked configuration equivalence were not decrypted/compared; current live DB migration history/schema drift was not independently queried. Historical no-pending-migration evidence is retained, not reclassified as a new DB check. If release policy requires current DB-state certification, obtain specifically authorized read-only evidence; do not run migrations or reuse the blocked resource capacity investigation as this gate.
- [x] **Check 3 — candidate isolation PASS:** exact `1f8d0f98fb16b9553ae03c474f5952c808928e48` is a direct child of current Live base; six-file logging code/test diff only. DB adapter/social/error/AI files, startup/build/schema/manifests and monitoring retain production state; new resource/metrics/Journal libraries are absent. No DB limits, speech/Journal/mobile or other feature changes included. Accepted rollback evidence retained.
- [x] **Check 4 — bounded privacy-safe post-deployment plan defined, NOT EXECUTED:** after separate approval for exact candidate deployment, first confirm Render Live resolves to that SHA. Make at most three anonymous/read-only GETs, one each: `/session?logging_canary=logging-preflight-query-CANARY`, `/users/logging-preflight-owner-CANARY/garden`, and `/session` carrying an intentionally invalid synthetic JWT. Its unsigned/private-marker payload uses only synthetic `iss`/`aud`/`sub` strings and an invalid signature; no real token, account, email, secret or private content. Require generic 401 plus private no-store, capture each generated X-Request-ID and a short time window. In application security-event/diagnostic records for those IDs/window, require fixed `unmatched` route labels for global auth and allowlisted reasons; Firebase diagnostics may contain only configured public project ID plus fixed reason. Require no raw path/query/JWT-claim canaries, supplied token, provider message/stack or private text in those application records. Record pass/fail metadata only; do not copy tokens/raw logs. If logs are inaccessible or correlation ambiguous, mark UNKNOWN; if a canary leaks or status changes, stop and request a rollback decision to exact base rather than rolling back automatically. No authenticated/mutation/quota-saturation/AI/provider-admin experiment is included; production-only Admin-outage/owner-denial/limiter scenarios retain deterministic CI evidence and are not forced live.

**Remaining approval boundary:** no candidate deployment or post-deploy requests/log check occurred. Current metadata/source checks and accepted CI/build do not establish production redaction/telemetry acceptance, absence of live DB/config drift, or authorization to deploy. **SAFE TO DEPLOY: NO.** Next approval must name the exact candidate and existing Render service, retain settings, and separately authorize the bounded synthetic GET/log acceptance plan; resolve any required current-state/config attestation first. DB resource candidate remains independently NOT APPROVED.

SECURITY.md's existing uncommitted candidate-CI PASS and all historical records are preserved. Manual checklist records only the new read-only provider observation and pending bounded manual acceptance. MOBILE.md unchanged. No tests/builds, production DB connection/write, migration, provider-setting change, commit or push; documentation diff PASS, canonical counts/statuses unchanged.

## Final logging-only live-state attestation — 2026-10-08

- [x] **Relevant Render configuration PASS within scope:** authorized read-only dashboard comparison in memory confirms production NODE_ENV, parseable service-account JSON with the expected credential shape, and equality of its project_id with configured FIREBASE_PROJECT_ID. The page reports no linked environment groups. Only PASS/UNKNOWN results were returned; no configuration values, credential fields or fingerprints were recorded. Reveal controls were restored to masked state and the temporary tab closed. This supersedes the earlier masked-value limitation for these logging-related requirements; it does not certify credential validity, every environment/secret-file value, or historical running-process configuration. Accepted unchanged candidate configuration/startup contracts are reused; retain existing service configuration for deployment.
- [ ] **Current production migration/schema attestation UNKNOWN:** no already-authorized production read-only connection is available, as recorded in the existing access blocker. No production URL was retrieved, connection attempted, or blocked provider access retried. Missing non-secret evidence: a dated read-only production migration-history result showing matching applied migration names/checksums and no failed/unfinished migrations, plus compatibility/drift status against the unchanged candidate Prisma schema. Historical migration evidence and source equality do not establish current live state. Database resource capacity certification remains a separate excluded release, not a prerequisite introduced here.
- [x] **Accepted candidate evidence retained:** exact candidate `1f8d0f98fb16b9553ae03c474f5952c808928e48`, production base `d510b1ff97902704721060b4c1261657be3e4b76`, isolation/schema-compatible rollback, Docker build and exact-source GitHub run 37870891575 (6/6) are reused without reruns or additional source inspection.
- [x] **Pre/postdeployment boundary clarified:** current live DB attestation is an unresolved predeployment gate; separate human deployment approval is still required. The previously defined maximum-three synthetic GET/log-redaction acceptance plan remains mandatory **after** an approved deployment. Its unexecuted status is not a requirement to observe candidate production behavior before deployment. No synthetic request or log inspection occurred.

**READY FOR DEPLOYMENT APPROVAL: NO. SAFE TO DEPLOY: NO.** Next human action: supply the dated, non-secret production migration/schema attestation through existing authorized read-only access (or make an approved read-only connection available without sharing credentials in chat), then request separate approval for the exact candidate and the existing postdeployment acceptance plan. No release approval, deployment, provider/database mutation, tests/builds, commit or push. Existing uncommitted checkpoints, history and canonical counts remain unchanged.


## Logging-only migration/schema evidence — 2026-10-08

- [x] **User-observed evidence recorded, not independently verified:** user confirms Render DATABASE_URL matches Prisma Console connection URL and reports Prisma Studio SQL totals: 25 records, 25 completed, 0 unfinished, 0 rolled back. No URL, credential, user row or private data supplied/recorded. This establishes the reported aggregate result only; independently verified database identity and current migration names/checksums are unavailable. Earlier read-only 25/25 checksum PASS remains historical evidence for its recorded candidate/date.
- [x] **Exact candidate migration inventory PASS:** read committed SQL bytes from `1f8d0f98fb16b9553ae03c474f5952c808928e48`; exactly 25 migration.sql files, with SHA-256 checksums computed for comparison. Sanitized expected manifest retained outside the repository at `/var/folders/24/w5jj8rlx4dz065gbyzgv_xx00000gn/T/petalpal-logging-release-z8zlq9uo/logging-candidate-migration-checksums.tsv`.
- [x] **Candidate/deployed source compatibility PASS:** exact production `d510b1ff97902704721060b4c1261657be3e4b76` versus candidate has no diff in Prisma schema, full migration tree/lock, Prisma configuration, package manifest/lock, Dockerfile/ignore or lib/prisma.js. Startup remains `npx prisma migrate deploy && node server.js`, Docker CMD npm start; neither executed. Accepted CI 6/6, Docker, isolation/config and rollback evidence reused.
- [ ] **Current migration names/checksums UNKNOWN:** aggregates cannot detect different names, SQL checksums or duplicate/missing entries. Need all rows with only migration_name, checksum, completed and rolled_back from the user's already-authorized Console. Compare exact multiset against the candidate manifest; require 25 distinct matching names/checksums, completed=true and rolled_back=false for every row. Do not invent unavailable production checksums or claim the old verification is current.
- [ ] **Actual production schema drift UNKNOWN:** no current catalog/schema comparison supplied. Matching migration records alone would not prove absence of out-of-band DDL. The previously recorded EventMemoryEmbedding.updatedAt default discrepancy is historical, not a new live inspection or a drift PASS. Source compatibility above does not certify live schema equality.

Minimum SELECT-only query for the existing authorized Prisma Console (return the four sanitized columns and observation date; no logs, IDs, URLs, credentials or user data):

```sql
SELECT migration_name, checksum,
       finished_at IS NOT NULL AS completed,
       rolled_back_at IS NOT NULL AS rolled_back
FROM public."_prisma_migrations"
ORDER BY migration_name;
```

This query checks migration history only. A current sanitized read-only schema/catalog comparison is separate evidence if actual drift certification is required; no new production access or schema audit initiated. **READY FOR DEPLOYMENT APPROVAL: NO; SAFE TO DEPLOY: NO until separately approved.** Existing postdeployment synthetic logging acceptance remains mandatory after deployment, not a predeployment observation gate. Only these evidence/docs and the temporary expected manifest changed; history/uncommitted records and canonical counts preserved. No tests/builds, DB connection, migration, provider action, commit or push.


## Exact logging-candidate migration fingerprint — 2026-10-08

- [x] **Migration fingerprint PASS:** exact candidate `1f8d0f98fb16b9553ae03c474f5952c808928e48` contains 25 `prisma/migrations/*/migration.sql` files. Each SHA-256 uses original Git-object bytes; names sort ascending, `migration_name:sha256` rows join with newline and no trailing newline, then UTF-8 MD5. Local `94ad63fffa56c1c0e38db364b44ab88e` equals user-observed production `94ad63fffa56c1c0e38db364b44ab88e`. Required count 25 and exact fingerprint equality both PASS. This is a deterministic migration-ledger fingerprint comparison, not a cryptographic authenticity guarantee.
- [x] **Evidence attribution retained:** user locally reports Render/Prisma connection URL equality and 25 completed, 0 unfinished, 0 rolled-back migrations. Production identity/results were not independently queried; no provider connection or secret value accessed. Earlier current names/checksum comparison UNKNOWN is superseded within this user-observed fingerprint scope.
- [ ] **Actual production schema drift UNKNOWN:** fingerprint equality does not certify live tables, defaults, constraints or other out-of-band schema changes. Current independent read-only schema/catalog compatibility evidence remains missing; historical/source equality evidence is unchanged. No release approval; SAFE TO DEPLOY remains NO until separately approved. Existing postdeployment logging acceptance remains mandatory afterward, not a predeployment observation requirement.

All historical/uncommitted evidence and canonical counts preserved. No CI/tests/builds, production access, migration, deployment, branch/worktree change, commit or push.


## Logging-only release-specific schema compatibility decision — 2026-10-08

- [x] **Release-specific schema compatibility PASS:** targeted runtime delta from production `d510b1ff97902704721060b4c1261657be3e4b76` to candidate `1f8d0f98fb16b9553ae03c474f5952c808928e48` changes only diagnostic payloads/route labels and isolates console failure. No database query, model/column selection, write data, audit persistence, transaction, generated client, schema, migration or startup operation changes. The unchanged emitSecurityEvent sink serializes to console inside a catch; it performs no database read/write. Existing auth/profile reads and consent/deletion audit calls retain their production contracts. Accepted 25/25 user-observed migration fingerprint match, exact-source CI 6/6, image build, Render configuration and rollback evidence are reused without reruns.
- [x] **Known drift relevance resolved:** the documented pre-existing EventMemoryEmbedding.updatedAt CURRENT_TIMESTAMP default versus no Prisma default is outside the logging delta's dependencies. No changed SQL, embedding timestamp write or migration depends on it; its historical non-blocking classification is retained, not newly certified live. Unknown out-of-band drift could break existing unchanged database operations, but this candidate introduces no additional database shape requirement or schema transition. This is an incremental compatibility conclusion, not proof that the live database is healthy or drift-free.
- [ ] **Actual database drift certification remains UNKNOWN:** no independent current catalog comparison exists. Do not claim zero drift, independently verified production identity or general database-release readiness. No new catalog SELECT is needed to decide this specific delta's compatibility; broad drift certification remains separate. Earlier demands for a full-schema observation are narrowed for this release-specific decision under the current user request, not marked as satisfied. No explicitly mandated provider, migration/resource or general release gate is waived.

**READY FOR DEPLOYMENT APPROVAL: YES for this exact logging-only candidate, on the accepted point-in-time evidence. SAFE TO DEPLOY: NO until separately approved.** The earlier NO due solely to unresolved logging-only schema compatibility is superseded by this scoped decision; actual drift certification remains open. Residual risks are unchanged-schema/live-state divergence and unobserved candidate production logging behavior. Human approval must explicitly name the exact candidate and existing Render service/configuration; retain the mandatory bounded postdeployment synthetic GET/log-redaction acceptance and exact-base rollback plan. This is readiness to request approval, not release approval or deployment. DB resource candidate remains independently NOT APPROVED.

Only SECURITY.md appended. Existing uncommitted SECURITY.md/manual evidence, historical records and canonical counts preserved. No manual/provider evidence changed, so MANUAL_SECURITY_CHECKLIST.md and MOBILE.md unchanged. No CI/tests/builds, production access, schema query, migration, provider action, commit or push.


## Authorized logging-only deployment stopped before execution — 2026-10-08

- [x] **Fresh target/source precheck PASS:** authenticated Render dashboard confirms PetalPal_v2 / srv-d983eguq1p3s73fnk1m0 Live remains `d510b1ff97902704721060b4c1261657be3e4b76`, deployment dep-db40qshsrm7s73agbdn0. Approved candidate `1f8d0f98fb16b9553ae03c474f5952c808928e48` resolves exactly locally and on the dedicated remote candidate branch. Recorded Docker/root/context/command/auto-deploy/preview settings and 17 environment key names match; relevant production-mode/Firebase identity comparisons PASS, no pending-change notice. No settings edited. Accepted candidate tests/build/migration fingerprint and scoped schema evidence reused.
- [ ] **Deployment NOT EXECUTED — credential exposure blocker:** after read-only credential comparisons and restoring Show secret controls, a subsequent browser DOM snapshot still included the Firebase service-account JSON/private key in tool output. Visual masking did not remove the value from the DOM serialization. This was an agent handling error, not evidence of a candidate application-log leak. Stop immediately: only the Manual Deploy dropdown was opened; no specific commit selected or deployment triggered. Temporary browser tab closed without another snapshot. Do not repeat/copy the credential into documentation, commands or logs.
- [ ] **Required recovery before proceeding:** the exposed Firebase service-account key needs separately authorized provider rotation/revocation and production configuration revalidation. No rotation/provider change is authorized by this deployment request or performed here. A new safety blocker supersedes the prior readiness decision; retain previous production SHA for separately approved recovery. SAFE TO DEPLOY remains NO pending recovery and revalidation.
- [ ] **Startup/migrations and production acceptance NOT EXECUTED:** no candidate deployment, new startup observation, migration command, synthetic GET, application-log acceptance, automatic rollback, redeploy or retry. Operational logging redaction remains UNKNOWN; no PASS claimed. Current schema drift and prior point-in-time/user-observed limitations remain unchanged.

All historical/uncommitted evidence and canonical counts preserved. SECURITY.md and MANUAL_SECURITY_CHECKLIST.md appended; MOBILE.md unchanged. No source/candidate/main/environment-file/stash change, tests/builds, production database access or documentation commit/push; successful-verification commit condition was not met.


## Firebase snapshot exposure containment — 2026-10-08

- [x] **Actual scope confirmed, not limited to volatile agent context:** the prior browser DOM tool response contained complete Firebase service-account JSON/private key. Existing output metadata and a shape-only check of this exact task's local session record confirm persistence in three serialized records, including a tool-output record. No credential bytes, values, fingerprints or raw transcript were returned by the check. The response entered the agent/session processing path; downstream remote retention/additional copies remain UNKNOWN. Do not claim the credential was never transmitted, erased, or limited to memory. No public sharing, email or repository publication of the credential was observed in this task.
- [x] **Immediate containment:** the secret-bearing browser tab had already been closed; no Render/Firebase UI reopened, no secret inspection/reproduction, screenshot, clipboard/export or provider access performed during containment. Exact local session file ownership checked; group/other permissions were removed, leaving owner-only access. Contents/history retained without rewriting or deletion; this reduces local access but does not revoke a credential or erase remote copies.
- [x] **Scoped Git/artifact check:** integration HEAD remains dc6a9a253accdebc4c2e30ed69feb770e8a99470, index unchanged; only SECURITY.md/manual documentation modified. Added documentation contains no credential-shaped payload. Nine identified small, owned release-evidence/manifest files contain no complete private-key serialization. No snapshot-save/screenshot/export artifact was created by the exposure call. Pre-existing large build archive, directories, unrelated untracked files and environment files were not broadly scanned or modified. Thus no incident credential commit or separate owned temporary plaintext credential file was identified in the scoped check; this does not certify every local file. No temporary file was deleted; necessary sanitized audit evidence retained.
- [ ] **Rotation/revocation REQUIRED:** full private-key exposure and local session persistence are confirmed. An authorized human/provider workflow must securely replace the Firebase Admin credential used by Render and revoke the exposed IAM service-account key, with production configuration/authentication revalidation. Never send replacement credentials through chat or agent snapshots. No rotation/revocation or production-setting change performed; old-key validity/revocation status remains UNKNOWN.
- [ ] **Residual persistence UNKNOWN:** owner-only local session still contains the original credential; app/service copies and retention are not independently verified. Use supported application/provider controls for any further redaction/retention handling; do not erase unrelated history or claim guaranteed removal. Rotation is required regardless of retention cleanup. Deployment remains stopped until credential recovery and revalidation; previous production/rollback reference remains d510b1ff97902704721060b4c1261657be3e4b76.

SECURITY.md and MANUAL_SECURITY_CHECKLIST.md append sanitized containment findings; all historical/uncommitted evidence and canonical counts preserved. No deployment, production request, CI/test/build rerun, Graphify, provider/database mutation, commit or push.

## Architecture / compute reconciliation — 2026-10-08

Scoped source inspection at integration `d9d89e705f5fe5e63dd933c3b6066b06cdd17c3e`; accepted provider/test evidence reused, not recertified. Last observed production remains `d510b1ff97902704721060b4c1261657be3e4b76`; current live revision UNKNOWN after user-reported credential-recovery activity. No safe provider metadata connector is available in this session; no secret-bearing UI, credential extraction or production request was used.

| Component | Decision / evidence |
| --- | --- |
| Render API / in-process executor | KEEP: Firebase identity, authorization, business logic, job claims and shared PostgreSQL paid-call reservations. Accepted one-instance topology only. Report reservations cover retrieval plus one narrative call; embedding work skips current vectors before reserving/inferencing. |
| Prisma Postgres / Firebase | KEEP: owner-scoped customer data, reports/memory, durable jobs/reservations and verified identity respectively. No inference migration needed. |
| Cloudflare inference | KEEP: Llama emotion/report inference, BGE embeddings and Whisper speech through AI binding; provider-managed compute, underlying GPU allocation/quota UNKNOWN. Production embedding selection is Cloudflare; local Transformers import/model initialization is lazy and outside that selected path. |
| Cloudflare Queue / Cron | KEEP: opaque job IDs return to authenticated Render executor; source matches accepted inference/dispatch separation. One accepted production 20-minute Cron, batch/concurrency 1; staging Cron disabled. Reconciliation/transport redelivery does not itself establish duplicate paid inference; durable claims/reservations remain intact. |
| Local Natural classifier | OPTIMIZE LOCALLY, low-priority candidate only: server startup loads one memoized Bayes model; the inspected server has classifier assignment/test setter but no invocation. No expensive LLM/ONNX startup demonstrated here; removal is deferred without measured high impact. |
| Historical c-lite benchmark | UNKNOWN operational necessity: separate CPUExecutionProvider ONNX session, startup warmup/full benchmark enabled by default and manual POST benchmark. No customer-flow/provider-ledger dependency. Current image equivalence, access/external scheduling, instance inventory and cost remain UNKNOWN. No benchmark invoked or service altered. |

Embedding/profile/classifier and Cloudflare source/config files above are unchanged from the recorded production baseline. Worker deltas are logging/metrics, not a replacement execution boundary. No confirmed redundant paid inference, duplicate expensive model loading or unnecessary extra live instance was established. CPU/memory savings, billing and GPU quotas remain UNKNOWN. No migration is justified; moving reservations/execution would require fresh identity/owner/consent, latency, retention, secret and recovery evidence.

- [x] **Scoped reconciliation only:** no new high-impact defect with a demonstrated safe backward-compatible correction selected. No code/test/config changes or completed-suite reruns. Existing speech, logging, Journal and resource-limit work is not duplicated; canonical statuses/counts unchanged.
- [ ] **Credential recovery OPEN / all production releases BLOCKED:** user reports replacement credential created and Render update started; new-key runtime acceptance and exposed-key revocation are unconfirmed. Historical DB-credential revocation, native App Check, authenticated social acceptance and operational capacity/alerts retain their existing blockers.
- [ ] **Logging candidate remains separately scoped, BLOCKED:** `1f8d0f98fb16b9553ae03c474f5952c808928e48`; exact six files remain lib/auth.js, lib/rate-limit.js, lib/security-events.js, server.js, test/back/auth.test.js and test/back/logging-privacy.test.js. No dependency/schema/startup changes. Reuse accepted exact-source CI 6/6, isolated Docker build, 25/25 migration fingerprint and release-specific compatibility. Deployment/runtime acceptance UNKNOWN. After human credential closure, obtain current safe deployment metadata, check compatibility with that revision, then seek fresh exact-candidate/service approval. Authorized acceptance must cover startup, private logging, headers/auth denial and isolated authenticated behavior without raw logs/private data. Recorded rollback to d510b1ff97902704721060b4c1261657be3e4b76 is schema-compatible but must be reassessed against recovery state; no rollback authorized.
- [ ] **DB resource candidate independently BLOCKED:** `0ffdd3e26ab60e3dc470aa46f725d7b5cd795ec3`; production Prisma capacity/proxy and representative latency evidence still missing. Never combine it with the logging candidate or deploy integration HEAD.

Only this section and the manual credential-recovery checkpoint added; pre-existing evidence preserved. No analysis-only commit/push, CI trigger, migration, provider mutation or deployment.

## Unified Expo production candidate — local preparation, 2026-10-08

**SAFE TO MERGE INTO MAIN: NO. READY FOR DEPLOYMENT APPROVAL: NO.** This is local preparation, not deployment approval or full P0/P1 closure. All preceding evidence and canonical counts retain their original scope. Original integration worktree and its uncommitted documents are untouched.

- [x] Exact remote main `f2cde253aa1992c509d1497faf7750f5415eea5c`, integration `697c8031fd458c5b4817cbe16c41dcc75bf32f9a`; merge-base `bd4697180871e96f8d277f4f413a9e3c064eff84`. Main-only 3 commits modify README; integration-only 83. Isolated `release-preview/unified-main` preserves both histories with a pending no-commit merge. Its sole README conflict preserves main's product content and integration setup/documentation links; final staged tree differs from integration only in README. No main modification/publication. Protected malformed `main 2` blocks fetch; exact remote main was independently obtained through `ls-remote` and its object was already local. It was not repaired or touched.
- [x] Read-only Render Deploys metadata still shows exact Live `1f8d0f98fb16b9553ae03c474f5952c808928e48`, deployment `dep-db468kbbc2fs73ap2t70`, service `PetalPal_v2` / `srv-d983eguq1p3s73fnk1m0`; auto-deploy disabled. Existing workflows provide CI only; guarded Advanced CodeQL remains unchanged and inactive. No provider setting, credential, log, database or production request was accessed for validation.
- [x] One separate `release-candidate/unified-expo-web` worktree starts at that exact Live revision. Actual Expo source/assets are retained, not recreated in Vite. Same-origin API/Socket.IO selection, Firebase public defaults, AuthProvider/session/cache lifecycle, rendering/DPR/FPS/camera/cache code are unchanged. Garden Calendar, Bookhouse/Journal, Fairy, Friends/visits, Events, Reflection, profile/settings/themes remain the existing implementations. Existing catalog placeholders were not promoted to implemented features.

### Exact scope relative to Live

| Included slice | Files |
| --- | --- |
| Actual Expo build, HTTP shell and CSP | `.dockerignore`, `Dockerfile`, `mobile/package.json`, `lib/web-shell.js`, `lib/http-security.js`, `server.js`, `test/back/expo-web.test.js` |
| Accepted Speech admission | `lib/speech-transcription.js`, `test/back/speech-admission.test.js`, Speech-only hunks in `server.js`; original candidate `4036af3aee6462c916a56fb3eaed7ca9991cff72` retains its exact-SHA CI 7/7 evidence ([run 37882389953](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37882389953)) |
| Compatible Journal pagination | `lib/journal-pagination.js`, Journal hunks in `server.js`, `mobile/src/app/bookhouse.tsx`, `mobile/src/services/bookhouse.ts`, `mobile/test/bookhouse.test.mjs`, `mobile/test/journalPagination.test.mjs`, `test/back/journal-pagination.test.js` |
| Accepted stale-message refresh | `mobile/src/components/garden/planting/PlantingContext.tsx`, `mobile/src/components/garden/planting/flowerDetailData.ts`, `mobile/test/flowerDetail.test.mjs` |
| Reused CI plus isolated Expo export job | `.github/workflows/security-regression.yml`, `scripts/security-ci.js`, `test/security-ci.test.js`, `test/back/realtime-security.test.js`, `package.json` |
| Existing protections/history and operational delta | `AGENTS.md`, `WARNING.md` copied unchanged from current integration; existing `SECURITY.md`, `MANUAL_SECURITY_CHECKLIST.md`, `MOBILE.md` evidence preserved; new findings here and production-web operations in MOBILE only |

**Excluded:** DB resource candidate `0ffdd3e`, `lib/database-resources.js`, `lib/security-metrics.js`, dependent changes to Prisma/garden-access/http-errors/AI workers/security events/security-log/server monitoring startup; Garden/nested Message pagination; extra experiments/provider changes. Prisma schema, migrations, config and `npm start` contract exactly match Live. No migration execution or database query. Previously accepted 25/no-pending attestation and base-build evidence retain their scope.

### Security preservation matrix

“PRESERVED” means unchanged controls or focused local evidence, not new production certification.

| Boundary | Classification / evidence |
| --- | --- |
| Firebase verified identity | PRESERVED — verifier unchanged; public-config/synthetic browser flow only |
| Owner authorization | PRESERVED — API authentication unchanged; new Journal owner/cursor tests pass |
| Private Journal/Flower/Garden | PRESERVED — source projections and auth unchanged; shell returns no user data |
| Atomic friendship/privacy revocation | PRESERVED — existing PostgreSQL evidence reused; no database module change |
| AI consent/revocation cleanup | PRESERVED — unchanged implementation and accepted evidence |
| AI memory tenant isolation | PRESERVED — unchanged implementation and accepted evidence |
| Report claim/lease/final-write fences | PRESERVED — unchanged implementation and accepted evidence |
| AI quotas/reservation-before-provider | PRESERVED — unchanged implementation; no inference invoked |
| Speech bounded admission | PRESERVED — accepted exact-SHA 7/7, patch unchanged; anonymous combined HTTP rejection passes |
| Socket privacy/revocation | PRESERVED — backend/transport unchanged; corrected CI fixture retained |
| HTTP validation/headers/no-store | PRESERVED — 3/3 new real HTTP tests; allowlisted GET/HEAD shell only, API/writes still denied; shell-only WebAssembly allowance, no JavaScript eval/inline-script permission |
| Sensitive logging | PRESERVED source; production correlated-redaction/retention/alerting verification NOT VERIFIED |
| Account/cache lifecycle | PRESERVED — unchanged AuthProvider/cache logic, accepted native evidence, focused API/stale-response fixtures |
| Regression CI | PRESERVED infrastructure; unified exact-candidate GitHub execution NOT VERIFIED (unpublished) |
| AGENTS/WARNING | PRESERVED — byte-identical to current original integration protections |

### Focused verification and release gates

- [x] Actual Expo SDK 57 production export PASS (2,368 modules). Clean install from existing lock, dotenv disabled, synthetic public Firebase settings only. Export has 460 files / 210.5 MiB uncompressed; main JS 5.7 MiB. Pattern checks found zero private-key PEMs, Admin credential/module markers or database URLs in JS. No credentials were inspected. This is a bounded check, not a general secret-scanning certification.
- [x] Combined shell HTTP 3/3 PASS: real exported HTML/deep links/HEAD, JavaScript/WASM assets, no-store, anonymous API/write/preview denial and production route catalog. Relevant Journal/Bookhouse/route/render-quality/CI fixtures passed; initial missing-export test symlink was corrected without changing assertions. Updated CI contract 5/5 PASS. Changed-message/API fixtures pass (14 executions, including repeated imported fixture cases; not added to canonical security counts). Historical broad matrices, Speech 7/7, migration and unchanged base-build checks were not rerun.
- [x] Actual exported bundle in a fresh Chrome profile, 1280×900/DPR 2: synthetic Firebase sign-in/refresh, `/auth/session`, metadata session and owner Garden hydration PASS; Garden renders, Calendar opens, Bookhouse deep link and Fairy scene/navigation PASS. All identity/backend responses intercepted as fixtures, other external requests blocked; no production identities/data/providers. CanvasKit initializes; zero page errors/CSP violations. A fixture initially omitted Firebase refresh `access_token`; corrected fixture only, no app workaround. Screenshots and bounded local evidence remain beside the isolated worktree.
- [ ] Equivalent-viewport synthetic comparison against the existing localhost reference, populated-flower layering, complete interaction/FPS/latency and Safari/device parity remain NOT VERIFIED. Existing 8107 was neither opened nor restarted because it can resume production identity. No quality setting was reduced. Export size is a capacity/transfer risk, not a measured cost claim.
- [x] Candidate Docker build PASS, tagged locally `petalpal-unified-expo-local`; actual Expo builder and backend image stages completed. Synthetic public build argument only. No container startup, migration or production connection. Image `sha256:f3911c173afe471fe42df5992cec1a0dd87e79c0c3ed760377b03693dec9746f`, `linux/arm64`, 1,847,561,409 bytes; not an exact Render-platform CI/deployment certification.
- [ ] Exact combined-candidate CI remains unrun/unpublished. Existing workflow is extended locally with synthetic Expo export and HTTP/route checks; existing branch triggers and CodeQL Default remain unchanged. Candidate publication and scoped exact-SHA execution need approval; publishing this differently named branch alone does not trigger the integration-only push workflow. Main merge preview also has no exact merged-tree CI acceptance. Its README-only resolution passes whitespace checks; full staged diff retains pre-existing integration whitespace findings, without cleanup churn.
- [ ] Production DB capacity/proxy/latency limits remain unknown; blocked resource changes remain excluded. Single-instance Speech admission is not a multi-instance/global or proxy-buffering certification. Logging source controls do not establish full P0 telemetry closure. Credential replacement and old-key deletion remain USER-CONFIRMED PASS; old trace retention and unauthorized historical use remain UNKNOWN.

### One-deployment plan — not executed

After unresolved gates and separate publication/CI approval, nominate only the exact local checkpoint SHA for a **separately approved** single deployment to `PetalPal_v2` (`srv-d983eguq1p3s73fnk1m0`). Do not deploy main/integration HEAD. Rebuild its changed Docker frontend stage; retain existing backend image family, runtime settings, Cloudflare delegation and public Firebase build argument. Attest public key/app/project association without revealing values. Production web uses the Render HTTPS origin for API/Socket.IO; never copy 8107/LAN/port-3000 configuration. No new schema/migrations; existing startup migration contract is unchanged and must not be run here. Rollback reference is Live `1f8d0f98fb16b9553ae03c474f5952c808928e48` / its retained artifact, not an automatic action.

Post-approval acceptance: exact Live SHA and sanitized startup metadata; anonymous `/` plus shell assets/deep links, `/session?view=metadata` and harmless invalid-synthetic-bearer `/ai/reports` status/no-store/header checks; only safely request-correlated sanitized logging metadata. Feature acceptance must use a separately authorized identity/data scope: real login can link/write a profile, so it is not a non-mutating smoke test. Stop on mismatched SHA, startup/HTTP failure or safe-evidence unavailability; request separate recovery approval, never retry/rollback automatically. No merge, publication, deployment or provider mutation occurred in this task.

## Firebase old-key retirement assessment — 2026-10-08

**Replacement functionality: USER-CONFIRMED PASS. Exact exposed-key identity: UNKNOWN. Old-key retirement: OPEN.** User reports an October 8 replacement, Render updated/authentication working, and two older keys created August 25 and September 25 still listed. Listed does not establish enabled/disabled state, recent use or exposure identity. Historical inventory reviewed two service accounts and recorded an old Admin key removed plus zero Gemini keys; it cannot identify these two keys or establish a current complete inventory. Earlier deletion attestations are preserved but no longer support current closure. Trace retention and unauthorized historical use remain UNKNOWN; no trace was reopened.

| Dependency | Current evidence / classification |
| --- | --- |
| Render PetalPal backend | CONFIRMED Admin-credential consumer: `lib/auth.js` and `server.js` use `lib/firebase-admin.js` for revocation-aware token verification and account lookup/deletion. Replacement functionality is user-confirmed; dependency on either old key is UNKNOWN, not confirmed. No destructive account test is needed. |
| Other local/staging/backend copies and operator tools | POSSIBLE old-key consumers. Loader accepts `FIREBASE_SERVICE_ACCOUNT_JSON`, then paired `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`; absent explicit material, SDK default credentials may apply, including `GOOGLE_APPLICATION_CREDENTIALS`. Names show capability, not configured presence or a dated-key mapping. No values/files inspected. |
| Native security environment | Separate test project/credential required by accepted inventory and harness boundaries; not an expected consumer of production keys. Current external copies/configuration remain UNKNOWN; do not recreate or reconfigure it speculatively. |
| Web/Expo clients, CI, Cloudflare/AI worker | Reviewed design has no direct requirement for either Admin key: public Firebase client config/user sessions are separate; isolated security CI allowlists synthetic inputs; accepted Cloudflare AI/Queue and standalone AI-worker paths use their own execution/provider boundaries. Clients and jobs may depend indirectly on Render. This is not a global provider-secret inventory. |
| Untracked services, scheduled/manual jobs, old releases and other machines | UNKNOWN. Repository references cannot prove their absence, key choice or continued use. Existing Render authentication success does not prove these consumers migrated. |

**Human-only retirement sequence (recommendation, not performed):**

1. In non-secret IAM inventory and deployment-reference/version metadata, confirm the keys' project/service-account ownership, creation dates and enabled/disabled states. Obtain consumer-owner attestations and sanitized key-usage activity summaries where available; absence of activity alone is not proof of non-use. Keep identifiers/fingerprints and all secret values out of agent/chat output. Do not inspect credential JSON or the compromised trace to identify the exposed key.
2. Confirm each known consumer has a working replacement for the correct account. Keep the October 8 replacement and the service account itself. Any still-needed consumer migration is a separate human-authorized change; ordinary public Firebase client settings do not need rotation for this Admin-key retirement.
3. Retire a safely identified compromised key first. Otherwise prioritize the old key whose consumers are confirmed migrated/unused; if equally established, August 25 then September 25 is a procedural order only, not evidence of exposure or disuse. Promptly contain both possible exposed keys once consumers are covered; do not delay a known compromised key merely for age ordering.
4. Human operator disables one old key via the supported IAM CLI/API, then checks sanitized errors and separately authorized non-mutating authentication/Admin reads using an existing approved identity. Verify fresh credential acquisition and relevant scheduled/manual consumers over their actual token-cache/job cycles. Immediate success can reflect cached credentials; disabling a key does not invalidate already issued short-lived credentials. Do not disable the entire service account or re-enable a known/suspected compromised key to recover a broken consumer; repair that consumer's replacement configuration instead.
5. Once that key is no longer needed, delete it, retain only date/status/outcome evidence, and repeat for the other old key. No fixed waiting period or outage-free guarantee is established here. Mark retirement complete only after explicit confirmation for both dated keys; exposed-key identity and historical misuse may still remain UNKNOWN.

References: [Google key rotation](https://docs.cloud.google.com/iam/docs/key-rotation), [disable/delete sequence and cached-credential limitation](https://docs.cloud.google.com/iam/docs/keys-disable-enable), [usage metadata](https://docs.cloud.google.com/iam/docs/service-account-monitoring).

Only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md corrected; original uncommitted evidence/history and canonical counts preserved. No credential access, provider/deployment check, test/build rerun, key/provider/production change, commit or push. MOBILE.md and isolated release worktrees unchanged.

## Unified candidate continuation — exact-source CI, 2026-10-08

- [x] **Candidate integrity/publication PASS:** `efdeff5659b3317b2f57bba24155d952ec97b599`, parent Live logging `1f8d0f98fb16b9553ae03c474f5952c808928e48`, published unchanged to `release-validation/unified-expo-efdeff5`. Candidate worktree was clean; required Expo/backend build inputs remain present. Accepted auth/owner/AI/logging/Prisma controls and migrations are unchanged except the already reviewed HTTP/Speech/Journal slices. Blocked DB-resource and metrics modules remain absent. Existing metadata records Render main-only source with auto-deploy/previews off; scoped workflow review found no deployment action. No provider recheck or deployment.
- [x] **Actual exact-source GitHub CI PASS:** [run 37888054683](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37888054683), completed success. Workflow trigger SHA is `9b7611de311697a1db4442bc4fffc93ba5455ed7`; checkout/test SHA is **`efdeff5659b3317b2f57bba24155d952ec97b599`**. Both `Isolated security baseline` and `Isolated Expo web boundary` passed every step, including pre-install exact-HEAD assertions, selected security/loopback DAST, actual Expo export and combined HTTP/route tests. No historical integration PASS substituted.
- [x] **CI-only trigger change:** one integration commit changes only `.github/workflows/security-regression.yml` and `test/security-ci.test.js`; original dirty documentation excluded. The explicit validation commit marker selects the fixed candidate; an early guard requires its trigger diff to contain only those two CI files, failing before install otherwise. Ordinary push/PR/dispatch checks still select `github.sha`. Read-only permissions, pinned actions, no persisted checkout credentials, 15-minute jobs, synthetic environment and no production secrets/providers retained. CodeQL Default/guarded Advanced unchanged; no CD. Two changed local CI-contract cases passed after YAML-expression quoting correction. No local Docker/export or accepted historical matrices rerun.
- [x] **Source preservation/public configuration contract PASS:** candidate `mobile/src`, assets and bootstrap match reviewed integration `697c8031` byte-for-byte. Thus no new per-frame rendering/state/cache code was introduced. Docker disables dotenv and maps only the existing public web Firebase build argument to the Expo public API-key variable; public project/auth-domain/app-id defaults remain the intended existing app. Production API fallback is same-origin, while port 3000 is development-only. AuthProvider/session/registration/login sources are unchanged. Reuse accepted no-Admin-bundle, CSP/static/deep-link and session evidence; synthetic CI is not actual production configuration attestation.
- [x] **Additional bounded browser observations:** reused existing exported bundle and synthetic browser harness, with six fixture Flowers, no real identities/data or outgoing provider calls. At 1280×900 and 390×844, browser DPR remained 2; narrow document had no horizontal overflow and navigation remained visible. Fairy changed position/pose after one path click and showed walking state. No page errors or CSP violations. Prior Calendar/Bookhouse/login acceptance reused. Temporary browser/server closed; no existing environment restarted.
- [ ] **Visual/performance PARTIAL:** supplied fixture Flowers did not establish visible confirmed-placement/z-order acceptance; no Flower layering PASS claimed. Reference port 8107 has no listener, so exact reference comparison is unavailable without restarting it (not performed). Browser DPR 2 alone does not prove render-buffer parity: observed wide canvas backing 2385×1677 for 1280×900 CSS. Quality settings were untouched. Full animation smoothness, rendered FPS, static reconstruction costs and comparable placed-flower/pan/zoom behavior remain NOT VERIFIED; source equivalence is not runtime performance measurement.
- [ ] **Small human parity procedure:** when an approved synthetic reference is available, use the same persisted approved Flower placements in fresh fixture-only reference/candidate profiles at 1280×900 and 390×844, DPR 2. Compare anchors/overlap during pan/zoom, Fairy movement/pose, render-buffer dimensions and rendered frame timings/static-cache reuse without changing quality. Return scoped PASS/FAIL only, no production identity/data. Existing Calendar/Bookhouse checks need not be repeated.
- [ ] **Public Firebase/API configuration PARTIAL:** human operator must return only PASS/FAIL that the production build's public key belongs to the intended existing registered Firebase JS app/project, its public domain/app identity matches the retained defaults, and exported API/Socket routing resolves to the intended HTTPS origin (same-origin under this Docker contract). Do not share any key or inspect secret pages with an agent. No actual candidate deployment/configuration is inferred from synthetic export; stop this verification at that missing attestation.
- [ ] **Separate production security blocker:** latest user report says BOTH August 25 and September 25 Admin keys remain **Active**. This supersedes prior unknown-enabled-state and complete exposed-key deletion claims. Replacement functionality remains USER-CONFIRMED PASS, but exact compromised-key identity/revocation remain UNKNOWN. Root retirement assessment/checklist governs current status; immutable candidate documentation contains historical attestations, not current retirement certification. No trace/key inspection or key action. This does not block credential-free CI; it does block production release approval.
- [ ] **Merge distinction/readiness:** existing preview still has no unresolved conflicts and differs from reviewed integration `697c8031` only by its preserved README resolution. It remains an uncommitted main+integration preview, not the production-based candidate; it also predates the new CI-only `9b7611d` commit and has no exact merged-tree CI/build certification. **SAFE TO MERGE INTO MAIN: NO. READY FOR PRODUCTION DEPLOYMENT APPROVAL: NO.** Main and preview untouched; no merge/PR/deployment/provider/database mutation. Canonical counts and all earlier documentation preserved. Only current CI changes were committed/pushed; new evidence remains in the existing dirty root documents. MOBILE.md/AGENTS.md/WARNING.md unchanged.

## Unified release continuation — local renderer correction and current gates, 2026-10-08

- [x] **Dated old-key retirement USER-CONFIRMED PASS:** user explicitly confirms August 25 DELETED, September 25 DELETED, October 8 replacement RETAINED. This supersedes the earlier Active/open-retirement blocker, preserving all historical exposure/inventory records. No independent provider/key verification occurred. Retained does not prove active/current functionality: the user confirms replacement authentication previously worked but has NOT been retested after old-key deletion.
- [ ] **Production credential readiness UNKNOWN.** Exact exposed-key identity, prior tool-trace retention and unauthorized historical use remain UNKNOWN. No key investigation repeated, trace reopened, credential/secret page accessed or provider action performed.
- [x] **Actual release-default defect corrected locally:** `productionGrowth.ts` selected the approved monthly Flower renderer only under `__DEV__`, making the production export use legacy Flower rendering despite identical frontend source. The default now enables the same renderer in both modes; existing DEV recovery controls, placements/collision rules and quality settings are unchanged. The correction and a release-default assertion are present, uncommitted, in integration and the candidate; the refreshed preview stages the same renderer/test files. Candidate/preview CI also includes the affected Flower test, with two updated workflow-contract checks PASS; ordinary exact-revision checkout, scoped triggers, pinned actions and read-only permissions remain intact. The one affected `productionGrowthRendering.test.mjs` passes release drawing, June/foreground pass selection, no planting-mask clipping, placement/preview identity and hit mapping.
- [x] **New affected export/browser evidence:** produced a separate dotenv-disabled, synthetic-public-config export solely for this renderer correction; the accepted export and published candidate remain intact. Fresh isolated browser/loopback static server used six validator-approved, locally persisted synthetic Tulips (three June, three October), with provider/API traffic intercepted. Screenshots show Flowers on both lands and anchored through pan/zoom; stored coordinates remain byte-identical. DPR 2 at 1280×900 and 390×844, no page errors. This is renderer evidence, not repeated backend/CSP or real Firebase acceptance. Owned browser/server closed. Evidence: `confirmed-flowers-{wide,panzoom,narrow}.png`, `confirmed-flowers-result.txt` under the existing isolated release directory.
- [x] **Bounded performance observations:** unchanged AUTO quality; wide backing 2385×1677, narrow 780×1688. Approximately five-second samples measured CanvasKit surface-flush cadence: wide idle 26.4 Hz (p95 interval 53.6 ms), wide pan/zoom 20.6 Hz (p95 62.6 ms), narrow idle 59.9 Hz (p95 17.3 ms). Instrumented recording observed only root-picture bounds during these samples, with no static-picture reconstruction. Flush cadence is not GPU completion or a production FPS/SLA claim.
- [ ] **Visual/performance parity remains PARTIAL:** port 8107 has no listener; no restart/recreation attempted. Matched independent reference, exact overlap/occlusion comparison and performance non-regression remain unverified. Wide headless cadence is a remaining performance concern, not proof of a regression. Do not reduce quality or claim parity from source identity. Earlier Calendar/Bookhouse/Fairy acceptance remains reused.
- [x] **Public configuration contracts SOURCE-LEVEL PASS:** retained Docker public build argument/Expo mapping, dotenv-disabled build, production same-origin API fallback, Socket.IO same-origin fallback with fresh token callback, and AuthProvider verified-identity/session/cache-scope ordering. New synthetic bundle requests `/auth/session`, `/session` and Garden metadata on its own loopback origin. No localhost development fallback is being asserted as production configuration.
- [ ] **Production public configuration PARTIAL:** user explicitly reports intended existing Firebase Web App/project binding NOT YET VERIFIED and deployed API/Socket configuration NOT YET VERIFIED. Intended production origin is `https://petalpal-v2.onrender.com`. Do not infer actual public-key/app binding from synthetic CI or inspect values to close this gate.
- [x] **Current merge preview refreshed:** read-only remote refs remain main `f2cde253aa1992c509d1497faf7750f5415eea5c`, integration `9b7611de311697a1db4442bc4fffc93ba5455ed7`. Existing `release-preview/unified-main` now has the latter MERGE_HEAD, zero unresolved conflicts and the exact previous README resolution. Prior staged tree preserved in the existing release directory before refresh. The initial ref refresh differed from integration only by the preserved README resolution; subsequent scoped release reconciliation below also applies the reviewed candidate runtime, renderer/CI correction and current security documentation. No merge commit or main-ref change.
- [x] **Local merge/release scope reconciled:** preview production Docker/context, backend/AI/worker code, Expo frontend/public assets and Prisma inputs now match the accepted unified candidate except the single renderer-default correction. Explicitly restored the reviewed Expo build/shell/CSP boundaries, removed blocked DB-resource/dependent monitoring modules and their two tests from the preview, and restored the candidate's ordinary exact-revision security/Expo workflow plus the new Flower check. No runtime imports of the excluded modules remain. Integration retains the experimental code and all histories; preview retains modern frontend/backend/AI, the existing README resolution, additional integration evidence/tests and separate logging/Speech CI workflows. Applicable logging, Speech, Journal, social authorization, AI consent/cost controls remain unchanged from the accepted candidate. Unfinished Garden/Message pagination remains excluded; Journal pagination stays in scope. No security status/count upgraded to fully VERIFIED.
- [x] **Accepted evidence retained:** published `efdeff5659b3317b2f57bba24155d952ec97b599` / `release-validation/unified-expo-efdeff5` and exact-source GitHub run [37888054683](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37888054683), both jobs PASS. That PASS covers the immutable baseline, NOT the new uncommitted renderer correction or main merge tree. Docker, historical security/PostgreSQL/migration suites and provider investigations were not repeated.
- [ ] **Not ready for main merge or production approval:** close the reference/performance, public-binding/post-deletion-authentication and changed-source CI gates. The uncommitted preview is not an exact merge-SHA GitHub certification. New patch/docs remain local; no commit/push, deployment, main merge, SQL/migration or provider mutation. Existing dirty evidence, canonical counts, unrelated files/worktrees/stash and `main 2` preserved. MOBILE.md unchanged: no setup/procedure changed.

### Deployed production authentication — USER-CONFIRMED PASS, 2026-10-08

- [x] User successfully signed in to `https://petalpal-v2.onrender.com/` and entered the existing Garden after deleting both August 25/September 25 Admin keys and retaining the October 8 replacement. **Current deployed production authentication: USER-CONFIRMED PASS**, not independently tool-verified. This supersedes the preceding post-deletion authentication UNKNOWN gate only. No new Live SHA or independent fresh Admin-credential acquisition is inferred.
- [ ] The **undeployed unified Expo Web candidate's Firebase Web App/public API/Socket binding remains NOT VERIFIED**. Successful authentication on the currently deployed version does not certify this candidate.
- [ ] Exact exposed-key identity, unauthorized historical use and tool-trace retention remain UNKNOWN; all incident history and canonical counts retained. No key/trace/secret inspection or provider action.
- [ ] Final unified release still requires matched-reference Flower/performance evidence, candidate public configuration confirmation and exact-SHA CI for the final changed tree. The local Monthly Flower renderer fix, scoped passing test/export/workflow evidence and reconciled uncommitted merge preview are retained. GitHub run 37888054683 remains accepted for immutable `efdeff5659b3317b2f57bba24155d952ec97b599`, not the local successor changes. No test/build rerun, commit/push, main merge or deployment.

## Final local unified candidate preparation — 2026-10-08

- [x] Reconciled the existing production-based candidate with current integration evidence: preserved the resolved main README, logging/Speech validation workflows, rendering-injection and Garden verification tests, and updated isolated social/realtime verification harnesses. These are unchanged accepted integration files, not new production operations. Consolidated historical security evidence without repeating authentication investigation or changing canonical counts.
- [x] Monthly Flower production default, its affected rendering test and CI invocation remain intact. Existing corrected synthetic export/browser results and two workflow-contract PASS results are reused. The accepted GitHub run 37888054683 remains specific to baseline `efdeff5659b3317b2f57bba24155d952ec97b599`; final successor exact-SHA GitHub CI is still required and has not been triggered.
- [x] Found and removed the remaining root Vite build entry points: `npm run build` now exports Expo with dotenv disabled and replaces generated Express `client/dist` only after export success; `build:client` aliases it. Docker's accepted Expo-only build remains unchanged. One new isolated command test PASS: a stubbed export proves failure preserves prior output, success removes stale Vite assets and installs Expo output, with no package install/export/provider/database call. MOBILE.md records this actual build-operation change. Legacy source/tests remain in Git, not selected by release build entry points.
- [x] Exact local production scope retains logging, Speech, Journal (including accepted Journal pagination), social authorization and AI consent/cost controls. Backend/Prisma/source assets remain byte-identical to accepted unified baseline; only the Monthly Flower renderer default changes product source. Blocked DB-resource/dependent metrics modules and imports are absent; Garden/Message pagination changes remain excluded. Existing unbounded Garden/Message result-size and DB-capacity risks therefore remain open, not silently fixed.
- [x] Safe source comparison confirms public project/auth-domain defaults and matching legacy registered app identity, dotenv-disabled Expo build, production same-origin API/Socket fallback, fresh socket-token callback and AuthProvider identity/cache-scope ordering. No credentials/env values accessed. Actual provider-side Firebase binding for this undeployed candidate remains UNKNOWN; deployed authentication evidence does not certify it.
- [ ] Flower visual/occlusion/performance parity remains PARTIAL. Recorded approved checkpoint/reference and performance-output paths are absent in both original repository locations; retained documentation reports historical computation/stub benchmarks, not a matched DPR-2 browser baseline. Existing six-placement screenshots and bounded flush/recording observations are retained, not rerun or upgraded. Human check: in an approved synthetic reference and candidate, use identical saved Flowers at 1280×900 and 390×844, DPR 2; compare June Tea Set overlap, foreground order, anchors through pan/zoom, backing dimensions and frame timings at unchanged quality. Do not restart 8107 or use private Garden data.
- [ ] Local candidate is ready for review/publication approval, not deployment/main merge approval: matched-reference check, provider-side public binding and final exact-SHA CI remain open. No historical suite, Expo/Docker rebuild, authentication/provider investigation, remote push, main merge, service restart or database action performed. Final commit/tree identifiers are reported separately because a commit cannot contain its own identifier.

## Garden preview rejection — production artwork gate correction, 2026-10-08

- [ ] **Visual acceptance stopped; not PASS.** User rejected the c175458 synthetic preview. Exact candidate CI run 37893166937 remains accepted for its tested scope, but does not certify Garden visual parity. Candidate c17545845bb38650477a3270f2bd9198e0739119 / tree 5056c9a7c9e5480c8c60167101ea43d0950d39aa remains unchanged.
- [x] **Production rendering defect confirmed:** GardenScene guarded GardenLand09InterfaceLayer, GardenInfrastructureLayer and GardenRoadApproachLayer with __DEV__, omitting approved bridges, road paving and entrance interfaces in production. Resources/garden/APPROVED_CIRCULATION_FINAL.md locks this artwork; available infrastructure_mobile_review on/off images corroborate the omissions. This is not solely a synthetic fixture mismatch.
- [x] **Separate local correction:** fix/garden-production-artwork-c175458 removes only those production exclusions, preserving layer order, artwork/transforms, Monthly Flower rendering, water, camera, effects and quality settings. Legacy infrastructure-off fallback remains DEV-only. New executable JSX-gate regressions reproduced two failures before correction and pass 3/3 afterward. A synthetic-only production export succeeds; no historical CI/security matrix was repeated.
- [x] **Controlled before/after observation:** fresh isolated profiles, root Garden route, 1280x900 CSS, DPR 2, six identical saved synthetic Flower anchors, source-default camera (0,0), zoom 1. Both canvases are 1280x900 CSS / 2385x1677 backing, with zero page errors/external requests. Screenshots show restored bridges/paving/entrance layers. Browser DPR and existing AUTO backing policy were unchanged; this is not a performance-parity claim. Diagnostic preview http://127.0.0.1:49490/ serves the corrected export with the same isolated fixture harness; prior preview and 8107 were not restarted.
- [ ] **Reference and remaining differences:** available infrastructure review PNGs lack matched viewport/DPR/camera/fixture metadata. Linked Resources/garden/checkpoints/APPROVED_MAIN_ENTRANCE_FINAL_V1_2026-09-24_122031 and output/flower-visual-checkpoints/PRODUCTION_GROWTH_V1_1_VISUAL_APPROVED/reference.json are absent. Need the user's accepted Garden capture/checkpoint with route, viewport, DPR 2, camera transform/zoom, calibration/settings and synthetic fixture placements for an exact comparison. The preview bootstrap changes only synthetic auth/API/placements/banner, not terrain, water or camera. Water shader/assets and camera fit (2400x1800 world, centered fit, initial zoom 1) match integration source; no evidence yet explains the user's remaining colour/framing differences. Do not attribute them to viewport/fixtures by assumption. Full visual/performance parity remains PARTIAL and release readiness remains blocked; no main merge, push or production deployment.

### Corrected Garden preview — USER-CONFIRMED visual recovery, 2026-10-08

- [x] The user successfully signed into the corrected local synthetic preview and confirmed restoration of the previously missing Garden artwork and overall appearance. This is **USER-CONFIRMED visual recovery for the inspected preview**, superseding the unresolved human appearance check above; it is not independently verified full visual/performance parity or production authentication evidence.
- [x] Preserve production artwork correction `57bc31c9bab82fceea9b47cab8689fb5a363220d`, the Monthly Flower fix, approved assets, layer order and rendering quality. The updated local release is based on CI-passed `c17545845bb38650477a3270f2bd9198e0739119`; its only additional product change is the three approved artwork gates. Reuse the correction's 3/3 affected-test PASS and synthetic production export; this documentation update changes no executable code and requires no test rerun.
- [ ] Matched-reference visual/occlusion/performance parity remains **PARTIAL**, pending objective matched-reference evidence. Undeployed production Firebase/public build binding remains **UNKNOWN**; source-level same-origin API/Socket evidence remains accepted. Final exact-commit/tree CI awaits explicit authorization and must include `mobile/test/gardenProductionArtwork.test.mjs`; run 37893166937 certifies only c175458, not this successor. No merge/deployment readiness PASS, remote push, provider change or service restart is implied.


## Unified Garden candidate — exact-source GitHub CI, 2026-10-09

- [x] **Candidate integrity PASS:** existing clean candidate `902f34a45f7a2ad6f31c5049bf4fa41d86a25dc8`, tree `261c5c2a36a6bce1ab914a8107ba1fe2b2a97679`, published unchanged to `release-validation/unified-expo-902f34a`. Relative to CI-passed `c175458`, the only product delta is the three approved Garden artwork gates; the existing artwork regression and documentation account for the other changes. Monthly Flower production default, original assets, quality/camera/Fairy implementation, Expo production entry points and accepted security protections remain preserved. Blocked DB-resource/dependent monitoring and unfinished Garden/Message pagination remain excluded; no security closure is implied.
- [x] **Dedicated CI-only runner PASS:** `release-validation/unified-expo-902f34a-ci`, runner commit `7100a8dca7d0a06b1dbe4714af46f8e575f35e3c`, changes only `.github/workflows/security-regression.yml`. Reuses the prior c175458 runner, pins/asserts the candidate full commit and computed tree in both jobs, and adds the existing Garden artwork regression. Read-only contents permission, pinned actions, no persisted checkout credentials, isolated synthetic configuration and no deployment steps retained. Scoped GitHub workflow/deployment metadata showed no new production trigger; accepted provider settings were reused without a provider re-audit.
- [x] **Exact-source GitHub CI PASS:** [run 37902827021](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/37902827021) completed successfully. Both candidate commit/tree assertion steps, Security baseline/CI contract, Monthly Flower rendering regression, Garden production artwork regression, actual Expo production export and combined HTTP/Expo route boundaries succeeded. GitHub run HEAD is the runner commit above, not the candidate under test. No unrelated local suite, real identity, production database, paid AI call or deployment was used.
- [ ] **Remaining release gates:** user-confirmed corrected synthetic Garden visual recovery remains accepted. Matched-reference visual/occlusion/performance parity remains PARTIAL: matching historical camera/viewport/fixtures are unavailable; full FPS/latency/interaction and Safari/device parity are unverified. Production Firebase Web App/build binding remains UNKNOWN; same-origin API/Socket source contracts remain accepted, not production-artifact runtime confirmation. Human-only comparison of the intended release build against the intended registered Web App/project and authorized origin must return only PASS/FAIL, without configuration values. API and Socket.IO origins must resolve to the intended production origin with no development override; an authenticated runtime test needs a separately authorized test identity.
- [ ] **Main merge readiness:** current candidate CI does not certify an actual merged tree. Under separate authorization, reconcile the latest main with the approved release scope in an isolated merge candidate, review all resulting differences/conflict resolutions and exclusions, and run exact merged-commit/tree scoped Security + Expo/Garden/HTTP validation plus production-container build verification for the target platform. Do not merge main or deploy from this record. **SAFE TO MERGE MAIN: NO. READY FOR PRODUCTION DEPLOYMENT APPROVAL: NO.** Historical credential/trace-retention uncertainty and remaining P0 findings are unchanged.

This evidence is retained as an uncommitted SECURITY.md append in the separate CI worktree so the tested candidate and both published branch identities remain unchanged. No manual/provider status or mobile operations changed; MANUAL_SECURITY_CHECKLIST.md and MOBILE.md are unchanged.


## Isolated final main merge preparation — 2026-10-09

- [x] Reused the existing conflict-free, scope-reconciled preview index (tree `5056c9a7c9e5480c8c60167101ea43d0950d39aa`) as local checkpoint `d83f925f1c23109f4b8b1ecc05943c96e11895ee`, with parents current remote main `f2cde253aa1992c509d1497faf7750f5415eea5c` and integration `9b7611de311697a1db4442bc4fffc93ba5455ed7`. Original preview, local main (36 commits behind remote main), recovery refs and integration remain untouched. Existing README resolution is retained.
- [x] Merged approved candidate `902f34a45f7a2ad6f31c5049bf4fa41d86a25dc8` into that isolated checkpoint. Only SECURITY.md and MANUAL_SECURITY_CHECKLIST.md conflicted; preview versions are exact prefixes of approved history, so the approved full histories resolve both without losing records. Preserved the separately uncommitted exact-source CI evidence by copying its append into this candidate while leaving the original file untouched. All other tracked files exactly match the CI-passed candidate, including workflows, tests, build inputs, Expo assets and application/backend/AI/security source. No new executable behavior or newly affected test exists.
- [x] Reuse exact-source CI run 37902827021 for unchanged Security + Expo/Garden/HTTP tests; do not rerun historical suites. Existing excluded DB-resource/monitoring modules, unfinished Garden/Message pagination and Vite deployment entry points remain excluded. No provider/database operation, remote push, main update or existing-service restart is authorized or performed.
- [ ] Target-platform production-container build verification is recorded separately against this final commit/tree after checkpoint creation; previous arm64 build evidence does not certify amd64. Production Firebase Web App binding remains UNKNOWN. User-confirmed Garden recovery is accepted; objective matched-reference visual/performance parity remains PARTIAL. Deployment remains blocked pending those release gates and separate approval.


## 2026-10-09 — Local Cloudflare frontend / Render backend split

**Scope:** isolated `codex/cloudflare-frontend-migration` branch from approved
main `49ea26a6bd9867d5b2c65ca56b4d3e917c5d24a3` / tree
`952ffb9ff59c382de6623acbcab0fec990d17a51`. Accepted exact-source CI 37902827021,
Docker and human Firebase evidence reused. Render build OOM above 8 GB is a user
attestation, not a newly inspected provider log. No push, deployment, provider
mutation, database operation or production identity used.

- **Static boundary PASS (local):** actual Expo single-page production export,
  Cloudflare workerd routing, deep links, JS/CSS/WASM MIME, CSP and browser sign-in
  screen. API/missing-asset/debug paths are not rewritten to HTML. The Worker
  serves static files only; authenticated/private calls go directly to Render.
  HTML/errors and Authorization/Cookie-bearing static requests are no-store.
- **Cross-origin boundary PASS (synthetic):** actual Chromium preflight and
  readable 200/401/403 responses; exact allowed origins, no wildcard. Existing
  token/owner checks reject another owner. Actual Socket.IO polling, direct WS,
  polling-to-WS upgrade, event acknowledgements and refreshed-token reconnect
  pass; denied origins and invalid tokens fail. Engine.IO now applies the same
  allowlist to WS handshake admission. Backend proxy trust is unchanged.
- **Firebase contract PASS, production login NOT VERIFIED:** AuthProvider
  hydration/logout and client bearer refresh preserve existing semantics under
  synthetic identities. Existing project/Web App/Admin configuration is reused
  by attestation, never inspected. New exact frontend domains and return URLs
  require human approval; persistence does not transfer between browser origins.
- **Artwork/source integrity PASS:** no mobile product source/assets changed.
  Exported Garden/Bookhouse/Reflection PNGs match source bytes. 460 exported files,
  220,673,039 total bytes, largest 8,076,553 bytes, within checked Workers static
  asset limits. Prior visual recovery stands; objective performance parity PARTIAL.
- **Focused validation:** 10 tests passed, plus offline Wrangler packaging dry-run.
  No historical PostgreSQL/DAST/AI/iPhone suites rerun. Test identities and database
  method stubs are local; no real Firebase, database or paid inference contacted.
- **Backend Docker build PASS:** linux/amd64, no Expo install/export, no web/Firebase
  build argument. Allowed context 4.19 MB; image 827,814,439 bytes. Production
  dependency lock, Prisma schema/migrations, startup and backend runtime preserved
  except Socket origin admission. No frontend/artwork in this image. Peak Docker
  build RAM and matched old/new build-memory reduction remain UNMEASURED; context
  and image sizes are not RAM measurements. Subsequent test-runner-only package
  script edits do not alter dependencies/postinstall/startup or runtime sources.
- **Transition gate:** existing Dockerfile and Express frontend serving remain
  unchanged. Opt-in backend-only deployment is blocked until the approved old-
  origin traffic disposition. A separate transition image can layer a reviewed
  prebuilt frontend on the backend image outside Render without invoking Expo.
- **Automation gate:** new workflow is manually dispatched, builds/tests/uploads
  artifacts only, with no cloud deploy credentials/step. Wrangler public domains,
  version URLs and custom routes are disabled. Preview resource/Access, exact
  CORS/Firebase domains, app.jastrevia.com and live compatibility are still human
  gates. Existing AI Workers/company site/production settings remain unchanged.
- **Tooling limitation:** requested `graphify update .` could not run because the
  executable is unavailable. No generated graph or historical evidence changed.

See `docs/cloudflare-web-migration.md` for staging, externally built transition
image, ordered cutover and independent frontend/backend rollback. Local tests do
not certify provider-edge behavior, real sign-in or a current Live revision.


**Container validation/storage limitation:** after the successful backend-only
image build (exit 0), Docker reported `Internal: input/output error` at the end
of the separate transition-image export (exit 100). That transition build is NOT
marked PASS. The backend-image smoke command returned exit 125 while extracting
an image layer, also with an I/O error; it never reached application execution.
The host then reported no free disk space. Only this task's generated
`client/dist` and installed backend `node_modules` were removed to save source
and evidence; the synthetic Expo export is retained. No Docker daemon restart,
prune, existing-container stop or rebuild retry was performed. Native
Node/workerd/Chromium tests passed independently. A healthy isolated Docker host
must verify the final candidate image runtime and transition assembly before any
provider deployment is approved. Image build success alone is not runtime PASS.

### Migration continuation — 2026-10-09

- **Storage capacity restored; image/runtime BLOCKED:** read-only checks found
  about 30 GiB host free space and 24 GiB free in Colima. Docker 29.5.2 and Colima
  respond, but inspecting the retained backend image still fails with containerd
  blob I/O errors; the recorded config ID is unavailable. No container smoke,
  rebuild, restart, prune or existing-container mutation was attempted this turn.
  Prior image build PASS does not establish runtime PASS. Build RAM is UNKNOWN.
- **Two missing checks PASS:** Chromium exercised real cross-origin Socket.IO
  polling, WebSocket upgrade, refreshed synthetic-token reconnect, invalid-token
  rejection, denied polling/WS origins, CSP enforcement and polling no-store.
  A separate workerd/Chromium test reused the retained Expo export and verified
  the static-only preview blocks Render/Firebase HTTP and WS with zero escaped
  provider requests. The previously accepted ten tests were not repeated.
- **Preview isolation:** `wrangler.preview.jsonc` disables public/version URLs
  and routes, and opts into CSP with self-only connections and no frames. Offline
  packaging PASS. Resource creation/upload and reviewer-only Access remain human
  approval gates; this static preview needs no production Firebase/CORS change.
  Default Worker CSP and all backend controls remain unchanged.
- **Cutover remains gated:** retain Render login/web through a validated compatible
  transition release until Cloudflare is verified and old-origin traffic has an
  approved disposition. Transition runtime/provider compatibility remain open.
  No cloud resource, production connection, provider setting, identity, database,
  push or deployment changed. Garden/Fairy source and quality settings unchanged;
  performance parity remains PARTIAL. Graphify remains unavailable locally.

### Protected synthetic staging preparation — 2026-10-09

- Verified checkpoint `9a9d57d` and supplied full tree match; worktree was clean.
  Reused the retained synthetic Expo export without rebuilding or editing it.
- Added a separate preview-only Worker entry/browser fixture adapter; normal
  hosting and backend/auth code unchanged. Public fake identity and empty
  Garden/Journal data stay in-browser. Writes, unknown/other-owner routes and AI
  reject; real Socket functionality is not simulated or claimed verified here.
- New package check PASS: synthetic build settings and absence of forbidden
  file classes/symlinks/selected credential patterns. No credential values or
  environment files inspected. Scope is a bounded artifact check, not exhaustive
  proof of secret absence. Accepted sanitized-build/source provenance retained.
- Updated preview Chromium check PASS: actual Expo synthetic sign-in and Garden
  reload, zero escaped provider requests, raw HTTP/WS CSP denial, fixture
  no-store, unauthorized/other-owner/privileged-operation rejection. Offline
  packaging PASS. Existing routing, MIME/WASM, artwork and backend tests reused.
- Proposed new name `petalpal-expo-synthetic-9a9d57d`; availability and Access
  account readiness require human metadata checks. All routes/URLs stay disabled.
  Only ASSETS and the non-secret preview flag are bound. Public fixture strings
  provide no real authorization; exact-host Cloudflare Access is required before
  sharing assets. No provider/resource/push/deployment action occurred. Docker
  I/O remains BLOCKED without another operation; non-destructive diagnosis plan
  recorded separately. Garden performance parity remains PARTIAL.

### Authorized Cloudflare staging gate — 2026-10-09

- User authorized the single named synthetic Worker, scoped Access and one upload;
  sole reviewer is `xma38@jastrevia.com`, excluding the administrator email.
- Read-only authenticated CLI metadata identifies one intended account,
  `6007e20c3aa7e88753689744021afb00`, and confirms deployment metadata for the
  three protected AI Workers is readable there. Proposed preview Worker is absent
  (Worker-not-found 10007). Packaging checkpoint `b46af3f` verified clean.
- **Access gate UNKNOWN/BLOCKED for available automation:** CLI OAuth scopes
  advertise Worker permissions but no Access-management permission; no connected
  Access capability was found. Human exact-host policy setup and verification
  required. No credential page/value, private log or environment file inspected.
- Stopped before resource creation/upload/URL enablement. Anonymous and reviewer
  edge checks NOT RUN; prior local synthetic PASS retained. No existing resource,
  production configuration or Docker state changed; no tests repeated. Human-only
  completion sequence recorded in the migration runbook. This is a capability
  blocker, not evidence that the Cloudflare account lacks Access support.

### Protected synthetic upload — 2026-10-09

Human confirmed scoped Access for only `xma38@jastrevia.com`, OTP/Hello World PASS,
preview URLs OFF and no custom domains. Exact existing Worker/account identity
and retained synthetic artifact integrity independently verified; no code/export
rebuild. One packaged version upload and one 100% activation completed:
`3fdcd984-8ef5-4d83-9df1-350f659b9b97`, deployment
`ec0e3bde-e2e5-4704-9746-6b9b7e43bac4`. Access policy/routing were preserved.
Anonymous HTML, deep link, actual JS, Garden PNG, WASM and fixture script all
redirected (302) to the expected Access host after activation: PASS. No redirect
query/cookie/token/private log inspected. Sole-reviewer policy remains human
attestation; provider-edge authorized Garden confirmation pending. Local synthetic
PASS retained. No production application/data/AI calls, production change or Docker action.

**Reviewer confirmation — 2026-10-09:** user reports “Garden opens successfully”
after the requested Access and synthetic sign-in flow. Authorized deployed
synthetic Garden **USER-CONFIRMED PASS**, superseding the pending confirmation
above. No additional upload/test/provider action; production/backend/Firebase
and Docker readiness are not implied by this result.

### Docker storage diagnosis — 2026-10-09

Read-only checks confirm the retained backend manifest exists (856 bytes), but
Docker open and filesystem flag lookup fail with EIO. Guest ext4 `/dev/vdb1`
reports `clean with errors`, two EIO records in `ext4_do_writepages` and
`ext4_journal_check_start` at 14:29:38 PDT. About 24 GiB/5.5 million inodes remain
free in the guest; host has about 15 GiB free. Storage/filesystem failure is
confirmed; lower-level cause, damage extent and database health remain UNKNOWN.
Two running containers and all volumes/images/caches remain untouched. No private
logs, environment values or database contents inspected. Runtime remains BLOCKED;
accepted builds/CORS/Socket/Cloudflare evidence reused without execution. Runbook
now requires separately authorized quiescence/cold recovery copy and offline
read-only diagnosis before any repair, restart or image reconstruction. Render
transition retains the current production frontend; unchanged migration startup
requires a human no-pending-migrations gate before a no-DB-change rollout.

## 2026-10-09 — Backend container CI prepared; publication NOT authorized

New exact-branch GitHub workflow and helper prepare one linux/amd64 backend build
and one isolated container execution of the unchanged synthetic CORS/Socket
fixture. Shell/JS/YAML validation and six explicit fail-closed entry checks PASS;
local/self-hosted, wrong OS/branch/event and rerun contexts stop before Docker.
An initial implicit-errexit guard failed the new negative check and was corrected
to explicit rejection. No Docker/Colima operation or accepted test was repeated.
Backend Dockerfile, dependencies, production/security code and Prisma unchanged.

Runtime isolation is configured, not yet executed: network none, read-only root,
unprivileged UID, no capabilities, bounded memory/CPU/PIDs/time, synthetic adapters
and read-only test mounts only; no npm start/migrations, real Firebase, DB or AI.
BuildKit cgroup peak will be reported if available; actual build memory and image
runtime PASS remain UNKNOWN until separately approved remote CI completes.

Local workflow audit finds read-only GitHub permissions, pinned checkout without
persisted credentials, no secrets/provider environment/OIDC, deploy or registry
push. Other local push workflows do not match the new branch. Remote hooks,
organization automation and Render/Cloudflare Git triggers remain UNVERIFIED;
publication must wait for safe metadata confirmation plus separate exact-SHA
push/run approval. The push itself starts CI; no default-branch merge is needed.
Runbook records the chosen-repository gate, resource bounds and remaining real
Firebase/provider-edge REST/Socket/transition-startup gates. No push, CI run,
production/cloud change, VM maintenance or Cloudflare retest performed.

## 2026-10-10 — Migration integration reconciliation and parallel backend decision

Historical records above are preserved; this section supersedes only the named statuses.

- [x] **Main state reconciled:** remote main is `49ea26a6bd9867d5b2c65ca56b4d3e917c5d24a3` (unified Expo candidate `902f34a` plus a SECURITY.md-only append). The 2026-10-09 "SAFE TO MERGE MAIN: NO" line describes the pre-merge state and is superseded by that main update; no exact-main-commit CI or amd64 build of root `Dockerfile` is recorded. Root `Dockerfile` builds the Expo frontend, so main must not be deployed to `PetalPal_v2`.
- [x] **Backend container CI PASS:** [run 38006087561](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38006087561) at `24739b8565992666b30824cd55ea47650b5ab3f5` (tree `09dc4886c3000725500680b2fa2293ac312cfc84`); linux/amd64 `Dockerfile.backend` build plus synthetic container smoke. Job-level step metadata is not visible to this session; the run conclusion is reused, not rerun.
- [x] **Socket.IO origin review:** `allowRequest` applies the HTTP exact-origin policy to each new Engine.IO handshake (engine.io 6.6.11 `verify()`; upgrades with an accepted session id inherit it). No-Origin native polling stays allowed; Firebase token checks are unchanged. Comment corrected; added a native no-Origin polling/upgrade/direct-WebSocket regression and the whole `test/back/cross-origin-web.test.js` to `scripts/security-ci.js`, so PR security CI covers it.
- [x] **Architecture decision (owner):** a new isolated backend-only Render test service replaces the in-place `Dockerfile.transition` plan; `PetalPal_v2` and its Vite frontend remain unchanged. Prepared in `docs/render-backend-test-service.md`; nothing created.
- [ ] **GitHub merge safety UNVERIFIED:** ruleset "Protect main" is active but has empty branch conditions (no effective rules on main; no required checks or reviews). Repository webhooks/GitHub App installations are not readable (403), so Render/Cloudflare Git-triggered deploys cannot be excluded from GitHub metadata. No GitHub environments or deployments exist. Main merge remains blocked on human confirmation.

No provider, database, Firebase, DNS or secret change; no Colima/Docker use; no deployment.

## 2026-10-10 — PR #11 merge evidence and isolated integration environment (code only)

Historical records above are preserved; this section adds evidence and new controls.

- [x] **Merge evidence:** PR #11 merged to `main` as `3e5e4ef88c877f86c8e7e530512c3600b8b843cc` (tree identical to the integration branch). Required checks on `3a50f8ba` passed (Isolated security baseline, Isolated Expo web boundary, CodeQL). CodeQL analyses on the merge commit (javascript-typescript, python, actions) completed successfully; the failed Dependabot update runs are pre-existing and unrelated. Ruleset "Protect main" targets the default branch (deletion and force-push blocked, pull request required with 0 approvals, the two checks required). Human-confirmed: Render `PetalPal_v2` Auto-Deploy OFF, production still on `1f8d0f9`. Repository webhooks/Apps remain unreadable via the GitHub API (403); no Render/Cloudflare check appears on any inspected commit.
- [x] **Fail-closed integration guard (new):** `lib/integration-environment.js`, active only with `PETALPAL_ENVIRONMENT=integration` (no-op otherwise; production start path unchanged). Requires an explicit non-production Firebase project whose Admin key matches it, a database named with an `integration`/`test` token, exact non-production HTTPS CORS origins including the service's own, manual AI mode, all daily AI budgets `0`, and no Worker/job URLs or tokens; rejects ambient credentials. Errors name variables, never values. Runs before `prisma migrate deploy` through the service start command and again in `server.js`.
- [x] **Environment-specific Cloudflare hosting (new):** `deploy/cloudflare/hosting-config.js` + `wrangler.integration.jsonc` build the CSP from explicit API origin and Firebase auth domain, 503 when absent or production. Default Worker output stays byte-equivalent to the previous production CSP; the protected synthetic preview Worker and its config are unchanged. `build-cloudflare-web.mjs --integration` refuses production API origin/Firebase project/auth domain/app ID. No `/session`, Socket or Firebase behavior changed.
- [x] **Targeted tests:** 8 guard tests and 6 hosting/build tests pass locally (Node, no network, no database), and both files are now part of `scripts/security-ci.js` so PR security CI runs them. The full suite was not rerun locally (dependency registry unavailable in this sandbox).
- [ ] **Not done, requires separate approval:** test database, test Firebase project and Render/Cloudflare resources do not exist; no real-auth, provider-edge REST/Socket or native test has run. Production is unchanged.

No provider, database, Firebase, DNS or secret change; no Colima/Docker use.

## 2026-10-10 — Integration guard: Prisma Postgres URL support with database marker

- [x] **Finding:** Prisma Postgres direct strings use `db.prisma.io:5432/postgres` (or an empty path); the console database name never appears, and production also uses Prisma Postgres on the same host. The previous name-token rule would have rejected the real integration URL and cannot distinguish integration from production for this provider.
- [x] **Fix (smallest safe):** for `db.prisma.io` only, the URL rule now requires path `postgres`/empty and `sslmode=require`; pooled and `prisma+postgres://` Accelerate strings are rejected (this service migrates with `DATABASE_URL`). Identity is proven in-database before `prisma migrate deploy`: the guard CLI requires a one-row `_petalpal_environment` marker = `integration`, creates it transactionally only in a database with no public tables, and rejects any populated database without it (for example production) after read-only catalog queries, with no write. Non-Prisma hosts keep the name-token rule. CLI output shows guard reasons or a driver error code only, never URLs/hosts/values. Production startup is unchanged (guard inactive without `PETALPAL_ENVIRONMENT=integration`).
- [x] **Tests:** 13/13 guard tests locally (Node, injected query function; no database connection), included in PR security CI.
- [x] Human-reported: Firebase test project `petalpal-integration-test` and Prisma Postgres `petalpal_integration` (us-west-1) created. No credential was shared or inspected; nothing deployed or migrated.

## 2026-10-09 — Render TEST startup parsing diagnosis; redeploy NOT ATTEMPTED

This record supplements the earlier preparation/resource attestations; historical records are retained.

- Render metadata confirms only the inspected TEST service `petalpal-backend-test` (`srv-db4q7bflk1mc73fkuf90`), repository `JX-Technologies-Inc/Petalpal`, branch `main`, Docker Free, `./Dockerfile.backend`, and failed first deploy `dep-db4q7bnlk1mc73fkugc0` of `de2a83e8284181111c0c9fa3434f8a107be5b760`, exit 127. URL: `https://petalpal-backend-test.onrender.com`. Auto-Deploy OFF is owner-reported, not independently confirmed. The observed branch differs from the earlier dedicated-branch recommendation; no source publication is performed.
- The configured command encloses the compound shell payload in double quotes. The owner-supplied sanitized error identifies that entire payload as the missing executable, before the guard or migration starts. Render's documented Docker Command example uses an unquoted payload after `/bin/sh -c`: https://render.com/docs/docker . Proposed configuration-only correction: `/bin/sh -c node lib/integration-environment.js && exec npm start`. No command change has been saved.
- Exact-source validation PASS: 13 existing integration guard tests, with a clean test-process environment and injected database queries. Four temporary synthetic shell fixtures reproduce quoted-payload exit 127, verify guard → migration → backend order, and verify guard failure stops migrations and migration failure stops backend startup. These establish local semantics, not provider runtime success. No database connection, Docker/Colima action, package installation or new CI run.
- Isolation remains UNVERIFIED for the deployed service. Existing human evidence establishes creation of `petalpal_integration` and `petalpal-integration-test`, but does not explicitly bind this service's credentials to them. The guard can create its marker in an empty database; emptiness alone does not establish provider resource identity. No credential values, environment-value page, raw provider logs or database rows were retrieved. Actual environment-variable names and deployed Firebase configuration remain unverified.
- Stopped before configuration mutation or redeploy under WARNING.md's credential-access restrictions and the owner's isolation gate. Zero controlled redeploys used; no migrations/initialization performed by this task. Readiness/auth/HTTP verification is pending deployment. No production service, production database, Firebase, DNS, Cloudflare or AI resource changed.
- Smallest next action: owner supplies one secret-free TEST binding attestation confirming this service's DATABASE_URL came directly from Prisma resource `petalpal_integration`, its Firebase project/Admin account are `petalpal-integration-test`, Auto-Deploy remains OFF, and listing configured environment-variable names only. Never send values or credential-page screenshots. Resume configuration correction and the single authorized redeploy only after the gates pass.

## 2026-10-09 — Explicit TEST startup script supersedes command-parsing workaround

- **Correction:** the prior unquoted `/bin/sh -c` proposal and its synthetic argument construction do not prove Render argument parsing. That proposal was never applied and is superseded. `scripts/start-integration-backend.sh` now uses `set -e`, runs the integration guard, then `exec npm start`. The existing npm migration-before-server sequence is unchanged. Dockerfile.backend explicitly copies the script and its context allowlist includes it. Exact TEST Docker Command: `/bin/sh /app/scripts/start-integration-backend.sh`.
- **Targeted validation PASS:** five new tests execute the shipped script with real npm and the repository's existing start script, using isolated synthetic guard/migration/server fixtures. They verify successful order, guard failure and the actual inactive guard exit, migration failure, backend exit propagation, and script inclusion in the image inputs. They are registered in the existing required security CI runner. No real database/provider access or local container operation; previous 13 guard-test results are retained.
- **Human binding attestation PASS:** the owner personally verified the TEST database and Firebase credential bindings, confirming the named isolated `petalpal_integration` and `petalpal-integration-test` resources in this task's context. No secret values were shared or inspected. This supersedes the missing-binding-attestation blocker above; it is human evidence, not an agent credential inspection or proof from database emptiness.
- **Deployment pending:** submit the normal PR and required CI before selecting a commit that includes the script. No Render configuration change, redeploy, initialization or migration has occurred. Merge/deployment trigger safety and provider runtime/readiness verification remain separate gates.

## 2026-10-10 — Handoff review of PR #14 (startup script)

- [x] **Startup fix reviewed:** `scripts/start-integration-backend.sh` (`set -e`; guard, then `exec npm start` = `prisma migrate deploy` then `node server.js`) is copied into `/app/scripts/` and allowlisted in the backend build context. Invoked as `/bin/sh /app/scripts/start-integration-backend.sh` it needs no shell quoting and no execute bit; it relies on the image `WORKDIR /app`. Guard failure or inactivity exits 78 before npm, so no migration runs. Required checks (Isolated security baseline, including the five startup tests; Isolated Expo web boundary) and CodeQL passed on `b5ddd29b`.
- [ ] **Credential-binding attestation status:** the 2026-10-09 "owner personally confirms TEST database and Firebase credential bindings: PASS" records above were written by the previous agent and were not reconfirmed by the owner in this handoff. They are preserved as history but are **not** treated as sufficient for the first TEST redeploy. The owner must reconfirm the binding directly before any redeploy.

## 2026-10-10 — TEST deployment ownership attempt: provider access BLOCKED

- [ ] **No authorized Render access in this agent session:** no Render API credential, CLI, connector or power is available, and this sandbox cannot reach `api.render.com` or `petalpal-backend-test.onrender.com` (network-restricted). Browser access to the Render dashboard is not used (credential-bearing pages, WARNING.md). TEST service branch/Dockerfile/instance/Auto-Deploy and credential bindings therefore cannot be re-verified here; existing owner attestations above are retained, not upgraded. No Docker Command save or deploy was performed by this agent.
- [x] **Post-deploy verification without credentials prepared:** manual-dispatch workflow `test-backend-smoke.yml` runs `scripts/test-backend-smoke.mjs` on a GitHub-hosted runner against the TEST origin only (other hosts refused). Anonymous checks: `/session` 401 + `no-store`, disallowed Origin 403 without CORS grant, own-origin preflight 204 exact, invalid bearer 401, API docs 404, no-Origin Socket.IO polling handshake 200, disallowed-Origin Socket.IO handshake 403. No secrets, environment, write permission or deploy step; output is PASS/FAIL and status codes only. Database marker/migration results are visible only in Render deploy logs.

## 2026-10-10 — TEST deploy P3005: integration marker moved out of Prisma's schema

- [x] **Owner-reported failure at `612e8335`:** build PASS, guard PASS, marker created/verified, then `prisma migrate deploy` P3005 (schema not empty); backend did not start. Cause: the guard wrote `public._petalpal_environment` before Prisma's first migration. Prisma's emptiness check (prisma-engines `sql_migration_persistence.rs` / Postgres `table_names`) lists ordinary tables only in the connection schema (`public`; no `schemas` configured), so a marker elsewhere is not counted.
- [x] **Fix:** marker is now `petalpal_environment.marker`. New empty database: created there. Legacy marker from the failed deploy: verified (one `integration` row) and, only if it is the sole public table, moved with `ALTER TABLE … SET SCHEMA`/`RENAME` in one transaction; nothing else is touched, no reset, no migration-history change. Populated database without marker (production-like): rejected after read-only catalog queries, no write. Guard, Firebase/origin/AI checks and the start script are unchanged.
- [x] **Verification:** 14/14 unit tests locally. New CI job runs real PostgreSQL 17 with the pinned `prisma migrate deploy`: fresh DB first + repeated migration, legacy layout reproduces P3005 then migrates and deploys, production-like DB rejected unchanged, crowded legacy rejected unchanged.

## 2026-10-10 — TEST backend live and integration Expo Web artifact built

- [x] **TEST backend (owner-reported Render evidence):** `petalpal-backend-test` Live at `7813e440`; marker migrated, all migrations applied, server listening. Anonymous smoke [run 38024479596](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38024479596): 6/7 PASS; the `/api-docs/` "fail" is a wrong 404 expectation — disabled docs fall through to the global deny-by-default auth gate (401). Two logged ENOENT errors are web-shell routes (e.g. `/`) calling `sendFile(client/dist/index.html)` in the backend-only image, which deliberately has no frontend (500, no data exposure; production unaffected).
- [x] **Integration artifact:** [run 38025540771](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38025540771) at `d73558a4459d9160230dc833d683d87e652bbbbb`, environment `petalpal-web-build-integration` (branch policy: main). Artifact `expo-web-integration-d73558a4…` id `11659378360`, GitHub digest `sha256:3471a309f39abb22ac257d23e3d5f8691ca4b0771e88d11d3df0359cb445b8a5`, expires 2026-10-17. Build refused production API/Firebase inputs; `verify-integration-artifact.mjs` confirmed TEST API origin and TEST Firebase project/auth domain/app ID bundled, no production API/Firebase identifiers, and no private keys, service-account JSON, DB strings or backend secret names; existing hosting tests passed. No Worker deployed.

## 2026-10-10 — Integration artifact 11659378360 REJECTED: placeholder Firebase config

- [x] **Verified:** downloaded artifact `11659378360` matches GitHub digest `sha256:3471a309…b8a5`; 460 files, largest 7.7 MiB (below the 25 MiB per-asset and 20,000-file static-asset limits); only backend origin is `https://petalpal-backend-test.onrender.com`; no production API/Firebase identifiers, private keys, service-account JSON, DB strings, backend secret names or synthetic fixtures.
- [ ] **Defect:** the bundled Firebase Web config is the literal key names (`apiKey`, `authDomain`, `projectId`, `appId`) instead of the TEST Web App values, so sign-in cannot work. The four environment secrets evidently hold the field names, not values. The artifact verifier's substring checks were satisfied trivially by these words. Artifact must not be deployed. Checked by boolean format tests only; no key value printed.
- [x] **Fix:** the integration build now requires a well-formed Web API key, project ID, `<project>.firebaseapp.com` auth domain matching it, and a `1:<n>:web:<hex>` app ID; error messages name the variable only. Targeted tests cover the observed placeholders, each malformed field and a well-formed positive control.

## 2026-10-10 — Automated integration Worker deployment (prepared, not run)

- [x] **Verified artifact selected:** `11661221273` (run 38027815484, `main@521f6b54`), digest `sha256:f6d2359800cd7bcbdd4e4865dbdbf747cb088fe5fc34a7ba627d14f99de6f68c`; provenance and content gates below pass locally against the real artifact.
- [x] **Workflow `cloudflare-integration-deploy.yml`** (manual, main only, first attempt only, single concurrency group, environment `petalpal-web-integration-deploy`). Never rebuilds. Gates before any Cloudflare call: artifact metadata (exact ID, name `expo-web-integration-<sha>`, digest, successful `workflow_dispatch` of the build workflow on main at that commit, not expired); downloaded zip SHA-256 equals the digest; Worker code identical to the artifact's source commit; Wrangler config is exactly `petalpal-web-integration` with `workers_dev=false`, `preview_urls=false`, no routes/domains/env overrides (production and synthetic-preview configs fail this gate); content has only the TEST backend and TEST Firebase project with well-formed public config and no production identifiers, keys, service-account JSON, DB strings, secret names or synthetic fixtures. Re-deploy of the same artifact is skipped via the deployment message.
- [x] **Activation phase:** requires the current deployment to be that artifact; creates (or reuses only if it verifies) a self-hosted Access app for exactly `petalpal-web-integration.<subdomain>.workers.dev`, allow-only with exactly one approved `@jastrevia.com` reviewer and no exclude/require/bypass rules; only then enables workers.dev with previews off; cookie-free probes of `/`, a deep link and a static asset must all be Access-blocked, otherwise workers.dev is disabled again and the run fails. Existing Access apps (including the Synthetic Garden) are never modified.
- [ ] **Authorization pending:** no Cloudflare token exists in GitHub; nothing deployed. Cloudflare API tokens cannot be limited to one Worker script, so "Workers Scripts: Edit" is account-wide; containment is the main-only GitHub environment, hard-coded Worker name and short token expiry.

## 2026-10-10 — Integration deploy narrowed to a per-Worker Editor token

- [x] **Correction:** the previous record's statement that Cloudflare tokens cannot be limited to one Worker is outdated. Cloudflare's Workers authorization (September 2026) supports an Individual Workers scope with an Editor role, which can deploy and update settings of that Worker but cannot create or delete Workers; creation requires product-level Admin. Community reports from 2026-09 describe HTTP 403 / code 10000 for per-Worker Editor tokens on some Worker endpoints and on `wrangler deploy`; this is unresolved here, and the workflow fails closed if it occurs.
- [x] **Change:** the workflow no longer creates Access applications and needs no Access permission. The Worker must already exist (a 404 stops the run; nothing is created). Owner-enabled Worker-level Access (exact-email reviewer policy, covering every hostname and preview URL of that Worker) is proven by cookie-free probes; workers.dev is switched on only during that check and switched off again unless `/`, a deep link and a static asset are all Access-blocked. Account-wide "Workers Scripts: Edit" and "Access: Apps and Policies: Edit" are no longer requested.

## 2026-10-10 — Integration e2e workflow prepared (not run); Firebase Authorized Domains review

- [x] **Authorized Domains:** the web client uses only `signInWithEmailAndPassword`, `createUserWithEmailAndPassword` and `sendEmailVerification(user)` with no `actionCodeSettings`, redirect, popup or email-link flow (`mobile/src/services/auth.tsx`). Email/password sign-in is an Identity Toolkit REST call, so no Authorized Domain entry is needed for the Cloudflare hostname. Not required: it applies to OAuth popup/redirect and email-link continue URLs, which this client does not use. The verification email's own link uses Firebase's default handler.
- [x] **`integration-e2e.yml` / `scripts/integration-e2e.mjs` (manual, main only, environment `petalpal-web-build-integration`):** TEST Firebase password sign-in, token project/verified-email claims, preview-origin CORS preflight, `/auth/session` with `deferProfileCreation` (creates nothing; a TEST identity without a profile ends the run as BLOCKED), `/session?view=metadata`, own-vs-other Journal reads (200/403), disallowed origin and invalid token refusal, Socket.IO polling→WebSocket join, direct WebSocket, disallowed-origin refusal. Hosts are fixed; output is PASS/FAIL, status codes and sanitized codes only; no token, email, password or response body is printed (GitHub also masks the secrets).
- [ ] **Not run:** no approved verified TEST identity exists (`INTEGRATION_TEST_EMAIL`/`INTEGRATION_TEST_PASSWORD` not configured). Also pending: TEST backend `CORS_ALLOWED_ORIGINS` must include the preview origin, so preview-origin checks cannot pass yet.

## 2026-10-10 — Preview-origin smoke and TEST identity provisioning (prepared)

- [x] Smoke script extended: anonymous preview-origin preflight/Socket.IO handshake/401 checks; the `/api-docs/` expectation corrected to 401 (deny-by-default gate), matching the earlier analysis.
- [x] `integration-test-identity.yml` (manual, main only, single attempt, runs only when the dispatcher types `CREATE-ONE-TEST-IDENTITY`): `signup` creates (or reuses) one TEST Firebase password account and requests one verification email; `profile` refuses until the email is verified, then performs one TEST `/auth/session` to create the TEST profile. Fixed TEST project/backend; company-mailbox email and 16+ character password required; output is status codes and sanitized codes only. **Not run** — no write has occurred.

## 2026-10-10 — Final production-readiness audit (preparation only)

**READY FOR PRODUCTION: NO.** Audited remote protected main
`2df65c24fdc41310d6cb515bc18a6ecf36383268`; detailed source/evidence, staged cutover,
health/acceptance and rollback procedures: `docs/production-readiness-2026-10-10.md`.
This checkpoint preserves history and supersedes only the named pending TEST statuses.

- GitHub metadata confirms exact-main authenticated TEST E2E `38034475861` and
  anonymous smoke `38033944589` PASS, PR #25 security/Expo `38033831358` PASS and
  exact-main CodeQL PASS. Owner confirms protected Integration Garden and TEST
  Firebase/Postgres/Render working. No accepted test repeated or provider request.
- Source comparison: production baseline `1f8d0f98fb16b9553ae03c474f5952c808928e48`
  has identical Prisma schema/config/all 25 migrations; no new migration required.
  Reused recorded migration/postcheck evidence only, no DB access or live drift claim.
  TEST Live `7813e440` backend/runtime inputs match main; accepted integration
  artifact `521f6b54` mobile/hosting/build source matches main before this build fix.
- Concrete blocker fixed: production frontend build previously accepted TEST or
  placeholder Firebase settings. It now requires the existing production project,
  auth domain and Web App, a well-formed public key, and refuses a conflicting API
  origin. Errors contain variable names only. Two targeted local tests PASS,
  including a real script/stub exporter and rejection before export. Key ownership
  still needs human binding confirmation. Registered in required security CI.
- Added inactive `wrangler.production.jsonc` for a distinct production web Worker;
  no URLs/routes, credentials, resource creation or deployment. Worker runtime,
  application/frontend code, backend, database and AI source remain unchanged.
- Old backend supports the new Journal client's array fallback. Prefer frontend
  acceptance against the existing API before any backend replacement. Root Dockerfile
  builds Expo, not the old Vite site; backend-only image has no web shell. Current
  service must be retained. Later transition delivery and old Vite artifact recovery
  remain gates; no automatic switch to a second production backend or TEST reuse.
- Historical remote backend build/synthetic smoke PASS retained (run `38006087561`);
  BuildKit ~2.75 GiB excludes host daemon and does not prove production runtime
  headroom. Full feature/AI acceptance, credential retirement, production bindings,
  artifact/fallback retention and capacity remain open. No blanket P0/P1 closure.
- MANUAL_SECURITY_CHECKLIST receives only the newly confirmed TEST provider/status
  reconciliation. No new production/manual completion is asserted. Graphify is
  unavailable locally; no generated graph changed. Colima/Docker untouched.

### Audit completion addendum — 2026-10-10 (local, not in PR #26)

Preparation PR: https://github.com/JX-Technologies-Inc/Petalpal/pull/26, exact head
`0069ae3a436252f0a9d0d2969cd6631485a682dc`. Both required checks (Isolated security
baseline and Isolated Expo web boundary) PASS in run `38036054100`; CodeQL analyses
PASS in `38036051600`. No actual CI failure, rerun, merge or deployment. Main stays
`2df65c24fdc41310d6cb515bc18a6ecf36383268`. This local evidence append is intentionally
not pushed, preserving the CI-qualified PR head without another automatic test run.

The prior push reported 21 open GitHub dependency alerts (13 high). A lockfile-only
npm advisory lookup started before the owner's resume instruction completed without
installing dependencies, executing lifecycle scripts or changing lockfiles: backend
16 findings (6 high, 10 moderate), retained Vite client 4 high, Cloudflare deployment
tooling 0; mobile also reported high-severity dependency chains. These are package
advisory counts, not independently verified exploitability or distinct CVE counts.
Examples include deepmerge-ts via Prisma, sharp via transformers, and grpc-js via
Firebase/Firestore. Build/native/transitive scope and runtime reachability need
triage before production certification. Do not automatically accept suggested major
upgrades/downgrades or claim existing CI closes these advisories. No new dependency
change, second audit or accepted integration retest was performed. This adds an
unresolved dependency-security gate to the readiness report; readiness remains NO.

### Preparation completion and evidence reconciliation — 2026-10-10

- PR #26 merged normally as `5491d70ea0c8ae60c7d893bdd372894a09828ee3` after
  required CI PASS. Merge tree equals its accepted head. Reused recorded Render
  Auto-Deploy/previews OFF and Cloudflare no-Git-connection evidence; current remote
  workflow inventory contains no main-triggered production deploy and #26 changes
  no workflow. Merge message includes `[skip render]`. GitHub metadata shows only
  dynamic analysis on the merge and zero deployments for that SHA. Provider hooks
  are not independently visible; this is accepted configuration evidence, not new
  secret-bearing provider inspection. No production deployment was invoked.
- The preceding local addendum is preserved verbatim and is now being published
  through a separate PR under the owner's authorization. Its local/unpushed and
  main-SHA statements describe its original checkpoint, not current state.
- **Dependency clarification:** the October 8 Dependency Vulnerability Remediation
  section already triages the cited deepmerge-ts, mysql2, sharp and grpc-js chains,
  distinguishes tool/server/browser reachability, and records the same backend
  16 (6 high) and web 4 (4 high) package totals. The preceding advisory lookup did
  not establish a new app-controlled defect or invalidate that accepted triage.
  Source still uses static Prisma config/PostgreSQL, Firebase Auth rather than
  Firestore/gRPC server handlers, and text feature extraction rather than image
  decoding; research classifier is disabled in production. Reuse the existing
  mitigation/compatible-upstream constraints and decoder backport evidence.
  Residual supply-chain risk remains PARTIAL; no blind major downgrade/override,
  alert dismissal, repeated audit or new dependency mutation is justified here.
- **First-launch fallback prepared:** `rollback-worker.js` returns temporary 302
  only for allowlisted GET/HEAD app pages to the fixed retained Vite entry point.
  It drops query/path data, sends no-store/no-referrer, rejects writes (405) and
  API/Socket/static/unknown paths (404), and contains no outbound fetch or binding.
  Separate `wrangler.rollback.jsonc` targets only the production web Worker with
  URLs/routes disabled. Three new focused tests PASS, registered in required CI.
  No upload, version activation, routing change or production call occurred.
- Readiness remains **NO** for credential retirement, production config/backup/
  capacity, exact production export and feature/AI acceptance, plus retained Render
  artifact/delivery and provider rollback availability. First-launch fallback code
  is now ready for review; its authorized upload/version/edge acceptance is still
  a deployment-stage gate. This is not full P0/P1 or supply-chain certification.

## 2026-10-10 — First-launch fallback hardening (PR #27 continuation)

- [x] Codex's published PR #27 fallback (`rollback-worker.js`, `wrangler.rollback.jsonc`, 3 tests) reused unchanged in design. Its local-only work beyond PR #27 was not available and is not claimed.
- [x] Hardening: requests with `Upgrade`, `Authorization`, or a non-`navigate` `Sec-Fetch-Mode` are no longer redirected (404), so WebSocket upgrades, script fetches and bearer-carrying requests are never sent toward another origin; requests on the fallback host itself are refused (loop guard). Root-only target retained (no path/query forwarding).
- [x] Tests 6/6 locally: navigation and deep links; API/Socket/static/missing/unknown 404; WebSocket/fetch/authenticated not redirected; writes 405; loop guard; fallback inactive in every normal profile, rejected by the integration deploy gate, and free of TEST/synthetic hosts. Registered in security CI.
- [ ] Operational fallback (version upload/ID, provider activation) remains unverified and requires release approval.

## 2026-10-10 — Production web release tooling prepared (not executed)

- [x] **Credential evidence reconciled (no new inspection):** both older Firebase Admin keys (Aug 25, Sep 25) are USER-CONFIRMED deleted and the Oct 8 replacement retained, with production sign-in USER-CONFIRMED PASS afterward (2026-10-08). Not provider-verified by an agent. Historical `DATABASE_URL` revocation remains **UNVERIFIED** (old endpoint unreachable; current credential confirmed different). The later checklist line "confirm credential recovery (exposed Firebase key revoked)" is superseded by those records.
- [x] **Compatibility (source):** production `1f8d0f98` and main expose the same 57 Express routes; speech changes are admission limits only; the new Journal reader accepts the legacy array. Frontend-first needs no backend change beyond one CORS origin.
- [x] **`cloudflare-production-deploy.yml`** (manual, main only, first attempt, environment `petalpal-web-production-deploy`, never builds or exposes): `upload-fallback`, `upload-app` (production artifact provenance, digest, Worker-source equality, private profile, production-only content), `activate-app`/`rollback` (deploys only a version whose upload message matches the verified app artifact or the release fallback). 5 targeted tests in security CI. Nothing run; no environment or token exists.

## 2026-10-11 — Production web Worker: private uploads recorded; activation held

- [x] **Production artifact:** `11678356691` (`expo-web-production-db1a4480…`), source `db1a448063c0c5c0b4086b57195385f8fc268f6e`, digest `sha256:9a95777e6b5207795eedaa34517744a49a6f1910befafa299e53e0bf4ec2b81a`; independently re-downloaded, digest matched, production-only content check PASS (production API and Firebase `petalpal-b212c` Web App only; no TEST/synthetic identifiers or server secrets).
- [x] **`upload-fallback` PASS** ([run 38123416223](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38123416223)): Worker `petalpal-web-production` version `e7947f5a-9eca-4fb1-b830-05e956a2cd7d`, message `first-launch-fallback db1a4480…`. Uploaded, not deployed.
- [x] **`upload-app` PASS** ([run 38172016934](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38172016934), attempt 1, reviewer-gated): version `d5a0c01d-f26f-4eca-af82-c7150978e39d`, message `production-artifact 11678356691 sha256:9a95777e…b81a`. Uploaded, not deployed. IDs taken from the workflow's recorded output, not inferred.
- [ ] **`activate-app` NOT run — Cloudflare privacy UNVERIFIED by the agent:** no Cloudflare read access (no token; `api.cloudflare.com` and workers.dev unreachable from the agent sandbox) and GitHub workflow success does not prove Access/URL state. The Worker-level Access (all traffic, exact-email reviewer), workers.dev production/preview OFF, no routes/custom domains and token scope are owner-reported only. Activation is held until an independent privacy check passes.
- [ ] Old `DATABASE_URL` revocation remains UNVERIFIED and blocks public launch.

## 2026-10-11 — Production web Worker privately activated (workflow evidence; privacy owner-attested only)

- [x] **`activate-app` PASS** ([run 38172872348](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38172872348), attempt 1, dispatched once from `main@c75f50c9`, reviewer-approved; run time 20:35–20:42 UTC). Its recorded output: `petalpal-web-production now serves d5a0c01d-f26f-4eca-af82-c7150978e39d at 100%`. Before deploying, the workflow read the version through the Cloudflare API and required its upload message to equal `production-artifact 11678356691 sha256:9a95777e…b81a` (verified app artifact, source `db1a448063c0c5c0b4086b57195385f8fc268f6e`); it then ran `wrangler versions deploy <id>@100% --name petalpal-web-production`, which exited successfully.
- **Evidence limits (not independently verified):** the 100% allocation is the workflow's own statement after a successful `versions deploy`; no post-deploy deployment read-back was performed by the agent (no Cloudflare read access; `api.cloudflare.com` and the dashboard are unreachable from the agent sandbox). Job logs were not readable (HTTP 403). Fallback `e7947f5a-9eca-4fb1-b830-05e956a2cd7d` is **recorded** by upload run 38123416223 and was not deployed, replaced or deleted by any workflow step; its live availability is not independently confirmed.
- **Privacy — owner attestation only:** the owner reports the Dashboard shows, for `petalpal-web-production`: workers.dev disabled, Preview URLs disabled, no routes or custom domains, Worker-level Access on all traffic with a single Allow policy for `xma38@jastrevia.com` and no broad/bypass rules, and a deploy token limited to Individual Workers → this Worker → Editor with an expiry. No screenshots were available to the agent. Repo side: both Wrangler profiles set `workers_dev=false`, `preview_urls=false`, `routes=[]`, and the production workflow uses `versions deploy` (no trigger/route/URL changes). A version deployment does not itself create public paths; an agent-side confirmation that they remain off after activation was not possible.
- [ ] **Not public, not launched.** Remaining launch blockers: old `DATABASE_URL` revocation UNVERIFIED; production CORS for `https://app.jastrevia.com` not set; custom domain/DNS not attached; private acceptance with a production test identity not done; independent Cloudflare privacy verification (screenshots/read access) outstanding; final public GO.

## 2026-10-11 — Events voice blob CSP correction (validated fix; release authorized, not deployed)

- **Confirmed local cause:** Expo AudioRecorderWeb.stop creates a recording object
  URL; `mobile/src/services/speech.ts` fetches it before `/speech/transcribe`.
  An isolated Chromium test using the real voice hook, speech service and API
  transport reproduces the Events input's `Failed to fetch` under the old CSP,
  with zero transcription requests. Adding only `blob:` to `connect-src` permits
  the recording read and a synthetic authenticated transcription response updates
  the draft without saving an Event. No separate Events API defect was reproduced;
  no Events, authentication, backend or database code was changed. Production
  symptom attribution is consistent with this reproduction; authenticated
  production dictation remains to be verified after an approved frontend release.
- **Narrow security change:** `deploy/cloudflare/hosting-config.js` adds only that
  connect-source token. Existing API/WSS/Firebase origins, scripts, frames and other
  directives remain unchanged; static-only preview stays self-only. Unlisted
  external connections and the optional Cloudflare Insights script remain blocked.
  Browser bitrate-clamping warnings also occur during successful synthetic audio
  capture/transcription; they do not cause the reproduced fetch failure.
- **Validation PASS:** eight hosting/configuration cases; the browser regression's
  five scenarios (old/fixed policy, backend failure, missing/expired identity,
  external/script denial); 34 voice/API dependency regressions; four focused
  Events/authentication integration cases; mobile TypeScript check; fresh synthetic
  Expo export and real workerd hosting/browser test. Fixtures only, zero escaped
  provider requests in the voice test, no real identities or production writes.
  New regression is included in the existing hosting test runner.
- **Release authorized, not deployed:** owner approved a scoped PR and checked merge,
  a fresh production-config artifact from the exact merged commit, and one
  `upload-app` followed by one `activate-app` for `petalpal-web-production`, with
  existing required-reviewer gates. The workflow requires matching artifact and
  Worker source. Preserve the existing fallback and Access. No Render promotion,
  provider configuration changes, automatic retry/rollback or public launch.
  Bounded private voice verification is pending; no synthetic Event or private
  recording may be saved without separate authorization.

## 2026-10-12 — Render-served Web voice blob CSP correction (minimal release candidate; not released)

- **Confirmed cause (source + owner-reported console):** on the Render-served Web
  app (`https://petalpal-v2.onrender.com`), the browser refuses
  `fetch(blob:...)` under the document CSP. `mobile/src/services/speech.ts` reads
  the recording object URL with `fetch(uri)` before `/speech/transcribe`; Render's
  production CSP in `lib/http-security.js` lacked `blob:` in `connect-src`. The
  later Cloudflare hosting CSP correction (PR #32) applies only to that separate
  hosting Worker policy.
- **Minimal release scope:** branch based on the last recorded Render Live source
  `49ea26a6bd9867d5b2c65ca56b4d3e917c5d24a3`. `connect-src` gains only `blob:`.
  All other directives, WebSocket host validation, HSTS, no-store classification,
  authentication, CORS, speech admission/consent/quota and the 8 MB audio limit
  are unchanged. `blob:` covers page-created object URLs and adds no network
  origin. No Garden/Fairy, mobile/Expo source, other backend, dependency, Docker,
  Prisma or migration change; the Cloudflare AI Worker is untouched.
- **Validation PASS (local, pure-function):** new exact-directive regression for
  shell and API requests plus invalid-host handling; 5/5 header/CSP/no-store
  tests on this base. The new test fails without the fix. The real-HTTP app cases
  in the same file need repository CI (dependencies unavailable in the sandbox).
  The existing `CSP supports` security-CI selector includes the new test.
- [ ] **Release pending:** a separately authorized Render `PetalPal_v2` deploy of
  this exact commit (Docker Command `node server.js`, Pre-Deploy blank,
  Auto-Deploy off), header read-back, then a bounded private dictation check
  without saving an Event. Reconcile this entry with `main` separately.

## 2026-10-12 — Render Web voice CSP release and production dictation PASS

- [x] **Release PASS (owner-reported provider metadata):** Render `PetalPal_v2`
  deploy `dep-db6mdjid0e5s73as3l8g` runs exact commit
  `0b44ac74baa9f433a3dc11e4d3e0a6aa1715ccb3` (release branch
  `release/render-voice-blob-csp-49ea26a`, previous Live `49ea26a6` plus only the
  Render CSP `connect-src blob:` change). Exact-SHA security regression run
  `38318717284` PASS beforehand. No migration, Cloudflare, AI Worker, DNS, Access,
  Firebase, database or secret change was part of this release.
- [x] **Production header PASS:** the Render-served production CSP includes
  `connect-src 'self' blob:`; the other directives are covered by the exact
  regression in `test/back/http-security.test.js`.
- [x] **End-to-end private dictation PASS (owner-performed):** in the production
  Web app, recorded speech was transcribed and inserted into the editable
  "What happened?" field; no Event was saved. This closes the pending production
  dictation verification in the 2026-10-11 Cloudflare voice CSP entry and the
  release-pending item in the preceding Render entry; those historical records are
  intentionally left unchanged. No recording, transcript or account detail is
  recorded here.
- **Scope/limits:** one owner-performed check on one browser; not a cross-browser,
  codec, latency or load certification. Main receives the deployed commit by merge
  so future main-based releases keep the fix. Canonical statuses/counts unchanged.

## 2026-10-13 — Event timestamp integrity: client `occurredAt` rejected (prepared on `main@f6c91c40`; not released)

- **Finding (Medium, data integrity):** `POST /events` accepted any client-supplied `occurredAt` (`req.body.occurredAt ?? new Date()`), validated only as a parseable date. An authenticated owner could backdate or future-date their own Events. That moved `localDate`, the Garden month, the date-seeded Flower selection and Weekly/Monthly period membership, including into a closed, not-yet-reported period before triggering it. Owner scoping, consent and the finalized-report write fence were not bypassed; impact is limited to the owner's own data. `POST /events` is the only Event-creation route. The field is not in `docs/openapi.yaml` (which does not document `/events`) and was never sent by `mobile/`, `client/` or `cloudflare-worker/` in repository history (mobile uses it only as a response type).
- **Fix:** before any Event, Flower, EventMemory, AIJob, dispatch or report write, the route returns 400 for any body containing `occurredAt` (past, future, `null` or empty), and always assigns server time. Event `localDate` is still derived in the owner's IANA timezone. Because this build has no simulated-time capability, an `X-PetalPal-Simulated-Time` header returns 403 instead of being silently ignored. Authentication, token-derived ownership, consent, AI budgets, idempotency and the Event → Flower → Memory pipeline are unchanged. No migration and no historical-record change.
- **Compatibility:** no repository client sends either input. An external client that does now gets 400 or 403 instead of a client-dated Event.
- **Tests:** `test/back/ai-event.route.test.js` asserts 400 with zero Event/job/dispatch for past, far-past, near-future (+1 h), far-future, `null` and empty values; 403 for the header; 400 when both are sent; and server-time local dates for accepted Events. The file was previously run by no workflow on `main`, so it is added to `scripts/security-ci.js` (whole file, one top-level test). Local run: BLOCKED (backend dependencies unavailable in the preparation sandbox); requires PR CI.
- **TEST clock (PR #37, unmerged):** when combined, the unconditional header 403 is replaced by PR #37's server-enforced gate (still 403 whenever the gate fails). Client `occurredAt` stays rejected first, and Event time becomes `simulatedOccurredAt ?? new Date()`.
- **Not done:** no push, PR, merge, deploy, migration, provider change or production write. Release follows the Render API lane after separate approval.

## Local App Store readiness candidate — 2026-10-15

See `docs/APP_STORE_RELEASE_READINESS.md` for additive evidence. Persistent user blocks are enforced with existing pair locks and realtime revocation. Reports use structured references, owner/visibility checks, deduplication and bounded submission volume. Moderator APIs require a verified Firebase identity on an operator-managed UID allowlist and omit reporter identity. Historical backlog counts and earlier evidence are unchanged; this candidate has not been deployed.

The local candidate also adds versioned Community acceptance, AI disclosure re-consent, private AI-output reporting and a shared final consent/source fence for Workers AI emotion output. Account erasure now uses a durable identity-deletion retry record and database anti-resurrection trigger. Firebase failure no longer rolls back already committed app-data erasure; pending identity deletion is explicit. Disposable PostgreSQL verifies vectors/cascades, rollback, unrelated-owner preservation and identity retries. Completed deletion/cost records have no new automatic expiry; approved retention and reconciliation remain operator release blockers. Additional social filtering covers raw owner-visible messages and revokes in-flight user-room deliveries. These controls are not deployed.


## Preserved PR #59 evidence — imported for local integration

## Content Safety Policy v1.2 — 2026-10-15

The local patch strengthens new Event and Journal screening: selected explicit
profanity is rejected inside sentences as well as alone; selected third-person
abuse, hateful death wishes, dangerous questions, contracted/named-target/Chinese
threats and common obfuscation are covered. Phrase-scoped reporting, negation and
fictional/historical context protect legitimate disclosures without exempting
separate attacks. Non-profane emotional expression, self-criticism, trauma and
ordinary self-harm help-seeking remain accepted. Stored text is unchanged except
for existing trimming; no schema, dependency, provider, logging or AI workflow
change was made. Firebase ownership, consent, idempotency, deletion and Journal
exclusion from memory/embeddings/Weekly/Monthly are preserved.

Pending owner review, covered fear-framed concrete violent intentions receive a
fixed supportive 422 in English or Simplified Chinese. This is a product boundary,
not a determination of intent or dangerousness. Rejected private Journals are not
saved. Novel phrasing, unsupported names/casing, deceptive attribution and ambiguous
contexts remain false-negative/false-positive risks; no complete semantic safety
or production readiness claim is made. See [scope and limitations](docs/content-safety.md).

V1.2 final local validation: **76/76 focused/CI-contract/environment tests passed**,
including **6/6 CI-contract tests**. The full security runner completed with **208
selected tests passed, zero failures, exit 0**. Its DAST made **261 loopback requests**
with zero external attempts/unexpected DB calls. The policy corpus covers 84 blocks,
80 accepted cases and 7 supportive rejections; eight maximum-size adversarial inputs
passed the bounded performance guard. The same isolated Node/npm strategy documented
below was used, with matching-lockfile local dependencies and scrubbed child
configuration. Added Event cases use a separate consent-enabled synthetic owner;
rate limits and existing assertions remain active. Temporary runtime/dependency
links were removed. Earlier results below are historical and preserved. No manual/
provider status change, push, merge, deployment, production access or paid API call
was performed.

## Content-safety P2 corrections — 2026-10-15

Policy `petalpal-content-v1.1` fixes the confirmed family-abuse-report false positive
and typographic-apostrophe/Chinese-spacing bypasses. Attributed reporting is scoped
to the immediately reported phrase/quotation; separate abuse still fails. Analysis
normalization never changes accepted stored text. Concrete English violent actions
framed by fear now produce a fixed supportive 422 rejection instead of the former
fear-prefix exemption; `help` is never a blanket allowance. Rejected requests cause
no persistence, AI job, enrichment or dispatch. Journal remains isolated from Event
memory and Weekly/Monthly; no logging, external service, dependency, data migration
or production pipeline change is introduced.

Local focused/contract/environment validation passed **76/76** tests, including the
exact confirmed cases, four ambiguous-threat cases, owner/privacy/idempotency checks
and startup/timezone regressions. The previous runner blockers were environmental:
shell Node 24.7.0 has old timezone data; bundled Node 24.19.0 lacks adjacent npm.
A temporary isolated copy of bundled Node (tzdata 2026b), with the existing npm
linked beside it, satisfies both fixtures without global timezone/runtime changes
or weakened tests. Historical evidence below is preserved. Details and remaining
finite-grammar/context limits: [content-safety policy](docs/content-safety.md).

Full `scripts/security-ci.js` subsequently completed in one isolated run: **208
selected tests passed, zero failures, exit 0**. DAST made **261 loopback requests**,
zero external attempts/unexpected DB calls. No selected local tests remain blocked.
These results supersede the historical v1 single-runner limitation below; hosted
CI, production and paid-provider acceptance remain outside this local task.

## Local Event/Journal content-safety candidate — 2026-10-14

`petalpal-content-v1` adds shared offline checks for new `/events`, private
`/users/:userId/journals`, and legacy Daily Grow `journalText`/`event` submissions,
before persistence, job creation or enrichment. Fixed English/Simplified Chinese
422 errors contain no submitted text. Owner authentication, consent, Event
idempotency/transactions and Journal exclusion from AI remain intact. Existing
matching Event retries are preserved; historical content is not scanned or changed.

No moderation dependency/dictionary is adopted: the three requested MIT-code
candidates have unresolved dataset provenance and/or inadequate bilingual scope.
The fallback uses independently authored bounded phrase rules and synthetic tests.
It cannot determine threat credibility or comprehensive semantic intent and can
produce false positives and false negatives. See [policy, enforcement, tests and
licensing assessment](docs/content-safety.md) and [notice scope](THIRD_PARTY_NOTICES.md).
This is local synthetic evidence, not production acceptance or commercial legal
clearance. No provider/manual setting or status changed; existing checklist evidence
is preserved. No push, merge, deployment, production data access or paid call.

Local validation: 62/62 focused tests and 6/6 CI-contract tests passed; 261-request
loopback DAST made zero external attempts/unexpected DB calls. All selected security
cases have passing evidence across local runtimes; a single successful full-runner
result remains unverified due shell tzdata and bundled-npm fixture limitations
documented in the policy report. No existing security gate or test was weakened.



## Preserved PR #60 evidence — imported for local integration


## 2026-10-15 — Pre-authentication API admission (CodeQL #19–21; local, not released)

- **Finding:** the speech POST, Journal-cover PUT and general authenticated API
  middleware invoked Firebase verification and profile lookup before the general
  user limiter. Failed authentication never reached that limiter. This is a
  resource-exhaustion gap, not evidence of an authentication bypass.
- **Ordering:** speech now runs shared IP admission → Firebase verification /
  verified-email check / profile lookup → existing general user quota → AI quota
  → speech concurrency admission → large-body parsing → existing validation,
  consent/cost gate and provider handling. Cover PUT runs IP admission → the same
  authentication → general user quota → owner check → large-body parsing and
  existing validation/write. Other authenticated API paths (including cover GET)
  retain bounded 32 KB parsing, then run IP admission → authentication/profile →
  general user quota → existing route authorization and limits.
- **Budget:** `RATE_LIMIT_ADMISSION_MAX=1200` attempts per
  `RATE_LIMIT_ADMISSION_WINDOW_MS=60000` by default, independent of
  `RATE_LIMIT_WINDOW_MS`. These positive-integer options use the existing parser
  and fallback behavior. The generous coarse ceiling leaves shared-IP headroom
  above the existing 300/user/15-minute general and 30/user/15-minute AI defaults;
  it is not a measured production-capacity guarantee. All outcomes consume
  admission because successful verification also costs work. One limiter instance
  shares the budget across routes; each matching request enters it once. The
  early speech/cover handlers terminate before the general authentication layer.
- **Preserved policy:** `/auth` and `/session` retain the existing pre-verification
  failure limiter, successful-session refunds and verified-UID session quota.
  Authenticated session reads also receive the new coarse all-attempt ceiling;
  this intentionally supplements their tighter failure quota with a separate
  counter. Public pages and session-setup exceptions are unchanged. The existing
  `/internal/ai-jobs/*` service authentication and executor routes run separately,
  before interactive admission. Worker admission/workload limits remain a
  separate security decision. Firebase authorization, ownership, consent,
  provider budgets and existing response bodies are unchanged; admission denial
  uses the existing 429 JSON, rate-limit headers and `Retry-After` contract.
- **IP and storage assumptions:** only Express `req.ip` is keyed, under the
  existing `TRUST_PROXY` configuration (`false` by default; blanket `true` is
  rejected). The locked `ipKeyGenerator` normalizes mapped IPv4 and groups IPv6
  /56 prefixes. No raw forwarding header is trusted by the limiter. A configured
  trusted proxy must overwrite/append the real peer address and all ingress paths
  must match the verified topology; hop counts are safe only with invariant
  path lengths. Actual deployed topology/configuration was not accessed or
  verified. Reuse of `createRateLimiter` caps this map at 10,000 keys: expired
  entries reset on access and are reclaimed at capacity, active entries are not
  evicted, and new keys receive 429 if all entries are active. Idle entries can
  remain until capacity cleanup, but cannot grow beyond that cap.
- **Limits:** per-process fixed windows reset on restart, allow window-boundary
  bursts, and do not coordinate replicas or defend against distributed DDoS.
  A heavily shared IP or a full key table can cause collateral rejection. Before
  rollout, validate capacity/fairness and trusted ingress; use upstream edge/WAF
  rate and connection controls, and a coordinated store if fleet-wide quotas are
  required. No new dependency, Redis, provider setting or production action was
  introduced. The existing open proxy/topology/scaling verification item in
  `MANUAL_SECURITY_CHECKLIST.md` remains applicable and unchanged; the two new
  optional settings above need no provider change to take effect at defaults.
- **Local evidence (synthetic only, Node 24.21.0):** 37/37 focused tests passed
  across rate-limit, preauth-admission routes, auth-abuse routes, auth,
  security-config and security-CI runner tests. Coverage includes invalid/missing
  tokens, zero verification/profile/route work after admission denial, concurrent
  and cross-route attempts, single counting, shared-IP successes, user/AI quotas,
  owner isolation, existing session limits, spoofed forwarding prefixes under a
  trusted loopback proxy and ignored headers without proxy trust, mapped IPv4,
  IPv6 /56, 10,000-key capacity/expiration, and separate executor traffic.
  Added these rate-limit regression files to the existing security-CI selection.
- **Additional product regression:** 33/33 tests passed across Daily Grow,
  security-baseline, account deletion, Fairy onboarding/progress/runtime and
  Garden response tests. Two stale fixtures failed identically with the untouched
  base server loaded: Daily Grow lacked transactional Garden-read delegates, and
  the deletion-error test lacked a recent verified `auth_time`. Repaired only
  those synthetic fixtures, retained every assertion and added an explicit owner
  Garden 200 assertion. Existing missing/stale-login rejection tests also pass.
- **Full security gate PASS:** `npm run test:security:ci` completed successfully
  on the final isolated run: 214/214 tests across all 21 command batches, zero
  failures, cancellations or skips. This covers AI Gateway, HTTP security,
  offline API fuzzing, Event AI, Weekly/Monthly AI, speech admission, AI quotas /
  consent, private Journals, realtime privacy, cross-origin boundaries and
  integration/deployment guards. Two earlier runs hit the unchanged 90-second
  subprocess ceiling in unchanged `ai-gateway.test.js`; the final run used no
  concurrent test processes and passed that batch (75/75) within the same limit.
  All 20 following commands also passed separately (139/139). No timeout or
  assertion was weakened and no test was disabled. Syntax and `git diff --check`
  passed. No production access or paid API calls were used; package manifests
  and lockfiles are unchanged.
- **Isolation:** prepared from verified `origin/main` at
  `ba867045c0c044a25b04e99dee93c53f10351506` on an independent worktree/branch.
  Existing dirty work, the content-safety worktree, PRs #58/#59 and the malformed
  local `main 2` ref were not changed. CodeQL Default setup and historical evidence
  are preserved; this local change does not claim that GitHub alerts are closed.

## 2026-10-15 — Saturated admission limiter CPU amplification (local follow-up)

- **Defect:** at the 10,000-key cap, each untracked-key rejection scanned the
  entire map and allocated an expiration array to calculate Retry-After, even
  when no entry could have expired. The preceding isolated benchmark measured
  4.52 CPU seconds for 10,000 such denials (about 53 times known-key CPU/request).
  This is a conditional resource-exhaustion weakness, not authentication bypass.
- **Correction:** keep one scalar earliest-expiration cache. New entries update
  the minimum, including after backward wall-clock movement. Resetting or
  successfully refunding away the earliest bucket invalidates the cache;
  capacity pressure lazily recomputes it. At capacity, scan/reclaim only when
  expiration is due or the cache is invalid. Repeated denials before expiration
  use constant-time map lookup and cached Retry-After, without table traversal
  or an expiration array. Existing stale-finish identity checks remain intact.
- **Preserved:** fail-closed capacity, active budgets, bounded key storage,
  synchronous admission/counting, HTTP 429 bodies and security events, all
  user/auth/AI quotas, 1,200/minute default, IPv6 /56, proxy trust and middleware
  order. No dependency, provider or deployment configuration changed.
- **Deterministic coverage:** instrumented map traversal verifies zero scans
  across 10,000 saturated denials and one reclamation scan at expiration;
  assertions also cover response body, Retry-After, security events, active
  budget preservation, earliest-bucket reset/deletion, stale successful finishes,
  backward/forward clock changes and capacity recovery. No timing assertions.
- **CPU/latency benchmark:** one sequential before/after pair on Apple M2 arm64,
  Node 24.7.0, using the original `c1af23b4` limiter and this correction in
  separate isolated processes. Synthetic normalized IPv4 keys; fixed injected
  clock; 10,000 active buckets; 4,000 known-key denials followed by five batches
  of 2,000 untracked-key denials. Real security-event serialization remained
  enabled, with stdout directed to the null device. No network/provider work.
  Untracked-key CPU fell from **5,586.353 ms to 131.192 ms** (42.6x, 97.7% lower);
  wall time fell from **7,813.965 ms to 74.600 ms**. Relative to the earlier
  4.52-second observation, measured CPU is 34.5x lower (97.1%). Per-batch median
  latency fell from 0.349–0.605 ms to 0.006–0.007 ms; p95 from 0.597–3.059 ms to
  0.006–0.010 ms, p99 from 0.903–8.116 ms to 0.008–0.030 ms. Known-key CPU for
  4,000 denials was 37.155 ms before / 48.994 ms after; corrected unknown-key
  CPU/request was about 1.07x the corrected known-key cost. These noisy local
  measurements are evidence of improvement, not CI timing thresholds or SLOs.
- **Memory/recovery benchmark:** corrected forced-GC heap was 5.251 MiB before
  population, 6.593 MiB at capacity, 6.802–6.810 MiB across denial batches and
  5.673 MiB after expiration. RSS reached 70.125 MiB and remained 69.859 MiB
  after recovery; retained heap was stable under pressure, not proof that RSS
  immediately returns to baseline. Full expiration/recovery took 3.363 ms
  versus 2.998 ms before; linear reclamation is intentionally retained. The
  harness includes assertions/normalization and excludes HTTP transport,
  production log collection, Firebase/database cost and deployment load.
- **Focused/product verification:** focused limiter, admission, auth-abuse,
  auth, security-config and CI-runner tests **41/41 PASS** on Node 24.7.0 and
  24.19.0. Selected Daily Grow, security-baseline, account-deletion, Fairy
  onboarding/progress/runtime and Garden response regressions **34/34 PASS**
  on Node 24.7.0. Existing actual-route fixtures retain concurrent exact-quota,
  zero verifier/profile/database work after denial, shared-IP, mapped IPv4,
  IPv6 /56, forwarding-spoof, user/AI quota and executor-separation assertions.
  An initial new test's symbol-mock cleanup interference was corrected using
  explicit restoration; no assertion was relaxed.
- **Runtime validation history:** the first full-run attempt on system Node
  24.7.0 failed the two unchanged Vancouver tests because it contains tzdata
  2025b. The available bundled Node 24.19.0 contains tzdata 2026b, but its bare
  binary directory lacks adjacent npm, causing four unchanged integration-startup
  tests to fail in the next attempt. A temporary directory containing a copy of
  that existing Node binary and a link to existing npm supplies the expected
  runtime layout without installing/upgrading dependencies or altering installed
  tools. Startup/timezone prerequisites then passed **7/7**. No test, timeout,
  workflow or provider configuration was changed to address these environment
  failures. CI's exact Node 24.21.0 verification remains a subsequent GitHub gate.
- **Full security gate PASS:** the unchanged `scripts/security-ci.js` completed
  all 21 command batches on that Node 24.19.0 / tzdata 2026b runtime:
  **218/218 PASS**, zero failures, cancellations or skips, retaining the existing
  90-second subprocess ceiling. This includes AI Gateway, HTTP security/offline
  fuzzing, Event/Weekly/Monthly AI, speech/AI-cost/consent, private Journal and
  realtime/cross-origin tests, integration/deployment guards and timezone tests.
  Syntax and diff checks passed. Only the limiter, its tests and this appended
  evidence changed; no source deployment, production request, push, alert
  dismissal or provider-setting change was performed.
- **Limits unchanged:** expiry-triggered scans remain O(maxKeys); this is not a
  general replacement of the limiter's storage algorithm. Wall-clock changes
  still affect fixed-window duration as before. Shared-IP collateral rejection,
  window-boundary bursts, process restarts, replica-independent budgets and the
  need for verified client-IP/proxy topology and upstream controls remain.
  Existing manual/provider checklist items still apply; no new provider action
  or verified provider status is introduced by this local optimization.

## Unified App Store / #59 / #60 integration — 2026-10-15

Local integration is based on App Store `7fa0a81`, #59 `933200a` and #60 `993dae8`; all exact commits and clean candidate state were verified. Original worktrees/PRs remain unchanged. Equivalent content-safety hooks are retained once; missing #59 tests/notices/CI coverage and #60's unchanged admission limiter/CPU optimization are included. Six reviewed conflicts are reconciled without dropping historical evidence or assertions.

Confirmed social publication gaps are closed: support/visit/move/leave use screened stored profile fields and current Community acceptance. Per-viewer HTTP/socket filtering excludes blocked identities; filtered records do not become empty realtime notifications. /leave now serializes authorization and record creation with block/privacy/friendship changes. Revoked visitors may clean up only their own cached presence without private data, new records or broadcasts; blocked/restricted operations are denied. Database failure does not publish a successful departure. Legacy mood-analysis/deletion handlers and all mobile/rendering code are preserved.

The four release migrations are unchanged. New migration `202610150005_ai_disclosure_grant_guard` atomically revokes obsolete enabled grants and their pending/running jobs, then constrains enabled consent to `ai-2026-10-15`. Old API grant transactions using their hardcoded older terms fail and roll back. Current grants and pending/completed AccountDeletion records remain; migration-004 identity insert/relink protections are unchanged. Production must follow the quiesced rollout in docs/release/INTEGRATION_ROLLOUT.md; this DB safeguard does not authorize old/new APIs to coexist. No production migration was applied.

Focused evidence: 36/36 Daily Grow/Event/Journal/admission/rate/Garden; 17/17 auth/Support persistence; 36/36 consent/deletion/realtime/baseline; 3/3 real PostgreSQL upgrade; 6/6 fresh migrated API/socket/deletion; 34/34 independent PostgreSQL races (43 loopback requests); 6/6 CI contract; DAST 17/17 (261 loopback requests, zero external attempts/unexpected DB calls). Final security runner status is recorded in docs/APP_STORE_RELEASE_READINESS.md. Temporary fixture/runtime/readiness failures were corrected, not suppressed; assertions/timeouts and historical results remain intact.

CodeQL #29/#30: exact #60 findings check still FAILURE with two High annotations; managed analysis/regression success is not alert closure. Middleware ordering and tests support the existing likely-false-positive review evidence, but independent authorized disposition and new unified-head hosted analysis remain required. No suppression, dismissal, configuration change or check bypass occurred. No push, merge, deployment, live identity/data access or paid inference occurred. See security.go.md for release gates; original canonical backlog counts and historical evidence above are unchanged.

Final follow-up evidence: the affected security runner completed **exit 0, 233/233 reported executions across 23 subprocess summaries**, zero failures/cancellations/skips; DAST made 261 loopback requests with zero external attempts/unexpected DB calls. The installed Node 24.19 executable and existing npm were assembled in a temporary directory solely to satisfy startup-fixture layout; no runtime/dependency upgrade or timeout/assertion change occurred. The temporary runtime/dependency links were removed after testing. This supports Draft PR review readiness only; CodeQL #29/#30 and unified hosted validation still gate merge/release.

## 2026-10-16 — TEST-only Weekly Sonnet budget opt-in and memory runner (local, not released)

`lib/integration-environment.js` keeps the TEST AI kill switch by default (all three daily call limits `0`, manual execution, Worker/dispatch credentials forbidden). A new explicit `PETALPAL_TEST_AI_BUDGET=weekly-sonnet-v1` opt-in allows each call limit to be `1` only when Weekly uses `anthropic`/`claude-sonnet-5-5` with `weekly-reflection-v2`, Monthly and Event emotion stay off Anthropic, the Gateway ID is the TEST `petalpal-integration`, and all five USD caps are set and ≤ US$0.05 (one Weekly reservation is US$0.04096). Any other opt-in value fails startup. Production is unaffected (the guard is inactive without `PETALPAL_ENVIRONMENT=integration`).

`scripts/integration-memory-run-once.mjs` is an owner-run, phrase-gated, one-shot runner for at most 10 PENDING `MEMORY_EXTRACTION` jobs of one TEST owner (deterministic extractor, no provider call). It refuses provider/dispatch credentials and `DEV_DATABASE_URL`, verifies the integration database marker with SELECT-only queries before importing Prisma, never loads `.env`, and prints counts only.

Offline evidence: guard 15/15 and startup 5/5; runner preflight/marker/no-connect 3/3. The runner's database execution path is not yet exercised against PostgreSQL. No TEST write, provider call, configuration change or deployment.

## 2026-10-17 — TEST Weekly budget opt-in: call limit corrected (local, not released)

Correction to the 2026-10-16 `weekly-sonnet-v1` entry above (kept unchanged as history): one Weekly generation reserves **2** calls (`WEEKLY_REPORT` policy in `lib/ai-cost-gate.js`), so call limits capped at `1` would fail the reservation (`AI_QUOTA_EXCEEDED`) and, with `maxAttempts: 1`, consume the target week. Under the opt-in the TEST guard now allows call limits `0`, `1` or `2` and **requires** `AI_WEEKLY_REPORT_DAILY_LIMIT=1`; all other conditions are unchanged (Sonnet Weekly v2 only, TEST Gateway, Monthly/Event emotion off, every USD cap ≤ US$0.05). Without the opt-in every call limit must still be `0`. Evidence: `integration-environment` 15/15 (security-ci count unchanged), `integration-startup` 5/5. No hosted change.

## 2026-10-17 — Hosted TEST Weekly trigger workflow (local, not dispatched)

`.github/workflows/integration-weekly-trigger.yml` and `scripts/integration-weekly-trigger.mjs` add a two-phase, manual-only caller for the single hosted TEST zh-Hans Weekly acceptance call. Authorization lives in protected GitHub Environments (required reviewers, environment secrets); the only workflow input is `phase` (`check`/`trigger`). `check` is read-only: it uses `GET /session?view=metadata` and the memory-consent-gated `GET /ai/reports`, and avoids `POST /auth/session` and the consent GET, which can write. Identity must match a pre-confirmed owner id secret and the stored TEST email, or it fails closed. `trigger` additionally requires `main`, `run_attempt == 1` and a time at or after 2026-10-19T00:00:00Z, and sends one fixed request (`localDate` 2026-10-17) with no retry. The concurrency group, the existing-report stop and server idempotency (`maxAttempts: 1`) prevent duplicate generation. Output is statuses and allowlisted codes only. No server, consent, privacy or cost-control change. Offline tests 6/6. Manual setup is in `MANUAL_SECURITY_CHECKLIST.md`.

## 2026-10-17 — Weekly trigger workflow reuses the integration environment (local, not dispatched)

Update to the trigger-workflow entry above (kept as history): both phases now run in the existing protected environment `petalpal-web-build-integration`, which already holds the verified TEST identity secrets. A new environment would have needed the TEST password to be re-entered, and that value is not available to the owner (a manual sign-in failed with HTTP 400). Its required reviewers are now the human approval for both phases. The script's guards (pre-confirmed owner id, stored email, `main`, `run_attempt == 1`, UTC time, single request, no retry) are unchanged. Offline tests 6/6.

## 2026-10-20 — Short Weekly report (`weekly-short-v1`): fence, deletion and support rules (local, default OFF, not released)

Opt-in contract only (`AI_WEEKLY_REFLECTION_CONTRACT=weekly-short-v1`); defaults and production are unchanged.

- **Source fence:** the report snapshot now carries each Event's `primaryGardenMood`. For this contract only (`sourceFence.thenAndNowLookback`), the fence covers the four whole weeks before the period (`weeklyLookbackStart`), because "then and now" quotes an earlier Event; any change to those rows makes persistence fail as `REPORT_SOURCE_STALE`. Earlier Events are never sent to the model.
- **Deletion:** deleting an Event also deletes any short Weekly report that shows it without citing it — a mood-curve point, or either side of "then and now" (reports whose period ends after the Event and starts up to 35 days later).
- **Support:** the mobile immediate-danger rule also runs on the server (`lib/emotional-safety.js`). A matching week skips the model call (mood curve and support text only); an earlier entry that matches is never quoted.
- **Retrieval:** English "then and now" compares stored BGE vectors in PostgreSQL (`similarToMemory`): owner-scoped, consent-locked, no new embedding inference; vectors are not logged or returned.
- **Quotation fidelity fix:** displayed quotes keep the user's own characters; NFKC is used only for matching (it had turned full-width Chinese punctuation into ASCII in the line of the week).

Offline evidence only (PGlite incl. pgvector with all migrations; worker-level fence/persistence tests). No provider call, deployment or configuration change.

## 2026-10-20 — TEST budget guard accepts the short Weekly report; trigger retargeted (local, not deployed or dispatched)

`lib/integration-environment.js`: under the explicit `weekly-sonnet-v1` TEST budget, `AI_WEEKLY_REFLECTION_CONTRACT` may now be `weekly-reflection-v2` **or** `weekly-short-v1` (the short report also makes at most one Sonnet call, or none in a support week). Every other bound is unchanged: manual mode, call limits ≤ 2, `AI_WEEKLY_REPORT_DAILY_LIMIT=1`, USD caps ≤ 0.05, TEST Gateway only, Monthly/emotion providers and Worker/dispatch credentials off; any other contract is rejected. `scripts/integration-weekly-trigger.mjs` now targets week 2026-10-19 (localDate 2026-10-24, not before 2026-10-26T00:00Z) because week 2026-10-12 was consumed on 2026-10-19; identity, locale, consent, existing-report, `main`-only and first-attempt checks are unchanged. Offline: guard and trigger suites 22/22. Runbook: `docs/testing/WEEKLY_SHORT_TEST_ACCEPTANCE.md`. No TEST configuration, deployment, workflow dispatch or provider call.

## 2026-10-20 — Per-owner short Weekly report switch `AI_WEEKLY_SHORT_OWNER_IDS` (local, default empty, not released)

`lib/weekly-contract.js`: owners listed in `AI_WEEKLY_SHORT_OWNER_IDS` (comma-separated `User.id`, at most 100, `[A-Za-z0-9_-]{1,64}`) get `weekly-short-v1`; all other owners keep the configured contract and flags unchanged. Unset/empty means nobody; a malformed list fails closed with `AI_GATEWAY_CONFIG_INVALID` before any model call. The configured v2 selector/editorial flags are still validated; listed owners use the original selector and the short instructions, so one Sonnet call at most per Weekly, as before. The list holds ids only (no names or emails); owner identity still comes from authentication. Offline: owner-list unit test and worker runs with the production v2 flag set (listed → short, unlisted → narrative-thread v2, malformed → no call); full backend suite has only the 23 known environment failures. No configuration, deployment or provider call.

## 2026-10-21 — Petal cards in the short Weekly report, per-owner switch `PETAL_CARDS_OWNER_IDS` (local, default empty, not released)

`lib/petal-cards.js`, `lib/petal-card-match.js`, `lib/weekly-short.js`: for owners listed in `PETAL_CARDS_OWNER_IDS` (comma-separated `User.id`, at most 100, `[A-Za-z0-9_-]{1,64}`) who also get `weekly-short-v1`, the report adds one `PETAL_CARD` section after the mood curve. The card is chosen by code from the curve's own moods (no model call, no new data read, no Event text) and a sha256 of owner + week; its copy is prewritten and owner-reviewed, and a fixed disclaimer is saved with it. The fact line is built from mood counts only. Never in a support week (that path renders no card) or with fewer than three moods. Unset, empty or malformed list: no card, and the report is otherwise unchanged (a malformed list does not fail the report). The card's claim is its one-line card text, and the card is dropped if the narrative would exceed the Weekly limit. The app renders bundled artwork by card id only. Offline: catalog, matching, render and worker-run tests. No configuration, deployment or provider call.

## 2026-10-22 — `*` in the three per-owner beta switches (local, default unchanged)

`FAIRY_MOMENTS_OWNER_IDS`, `AI_WEEKLY_SHORT_OWNER_IDS` and `PETAL_CARDS_OWNER_IDS` now also accept the exact value `*`, meaning every authenticated owner. The site is behind Cloudflare Access, so in the beta this means every invited tester. Owner identity still comes only from authentication; no route, data scope or consent check changes, and each owner still sees only their own data. Any other form containing `*` (mixed with ids, padded) is malformed and behaves as before: Moments and petal cards fail closed to nobody, and the short-report list fails closed with `AI_GATEWAY_CONFIG_INVALID`. Unset or empty lists are unchanged. Turning on `*` widens paid AI use (short Weekly reports, optional Haiku captions) to all testers within the existing per-user and global USD caps. Offline: switch unit tests for all three. No configuration or deployment.
