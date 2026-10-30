# PetalPal — Time, Timezones and Report Periods

Authoritative reference for every time-, timezone-, calendar-period- and
time-dependent-testing behavior. Status labels used throughout:

- **VERIFIED** — present in source on `main` (2026-10-17) *and* asserted by an
  automated test or a recorded run (cited).
- **IMPLEMENTED BUT UNTESTED** — present in source; no test or run proves it.
- **PROPOSED** — not implemented. Never cite it as existing behavior.
- **NOT SUPPORTED** — deliberately absent or blocked.

"CURRENT IMPLEMENTATION" below means present in source; "TESTED BEHAVIOR" names
the proving test. The step-by-step test plan lives in
[docs/testing/TIME_WORKFLOW_TEST_PLAN.md](docs/testing/TIME_WORKFLOW_TEST_PLAN.md).
Change policy: see [§10](#10-change-policy). Security and privacy rules in
[WARNING.md](WARNING.md) and [AGENTS.md](AGENTS.md) take precedence.

---

## 1. Time concepts

| Concept | Meaning | Source of truth (CURRENT IMPLEMENTATION) |
|---|---|---|
| UTC timestamp | Every stored instant (`occurredAt`, `createdAt`, `periodStartUtc`, `periodEndUtc`, job times) is an absolute instant in UTC | PostgreSQL `timestamp(3)` via Prisma |
| Server clock | `new Date()` on the Render backend | Real time only; no override (see §6) |
| Account timezone | `User.timezone`, an IANA name, set once at profile creation | `POST /auth/session` in [server.js](server.js): `normalizeTimezone(req.body.timezone) \|\| "UTC"` |
| Account timezone (display) | Me page shows it as city · zone name (`Vancouver · Pacific Time` / `温哥华 · 北美太平洋时间`); display only, the stored IANA id is unchanged. There is no `Canada/Vancouver` IANA id | `timezoneLabel` in [mobile/src/services/timezoneLabel.ts](mobile/src/services/timezoneLabel.ts) |
| Device timezone | The phone/browser zone. Sent **only** at profile creation | [mobile/src/services/auth.tsx](mobile/src/services/auth.tsx): `Intl.DateTimeFormat().resolvedOptions().timeZone \|\| 'UTC'` |
| Event occurrence time | `Event.occurredAt` = server `new Date()` at save | `POST /events` rejects a client `occurredAt` (400) and the `x-petalpal-simulated-time` header (403) |
| Event creation time | `Event.createdAt` (database default) | Practically equal to `occurredAt`; not used for periods |
| `localDate` | `Event.localDate` = calendar date of `occurredAt` in the account timezone, stored with `Event.timezone` | `localDateForInstant` in [lib/ai-periods.js](lib/ai-periods.js), called in `createEventAndEnqueueMemoryJob` ([lib/ai-jobs.js](lib/ai-jobs.js)) |
| Job retry time | A failed job that has attempts left gets `AIJob.nextAttemptAt` = failure instant + `retryBackoffMs(attemptCount, base)`: base × 2^(attempt − 1), capped at 60 s, half of it random. An error's own `retryDelayMs` (5 s while Event enrichment is pending) wins. Weekly trigger jobs have `maxAttempts: 1` and never retry | `retryBackoffMs` in [lib/ai-worker.js](lib/ai-worker.js); [test/back/resilience.test.js](test/back/resilience.test.js) |
| Memory processing time | When a `MEMORY_EXTRACTION` job runs (job `startedAt`/`completedAt`) | [lib/ai-worker.js](lib/ai-worker.js); unrelated to the Event's period |
| `EventMemory.eventDate` | Copied from the source Event's `occurredAt` | `eventDate: event.occurredAt …` in [lib/event-memory.js](lib/event-memory.js) |
| Report evaluation time (`asOf`) | The instant compared with `periodEndUtc` | Trigger route: `new Date()`; worker: the job's `lockedAt` ([lib/ai-worker.js](lib/ai-worker.js)) |
| Report generation time | When the Weekly job runs and persists the report | Real time on the backend |
| Ops-metrics active window | `activeUsers7d` / `activeUsers30d` in `ops_totals.csv` count owners with `Event.occurredAt` within 7 / 30 × 24 h before the database's `now()` at export time — rolling instants, not account-local calendar days | `totals` in [scripts/export-ops-metrics.mjs](scripts/export-ops-metrics.mjs) (IMPLEMENTED BUT UNTESTED: the test checks the lifetime totals only) |
| Ops-metrics day | The **UTC** calendar day of each stored instant (`User.createdAt`, `Event.occurredAt`, `Flower.createdAt`, AI audit/job `createdAt`), not the account `localDate`; an evening Event in Vancouver can land on the next UTC day. Aggregates only, for the internal dashboard | `day()` in [scripts/export-ops-metrics.mjs](scripts/export-ops-metrics.mjs); see [docs/analytics/POWER_BI.md](docs/analytics/POWER_BI.md) |

## 2. Event → Memory → Report lifecycle

```
save Event ──► occurredAt (server UTC) ──► localDate (account tz) ──► fixes the Event's week/month
     │
     └─► MEMORY_EXTRACTION job (only with full memory consent)
            runs any time later ──► EventMemory.eventDate = Event.occurredAt
                                    (processing time never moves the Event's period)
period closes (periodEndUtc ≤ now) ──► Weekly trigger accepted ──► one WEEKLY_REPORT job per
                                                                    (owner, periodKey, version)
```

**CURRENT IMPLEMENTATION.** A report selects Events by
`Event.occurredAt ∈ [periodStartUtc, periodEndUtc)` with
`memoryProcessingAllowed = true` (`periodEvents` in
[lib/report-foundation.js](lib/report-foundation.js)). The memory itself only
supplies evidence; for Weekly v2 every retrieved memory must still match its
Event exactly, including `eventDate === occurredAt`, or the input is rejected as
`REPORT_SOURCE_STALE`. A memory that finishes days later therefore still
belongs to the week in which the Event occurred. A memory job runs as soon as an
executor claims it; it does not wait for any period boundary.

## 3. Weekly Reports

**CURRENT IMPLEMENTATION** ([lib/ai-periods.js](lib/ai-periods.js), `POST /ai/reports/weekly/trigger` in [server.js](server.js)):

- **Boundaries:** Monday 00:00 to the next Monday 00:00 in the **account timezone**
  (`AI_WEEK_START = "MONDAY"`). `periodKey` is the Monday's local date
  (`YYYY-MM-DD`). `periodStartUtc`/`periodEndUtc` are those local midnights
  converted to UTC (`localMidnightToUtc`); the end is exclusive.
- **Ready from Sunday 23:59 (owner decision 2026-10-29):** a Weekly may be written from one minute before its
  week ends: `weeklyReadyAt(period) = periodEndUtc − 60 s`, i.e. Sunday 23:59 in the account timezone (DST weeks
  included, since `periodEndUtc` is already the local Monday midnight). `weeklyReportPeriodStatus(period, asOf)`
  returns `COMPLETE` from then and otherwise throws `AI_REPORT_PERIOD_OPEN`. Monthly keeps the plain closed-period
  rule `reportPeriodStatus(periodEndUtc, asOf)`. `allowPartial` exists in the helper but no production caller passes it.
- **The week's boundaries do not move.** A report written before Monday 00:00 reads this week's Events only up to its
  own moment (`weeklySourceEnd(period, asOf)`, saved as `sourceFence.cutoffUtc`), and its write fence checks the same
  range, so an Event saved in that last minute while the report is being written never makes it stale. Such an Event
  still belongs to the week; it is simply not in a report written before it. Deleting it removes a report only if the
  report shows it (`reportShowsEvent`).
- **Which week the trigger targets:** without a body, the newest ready week (`latestReadyWeeklyPeriod(now, tz)`):
  this week from Sunday 23:59 local, otherwise last week. With
  `{ "localDate": "YYYY-MM-DD" }` it targets the week containing that date. The app's `lastClosedWeekKey`
  (`mobile/src/services/reflections.ts`) uses the same Sunday 23:59 rule on the device clock.
  The only accepted body field is `localDate`; the owner comes from
  authentication. An open period returns **400** before any consent check or
  job creation.
- **Eligibility:** full memory consent (`requireLockedMemoryConsent`), then the
  job is enqueued in the same transaction.
- **Duplicate-generation protection:** the job's idempotency key is
  `WEEKLY_REPORT:<periodKey>:<REPORT_NARRATIVE_GENERATION_VERSION>`
  ([lib/ai-jobs.js](lib/ai-jobs.js)); `enqueue` returns the existing job of any
  status. `WeeklyReport` is unique on `(ownerId, periodKey)`, and a finalized
  report short-circuits re-execution. The trigger uses `maxAttempts: 1`, so a
  **failed** run leaves a terminal `FAILED` job: that period cannot be
  regenerated for the same generation version.
- **Execution:** in `manual` async mode (TEST) the trigger runs the job inline.
  In `cloudflare_queue` mode (production) it is dispatched.

**TESTED BEHAVIOR:** Sunday→Monday boundary and contiguous weeks; the 167-hour
2026-03-08 Vancouver spring-forward week; open-period rejection and `PARTIAL`
only with `allowPartial` ([test/back/ai-p0.integration.test.js](test/back/ai-p0.integration.test.js)).
Ready at Sunday 23:59:00 and not at 23:58:59 in Vancouver, including the fall-back and spring-forward weeks; the
trigger's target week either side of it; a last-minute Event outside the cutoff
([test/back/weekly-ready.test.js](test/back/weekly-ready.test.js)).

### Short Weekly report mood curve (opt-in `weekly-short-v1`, default OFF)

**CURRENT IMPLEMENTATION** (`weeklyMoodCurve` in [lib/weekly-short.js](lib/weekly-short.js)):

- **Days:** the seven calendar dates from the Monday `periodKey`, by plain date
  arithmetic (no zone math), so a 167- or 169-hour DST week still has seven days.
- **Which day an Event falls on:** `localDateForInstant(Event.occurredAt, period.timezone)`,
  the same account-timezone rule as `Event.localDate`. Membership is still the period's
  `[periodStartUtc, periodEndUtc)` on `occurredAt`; previous-week source rows are excluded.
- **Halves in the factual line:** Monday–Thursday and Friday–Sunday of that local week.
- No new period boundary, trigger rule or idempotency key; the job key and
  `generationVersion` are unchanged.
- **Petal card** (opt-in `PETAL_CARDS_OWNER_IDS`, [lib/petal-card-match.js](lib/petal-card-match.js)):
  reads only the mood curve's points and uses the same Monday–Thursday / Friday–Sunday halves
  for its arc; the card is picked by a hash of owner + `periodKey`, so a regenerated report of
  the same week gets the same card. No clock read, no new period logic.

- **"Then and now" lookback:** the four whole account-timezone weeks before the period
  (`weeklyLookbackStart` in [lib/ai-periods.js](lib/ai-periods.js), four `previousWeeklyPeriod`
  steps, so DST weeks stay exact). A pair's two Events are at least 7 × 24 hours apart by
  `occurredAt`; dates shown are each Event's account-timezone local date. The source fence
  widens to the same window for this contract only. Event deletion looks at short reports whose
  period ends after the Event (a Weekly 2.0 time echo can quote an Event from up to a year before); each is deleted only
  if it actually shows the Event (`reportShowsEvent`).

- **Weekly 2.0** (opt-in `WEEKLY_INSIGHTS_OWNER_IDS`, [lib/insight-compute.js](lib/insight-compute.js),
  [docs/product/WEEKLY_2.0.md](docs/product/WEEKLY_2.0.md)): read the same five-week source fence as
  "then and now" (no new window). An Event's week index (0 this week, 1–4 earlier) compares its account-timezone
  local date with the Monday `periodKey`s reached by four `previousWeeklyPeriod` steps, so DST weeks stay exact; it
  only weights freshness. "Later" and "after" mean a later `occurredAt`; an open question counts as answered only by
  an Event before `periodEndUtc`. Evidence dates shown are local dates. No clock read, no new boundary, trigger or
  idempotency key. "Last week's main insight" is the saved report of `previousWeeklyPeriod` (its `HEADLINE.insightType`).
  The per-Event extraction (`EventInsightExtraction`) is not time-based: it runs once after the Event's memory is saved,
  and is used only while the Event text is unchanged; `sourceUpdatedAt` is stored for that check, never compared with a
  clock. The backfill script's default `since` (90 days before now) only chooses which Events to queue.
  **Time echo** (`lib/insight-echo.js`): this week's Events against the owner's Events from up to 365 days before the
  week starts, each pair at least 30 × 24 hours apart by `occurredAt`; dates shown are local dates. An earlier Event
  outside the five-week window is added to the fence by id (`sourceFence.echoSources`). IMPLEMENTED; the
  unit tests run in `UTC` only ([test/back/weekly-2.test.js](test/back/weekly-2.test.js)).
  **闭环 (M2, [lib/insight-loop.js](lib/insight-loop.js)):** a **future letter**'s `deliverOn` is an account-timezone
  local date, validated against "today" = `localDateForInstant(now, User.timezone)` at write time: tomorrow up to
  366 days ahead. It is due in the Weekly whose week (Monday `periodKey` … `periodKey + 6` local days) contains it, or
  in a later Weekly (up to 56 days after its week starts) if no saved report since `deliverOn − 6` days carried it (a report rewritten for the same week keeps
  it). It can be withdrawn while `deliverOn` is still after today, so it can never be withdrawn once its week's report
  can be written (Sunday 23:59). `writtenOn` is the local date of `createdAt`. A **thread** counts only in Weeklies whose
  `periodEndUtc` is after the thread was created; it counts this week's Events (same source fence). An **answer** is an
  Event created (`createdAt`) after the report it answers was saved; it is quoted only in a later week's report
  (`periodKey` comparison). The "1 week, 3 entries" unlock line is the existing threshold, not a time rule. IMPLEMENTED;
  tests run in `UTC` only ([test/back/insight-loop.test.js](test/back/insight-loop.test.js)).
  **M3 modules:** **第一次** needs the owner's earliest Event `occurredAt` to be ≥ 28 × 24 hours before `periodStartUtc`,
  and checks earlier Events by `occurredAt < periodStartUtc` (all history). **节律** reads this week and the three before
  (week index ≤ 3) and buckets each Event by its **local hour in the account timezone** (`Intl.DateTimeFormat`, so DST
  days keep wall-clock hours): 5–11, 11–17, 17–22, 22–5. Its unlock line counts week index ≤ 2 (what next week's
  window will hold before next week's own entries). **身体信号** and **反复的句式** use the existing five-week window and
  this week only. No clock read beyond the existing report time; tests: [test/back/weekly-m3.test.js](test/back/weekly-m3.test.js)
  (Vancouver DST parts of the day; the rest in `UTC`).
- **Monthly 2.0** (opt-in `MONTHLY_INSIGHTS_OWNER_IDS`, [lib/monthly-insights.js](lib/monthly-insights.js)): uses the existing
  Monthly period (`monthlyPeriodFor`, account timezone) and its existing fence (this month + `previousMonthlyPeriod`). Garden days
  are the month's local dates (`addLocalDays` from `YYYY-MM-01` while the prefix matches); an Event's day is
  `localDateForInstant(occurredAt)`. The month's Weeklies are those whose Monday `periodKey` is a local date in the month.
  A thread counts this month's Events whose local date is on or after that week's `periodKey + 7` days. **Auto-schedule**
  (`AI_MONTHLY_AUTO_SCHEDULE_OWNER_IDS`, off by default): at each run, an owner's due month is `previousMonthlyPeriod` of the
  owner's current local month, i.e. last month from local 00:00 on the 1st; the job key is the trigger's
  (`MONTHLY_REPORT:YYYY-MM:<version>`), so a month is written once. Tests: [test/back/report-schedule.test.js](test/back/report-schedule.test.js)
  (Vancouver vs Honolulu at `2026-11-01T07:30Z`), [test/back/monthly-2.test.js](test/back/monthly-2.test.js) (`UTC`).
- **花语年鉴** ([lib/almanac.js](lib/almanac.js)): computed on read, never stored. The year runs from local midnight on 1 January
  (`monthlyPeriodFor({ year, month: 1 })`) to local midnight on the next 1 January; an Event belongs to the year of its
  `localDateForInstant(occurredAt)`. The current year opens when the account-timezone local date reaches `YYYY-12-25`
  (one clock read per request, the request time); earlier years always. Its Weeklies are those whose Monday `periodKey`
  is in the year; a "first time" is shown on its evidence's local date. Tests: [test/back/almanac.test.js](test/back/almanac.test.js)
  (Tokyo at `2026-12-24T14:00Z` vs `15:30Z`).

**TESTED BEHAVIOR:** the `2026-11-16` Vancouver week (after the 2026-11-01 DST change) looks
back to `2026-10-19T07:00Z`; an earlier Event five days before is not paired; a worker run reads
`2026-08-25` but not `2026-08-10` for the `2026-09-14` week
([test/back/weekly-then-and-now.test.js](test/back/weekly-then-and-now.test.js),
[test/back/sonnet-weekly.test.js](test/back/sonnet-weekly.test.js)).
An Event at `2026-09-21T06:30Z` in `America/Vancouver` lands on
Sunday `2026-09-20` of the `2026-09-14` week; moodless and prior-week rows add no point
([test/back/weekly-short.test.js](test/back/weekly-short.test.js)).
The petal card's halves and hash are covered in
[test/back/petal-card-match.test.js](test/back/petal-card-match.test.js) and the `petal card` tests
of [test/back/weekly-short.test.js](test/back/weekly-short.test.js).

## 4. Monthly and Yearly Reports

**CURRENT IMPLEMENTATION**

- **Monthly boundaries:** local midnight on the 1st to local midnight on the
  next month's 1st in the account timezone (`monthlyPeriodFor`); `periodKey`
  `YYYY-MM`; same `reportPeriodStatus` closed-period rule.
- **Monthly generation:** the worker can build and persist Monthly reports
  (`buildMonthlyInput`, Opus path disabled by default). Jobs are created by the
  authenticated `POST /ai/reports/monthly/trigger`, which mirrors the Weekly
  trigger: without a body it targets the **previous** month relative to the
  current local date (`previousMonthlyPeriod`); `{ "month": "YYYY-MM" }` targets
  that month; an open month returns **400** before any consent check or job;
  one `MONTHLY_REPORT` job per (owner, periodKey, version) with
  `maxAttempts: 1`. The Mobile Monthly book calls it once per visit when last
  month's reflection is missing. No scheduler creates Monthly jobs.
  TESTED BEHAVIOR: [test/back/monthly-trigger.route.test.js](test/back/monthly-trigger.route.test.js).
- **Yearly:** `YearlyReport` exists as a data model only. There is no Yearly
  period helper, generation path or trigger.

**TESTED BEHAVIOR:** the September 2026 Vancouver month is
`2026-09-01T07:00Z`–`2026-10-01T07:00Z`; November 2026 Vancouver is
`2026-11-01T07:00Z`–`2026-12-01T07:00Z` (permanent UTC-7, below).

## 5. Timezone behavior

**CURRENT IMPLEMENTATION**

- **One authoritative zone per account.** Event dates and report periods use
  `User.timezone`, never the device's current zone. A user who travels or
  changes the device zone keeps their account-zone weeks.
- **No timezone update path.** `PUT /users/:id/profile` accepts only
  `preferredLocale`. The account zone is whatever the device reported when the
  profile was created (else `UTC`). Each Event also stores its own `timezone`
  and `localDate` at save time.
- **DST** is handled by IANA rules through `Intl`, so weeks may be 167 or 169
  hours long. `localMidnightToUtc` throws "Unable to resolve local midnight"
  for a date whose local midnight does not exist (zones that shift at 00:00).
  That case is not covered by tests.
- **Runtime tzdata matters.** Node uses its bundled ICU tzdata, not the OS.
  British Columbia (`America/Vancouver`) is permanently UTC-7 from 2026-11-01
  (IANA 2026b+); a stale runtime would shift Vancouver dates by one hour.
  **TESTED BEHAVIOR:** [test/back/vancouver-timezone.test.js](test/back/vancouver-timezone.test.js)
  fails on stale tzdata; `.github/workflows/runtime-tzdata-verification.yml`
  checks the runtime.
- **Daily Grow** computes its local date with a separate helper
  (`getLocalDate`/`normalizeTimezone` in [server.js](server.js)), also from
  `User.timezone`.
- **Fairy day and night** ([lib/fairy-runtime.js](lib/fairy-runtime.js) `fairyDayPhase`,
  `FAIRY_RUNTIME_CONFIG.night`; owner decision 2026-10-21): the seeded runtime states follow
  `User.timezone` (invalid or missing: UTC). Every local evening at 22:00 her night starts and
  she is `SLEEPING` until 06:00; she is never asleep by day. About one night in five (seeded
  per account-zone local date) she stays up in `SWINGING` / `IN_TREEHOUSE` / `IDLE` until a
  bedtime between 23:30 and 01:00, then sleeps until 07:30. Boundaries are local wall-clock
  times (`localTimeToUtc` in [lib/ai-periods.js](lib/ai-periods.js)), so a DST change moves them
  in UTC, not on the clock. A state that would run past a boundary it is not allowed beyond
  ends there; a state written under the older time-blind schedule (e.g. daytime sleep) ends at
  once on the next reconcile. **VERIFIED:** [test/back/fairy-runtime.test.js](test/back/fairy-runtime.test.js)
  (60 simulated days in `Asia/Shanghai` and `America/Vancouver`; 22:00 / 06:00 / 07:30 and the
  late bedtime on the local clock across the 2026-10/11 changes in `America/New_York`,
  `Europe/London`, `America/Vancouver`) and
  [test/back/fairy-moments.route.test.js](test/back/fairy-moments.route.test.js).
  The Garden shows this schedule for owners in `FAIRY_MOMENTS_OWNER_IDS` (`gardenSchedule`
  in the runtime response; [mobile/src/components/garden/fairy/fairySchedule.ts](mobile/src/components/garden/fairy/fairySchedule.ts)):
  the app re-reads the runtime 1.5 s after `nextTransitionAt` and on returning to the
  foreground, and holds the schedule for 60 s after a user tap (device clock, durations only).
  Its night scenery uses the phone's clock (22:00–06:00), so the two can differ when the phone
  and account zones differ.
- **Fairy Moments** (default OFF; owners listed in `FAIRY_MOMENTS_OWNER_IDS`) are
  planned in [lib/fairy-moments.js](lib/fairy-moments.js) from the seeded Fairy
  runtime transitions of the last 7 days, when `GET /api/fairy/runtime`
  reconciles. A post lands 5–25 minutes after she enters the state, only between
  08:00 and 23:30 in `User.timezone` (an invalid zone falls back to UTC; good-night
  posts from `SLEEPING` only 21:00–23:30), at least 48 hours after any other post
  and at most 3 per rolling 7 days. The local hour also picks the photo's light
  (day 08–18, dusk 18–21, night 21–24); with no photo for that light the post is
  text only. Her mood is fixed per account-zone local date (`localDateForInstant`).
  `FairyMoment.postedAt` is stored in UTC; a post still ahead of the server clock
  stays hidden until then. **VERIFIED:**
  [test/back/fairy-moments.test.js](test/back/fairy-moments.test.js) (UTC,
  `America/Vancouver`, `Asia/Shanghai`) and
  [test/back/fairy-moments.route.test.js](test/back/fairy-moments.route.test.js).
- **Fairy closeness, calendar check-in and keepsakes** (default OFF; owners listed in
  `FAIRY_CLOSENESS_OWNER_IDS`, [lib/fairy-closeness.js](lib/fairy-closeness.js)). A
  "day" is the account-zone local date of the request (`localDateForInstant(now,
  User.timezone)`, invalid zone → UTC): one check-in per local date
  (`FairyCheckIn @@unique([userId, localDate])`), the per-source daily caps count
  `FairyClosenessAward.localDate`, and a month is the `YYYY-MM` prefix of that
  date. The streak continues when the previous check-in is the day before; a gap of
  exactly one missed day is bridged once per 7 local days (`graceUsed`). Day
  arithmetic is calendar-date only (`addLocalDays`, UTC date numbers), so DST
  changes never add or drop a day. Changing `User.timezone` later starts using the
  new zone's dates from then on; stored rows keep the date they were written with.
  **VERIFIED:** [test/back/fairy-closeness.test.js](test/back/fairy-closeness.test.js)
  (`America/Vancouver`, a UTC instant that is still the previous local evening).
- **Daily petal card draw** ([lib/petal-card-draw.js](lib/petal-card-draw.js), switch
  `PETAL_CARDS_OWNER_IDS`): one draw per account-local date (`PetalCardDraw @@unique([userId,
  localDate])`, the same `localDateForInstant(now, User.timezone)` rule). The deck order is seeded
  by owner + local date, and the card back alternates by calendar-day number, so both change at
  local midnight. **VERIFIED:** [test/back/petal-card-draw.test.js](test/back/petal-card-draw.test.js).
- **Beta badge** ([lib/beta-cohort.js](lib/beta-cohort.js)): an account is a beta tester when
  `User.createdAt` (UTC) is before the instant in `BETA_COHORT_ENDS_AT`; unset means the beta is
  still on and every account is one. No local date is involved, so time zones do not move the
  boundary. **VERIFIED:** [test/back/beta-cohort.test.js](test/back/beta-cohort.test.js).
- **Daily flower limit** ([lib/flower-quota.js](lib/flower-quota.js), on unless
  `DAILY_GROW_LIMIT_ENABLED=false`): at most 2 new flowers per account-local date, counted in
  `DailyFlowerQuota(userId, localDate)`. An Event's flower counts against `Event.localDate` (set at
  save from `User.timezone`); legacy Daily Grow and `GET /api/flowers/today` use the server's
  current local date for the same zone. Deleting a flower never lowers the count; a third Event that
  day is still saved, just without a flower. The new day's count starts at local midnight.
  **VERIFIED:** [test/back/flower-quota.test.js](test/back/flower-quota.test.js) (the migration's
  conditional upsert on PGlite, 4 concurrent reserves → 2 granted) and the `two Flowers a day` test in
  [test/back/haiku-event-emotion.test.js](test/back/haiku-event-emotion.test.js) (third Event saved
  without a Flower; deleting a Flower does not free the day).
- **Flower land = month** ([lib/flower-placement.js](lib/flower-placement.js)): Garden lands 1–12
  are the months. `POST /users/:userId/flowers/:flowerId/placement` accepts only the land of the
  flower's month: `Event.localDate`, else `DailyCheckIn.localDate`, else `Flower.createdAt` in
  `User.timezone` (the app's `plantingRecord` uses the same dates). The spot is written once
  (`Flower.worldX/worldY/placedAt`, land in `regionId`) and never moves.
  **VERIFIED:** [test/back/flower-placement.test.js](test/back/flower-placement.test.js) (wrong
  land refused; a check-in date and a Vancouver evening `createdAt` pick their own month).
- **Bookhouse month books** ([mobile/src/services/bookhouse.ts](mobile/src/services/bookhouse.ts)
  `openableMonths`): a month book opens when it holds a private Journal, keyed by the Journal's
  `localDate` (the linked check-in's date, else `createdAt` in `User.timezone`, server side). The
  current month by the **device clock** is always open as well, and opens on today's page with a
  "Write today's journal" action. Near a month boundary, when the device and account zones differ,
  the open "current" month can be the neighbouring one for a few hours; a Journal saved then still
  lands in its account-zone month. **VERIFIED:** [mobile/test/bookhouse.test.mjs](mobile/test/bookhouse.test.mjs)
  (empty history, a December 31 → January 1 device clock).

## 6. Production vs TEST

| | Production | Hosted TEST | Unit / disposable tests |
|---|---|---|---|
| Clock | Real server time | Real server time | Injected `now`/`asOf`/`occurredAt` (CURRENT, TESTED) |
| Event `occurredAt` | Server-assigned | Server-assigned | Passed directly to `createEventAndEnqueueMemoryJob` |
| Simulated-time header | Rejected (403) | Rejected (403) | Not used |
| Closed-period rule | Enforced | Enforced | Enforced, or `allowPartial` in helper tests |
| AI execution | `cloudflare_queue` | `manual`; TEST guard requires call limits 0 unless the explicit `PETALPAL_TEST_AI_BUDGET` opt-in ([lib/integration-environment.js](lib/integration-environment.js)) | Mocked providers |
| Memory jobs | Executed by the queue executor | Not executed by the backend; owner-run [scripts/integration-memory-run-once.mjs](scripts/integration-memory-run-once.mjs) | Run in tests |

**Time injection points (CURRENT IMPLEMENTATION, library level only):**
`createEventAndEnqueueMemoryJob({ occurredAt })`, `AiJobWorker.runJob/runOnce({ now })`
(the claim sets `lockedAt = now`, which becomes the report `asOf`),
`ReportInputService.buildWeeklyInput/buildMonthlyInput({ asOf })` and
`reportPeriodStatus(periodEndUtc, asOf)`. The worker re-checks the closed
period at `asOf`, independently of the HTTP trigger. The HTTP routes always use
the real clock. The AI cost gate reads the **database** clock for its daily and
monthly windows, so injected `now` never shifts budgets.

**Reservation order (VERIFIED, `test/back/weekly-zh-time-boundary.postgres.test.js`):**
on the Sonnet path the cost reservation (2 calls, one Weekly action, USD) is
taken **before** report input is built. A run that then fails, such as on an open
period (surfaced as `AI_GATEWAY_INVALID_INPUT`), makes no provider call, but its
reservation is not released and still counts against that database day's budget.
The HTTP trigger rejects an open period before creating a job, so this matters
only for worker-level failures.

**Hosted TEST has no report-time override.** The `real-ai-*` workflows set
`PETALPAL_SIMULATED_TIME`/`PETALPAL_SIMULATED_TIME_EMAILS`, but no source file
reads them in this build, and `POST /events` states that no simulated-time
capability exists. Treat those variables as inert.

### Automation (CURRENT IMPLEMENTATION)

- **Memory, production:** in `AI_ASYNC_EXECUTION_MODE=cloudflare_queue`,
  `POST /events` dispatches the new job to the Cloudflare dispatch Worker,
  which uses the Queue (`petalpal-ai-jobs-production`, max 3 retries) to call
  the Render `/internal/ai-jobs/:id/execute` executor. A cron (`*/20 * * * *`,
  production Worker only) re-dispatches PENDING or lease-expired jobs (max 5
  per run). The executor chains the follow-up `EMBEDDING_GENERATION` job. See
  [cloudflare-worker/src/index.js](cloudflare-worker/src/index.js),
  [cloudflare-worker/wrangler.jsonc](cloudflare-worker/wrangler.jsonc) and
  [lib/ai-async-dispatch.js](lib/ai-async-dispatch.js).
- **Memory, hosted TEST:** NOT SUPPORTED. Manual mode, and the TEST guard
  forbids dispatch and executor credentials; only the owner-run one-shot
  runner executes memory jobs.
- **Weekly scheduling (IMPLEMENTED, off by default):** the production cron first calls
  `POST /internal/ai-jobs/schedule-weekly` (executor token), which queues one WEEKLY_REPORT job per consenting owner
  on `AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS` (ids or `*`) whose newest ready week (Sunday 23:59 local) has no job yet,
  at most 25 per run, with the trigger's own job key, so the trigger and the schedule never write a week twice
  ([lib/report-schedule.js](lib/report-schedule.js), [test/back/report-schedule.test.js](test/back/report-schedule.test.js)).
  The cron sends those jobs to the Queue, then re-dispatches as before. With a 20-minute cron a report is written
  within about 20 minutes after Sunday 23:59 (or when the owner opens the book, whichever is first).
- **Monthly scheduling:** NOT SUPPORTED. Monthly jobs are created only by `POST /ai/reports/monthly/trigger` (§4).

## 7. Developer time simulation — PROPOSED (not implemented)

Goal: validate Weekly/Monthly generation immediately, without waiting for a real
boundary, and without weakening production safeguards. Recommended order:

1. **Prefer the existing library injection:** in disposable PostgreSQL, create
   synthetic Events at real time, enqueue the Weekly job through the job
   repository (same idempotency key as the trigger), and run the worker with an
   injected `now` after `periodEndUtc`. The worker's own `asOf` check, consent,
   cost gate, grounding and persistence all still run. Fixture-history
   harnesses such as
   [scripts/zh-reflection-v2-weekly-acceptance.mjs](scripts/zh-reflection-v2-weekly-acceptance.mjs)
   instead insert a synthetic past week directly. Both stay off hosted data.
2. **If hosted TEST must be used**, add one TEST-only *evaluation clock*:
   - Accepted only when the TEST startup guard is active
     (`PETALPAL_ENVIRONMENT=integration`); startup fails if it is set anywhere
     else.
   - Set by the owner as server configuration, never by a request header or
     body.
   - Applies **only** to `asOf` in `reportPeriodStatus` and the trigger's
     default previous week. It never alters `occurredAt`, `localDate`, stored
     periods or Memory.
   - Limited to an allowlisted synthetic owner, with consent, cost gate, `maxAttempts`,
     idempotency keys, evidence grounding and persistence unchanged; logged as
     sanitized metadata.
   - Rejected outright when the evaluation clock is earlier than the real clock.
   This needs its own design review, tests, a `SECURITY.md` entry and approval
   before implementation.

Never backdate hosted Events, edit stored timestamps or open-period checks, or
reuse a period whose Weekly job is already terminal.

## 8. Worked example (TEST account, timezone `UTC`)

- Two synthetic Events occurred on **2026-10-17 UTC** (Saturday), so
  `localDate = 2026-10-17`.
- Their week is `periodKey 2026-10-12`: **2026-10-12T00:00Z → 2026-10-19T00:00Z**.
  The end is **Sunday 2026-10-18, 17:00 Vancouver PDT (UTC-7)**.
- Hosted TEST state (recorded 2026-10-17): read-only preflight showed exactly 2
  PENDING memory jobs and no Weekly job; the owner-run runner reported
  `{"SUCCEEDED":2}; provider calls 0`. EventMemory rows were not independently
  verified (NOT VERIFIED).
- **Memory jobs can finish immediately.** Memory extraction is independent of
  the period, and its result keeps `eventDate = occurredAt`. Finishing on
  2026-10-17 or a week later puts the memories in the same week.
- **Weekly generation must wait:**
  - Before 2026-10-19T00:00Z, `{ "localDate": "2026-10-17" }` returns 400
    `AI_REPORT_PERIOD_OPEN` without creating a job.
  - An **empty body** before that boundary targets the *previous* week
    (2026-10-05). It creates and consumes that week's job: avoid it.
  - On or after 2026-10-19T00:00Z, an empty body or `localDate` 2026-10-17
    targets week 2026-10-12, which then has 2 eligible Events (the Weekly
    minimum is 2).

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Event shows the wrong date | Compare `Event.timezone` with `User.timezone`; the date is in the account zone, not the device zone. Check the runtime tzdata (`process.versions.tz`) for Vancouver. |
| `AI_REPORT_PERIOD_OPEN` / 400 on trigger | The target week ends after now. Compute `periodEndUtc` with `weeklyPeriodForLocalDate(localDate, User.timezone)`. |
| Report missing for a week | Events outside `[periodStartUtc, periodEndUtc)`; `memoryProcessingAllowed=false` (Event created before full consent); fewer than 2 evidence items (`INSUFFICIENT_EVIDENCE`); memory jobs not yet run on TEST; trigger targeted a different week. |
| Week contains unexpected Events | Different account zone than assumed; Events near midnight; DST week length. |
| Repeated generation / "already finalized" | Same `(owner, periodKey, version)` returns the existing job or report. A `FAILED` job is terminal for that period. Only a new `REPORT_NARRATIVE_GENERATION_VERSION` changes the key. |
| Timezone mismatch after travel | Expected: there is no update path; the account zone stays fixed (§5). |
| "Unable to resolve local midnight" | The account zone has no 00:00 on that date (DST at midnight). Unsupported edge (§11). |

## 10. Change policy

Any change to timestamps, timezone handling, `localDate`, period boundaries,
closed-period rules, trigger targeting, report idempotency keys or time-related
test tooling must, in the same change:

1. Review and update this `time.md` (keeping the IMPLEMENTATION/TESTED/PROPOSED labels).
2. Add or update tests, at minimum [test/back/ai-p0.integration.test.js](test/back/ai-p0.integration.test.js)
   period cases and [test/back/vancouver-timezone.test.js](test/back/vancouver-timezone.test.js)
   when zone data is involved.
3. Update `SECURITY.md` if a closed-period, consent or cost safeguard changes.

## 11. Open time-design questions

- No supported way to change `User.timezone` after signup.
- Zones without a local midnight on some dates make `localMidnightToUtc` throw.
- Monthly jobs are created only on request (§4), never on a schedule; Yearly generation does not exist.
- No Weekly scheduler; the trigger is API-only (no Web/Mobile caller).
- Hosted TEST cannot run memory or report jobs automatically.
- The trigger's empty-body default (previous week) can silently consume an
  unintended week's single attempt.
- `maxAttempts: 1` makes any failed Weekly run terminal for that period/version.
- `PETALPAL_SIMULATED_TIME*` workflow variables are inert and may mislead.
- Daily Grow and Events use different local-date helpers that share the same
  timezone source; no test asserts they agree.
