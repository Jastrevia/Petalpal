import assert from "node:assert/strict";
import test from "node:test";
import { latestReadyWeeklyPeriod, reportPeriodStatus, weeklyPeriodForLocalDate, weeklyReadyAt, weeklyReportPeriodStatus,
  weeklySourceEnd } from "../../lib/ai-periods.js";
import { assertReportSources, reportSourceSnapshot } from "../../lib/report-write-fence.js";

// time.md §3: a Weekly may be written from Sunday 23:59 local; the week's boundaries do not move.
const TZ = "America/Vancouver";

test("a Weekly is ready from Sunday 23:59 local, also across the DST change", () => {
  const week = weeklyPeriodForLocalDate("2026-10-19", TZ); // ends Monday 2026-10-26 00:00 PDT = 07:00Z
  assert.equal(weeklyReadyAt(week).toISOString(), "2026-10-26T06:59:00.000Z");
  assert.throws(() => weeklyReportPeriodStatus(week, new Date("2026-10-26T06:58:59Z")), { code: "AI_REPORT_PERIOD_OPEN" });
  assert.equal(weeklyReportPeriodStatus(week, new Date("2026-10-26T06:59:00Z")), "COMPLETE");
  // The week the clocks go back (Sunday 2026-11-01 02:00): it ends Monday 00:00 PST = 08:00Z.
  const dst = weeklyPeriodForLocalDate("2026-10-26", TZ);
  assert.equal(weeklyReadyAt(dst).toISOString(), "2026-11-02T07:59:00.000Z");
  // Spring forward (Sunday 2026-03-08): the 167-hour week ends Monday 00:00 PDT = 07:00Z.
  assert.equal(weeklyReadyAt(weeklyPeriodForLocalDate("2026-03-02", TZ)).toISOString(), "2026-03-09T06:59:00.000Z");
  // Monthly keeps the closed-period rule.
  assert.throws(() => reportPeriodStatus(new Date("2026-11-01T07:00:00Z"), new Date("2026-11-01T06:59:30Z")), { code: "AI_REPORT_PERIOD_OPEN" });
});

test("the newest week that may be written: this week from Sunday 23:59, else last week", () => {
  assert.equal(latestReadyWeeklyPeriod(new Date("2026-10-26T06:58:59Z"), TZ).periodKey, "2026-10-12");
  assert.equal(latestReadyWeeklyPeriod(new Date("2026-10-26T06:59:00Z"), TZ).periodKey, "2026-10-19");
  assert.equal(latestReadyWeeklyPeriod(new Date("2026-10-26T07:30:00Z"), TZ).periodKey, "2026-10-19", "Monday: the week that just ended");
  assert.equal(latestReadyWeeklyPeriod(new Date("2026-10-21T12:00:00Z"), TZ).periodKey, "2026-10-12", "midweek: last week");
});

test("a report written in the last minute reads Events up to its own moment, and a later Event never makes it stale", async () => {
  const week = weeklyPeriodForLocalDate("2026-10-19", TZ), asOf = new Date("2026-10-26T06:59:20Z");
  const cutoff = weeklySourceEnd(week, asOf);
  assert.equal(cutoff.toISOString(), asOf.toISOString());
  assert.equal(weeklySourceEnd(week, new Date("2026-10-27T00:00:00Z")).toISOString(), "2026-10-26T07:00:00.000Z");
  const event = (id, occurredAt) => ({ id, ownerId: "alice", occurredAt: new Date(occurredAt), updatedAt: new Date(occurredAt),
    memoryProcessingAllowed: true, primaryGardenMood: null, memory: null });
  const events = [event("e-1", "2026-10-20T18:00:00Z"), event("e-late", "2026-10-26T06:59:40Z")];
  const reads = [];
  const tx = { $queryRawUnsafe: async query => query.includes('"User"') ? [{ timezone: TZ, preferredLocale: "en" }] : [],
    event: { findMany: async ({ where }) => { reads.push(where.occurredAt.lt);
      return events.filter(item => item.occurredAt >= where.occurredAt.gte && item.occurredAt < where.occurredAt.lt); } } };
  const input = { reportType: "WEEKLY", period: week, evidenceSelection: { evidence: [] },
    aggregates: { periodKey: week.periodKey, periodStartUtc: week.periodStartUtc, periodEndUtc: week.periodEndUtc },
    sourceFence: { consentUpdatedAt: new Date("2026-01-01T00:00:00Z"), sources: reportSourceSnapshot([events[0]]), cutoffUtc: cutoff } };
  await assertReportSources(tx, "alice", input);
  assert.equal(reads[0].toISOString(), cutoff.toISOString(), "the fence reads only up to the cutoff");
  // A cutoff after the week ends, or on a Monthly report, is refused.
  await assert.rejects(assertReportSources(tx, "alice", { ...input, sourceFence: { ...input.sourceFence, cutoffUtc: week.periodEndUtc } }),
    { code: "REPORT_SOURCE_STALE" });
  // Without a cutoff (written after the week ended) the late Event is a source like any other.
  await assert.rejects(assertReportSources(tx, "alice", { ...input, sourceFence: { ...input.sourceFence, cutoffUtc: undefined } }),
    { code: "REPORT_SOURCE_STALE" });
});

test("a time echo's earlier Event is locked and re-read by id; a changed or extra one makes the report stale", async () => {
  const week = weeklyPeriodForLocalDate("2026-10-19", TZ);
  const event = (id, occurredAt, summary) => ({ id, ownerId: "alice", occurredAt: new Date(occurredAt), updatedAt: new Date(occurredAt),
    memoryProcessingAllowed: true, primaryGardenMood: null,
    memory: { id: `m-${id}`, ownerId: "alice", sourceEventId: id, updatedAt: new Date(occurredAt), embeddingInputRevision: 1,
      memoryType: "EVENT", summary, topics: [], importanceScore: null, embeddingStatus: "DONE", embeddedInputRevision: 1 } });
  const far = event("far", "2026-03-12T12:00:00Z", "我又在凌晨三点醒来了。");
  let stored = far;
  const locks = [];
  const tx = { $queryRawUnsafe: async (query, ...args) => { if (query.includes("ANY($2")) locks.push(args[1]);
      return query.includes('"User"') ? [{ timezone: TZ, preferredLocale: "en" }] : []; },
    event: { findMany: async ({ where }) => where.id ? [stored].filter(item => where.id.in.includes(item.id)) : [] } };
  const input = { reportType: "WEEKLY", period: week, evidenceSelection: { evidence: [] },
    aggregates: { periodKey: week.periodKey, periodStartUtc: week.periodStartUtc, periodEndUtc: week.periodEndUtc },
    sourceFence: { consentUpdatedAt: new Date("2026-01-01T00:00:00Z"), sources: [], echoSources: reportSourceSnapshot([far]) } };
  await assertReportSources(tx, "alice", input);
  assert.deepEqual(locks, [["far"], ["far"]], "the Event and its memory are locked");
  stored = event("far", "2026-03-12T12:00:00Z", "改过了。");
  await assert.rejects(assertReportSources(tx, "alice", input), { code: "REPORT_SOURCE_STALE" });
  stored = far;
  await assert.rejects(assertReportSources(tx, "alice", { ...input, sourceFence: { ...input.sourceFence,
    echoSources: [...input.sourceFence.echoSources, ...input.sourceFence.echoSources] } }), { code: "REPORT_SOURCE_STALE" });
});
