import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { weeklyPeriodForLocalDate } from "../../lib/ai-periods.js";
import { PrivateEventRepository } from "../../lib/ai-events.js";
import { PrismaAiJobRepository } from "../../lib/ai-jobs.js";
import { lockReportConsent, lockReportClaim, finishReportClaim, assertReportSources, reportSourceSnapshot } from "../../lib/report-write-fence.js";

// Fresh in-memory PostgreSQL engine; minimal test DDL only. No local database,
// URLs, production migrations, providers or containers are used. PGlite cannot
// demonstrate independent-connection PostgreSQL row-lock interleavings.
async function fixture(t) {
  // Match Prisma's UTC interpretation of timestamp-without-time-zone.
  const db = new PGlite({ parsers: { 1114: (value) => new Date(`${value}Z`) } });
  t.after(() => db.close());
  await db.exec(`
    CREATE TYPE "AIJobType" AS ENUM ('WEEKLY_REPORT', 'MONTHLY_REPORT');
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY, "aiProcessing" boolean, "personalization" boolean, "memoryEnabled" boolean, "updatedAt" timestamp(3));
    CREATE TABLE "User" ("id" text PRIMARY KEY, "timezone" text, "preferredLocale" text);
    CREATE TABLE "AIJob" ("id" text PRIMARY KEY, "ownerId" text, "jobType" "AIJobType", "resourceId" text, "idempotencyKey" text,
      "status" text, "attemptCount" integer, "lockedAt" timestamp(3), "lockedBy" text, "leaseExpiresAt" timestamp(3),
      "completedAt" timestamp(3), "updatedAt" timestamp(3), "lastError" text);
    CREATE TABLE "Event" ("id" text PRIMARY KEY, "ownerId" text, "occurredAt" timestamp(3), "updatedAt" timestamp(3), "memoryProcessingAllowed" boolean);
    CREATE TABLE "EventMemory" ("id" text PRIMARY KEY, "ownerId" text, "sourceEventId" text, "updatedAt" timestamp(3),
      "embeddingInputRevision" integer, "memoryType" text, "summary" text, "topics" json, "importanceScore" double precision,
      "embeddingStatus" text, "embeddedInputRevision" integer);
    CREATE TABLE "WrittenReport" ("id" text PRIMARY KEY);
    INSERT INTO "User" VALUES ('alice','UTC','en');
    INSERT INTO "AiConsent" VALUES ('alice',true,true,true,'2000-01-01');
    INSERT INTO "Event" VALUES ('event-1','alice','2026-09-15','2026-09-21',true);
    INSERT INTO "EventMemory" VALUES ('memory-1','alice','event-1','2026-09-21',1,'EVENT','synthetic evidence','[]',0.9,'GENERATED',1);
    INSERT INTO "AIJob" VALUES ('job-1','alice','WEEKLY_REPORT','2026-09-14','WEEKLY_REPORT:2026-09-14:v1',
      'RUNNING',1,(clock_timestamp() AT TIME ZONE 'UTC'),'worker-1',(clock_timestamp() AT TIME ZONE 'UTC') + interval '60 seconds',NULL,NULL,NULL);
  `);
  const tx = {
    async $queryRawUnsafe(query, ...args) { return (await db.query(query, args)).rows; },
    event: { async findMany({ where }) {
      return (await db.query(`SELECT event.*, row_to_json(memory) AS memory FROM "Event" AS event
        LEFT JOIN "EventMemory" AS memory ON memory."sourceEventId" = event."id" AND memory."ownerId" = event."ownerId"
        WHERE event."ownerId" = $1 AND event."memoryProcessingAllowed" = true
          AND event."occurredAt" >= $2 AND event."occurredAt" < $3 ORDER BY event."id"`,
      [where.ownerId, where.occurredAt.gte, where.occurredAt.lt])).rows;
    } }
  };
  const job = (await db.query('SELECT * FROM "AIJob"')).rows[0];
  const period = weeklyPeriodForLocalDate("2026-09-14", "UTC");
  const sources = await tx.event.findMany({ where: { ownerId: "alice", occurredAt: { gte: new Date("2026-09-07"), lt: period.periodEndUtc } } });
  const input = { reportType: "WEEKLY", period, aggregates: { ...period },
    sourceFence: { consentUpdatedAt: new Date("2000-01-01"), sources: reportSourceSnapshot(sources) },
    evidenceSelection: { evidence: [{ ownerId: "alice", sourceEventId: "event-1", sourceMemoryId: "memory-1",
      eventDate: new Date("2026-09-15"), summary: "synthetic evidence", topics: [], importanceScore: 0.9 }] }
  };
  const context = { ownerId: "alice", job, workerId: "worker-1", generationVersion: "v1", reportType: "WEEKLY", periodKey: period.periodKey };
  async function persist(afterWrite = async () => {}) {
    await db.exec("BEGIN");
    try {
      await lockReportConsent(tx, context.ownerId, input.sourceFence.consentUpdatedAt);
      await lockReportClaim(tx, context);
      await assertReportSources(tx, context.ownerId, input);
      await db.exec('INSERT INTO "WrittenReport" VALUES (\'report-1\')');
      await afterWrite();
      await finishReportClaim(tx, context);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  return { db, tx, job, input, context, persist };
}

for (const [name, mutation, code] of [
  ["consent revoked", `UPDATE "AiConsent" SET "memoryEnabled"=false`, "AI_FORBIDDEN"],
  ["consent epoch changed after regrant", `UPDATE "AiConsent" SET "updatedAt"='2000-01-02'`, "REPORT_SOURCE_STALE"],
  ["Event deleted", `DELETE FROM "Event"`, "REPORT_SOURCE_STALE"],
  ["Event revised", `UPDATE "Event" SET "updatedAt"='2026-09-22'`, "REPORT_SOURCE_STALE"],
  ["memory revision changed", `UPDATE "EventMemory" SET "embeddingInputRevision"=2`, "REPORT_SOURCE_STALE"],
  ["period eligibility changed", `UPDATE "Event" SET "occurredAt"='2026-10-03'`, "REPORT_SOURCE_STALE"],
  ["cross-owner source", `UPDATE "Event" SET "ownerId"='bob'`, "REPORT_SOURCE_STALE"],
  ["cross-owner claimed job", `UPDATE "AIJob" SET "ownerId"='bob'`, "AI_JOB_LEASE_LOST"],
  ["lease expired", `UPDATE "AIJob" SET "leaseExpiresAt"='2000-01-01'`, "AI_JOB_LEASE_LOST"],
  ["lease reclaimed", `UPDATE "AIJob" SET "lockedBy"='worker-2', "attemptCount"=2`, "AI_JOB_LEASE_LOST"],
  ["same-ID claim ABA", `UPDATE "AIJob" SET "attemptCount"=2`, "AI_JOB_LEASE_LOST"]
]) test(`in-memory PostgreSQL SQL fence: ${name}`, async (t) => {
  const f = await fixture(t);
  await f.db.exec(mutation);
  await assert.rejects(f.persist(), (error) => error.code === code);
  assert.equal((await f.db.query('SELECT * FROM "WrittenReport"')).rows.length, 0);
  assert.equal((await f.db.query('SELECT "status" FROM "AIJob"')).rows[0].status, "RUNNING");
});

test("SQL guarded completion commits once and rejects stale duplicate completion", async (t) => {
  const f = await fixture(t);
  await f.persist();
  assert.equal((await f.db.query('SELECT * FROM "WrittenReport"')).rows.length, 1);
  assert.equal((await f.db.query('SELECT "status" FROM "AIJob"')).rows[0].status, "SUCCEEDED");
  await assert.rejects(f.persist(), (error) => error.code === "AI_JOB_LEASE_LOST");
  assert.equal((await f.db.query('SELECT * FROM "WrittenReport"')).rows.length, 1);
});

test("SQL expiry after write rolls back the transaction rather than succeeding", async (t) => {
  const f = await fixture(t);
  let wrote = false;
  await assert.rejects(f.persist(async () => {
    wrote = true;
    await f.db.exec(`UPDATE "AIJob" SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') + interval '10 milliseconds'`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }), (error) => error.code === "AI_JOB_LEASE_LOST");
  assert.equal(wrote, true);
  assert.equal((await f.db.query('SELECT * FROM "WrittenReport"')).rows.length, 0);
  assert.equal((await f.db.query('SELECT "status" FROM "AIJob"')).rows[0].status, "RUNNING");
});

test("Event deletion takes owner/source locks before report discovery even without consent", async () => {
  const steps = [];
  const tx = {
    async $queryRawUnsafe(sql) { steps.push(sql.includes('"AiConsent"') ? "consent lock" : "source lock"); return []; },
    event: { async findFirst() { steps.push("event"); return { id: "event-1" }; }, async deleteMany() { steps.push("delete"); } },
    aiEvidence: { async findMany() { steps.push("discover"); return []; } },
    weeklyReport: { async findMany() { steps.push("mood curve"); return []; } },
    monthlyReport: { async findMany() { steps.push("month garden"); return []; } }
  };
  await new PrivateEventRepository({ async $transaction(fn) { return fn(tx); } }).deleteEventAndAffectedReports({ identity: { userId: "alice" }, eventId: "event-1" });
  assert.deepEqual(steps, ["consent lock", "source lock", "event", "discover", "mood curve", "month garden", "delete"]);
});

test("heartbeat/completion/failure cannot act on a newer same-ID worker attempt", async () => {
  const claim = { ownerId: "alice", attemptCount: 1, lockedAt: new Date("2026-10-01") };
  const now = new Date("2026-10-02");
  let guarded = 0;
  const repo = new PrismaAiJobRepository({
    aiJob: { async updateMany({ where }) {
      assert.equal(where.attemptCount, 1); assert.equal(where.lockedAt, claim.lockedAt);
      assert.equal(where.ownerId, "alice");
      if (where.leaseExpiresAt) assert.equal(where.leaseExpiresAt.gt, now);
      guarded += 1; return { count: 0 };
    }, async findUnique() { return { status: "RUNNING" }; } },
    async $queryRawUnsafe(sql, ...args) {
      assert.match(sql, /"attemptCount" = \$6 AND "lockedAt" = \$7 AND "ownerId" = \$8/);
      assert.deepEqual(args.slice(5), [1, claim.lockedAt, "alice"]); guarded += 1; return [];
    }
  });
  assert.equal((await repo.renewLease({ jobId: "job-1", workerId: "same-worker", claim, now })).count, 0);
  assert.equal((await repo.markSucceeded({ jobId: "job-1", workerId: "same-worker", claim, now })).count, 0);
  assert.equal(await repo.cancelClaimed({ jobId: "job-1", workerId: "same-worker", claim, now }), false);
  assert.equal(await repo.markFailed({ jobId: "job-1", workerId: "same-worker", claim, now, error: new Error("safe") }), null);
  assert.equal(guarded, 4);
});
