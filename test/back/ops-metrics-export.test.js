import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { exportOpsMetrics, gatewayDaily, toCsv } from "../../scripts/export-ops-metrics.mjs";

// Fresh in-memory PostgreSQL with only the columns the export reads; no local or production database.
async function fixture(t) {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(`
    CREATE TABLE "User" ("id" text PRIMARY KEY, "email" text, "createdAt" timestamp(3) NOT NULL);
    CREATE TABLE "Event" ("id" text PRIMARY KEY, "ownerId" text, "content" text, "occurredAt" timestamp(3) NOT NULL);
    CREATE TABLE "Flower" ("id" text PRIMARY KEY, "userId" text, "createdAt" timestamp(3) NOT NULL);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY, "createdAt" timestamp(3) NOT NULL, "eventType" varchar(64), "actorUserId" text,
      "targetClass" varchar(64), "targetSafeId" varchar(128), "actionCode" varchar(64), "reasonCode" varchar(64));
    CREATE TABLE "AiInteractionMetadata" ("id" text PRIMARY KEY, "userId" text, "task" text, "provider" text, "latencyMs" int,
      "inputTokens" int, "outputTokens" int, "success" boolean, "createdAt" timestamp(3) NOT NULL);
    CREATE TABLE "AIJob" ("id" text PRIMARY KEY, "ownerId" text, "jobType" text, "status" text, "attemptCount" int, "createdAt" timestamp(3) NOT NULL,
      "lastError" text);
    INSERT INTO "User" VALUES ('alice','alice@example.invalid','2026-10-01 08:00'), ('bob','bob@example.invalid','2026-10-02 23:59');
    INSERT INTO "Event" VALUES ('e1','alice','private journal text','2026-10-02 10:00'), ('e2','alice','more private text','2026-10-02 22:00'),
      ('e3','bob','bob private text','2026-10-02 23:30'), ('e4','alice','next day','2026-10-03 00:01');
    INSERT INTO "Flower" VALUES ('f1','alice','2026-10-02 10:00'), ('f2','bob','2026-10-02 23:30');
    INSERT INTO "AuditEvent" VALUES
      ('r1:usage','2026-10-02 10:00','AI_GATEWAY_USAGE','alice','ANTHROPIC','claude-haiku-5-5','EVENT_EMOTION','1000:200:0'),
      ('r2:usage','2026-10-02 11:00','AI_GATEWAY_USAGE','bob','ANTHROPIC','claude-haiku-5-5','EVENT_EMOTION','500:100:0'),
      ('r3:usage','2026-10-03 09:00','AI_GATEWAY_USAGE','alice','ANTHROPIC','claude-sonnet-5-5','WEEKLY_REPORT','6000:900:0'),
      ('r1:usd','2026-10-02 10:00','AI_GATEWAY_USD_RESERVED','alice','ANTHROPIC',NULL,'EVENT_EMOTION','999999'),
      ('c1','2026-10-02 10:00','AI_COST_RESERVED','alice','CLOUDFLARE_WORKERS_AI',NULL,'EVENT_EMOTION','1'),
      ('c2','2026-10-02 11:00','AI_COST_RESERVED','bob','CLOUDFLARE_WORKERS_AI',NULL,'EVENT_EMOTION','1'),
      ('c3','2026-10-02 12:00','AI_COST_RESERVED','alice','CLOUDFLARE_WORKERS_AI',NULL,'EVENT_EMOTION','1'),
      ('c4','2026-10-03 09:00','AI_COST_RESERVED','alice','CLOUDFLARE_WORKERS_AI',NULL,'WEEKLY_REPORT','2');
    INSERT INTO "AiInteractionMetadata" VALUES ('m1','alice','EMBEDDING','CLOUDFLARE',400,300,0,true,'2026-10-02 10:00'),
      ('m2','bob','EMBEDDING','CLOUDFLARE',600,200,0,false,'2026-10-02 12:00');
    INSERT INTO "AIJob" VALUES ('j1','alice','EMBEDDING_GENERATION','SUCCEEDED',1,'2026-10-02 10:00',NULL),
      ('j2','bob','EMBEDDING_GENERATION','FAILED',3,'2026-10-02 12:00','AI job failed'),
      ('j3','alice','EMBEDDING_GENERATION','SUCCEEDED',2,'2026-10-02 13:00',NULL),
      ('j4','alice','WEEKLY_REPORT','FAILED',1,'2026-10-03 09:00','AI job failed: REPORT_NARRATIVE_TIMEOUT'),
      ('j5','bob','WEEKLY_REPORT','FAILED',1,'2026-10-03 10:00','AI job failed: REPORT_NARRATIVE_TIMEOUT'),
      ('j6','bob','WEEKLY_REPORT','FAILED',1,'2026-10-03 11:00','private provider detail for bob');
  `);
  return async sql => (await pg.query(sql)).rows;
}

test("exports per-UTC-day aggregates for activity, Claude cost, other AI calls and jobs", async t => {
  const files = await exportOpsMetrics(await fixture(t));
  assert.equal(files["daily_activity.csv"], [
    "date,newUsers,events,activeUsers,flowers",
    "2026-10-01,1,0,0,0",
    "2026-10-02,1,3,2,2",
    "2026-10-03,0,1,1,0", ""].join("\n"));
  // Haiku: (1500 in × 100 + 300 out × 500) nano-USD; Sonnet: 6000 × 2000 + 900 × 10000.
  assert.equal(files["ai_gateway_daily.csv"], [
    "date,action,provider,model,calls,inputTokens,outputTokens,estCostUsd",
    "2026-10-02,EVENT_EMOTION,ANTHROPIC,claude-haiku-5-5,2,1500,300,0.0003",
    "2026-10-03,WEEKLY_REPORT,ANTHROPIC,claude-sonnet-5-5,1,6000,900,0.021", ""].join("\n"));
  assert.equal(files["ai_calls_daily.csv"].split("\n")[1], "2026-10-02,EMBEDDING,CLOUDFLARE,2,1,500,500,0");
  assert.deepEqual(files["ai_jobs_daily.csv"].trim().split("\n").slice(1),
    ["2026-10-02,EMBEDDING_GENERATION,FAILED,1,3", "2026-10-02,EMBEDDING_GENERATION,SUCCEEDED,2,1.5", "2026-10-03,WEEKLY_REPORT,FAILED,3,1"]);
  assert.deepEqual(files["ai_reservations_daily.csv"].trim().split("\n"), ["date,action,provider,calls,users",
    "2026-10-02,EVENT_EMOTION,CLOUDFLARE_WORKERS_AI,3,2", "2026-10-03,WEEKLY_REPORT,CLOUDFLARE_WORKERS_AI,2,1"]);
  const totals = Object.fromEntries(files["ops_totals.csv"].trim().split("\n").slice(1).map(line => line.split(",")));
  assert.deepEqual({ ...totals, activeUsers7d: undefined, activeUsers30d: undefined },
    { users: "2", usersWithEvents: "2", events: "4", flowers: "2", activeUsers7d: undefined, activeUsers30d: undefined });
  // Stored codes are counted; legacy and free-text lastError values never leave the database.
  assert.deepEqual(files["ai_job_failures_daily.csv"].trim().split("\n"), ["date,jobType,code,jobs",
    "2026-10-02,EMBEDDING_GENERATION,UNRECORDED,1", "2026-10-03,WEEKLY_REPORT,REPORT_NARRATIVE_TIMEOUT,2", "2026-10-03,WEEKLY_REPORT,UNRECORDED,1"]);
});

test("no user ids, emails or written text reach any exported file", async t => {
  const all = Object.values(await exportOpsMetrics(await fixture(t))).join("\n");
  for (const secret of ["alice", "bob", "example.invalid", "private", "journal", "r1:usage"]) assert.ok(!all.includes(secret), secret);
});

test("malformed token receipts and unknown models are skipped or cost zero, and CSV cells are quoted", () => {
  const rows = gatewayDaily([
    { date: "2026-10-02", action: "X", provider: "P", model: "unknown-model", tokens: "100:10:0" },
    { date: "2026-10-02", action: "X", provider: "P", model: "unknown-model", tokens: "garbage" }]);
  assert.deepEqual(rows, [{ date: "2026-10-02", action: "X", provider: "P", model: "unknown-model", calls: 1, inputTokens: 100, outputTokens: 10, estCostUsd: 0 }]);
  assert.equal(toCsv([{ a: 'x,"y"' }], ["a"]), 'a\n"x,""y"""\n');
});
