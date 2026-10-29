# Weekly short report — design (approved direction, 2026-10-20)

Status: **design approved by the owner; step 1 (backend contract) built, default OFF.** The beta keeps
the current narrative-thread Weekly report ([BILINGUAL_WEEKLY_ACCEPTANCE.md](../testing/BILINGUAL_WEEKLY_ACCEPTANCE.md)).

## Why

Two live A/Bs (2026-10-17, 2026-10-20) showed that prompt wording alone cannot make a one-week
report both deep and faithful: the owner read one style as long-winded and "obviously AI", the
other as an inventory ([WEEKLY_PATTERN_INSIGHT_CANDIDATE.md](../ai/WEEKLY_PATTERN_INSIGHT_CANDIDATE.md)).
Depth should come from the user's own words placed side by side and across time, not from the
model interpreting feelings. Fewer model-written words also means less "AI voice".

## Sections (top to bottom)

| Section | Source | Rule |
|---|---|---|
| Line of the week | Model picks, code verifies | One exact clause from this week's Events, unchanged; tap opens that Event |
| Mood curve | Code only | Seven days from the user's own `primaryGardenMood` per Event; one factual line ("Quiet or Drifting 5 times early in the week; Healing and Peaceful 3 times from Friday") |
| Side by side | Model, at most 2 sentences | Two Events placed next to each other; states what happened only — no "because", no "this shows you…"; per-sentence refs and the existing validators |
| Then and now | Retrieval + code | An earlier entry about the same thing (≥ 7 days apart), both exact quotes in date order; only factual counts ("the third time this month you wrote about not sleeping") |
| A question for you | Model, 1 sentence | A question, never advice; its button starts a new Event |
| Petal card (optional, built 2026-10-21, `PETAL_CARDS_OWNER_IDS`) | Code only, after the mood curve | [PETAL_CARDS_DESIGN.md](PETAL_CARDS_DESIGN.md) |
| Weekly 2.0 (optional, built 2026-10-29, `WEEKLY_INSIGHTS_OWNER_IDS`) | Code finds, model phrases, code verifies | Replaces the line of the week and "side by side" with a headline and up to four fact-based insight cards: [WEEKLY_2.0.md](WEEKLY_2.0.md) |

Mood curve levels (display only, never shown as labels): Sunny high; Peaceful, Gentle, Wonder,
Healing middle; Quiet, Drifting, Fire low. Points are the user's own flowers.

## Fallbacks (never pad)

1. Fewer than 3 Events: line of the week and mood curve only.
2. No earlier entry about the same thing: hide "then and now".
3. Then-and-now order of preference: a change in wording → a repeated phrase → hidden.
4. Any Event triggers the existing support hint: no quotation and no card; show support resources.
5. A model-written section fails validation: hide that section only; the rest still shows
   (today a single failure loses the whole report).

## Step 1 — backend contract (built, default OFF, offline tests only)

Enable with `AI_WEEKLY_REFLECTION_CONTRACT=weekly-short-v1` (Sonnet provider). Code:
[lib/weekly-short.js](../../lib/weekly-short.js), wired in [lib/sonnet-weekly.js](../../lib/sonnet-weekly.js).

- One request; the model returns `line`, `sideBySide`, `question` (each may be empty). The packet
  reuses the v2 builder's selection, aliases and byte trimming; `include` lists the parts wanted.
- Saved `narrativeSections` kinds, in order: `LINE_OF_WEEK`, `MOOD_CURVE`, `SIDE_BY_SIDE`, `QUESTION`;
  a support week saves `MOOD_CURVE` + `SUPPORT_RESOURCES`. No schema migration.
- Per-part checks; a failing part is hidden alone. Malformed JSON or a wrong locale still fails the job.
  - Line of the week: an exact clause-aligned copy from the cited Event (same rule as v2 quotations).
  - Side by side: exactly two Events; numbers and quotations must come from cited Events; explanatory
    links (because / shows / means, 因为 / 所以 / 说明 …) hide it.
  - Question: one sentence ending in ? / ？; advice words (should / try to, 应该 / 试试 …) hide it.
- Mood curve: one point per period Event with a `primaryGardenMood` (date, mood, level, Event id) and a
  code-written line such as "Mon–Thu: Quiet 2 times, Drifting once. Fri–Sun: Healing 2 times."
  Time rules: [time.md](../../time.md).
- Fewer than 3 Events: only the line of the week is requested; side by side and question are ignored.
- Support: the mobile immediate-danger rule now also runs on the server
  ([lib/emotional-safety.js](../../lib/emotional-safety.js)) over this week's Event memories. A match
  skips the model call entirely: no quotation, mood curve and support text only.
- Event deletion also deletes a short report whose mood curve shows that Event, even when it was
  not cited ([lib/ai-events.js](../../lib/ai-events.js)).

Open items for the owner:

- zh-Hans mood names (owner, 2026-10-29: the same names the Events screen shows when a mood is chosen): 晴朗 平和 温柔 惊喜 治愈 安静 飘忽 热烈.
  Earlier saved reports keep the names they were written with (晴朗 平静 温柔 好奇 疗愈 安静 迷茫 火焰).
- A week with fewer than two selectable Events stays "insufficient evidence" (no curve-only report yet).
- Hosted TEST only allows the v2 contract (`lib/integration-environment.js`); live acceptance needs that
  gate widened under a separately approved task, then paid inference approval.

## Step 2 — mobile rendering (built)

[ShortWeeklyReport.tsx](../../mobile/src/components/features/ShortWeeklyReport.tsx), parsing and layout in
[reflections.ts](../../mobile/src/services/reflections.ts); used by the Reflection Summary tab.

- Only a report whose every section has `contractVersion: weekly-short-v1` renders this way; older
  reports keep the plain summary text.
- Line of the week: tapping it loads that Event with the existing `GET /events/:id` and shows its full
  text inline (or a short "can't be opened" note); no new route.
- Mood curve: seven columns (Mon first), the user's mood icons from the Event panel as points, joined in
  time order; the factual line sits below and is the curve's accessibility label.
- Question: "Write about it" / 写一写 opens the existing Event panel (`/` with `feature=events`).
- Labels follow the report's locale (en / zh-Hans).
- Checked offline (parsing and layout tests, type check) and visually in Expo web at phone width with
  synthetic data; the signed-in tap-to-Event success path is not yet checked against a backend.

## Step 3 — then and now (built, code only)

[lib/weekly-then-and-now.js](../../lib/weekly-then-and-now.js); chosen while the Weekly input is built
([lib/report-foundation.js](../../lib/report-foundation.js)), saved as `THEN_AND_NOW` between side by side
and the question. No model involvement; earlier Events never reach the model.

- Looks back four whole weeks before the period; the two Events are ≥ 7 days apart. Up to 8 recent Events
  of this week × 60 earlier ones are compared.
- English, change in wording: cosine ≥ 0.85 between stored BGE vectors (PostgreSQL, no new inference) and no
  shared phrase; quotes each whole entry (≤ 180 characters).
- Repeated phrase (both languages): longest shared phrase — ≥ 4 Chinese characters or ≥ 2 English words, at
  least two of them not everyday filler, trimmed of filler at the edges; quotes the sentence containing it
  (≤ 180 / 60 characters). Count line ("appears in 3 of your entries over the past five weeks" /
  "过去五周里，你有 3 条记录写到…") only when the phrase is in ≥ 3 entries.
- Preference: change in wording → repeated phrase → hidden. Hidden too with fewer than 3 Events this week,
  in a support week, or when either quote would trigger the support hint.
- The 0.85 threshold and the filler lists are first guesses; tune them in live review.
- Mobile shows "Then · Sep 21 / Now · Oct 6" (那时 / 现在) quote blocks and the count line.

## Per-owner switch (built)

`AI_WEEKLY_SHORT_OWNER_IDS` ([lib/weekly-contract.js](../../lib/weekly-contract.js)): comma-separated PetalPal
user ids (`User.id`, the `user.id` of `/session`), at most 100, or `*` alone for every owner (the beta, behind
Cloudflare Access). Listed owners get `weekly-short-v1`; everyone
else keeps `AI_WEEKLY_REFLECTION_CONTRACT` and its flags (production: v2 with Selector V2, significance and the
narrative thread). For a listed owner those v2 flags are still validated but not used (original selector, short
instructions). Unset or empty: nobody. A malformed list fails closed (`AI_GATEWAY_CONFIG_INVALID`, no model call).
It changes only reports generated afterwards; a saved report keeps its own contract.

Use: beta users stay on the accepted v2 report; add your own (or a few testers') ids to see the short report
in production without switching everyone.

## Next steps

- Hosted TEST zh-Hans acceptance: prepared, not executed — [WEEKLY_SHORT_TEST_ACCEPTANCE.md](../testing/WEEKLY_SHORT_TEST_ACCEPTANCE.md)
  (TEST guard accepts `weekly-short-v1`; trigger targets week 2026-10-19).
- Owner blind review against the current report, as in the earlier A/Bs: a separate local live run with its own
  paid-inference approval.
- Mockup used for approval: low-week example in en and zh-Hans (synthetic data), reviewed in chat on
  2026-10-20; not stored in the repository.
