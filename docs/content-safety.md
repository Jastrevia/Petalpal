# Event and Journal content safety

Policy: `petalpal-content-v1.2` (2026-10-15). Local development candidate only.

## Social text rules — 2026-11-12

Text a friend reads (messages on a friend's Flower, names, fairy names, avatars, visitor names)
goes through `assertSocialContent` in `lib/community-policy.js`: the Event/Journal rules above,
then social-only rules for telling someone to die or hurt themselves (`kys`, `go die`, `你去死吧`,
`死全家`), bullying (`nobody likes you`, `大家都讨厌你`), slurs, sexual harassment (`send nudes`,
`约炮`, `发张裸照`) and abusive swearing aimed at the reader (`尼玛`, `cnm`, `智障`, `给我滚`).
A writer's own distress (`我想去死`, `I want to die`) is deliberately not matched: the message
composer shows its support note instead, so a friend can still be asked for help. A rejected
message is not saved; the writer sees `SOCIAL_MESSAGE_REJECTED` in their app language
(`preferredLocale`), and the text is never echoed. Coverage is finite like the rules above:
homophones, spacing tricks outside the bounded ones, and new slang can escape. Cases live in
`test/back/social-content.test.js`. Private Events and Journals are unchanged.

## v1.2 product-policy corrections — 2026-10-15

Prohibited profanity now matches throughout unprotected text, including emotional
sentences, selected inflections and compounds (`fucking`, `motherfucker`, `shit`,
`他妈的`). Users can express the same feelings without that wording. This supersedes
the v1/v1.1 emotional-profanity exemption; there is no whole-entry help-word exception.
Selected third-person insults, death wishes using “be killed”, harmful questions,
contracted/leet threats, capitalized Latin-name targets and Chinese “我要杀你” are
also covered. The Cyrillic c lookalike is recognized only inside selected terms;
repeated i is bounded to 2–4 within “bitch”, and sha/bi spacing is bounded. No global
confusable folding, repetition collapsing, dependency or third-party list is added.

Reporting frames include “My father said” and “He told me”; “Nobody believes” and
bounded negative predicates protect clear negation. Explicit fictional/historical
reporting is supported. Protection covers only the attributed quote or matched
phrase, including nested profanity matches. A separate attack, even in the same
submission, is still checked. Benign bomb-shelter/message/chess expressions,
prevention questions, ordinary distress, trauma and self-harm help-seeking retain
acceptance. Accepted wording is unchanged apart from existing caller trimming.

**Pending owner review:** matched fear-framed first-person violent intentions
continue to receive a supportive 422. This now applies to the covered Chinese
threats and capitalized-name English threats as well. It is a product decision,
not an assessment that the writer is dangerous or that harm is imminent. Both
English and Simplified Chinese responses are fixed and disclose no submitted text.
**Rejected private Journals are not saved**, including help-seeking entries rejected
by this rule; rejected Events likewise create no jobs, enrichment or dispatch.

Coverage remains finite. Named-target matching requires a capitalized Latin name
of 2–30 characters; other scripts/casing, unfamiliar names, paraphrases, homophones,
encoded attacks and unsupported inflections can escape. Unrecognized reporting,
negation, fictional/medical/benign contexts can be falsely rejected. Attribution
can be fabricated. Intent, credibility and comprehensive dangerous instructions
cannot be reliably resolved by these rules; this patch is not production semantic
moderation acceptance. Existing owner, consent, idempotency, deletion and Journal
exclusion from memory/embeddings/Weekly/Monthly paths are unchanged.

Final local v1.2 validation: **76/76 focused/CI-contract/environment tests passed**
(including all **6 CI-contract tests**). The policy corpus has **84 rejection cases,
80 accepted cases, 7 supportive-rejection cases**, and 3 explicit remaining
ambiguous/unsupported examples. Eight 4,000-character adversarial inputs passed a
2-second aggregate guard; this is a regression check, not a throughput guarantee.
The **full security runner passed 208 selected tests, zero failures, exit 0**;
its DAST completed **261 loopback requests**, zero external attempts/unexpected DB
calls. No tests were weakened and no global runtime/timezone settings changed.
Validation used
matching-lockfile local dependencies, synthetic fixtures, disposable PGlite and a
temporary copy of bundled Node 24.19.0 (tzdata 2026b) with existing npm linked beside
it. Temporary runtime/dependency links were removed. Added Event API cases use a
separate consent-enabled synthetic owner to preserve the existing rate-limit test
budget. Earlier results remain historical; no provider/manual status or checklist
changed. No push, merge, deployment, production access or paid calls.

## Historical v1.1 P2 corrections — 2026-10-15

- Reporting frames now recognize a bounded set of Chinese family roles, including
  爸爸/妈妈/父亲/母亲. The confirmed paternal abuse report is accepted unchanged.
  Only the attributed phrase/quotation is protected; a subsequent direct attack
  remains rejected. This still cannot verify the truth of an attribution.
- Curly left/right and modifier apostrophes are folded only between Latin letters;
  NFKC already handles fullwidth apostrophes. This closes `You’re`/`Youʼre` evasions
  while preserving paired quotation delimiters. Chinese direct-address components
  accept up to three horizontal Unicode spaces/tabs before the optional connector;
  existing bounded gaps handle the connector/insult boundary. No global whitespace
  removal or new substring dictionary is introduced.
- Concrete English first-person violent actions immediately framed by
  `I am scared/afraid/worried` are **rejected with supportive safety wording**, not
  treated as ordinary abuse or silently allowed. This supersedes v1's fear-prefix
  exemption. `help` elsewhere never changes a decision. The exact reported
  high-risk example gets 422/`CONTENT_REJECTED` before any write/job/AI work, with
  fixed English/Chinese advice to create distance and contact trusted support or
  local emergency services if someone is in immediate danger. No contact is made
  by the app. A fear disclosure without a matched concrete violent action remains
  allowed. Intent and imminence cannot be established by these rules.
- Policy/API regressions cover 46 ordinary blocks, 42 allowed cases, four supportive
  threat rejections and six explicitly documented false negatives. API tests assert
  zero rejected writes/jobs/classification/dispatch and preserve accepted paternal
  reporting text exactly. The response keeps status/code compatibility and exposes
  policy version v1.1; no raw text, new logging, network call or persistence field.
- Focused policy, API, private Journal, legacy, AI-foundation, CI-contract and
  environment tests: **76/76 passed**. The temporary local test runtime copies
  bundled Node 24.19.0 (tzdata 2026b) and links the existing npm beside it, satisfying
  the startup fixture's adjacency requirement without system/runtime/test changes.
  Full-runner results are recorded after validation in SECURITY.md. The earlier v1
  evidence below remains historical and is not overwritten.
- Full security runner: **208 selected tests passed, zero failures, exit 0** in one
  run using that temporary runtime; DAST made **261 loopback requests** with zero
  external attempts/unexpected DB calls. No selected local test remains blocked.
  Temporary runtime/dependency links were removed after validation. No push,
  hosted workflow, merge, deployment or production/paid-provider test was performed.

## Enforcement and privacy

The backend rejects a bounded set of explicit abusive phrases, severe direct
insults, identity-group dehumanization/death wishes, first-person violent threats,
harm promotion and instructional introductions. These are independently authored
English and Simplified Chinese phrase rules, not an imported profanity dictionary.
This is a deliberately limited deterministic policy, not semantic moderation.

- `lib/ai-jobs.js`: check new Events in `createEventAndEnqueueMemoryJob`, after
  owner-scoped idempotency lookup and before consent locks, Event/job writes or
  enrichment. Matching existing retries retain their response; conflicting reuse
  still returns 409. Rejection consumes no idempotency key. The transaction stays
  atomic. `lib/ai-events.js` only reads/deletes and needs no write check.
- `server.js`: check standalone `/users/:userId/journals` after existing owner,
  body, type and length validation and before `journal.create`.
- `lib/daily-flower-input.js`: check the legacy `/users/:userId/flowers` inputs
  `journalText` and deprecated `event`, before any Garden/check-in/Journal/Flower
  writes. They remain private Journal inputs, outside Event memory and AI.
- Return 422 with `CONTENT_REJECTED`, `policyVersion`, and a fixed message selected
  by `Accept-Language` (English default; `zh`/`zh-CN` use Simplified Chinese).
  Responses contain no matching terms, rule IDs or submitted text. Rejections are
  handled before generic error logging. There is no new moderation logging,
  telemetry, inference, network request, database field or migration.

Analysis applies NFKC, case-insensitive English matching,
combining-mark/default-format removal and
bounded punctuation/spacing/common-leet matching for selected English profane terms.
Case is retained for the bounded proper-name threat rule.
Chinese character gaps are bounded in direct-insult patterns. English uses Latin
letter/number boundaries, so normal words containing short profane substrings are
not blocked and adjacent Chinese/English abuse can be detected. There is no global
substring blacklist or global whitespace removal.

Original allowed wording is preserved, including reported abuse. Existing outer
whitespace trimming remains unchanged. Explicit reporting frames protect only the
immediately attributed phrase or paired quotation. Rejection-of-claim frames have
narrow exceptions; covered English/Chinese fear-framed threats receive a supportive
rejection. A help-seeking word or quotation elsewhere
does not exempt a separate attack. Emotional distress, trauma, anger, sexual/medical
discussion and requests for support are not themselves prohibited. Plain quotations
without a recognized reporting frame may still be rejected.

Journal remains excluded from Event memory, embeddings, enrichment and Weekly/
Monthly reporting. No historical content is scanned, reclassified or changed.
Mobile `useEventJournal` → `services/events.ts` → `/events`, and Bookhouse's
`JournalEditor` → `savePrivateJournal` → `/users/:userId/journals` already display
backend error messages and retain failed drafts. Dictation populates those same
editable drafts before saving; `/journal` redirects to the Event panel. The legacy
client's Daily Grow aliases use the checked resolver. No frontend authority or
client-side dictionary is added. Transcription is not submission moderation.

## Limits and validation

Only the finite grammar in `lib/content-safety.js` is enforced. It cannot establish
threat credibility, speaker intent, truth of reported speech, or comprehensive hate
or instruction semantics. It misses novel phrasing, unsupported named targets, many slurs,
pinyin/homophones, Traditional Chinese, arbitrary confusables, repeated-letter and
encoded evasion, and actual harmful instructions without a recognized introduction.
A malicious writer can falsely attribute an attack; an unrecognized legitimate
quotation, negation, idiom or fictional description can be rejected. The earlier
v1/v1.1 allowance for expletives inside emotional reflection is superseded by v1.2. Remaining false positives/negatives are unresolved coverage risks.
No claim of comprehensive safety or commercial-release readiness is made.

Original v1 benchmark evidence (superseded by the v1.1 results above):
`test/back/content-safety.test.js` contains only independently authored synthetic
examples: 37 blocked and 33 allowed bilingual cases, plus 6 documented false
negatives. A local single-pass run took about 65ms including regex startup;
this is not a throughput/memory guarantee. Length-bounded 4,000-character inputs
are tested. API tests verify zero rejected writes/jobs/classification/dispatch,
localized safe errors, owner isolation, consent-independent checks, correction
after rejection, existing retries and unchanged private Journal behavior. Existing
auth, consent, transaction, report and security checks remain in force.

Validation uses the matching lockfile's existing local dependencies, generated
Prisma client without database connection, a scrubbed child environment, loopback
HTTP, injected provider stubs and disposable PGlite. No production API/database,
live LLM evaluation, private records or credentials are used. No existing Graphify
graph was available; no full graph rebuild was performed.

Original v1 local results (historical):

- Focused policy/API/Journal/legacy/AI-foundation selection: **62/62 passed** on
  bundled Node 24.19.0; CI contract: **6/6 passed**; syntax/diff checks passed.
- Security CI on shell Node 24.7.0: **190 passed**, then two pre-existing Vancouver
  timezone assertions failed because that runtime contains tzdata 2025b. Its
  isolated DAST completed **261 requests**, zero external attempts/unexpected DB
  calls. The final Event API file, after those assertions, passed in the focused run.
- Bundled Node 24.19.0 has tzdata 2026b: the two timezone assertions passed
  separately. A broader retry passed **177** tests (including new policy/legacy
  coverage), then four startup-fixture cases failed because that bundled runtime
  has no adjacent `bin/npm`; those unchanged cases passed on shell Node 24.7.0.
  Thus every selected security case has passing local evidence across compatible
  runtimes, but **neither full runner invocation completed successfully**. No tests
  were weakened/skipped and no project/system runtime configuration was changed.
  The final phrase-rule delta was covered by the final 62-test selection; unrelated
  security results are reused. A single-run result on CI's pinned Node 24.21.0
  remains unverified because no push or workflow dispatch is authorized here.
- The legacy Garden-read mock was updated to implement the existing social-lock
  transaction contract. Extra rejected legacy requests use another synthetic owner
  so the existing 20-request concurrency test retains its rate-limit budget.

## Dependency and licensing assessment

Reviewed 2026-10-14, limited to the three requested candidates. Exact metadata came
from the public npm registry: [2toad 3.3.0](https://registry.npmjs.org/@2toad%2fprofanity/3.3.0),
[obscenity 0.4.6](https://registry.npmjs.org/obscenity/0.4.6),
[profanity-guard 1.1.17](https://registry.npmjs.org/profanity-guard/1.1.17).
All declare SPDX `MIT`, TypeScript declarations, and no runtime, optional or bundled
dependencies; therefore no new runtime transitive dependency graph is introduced
by these versions. Development/build dependencies were not comprehensively audited.

| Candidate | Technical fit / maintenance metadata | English data | Chinese data / decision |
| --- | --- | --- | --- |
| `@2toad/profanity@3.3.0` | Node ≥12, CJS, TS; 179,251 unpacked bytes / 35 files; published 2026-03-24. Whole-word/Unicode boundaries and whitelist; not contextual abuse detection. | Bundled array has no separately documented upstream chain in reviewed material. Code MIT does not independently establish list rights. | `zh` is listed, but contribution docs describe LibreTranslate translations of the English list. Source-list rights and exact translation/model provenance remain unverified. Reject adoption. |
| `obscenity@0.4.6` | Node ≥18, CJS/ESM, TS; 152,763 bytes / 62 files; published 2026-01-18. Transformers address leet/confusables/repetition; whitelist reduces some false positives. | Preset explicitly credits `words/cuss`, embeds its MIT notice. Upstream cuss documents CMU and Wikipedia sources, without a pinned source revision/complete rights chain established in this review. | No bundled Chinese preset. Reject for bilingual scope; upstream rights verification is also incomplete. |
| `profanity-guard@1.1.17` | CJS, TS, no declared Node engine; 222,054 bytes / 49 files; published 2026-05-09. Normalization/leet handling; CJK substring matching can overmatch context. | Source file lacks provenance/attribution statements; community contribution guidance is not proof of origin rights. | `zh` array likewise lacks independently verified origin/permissions. A language label is not measured Chinese adequacy. Reject adoption. |

Sources inspected at the package's source revision/tag:

- 2toad: [MIT license](https://github.com/2Toad/Profanity/blob/v3.3.0/LICENSE),
  [bundled data](https://github.com/2Toad/Profanity/blob/v3.3.0/src/data/profane-words.ts),
  [translation process](https://github.com/2Toad/Profanity/blob/v3.3.0/contribute.md).
  npm `gitHead` matches tag `19d6da192d61bd14544b7e417ea2613a2ba8357f`.
- Obscenity: [code license](https://github.com/jo3-l/obscenity/blob/v0.4.6/LICENSE.md),
  [English preset's upstream credit/license](https://github.com/jo3-l/obscenity/blob/v0.4.6/src/preset/english.ts),
  [cuss data origins](https://github.com/words/cuss#data),
  [cuss license](https://github.com/words/cuss/blob/main/license).
  Source tag `409dd3691058d8f9ae6fda96bc577e1d9691ca11`; npm does not declare `gitHead`.
- Guard: npm `gitHead` `e902a805b13c405faf21a295af5213e277af65c7`:
  [license](https://github.com/AkshayBenny/profanity-guard/blob/e902a805b13c405faf21a295af5213e277af65c7/LICENSE),
  [English source](https://github.com/AkshayBenny/profanity-guard/blob/e902a805b13c405faf21a295af5213e277af65c7/src/locales/en.ts),
  [Chinese source](https://github.com/AkshayBenny/profanity-guard/blob/e902a805b13c405faf21a295af5213e277af65c7/src/locales/zh.ts),
  [engine](https://github.com/AkshayBenny/profanity-guard/blob/e902a805b13c405faf21a295af5213e277af65c7/src/engine.ts).

The inspected MIT code grants commercial use, modification, sale and redistribution,
conditional on retention of copyright and permission notices, and disclaims warranty.
That grant covers only rights the licensors possess; it does not cure unverified
upstream data rights. No additional NOTICE file appeared in the reviewed source
trees; this is not a complete supply-chain/legal audit. Package byte counts are
npm unpacked sizes, not compressed bundle measurements. Runtime memory, comparative
latency and security-advisory status were not measured/certified. All three run
locally, but offline operation alone cannot establish semantic safety or provenance.

No candidate was installed, executed, vendored, benchmarked or adopted. Candidate
benchmarking was gated by the provenance check; the small bilingual benchmark was
run against the independently authored fallback. No third-party dictionary was
scraped, copied into the project, merged or redistributed. No package/lockfile change.
Unverified dataset rights remain a blocker to adopting these lists; a future
dependency proposal must resolve them and pass a bilingual/context benchmark.
See [third-party notice scope](../THIRD_PARTY_NOTICES.md).

## App Store candidate social extension (2026-10-15)

Selective source reuse from PR #59 at `933200a648193f88fc6e210ba8834d68c300f19e`; not a merge or deployment claim. `lib/community-policy.js` applies v1.2 to social messages/profiles and adds authored sexual-exploitation/illegal-solicitation examples. Terms version `petalpal-community-2026-10-15` is stored before publication. New social rejection occurs inside the locked transaction before message/visit records or broadcasts. No dictionary/provider dependency. Bounded deterministic tests do not establish complete semantic moderation; novel threats, idioms, languages and context require human reports and review.
