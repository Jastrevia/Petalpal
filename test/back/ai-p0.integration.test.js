import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import { PrivateEventRepository } from "../../lib/ai-events.js";
import { AI_JOB_TYPES, PrismaAiJobRepository } from "../../lib/ai-jobs.js";
import {
  localDateForInstant,
  monthlyPeriodFor,
  reportPeriodStatus,
  weeklyPeriodForLocalDate
} from "../../lib/ai-periods.js";
import { WeeklyReportService } from "../../lib/report-foundation.js";
import { PrismaEventEmbeddingRepository } from "../../lib/semantic-retrieval.js";
import { LOCAL_EMBEDDING_PROFILE_KEY, PRODUCTION_EMBEDDING_PROFILE_KEY } from "../../lib/embedding-profiles.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationNames = [
  "202608250000_baseline",
  "202608250001_month1_product_models",
  "202608250002_firebase_auth",
  "202608250003_remove_legacy_passwords",
  "202608260001_context_aware_flower_engine",
  "202608260002_fairy_runtime_state",
  "202608260003_fairy_ownership_collection",
  "202608260004_monthly_fairy_twenty_days",
  "202608270001_emotion_routing",
  "202608270002_flower_variant_semantics",
  "202609030001_daily_grow_limit_toggle",
  "202609040001_flower_placement_fields",
  "202609040002_user_preferred_locale",
  "202609040003_enable_pgvector",
  "202609140001_ai_foundation",
  "202609170001_event_memory_embeddings",
  "202609170002_grounded_report_narratives",
  "202609280001_multi_profile_event_memory_embeddings"
];

async function migratedDatabase() {
  const database = new PGlite({ extensions: { vector } });
  for (const name of migrationNames) {
    await database.exec(await readFile(path.join(projectRoot, "prisma", "migrations", name, "migration.sql"), "utf8"));
  }
  return database;
}

function pgliteRawAdapter(database) {
  const adapt = (client) => ({
    $queryRawUnsafe: async (sql, ...params) => (await client.query(sql, params)).rows
  });
  return {
    ...adapt(database),
    $transaction: async (callback) => database.transaction(async (transaction) => callback(adapt(transaction)))
  };
}

async function seedOwners(database) {
  await database.exec(`
    INSERT INTO "User" ("id", "name", "timezone")
    VALUES ('alice', 'Alice', 'America/Vancouver'), ('bob', 'Bob', 'UTC');
    INSERT INTO "Event"
      ("id", "ownerId", "content", "occurredAt", "timezone", "localDate", "idempotencyKey", "memoryProcessingAllowed", "updatedAt")
    VALUES
      ('event-alice', 'alice', 'Alice private Event', '2026-09-15T06:30:00Z', 'America/Vancouver', '2026-09-14', 'event-request-alice', true, CURRENT_TIMESTAMP),
      ('event-bob', 'bob', 'Bob private Event', '2026-09-15T12:00:00Z', 'UTC', '2026-09-15', 'event-request-bob', true, CURRENT_TIMESTAMP);
    INSERT INTO "WeeklyReport"
      ("id", "ownerId", "timezone", "periodKey", "periodStartUtc", "periodEndUtc", "asOf", "eventCount", "updatedAt")
    VALUES
      ('weekly-alice', 'alice', 'America/Vancouver', '2026-09-14', '2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z', '2026-09-22T00:00:00Z', 1, CURRENT_TIMESTAMP);
    INSERT INTO "MonthlyReport"
      ("id", "ownerId", "timezone", "periodKey", "periodStartUtc", "periodEndUtc", "asOf", "year", "month", "eventCount", "updatedAt")
    VALUES
      ('monthly-alice', 'alice', 'America/Vancouver', '2026-09', '2026-09-01T07:00:00Z', '2026-10-01T07:00:00Z', '2026-10-02T00:00:00Z', 2026, 9, 1, CURRENT_TIMESTAMP);
  `);
}

test("database rejects cross-owner AI relations, invalid evidence shapes and duplicate evidence", async () => {
  const database = await migratedDatabase();
  try {
    await seedOwners(database);
    await assert.rejects(database.exec(`
      INSERT INTO "EventMemory"
        ("id", "ownerId", "sourceEventId", "memoryType", "summary", "eventDate", "updatedAt")
      VALUES ('cross-memory', 'bob', 'event-alice', 'EVENT', 'forbidden', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `), /foreign key|constraint/i);

    await assert.rejects(database.exec(`
      INSERT INTO "AIEvidence" ("id", "ownerId", "sourceEventId", "weeklyReportId")
      VALUES ('cross-evidence', 'bob', 'event-alice', 'weekly-alice')
    `), /foreign key|constraint/i);

    await assert.rejects(database.exec(`
      INSERT INTO "AIJob"
        ("id", "ownerId", "jobType", "resourceId", "eventId", "idempotencyKey", "updatedAt")
      VALUES ('cross-job', 'bob', 'MEMORY_EXTRACTION', 'event-alice', 'event-alice', 'cross-job-v1', CURRENT_TIMESTAMP)
    `), /foreign key|constraint/i);

    await assert.rejects(database.exec(`
      INSERT INTO "AIEvidence" ("id", "ownerId", "sourceEventId")
      VALUES ('no-report', 'alice', 'event-alice')
    `), /exactly_one_report|check constraint/i);

    await assert.rejects(database.exec(`
      INSERT INTO "AIEvidence" ("id", "ownerId", "sourceEventId", "weeklyReportId", "monthlyReportId")
      VALUES ('two-reports', 'alice', 'event-alice', 'weekly-alice', 'monthly-alice')
    `), /exactly_one_report|check constraint/i);

    await database.exec(`
      INSERT INTO "EventMemory"
        ("id", "ownerId", "sourceEventId", "memoryType", "summary", "eventDate", "updatedAt")
      VALUES ('memory-alice', 'alice', 'event-alice', 'EVENT', 'Alice memory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "AIEvidence" ("id", "ownerId", "sourceEventId", "sourceMemoryId", "weeklyReportId")
      VALUES ('valid-evidence', 'alice', 'event-alice', 'memory-alice', 'weekly-alice')
    `);
    await assert.rejects(database.exec(`
      INSERT INTO "AIEvidence" ("id", "ownerId", "sourceEventId", "weeklyReportId")
      VALUES ('duplicate-evidence', 'alice', 'event-alice', 'weekly-alice')
    `), /unique|duplicate/i);

    await assert.rejects(database.exec(`
      INSERT INTO "MonthlyReport"
        ("id", "ownerId", "timezone", "periodKey", "periodStartUtc", "periodEndUtc", "asOf", "year", "month", "eventCount", "updatedAt")
      VALUES ('invalid-month', 'alice', 'UTC', '2026-13', '2026-01-02', '2026-01-01', CURRENT_TIMESTAMP, 2026, 13, -1, CURRENT_TIMESTAMP)
    `), /check constraint/i);

    await database.exec(`DELETE FROM "Event" WHERE "id" = 'event-alice'`);
    const lifecycle = await database.query(`SELECT
      (SELECT count(*)::int FROM "EventMemory" WHERE "sourceEventId" = 'event-alice') AS memories,
      (SELECT count(*)::int FROM "AIEvidence" WHERE "sourceEventId" = 'event-alice') AS evidence,
      (SELECT count(*)::int FROM "WeeklyReport" WHERE "id" = 'weekly-alice') AS reports`);
    assert.deepEqual(lifecycle.rows[0], { memories: 0, evidence: 0, reports: 0 });
  } finally {
    await database.close();
  }
});

for (const profileKey of [LOCAL_EMBEDDING_PROFILE_KEY, PRODUCTION_EMBEDDING_PROFILE_KEY]) {
test(`pgvector Event retrieval is 384-dimensional, owner-scoped, exact, and cascade-safe (${profileKey})`, async () => {
  const database = await migratedDatabase();
  const first = [1, ...Array(383).fill(0)];
  const second = [0.8, 0.6, ...Array(382).fill(0)];
  const vectorText = (values) => `[${values.join(",")}]`;
  try {
    await seedOwners(database);
    await database.exec(`
      INSERT INTO "AiConsent"
        ("id", "userId", "termsVersion", "aiProcessing", "personalization", "memoryEnabled", "updatedAt")
      VALUES
        ('consent-alice', 'alice', 'v1', true, true, true, '2026-09-17T12:00:00.000Z'),
        ('consent-bob', 'bob', 'v1', true, true, true, '2026-09-17T12:00:00.000Z');
      INSERT INTO "EventMemory"
        ("id", "ownerId", "sourceEventId", "memoryType", "summary", "eventDate",
         "embeddingStatus", "embeddingModel", "embeddingProfileKey", "embeddingModelRevision",
         "embeddingInputVersion", "embeddingInputRevision", "embeddedInputRevision", "embedding", "embeddedAt", "updatedAt")
      VALUES
        ('memory-alice', 'alice', 'event-alice', 'EVENT', 'Alice relevant memory', CURRENT_TIMESTAMP,
         'NOT_REQUESTED', NULL, NULL, NULL, NULL, 1, NULL, NULL, NULL, CURRENT_TIMESTAMP),
        ('memory-bob', 'bob', 'event-bob', 'EVENT', 'Bob must not leak', CURRENT_TIMESTAMP,
         'GENERATED', 'Xenova/bge-small-en-v1.5', 'production-bge-small-en-v1.5-v1', 'main',
         'summary-v1', 1, 1, '${vectorText(first)}'::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const consent = (await database.query(`SELECT "updatedAt" FROM "AiConsent" WHERE "userId" = 'alice'`)).rows[0];
    // This fixture must select its intended representation explicitly: the
    // default now writes Cloudflare profile rows, not the retained inline vector.
    const repository = new PrismaEventEmbeddingRepository(pgliteRawAdapter(database), profileKey);
    await repository.begin({ identity: { userId: "alice" }, memoryId: "memory-alice", inputRevision: 1 });
    await repository.store({
      identity: { userId: "alice" },
      memoryId: "memory-alice",
      inputRevision: 1,
      vector: first,
      consentUpdatedAt: new Date(consent.updatedAt)
    });
    await repository.begin({ identity: { userId: "bob" }, memoryId: "memory-bob", inputRevision: 1 });
    await repository.store({ identity: { userId: "bob" }, memoryId: "memory-bob", inputRevision: 1,
      vector: first, consentUpdatedAt: new Date(consent.updatedAt) });
    const legacy = profileKey === LOCAL_EMBEDDING_PROFILE_KEY;
    const stored = (await database.query(legacy ? `
      SELECT "embeddingStatus", "embeddingProfileKey", "embeddedInputRevision"
      FROM "EventMemory" WHERE "id" = 'memory-alice'
    ` : `SELECT "status" AS "embeddingStatus", "profileKey" AS "embeddingProfileKey", "inputRevision" AS "embeddedInputRevision"
      FROM "EventMemoryEmbedding" WHERE "eventMemoryId"='memory-alice' AND "profileKey"='${profileKey}'`)).rows[0];
    assert.deepEqual(stored, {
      embeddingStatus: "GENERATED",
      embeddingProfileKey: profileKey,
      embeddedInputRevision: 1
    });
    await assert.rejects(database.exec(legacy ? `
      UPDATE "EventMemory" SET "embedding" = '[1,2,3]'::vector WHERE "id" = 'memory-alice'
    ` : `UPDATE "EventMemoryEmbedding" SET "embedding"='[1,2,3]'::vector WHERE "eventMemoryId"='memory-alice'`), /dimension|expected 384/i);

    const rows = await repository.search({
      identity: { userId: "alice" },
      vector: second,
      take: 10,
      consentUpdatedAt: new Date(consent.updatedAt)
    });
    assert.deepEqual(rows.map((row) => row.id), ["memory-alice"]);
    assert.equal(rows.some((row) => row.summary.includes("Bob")), false);

    await database.exec(`DELETE FROM "Event" WHERE "id" = 'event-alice'`);
    assert.equal((await database.query(`SELECT count(*)::int AS count FROM "EventMemory" WHERE "id" = 'memory-alice'`)).rows[0].count, 0);
    assert.equal((await database.query(`SELECT count(*)::int AS count FROM "EventMemoryEmbedding" WHERE "eventMemoryId" = 'memory-alice'`)).rows[0].count, 0);
  } finally {
    await database.close();
  }
});
}

test("Event deletion atomically removes every report that cites it", async () => {
  const state = {
    event: true,
    weekly: new Set(["weekly-1"]),
    monthly: new Set(["monthly-1"]),
    yearly: new Set(["yearly-1"])
  };
  const tx = {
    $queryRawUnsafe: async (sql, ...params) => {
      assert.match(sql, /FOR UPDATE/);
      return sql.includes('"AiConsent"') ? [{ userId: params[0] }] : state.event ? [{ id: params[0] }] : [];
    },
    event: {
      findFirst: async ({ where }) => state.event && where.ownerId === "alice" ? { id: where.id } : null,
      deleteMany: async () => { state.event = false; return { count: 1 }; }
    },
    aiEvidence: {
      findMany: async () => [{ weeklyReportId: "weekly-1", monthlyReportId: "monthly-1", yearlyReportId: "yearly-1" }]
    },
    weeklyReport: { findMany: async () => [], deleteMany: async ({ where }) => { where.id.in.forEach((id) => state.weekly.delete(id)); } },
    monthlyReport: { findMany: async () => [], deleteMany: async ({ where }) => { where.id.in.forEach((id) => state.monthly.delete(id)); } },
    yearlyReport: { deleteMany: async ({ where }) => { where.id.in.forEach((id) => state.yearly.delete(id)); } }
  };
  const repository = new PrivateEventRepository({ $transaction: async (callback) => callback(tx) });
  const deleted = await repository.deleteEventAndAffectedReports({ identity: { userId: "alice" }, eventId: "event-1" });
  assert.deepEqual(deleted.deletedReports, { weekly: 1, monthly: 1, yearly: 1 });
  assert.equal(state.event, false);
  assert.equal(state.weekly.size + state.monthly.size + state.yearly.size, 0);
});

test("report regeneration loads owner-period Events and atomically replaces evidence", async () => {
  const evidence = [];
  const report = { id: "weekly-1" };
  const eventRows = [
    { id: "event-current", ownerId: "alice", memoryProcessingAllowed: true, occurredAt: new Date("2026-09-15T12:00:00Z"), memory: { id: "memory-current", topics: ["career"], importanceScore: 0.9 } },
    { id: "event-previous", ownerId: "alice", memoryProcessingAllowed: true, occurredAt: new Date("2026-09-09T12:00:00Z"), memory: { id: "memory-previous", topics: ["study"], importanceScore: 0.2 } },
    { id: "event-bob", ownerId: "bob", memoryProcessingAllowed: true, occurredAt: new Date("2026-09-15T12:00:00Z"), memory: null }
  ];
  const tx = {
    $queryRawUnsafe: async (_query, ownerId) => [{ userId: ownerId, aiProcessing: true, personalization: true, memoryEnabled: true }],
    user: { findUnique: async () => ({ timezone: "America/Vancouver" }) },
    event: {
      findMany: async ({ where }) => eventRows.filter((event) =>
        event.ownerId === where.ownerId &&
        event.memoryProcessingAllowed === where.memoryProcessingAllowed &&
        event.occurredAt >= where.occurredAt.gte &&
        event.occurredAt < where.occurredAt.lt)
    },
    weeklyReport: {
      upsert: async ({ create, update }) => Object.assign(report, report.periodKey ? update : create)
    },
    aiEvidence: {
      deleteMany: async ({ where }) => {
        for (let index = evidence.length - 1; index >= 0; index -= 1) {
          if (evidence[index].ownerId === where.ownerId && evidence[index].weeklyReportId === where.weeklyReportId) evidence.splice(index, 1);
        }
      },
      createMany: async ({ data }) => { evidence.push(...data); }
    }
  };
  const service = new WeeklyReportService({ $transaction: async (callback) => callback(tx) });
  const input = { identity: { userId: "alice" }, localDate: "2026-09-15", asOf: new Date("2026-09-22T00:00:00Z") };
  await service.generate(input);
  await service.generate(input);
  assert.equal(report.eventCount, 1);
  assert.equal(report.periodKey, "2026-09-14");
  assert.deepEqual(evidence, [{
    ownerId: "alice",
    sourceEventId: "event-current",
    sourceMemoryId: "memory-current",
    weeklyReportId: "weekly-1"
  }]);
});

function pgliteJobAdapter(database) {
  return {
    $transaction: async (callback) => database.transaction(async (transaction) => callback({
      $queryRawUnsafe: async (sql, ...params) => (await transaction.query(sql, params)).rows
    })),
    $queryRawUnsafe: async (sql, ...params) => (await database.query(sql, params)).rows
  };
}

test("25 concurrent workers claim one job once and an expired lease is recoverable", async () => {
  const database = await migratedDatabase();
  try {
    await database.exec(`
      INSERT INTO "User" ("id", "name") VALUES ('owner', 'Owner');
      INSERT INTO "Event"
        ("id", "ownerId", "content", "occurredAt", "timezone", "localDate", "idempotencyKey", "memoryProcessingAllowed", "updatedAt")
      VALUES ('event-1', 'owner', 'durable', CURRENT_TIMESTAMP, 'UTC', '2026-09-14', 'event-request-1', true, CURRENT_TIMESTAMP);
      INSERT INTO "AIJob"
        ("id", "ownerId", "jobType", "resourceId", "eventId", "idempotencyKey", "maxAttempts", "nextAttemptAt", "updatedAt")
      VALUES ('job-1', 'owner', 'MEMORY_EXTRACTION', 'event-1', 'event-1', 'memory:event-1:v1', 3, '2026-09-14T11:00:00Z', CURRENT_TIMESTAMP);
    `);
    const repository = new PrismaAiJobRepository(pgliteJobAdapter(database));
    const now = new Date("2026-09-14T12:00:00Z");
    const claims = await Promise.all(Array.from({ length: 25 }, (_, index) =>
      repository.claimNext({ workerId: `worker-${index}`, now, leaseMs: 1_000 })
    ));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean).attemptCount, 1);

    const recovered = await repository.claimNext({
      workerId: "recovery-worker",
      now: new Date("2026-09-14T12:00:02Z"),
      leaseMs: 1_000
    });
    assert.equal(recovered.id, "job-1");
    assert.equal(recovered.lockedBy, "recovery-worker");
    assert.equal(recovered.attemptCount, 2);

    const succeeded = await database.query(`
      UPDATE "AIJob"
      SET "status" = 'SUCCEEDED', "completedAt" = '2026-09-14T12:00:03Z',
          "lockedAt" = NULL, "lockedBy" = NULL, "leaseExpiresAt" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'job-1'
      RETURNING "status"
    `);
    assert.equal(succeeded.rows[0].status, "SUCCEEDED");
    await assert.rejects(database.exec(`
      UPDATE "AIJob"
      SET "status" = 'PENDING', "completedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'job-1'
    `), /invalid AIJob status transition|constraint/i);
  } finally {
    await database.close();
  }
});

test("targeted job claim is exact, owner-scoped, type-scoped, and single-claim", async () => {
  const database = await migratedDatabase();
  try {
    await database.exec(`
      INSERT INTO "User" ("id", "name") VALUES ('alice', 'Alice'), ('bob', 'Bob');
      INSERT INTO "AIJob"
        ("id", "ownerId", "jobType", "resourceId", "idempotencyKey", "maxAttempts", "nextAttemptAt", "updatedAt")
      VALUES
        ('weekly-alice', 'alice', 'WEEKLY_REPORT', '2026-09-07', 'WEEKLY_REPORT:2026-09-07:v1', 1, '2026-09-15T00:00:00Z', CURRENT_TIMESTAMP),
        ('weekly-bob', 'bob', 'WEEKLY_REPORT', '2026-09-07', 'WEEKLY_REPORT:2026-09-07:v1', 1, '2026-09-15T00:00:00Z', CURRENT_TIMESTAMP);
    `);
    const repository = new PrismaAiJobRepository(pgliteJobAdapter(database));
    const now = new Date("2026-09-16T00:00:00Z");
    assert.equal(await repository.claimById({
      jobId: "weekly-alice",
      ownerId: "bob",
      jobType: AI_JOB_TYPES.WEEKLY_REPORT,
      workerId: "wrong-owner",
      now
    }), null);
    assert.equal(await repository.claimById({
      jobId: "weekly-alice",
      ownerId: "alice",
      jobType: AI_JOB_TYPES.MONTHLY_REPORT,
      workerId: "wrong-type",
      now
    }), null);

    const claims = await Promise.all(["target-1", "target-2"].map((workerId) => repository.claimById({
      jobId: "weekly-alice",
      ownerId: "alice",
      jobType: AI_JOB_TYPES.WEEKLY_REPORT,
      workerId,
      now
    })));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean).ownerId, "alice");
    assert.equal(claims.find(Boolean).jobType, AI_JOB_TYPES.WEEKLY_REPORT);

    const statuses = (await database.query(`
      SELECT "id", "status" FROM "AIJob" ORDER BY "id"
    `)).rows;
    assert.deepEqual(statuses, [
      { id: "weekly-alice", status: "RUNNING" },
      { id: "weekly-bob", status: "PENDING" }
    ]);
  } finally {
    await database.close();
  }
});

test("Vancouver local dates and report periods are stable across UTC, month, week and DST boundaries", () => {
  assert.equal(localDateForInstant("2026-09-15T06:30:00Z", "America/Vancouver"), "2026-09-14");
  assert.equal(localDateForInstant("2026-10-01T06:30:00Z", "America/Vancouver"), "2026-09-30");

  const sunday = weeklyPeriodForLocalDate("2026-09-20", "America/Vancouver");
  const monday = weeklyPeriodForLocalDate("2026-09-21", "America/Vancouver");
  assert.equal(sunday.periodKey, "2026-09-14");
  assert.equal(monday.periodKey, "2026-09-21");
  assert.equal(sunday.periodEndUtc.getTime(), monday.periodStartUtc.getTime());

  const dstWeek = weeklyPeriodForLocalDate("2026-03-08", "America/Vancouver");
  assert.equal((dstWeek.periodEndUtc - dstWeek.periodStartUtc) / 3_600_000, 167);

  const september = monthlyPeriodFor({ year: 2026, month: 9, timezone: "America/Vancouver" });
  assert.equal(september.periodStartUtc.toISOString(), "2026-09-01T07:00:00.000Z");
  assert.equal(september.periodEndUtc.toISOString(), "2026-10-01T07:00:00.000Z");
  assert.equal(reportPeriodStatus(september.periodEndUtc, new Date("2026-10-02T00:00:00Z")), "COMPLETE");
  assert.throws(
    () => reportPeriodStatus(september.periodEndUtc, new Date("2026-09-15T00:00:00Z")),
    (error) => error.code === "AI_REPORT_PERIOD_OPEN"
  );
  assert.equal(
    reportPeriodStatus(september.periodEndUtc, new Date("2026-09-15T00:00:00Z"), true),
    "PARTIAL"
  );
});
