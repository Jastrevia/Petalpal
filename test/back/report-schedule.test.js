import assert from "node:assert/strict";
import test from "node:test";
import { scheduleWeeklyReports, weeklyScheduleOwners } from "../../lib/report-schedule.js";
import { REPORT_NARRATIVE_GENERATION_VERSION } from "../../lib/report-narrative.js";

// Synthetic owners only. 2026-10-26T06:59:30Z is Sunday 23:59:30 in Vancouver and already Monday in Tokyo.
const NOW = new Date("2026-10-26T06:59:30Z");
function fake({ users, jobs = [], consent = () => true }) {
  const created = [];
  const db = {
    $queryRawUnsafe: async (query, ...args) => query.includes('"AiConsent"') && query.includes("FOR SHARE")
      ? (consent(args[0]) ? [{ userId: args[0], aiProcessing: true, personalization: true, memoryEnabled: true }] : [])
      : users.filter(user => !args[0] || args[0].includes(user.id)),
    aiJob: {
      findMany: async ({ where }) => [...jobs, ...created].filter(job => where.ownerId.in.includes(job.ownerId) && where.idempotencyKey.in.includes(job.idempotencyKey)),
      createMany: async ({ data }) => { for (const row of data) created.push({ id: `job-${created.length + 1}`, status: "PENDING", ...row }); return { count: data.length }; },
      findUnique: async ({ where }) => [...jobs, ...created].find(job => job.ownerId === where.ownerId_idempotencyKey.ownerId &&
        job.idempotencyKey === where.ownerId_idempotencyKey.idempotencyKey) ?? null
    }
  };
  db.$transaction = fn => fn(db);
  return { db, created };
}
const key = periodKey => `WEEKLY_REPORT:${periodKey}:${REPORT_NARRATIVE_GENERATION_VERSION}`;

test("the owner list is off by default; malformed means off", () => {
  assert.equal(weeklyScheduleOwners({}), null);
  assert.equal(weeklyScheduleOwners({ AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: "*" }), "*");
  assert.deepEqual(weeklyScheduleOwners({ AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: " alice, bob " }), ["alice", "bob"]);
  assert.equal(weeklyScheduleOwners({ AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: "alice;bob" }), null);
});

test("each consenting owner gets one job for their own newest ready week, never twice", async () => {
  const users = [{ id: "alice", timezone: "America/Vancouver" }, { id: "bob", timezone: "America/New_York" },
    { id: "carol", timezone: "Asia/Tokyo" }, { id: "dan", timezone: "Not/AZone" }];
  const off = fake({ users });
  assert.deepEqual(await scheduleWeeklyReports({ prisma: off.db, now: NOW, env: {} }), []);
  const run = fake({ users, jobs: [{ id: "old", ownerId: "carol", idempotencyKey: key("2026-10-19"), jobType: "WEEKLY_REPORT", resourceId: "2026-10-19", eventId: null }] });
  const env = { AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: "*" };
  const jobs = await scheduleWeeklyReports({ prisma: run.db, now: NOW, env });
  // Vancouver: Sunday 23:59, this week. New York: already Monday, the week just ended (the same week).
  // Tokyo already has its job; an invalid timezone is skipped.
  assert.deepEqual(jobs.map(job => [job.ownerId, job.resourceId, job.maxAttempts]), [["alice", "2026-10-19", 1], ["bob", "2026-10-19", 1]]);
  assert.deepEqual(await scheduleWeeklyReports({ prisma: run.db, now: NOW, env }), [], "a second run finds nothing to do");
  // One minute earlier Vancouver's week is not ready yet: it gets the week before.
  const early = fake({ users: [users[0]] });
  assert.equal((await scheduleWeeklyReports({ prisma: early.db, now: new Date("2026-10-26T06:58:30Z"), env }))[0].resourceId, "2026-10-12");
});

test("the batch cap, the owner list and a consent withdrawn in between are respected", async () => {
  const users = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, timezone: "UTC" }));
  const capped = fake({ users });
  assert.equal((await scheduleWeeklyReports({ prisma: capped.db, now: NOW, env: { AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: "*" }, limit: 2 })).length, 2);
  const listed = fake({ users });
  assert.deepEqual((await scheduleWeeklyReports({ prisma: listed.db, now: NOW, env: { AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: "u3" } })).map(job => job.ownerId), ["u3"]);
  const withdrawn = fake({ users: users.slice(0, 2), consent: id => id !== "u0" });
  assert.deepEqual((await scheduleWeeklyReports({ prisma: withdrawn.db, now: NOW, env: { AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS: "*" } })).map(job => job.ownerId), ["u1"]);
});
