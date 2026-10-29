import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createProductionAiWorker } from "../../lib/ai-worker.js";
import { ReportInputService, REPORT_EVIDENCE_LIMITS } from "../../lib/report-foundation.js";
import { getEmbeddingProfile, PRODUCTION_EMBEDDING_PROFILE_KEY } from "../../lib/embedding-profiles.js";
import { REPORT_NARRATIVE_GENERATION_VERSION } from "../../lib/report-narrative.js";
import { weeklyReportLocale } from "../../lib/report-locale.js";
import { PrismaAiCostGate } from "../../lib/ai-cost-gate.js";
import { assertReportSources } from "../../lib/report-write-fence.js";
import { buildWeeklyReflectionPacket, validateWeeklyReflection, weeklyReportProvider,
  WEEKLY_REFLECTION_CONTRACT, SONNET_WEEKLY_MODEL, SonnetWeeklyReflectionService } from "../../lib/sonnet-weekly.js";
import { REFLECTION_V2, REFLECTION_V2_INSTRUCTIONS } from "../../lib/reflection-v2.js";
import { GATEWAY_TASK_LIMITS } from "../../lib/ai-gateway-config.js";
import { WEEKLY_RETROSPECTIVE_INSTRUCTIONS, WEEKLY_NARRATIVE_THREAD_INSTRUCTIONS } from "../../lib/weekly-editorial.js";
import { WEEKLY_SHORT, WEEKLY_SHORT_INSTRUCTIONS } from "../../lib/weekly-short.js";
import { WEEKLY_2, WEEKLY_2_INSTRUCTIONS } from "../../lib/insight-write.js";
import { exemplars as threadExemplars } from "../../experiments/weekly-narrative-thread-v1/fixtures.mjs";
import { corpus as editorialCorpus, targets as editorialTargets } from "../../experiments/weekly-editorial-quality-v1/fixtures.mjs";

const enabled = { AI_WEEKLY_REPORT_PROVIDER: "anthropic", AI_WEEKLY_REPORT_MODEL: SONNET_WEEKLY_MODEL,
  AI_GATEWAY_ENABLED: "true", AI_GATEWAY_ANTHROPIC_ENABLED: "true",
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_GATEWAY_ID: "synthetic-weekly",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "synthetic-gateway", ANTHROPIC_API_KEY: "synthetic-provider",
  AI_USER_DAILY_USD_LIMIT: "10", AI_USER_MONTHLY_USD_LIMIT: "10", AI_GLOBAL_DAILY_USD_LIMIT: "10",
  AI_GLOBAL_MONTHLY_USD_LIMIT: "10", AI_ANTHROPIC_MONTHLY_USD_LIMIT: "10" };
const summaries = locale => locale === "en" ? ["I finished a sketch. It was a quiet afternoon.", "I shared my drawing with a friend."]
  : locale === "zh-Hant" ? ["今天畫完了一幅素描。那個下午很安靜。", "我把畫分享給朋友，聊了彼此的近況。"]
    : ["今天画完了一幅素描。那个下午很安静。", "我把画分享给朋友，聊了彼此的近况。"];
function output(packet) {
  return { version: WEEKLY_REFLECTION_CONTRACT, locale: packet.locale,
    moments: packet.evidence.filter(item => item.sentences.length).slice(0, 2).map(item => ({ ref: item.ref, quote: item.sentences[0] })), insights: [] };
}
const native = data => ({ model: SONNET_WEEKLY_MODEL, type: "message", role: "assistant", stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(data) }], usage: { input_tokens: 300, output_tokens: 100 } });

// This test-only matrix passes the flag into the actual worker factory. Ambient
// production flags cannot override the explicit v1/default-routing regressions.
const matrixMode = process.env.PETALPAL_WEEKLY_SELECTOR_TEST_MODE;
if (matrixMode !== undefined && !["OFF", "ON"].includes(matrixMode)) throw Error("Invalid selector test mode");
const matrixModes = matrixMode ? [matrixMode] : ["OFF", "ON"];
const quotedV2 = packet => ({ version: REFLECTION_V2.WEEKLY, locale: packet.locale,
  paragraphs: [{ sentences: packet.evidence.map(item => ({ text: `“${item.text}”`, refs: [item.ref] })) }] });
for (const mode of matrixModes) for (const locale of ["en", "zh-CN"]) {
  const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY,
    AI_WEEKLY_EVIDENCE_SELECTOR_V2: mode === "ON" ? "true" : "false" };
  test(`selector ${mode}/${locale}: realistic week reaches worker with exact provenance and budgets`, async t => {
    const f = await fixture(t, { locale, count: 7 });
    const texts = locale === "en" ? [
      "I sent the bridge proposal to Mina.", "I shared a charcoal sketch with Lee.",
      "Mina marked the cost section in the bridge proposal.", "An unrelated coupon arrived in my mailbox.",
      "I rewrote the bridge proposal using Mina's cost notes.",
      "I did not approve the bridge proposal cost plan; the missing fees remain unresolved.", "I bought groceries for dinner."
    ] : ["我把桥梁方案发给了小敏。", "我把炭笔素描分享给了小林。", "小敏在桥梁方案的费用部分做了标记。",
      "信箱里收到一张无关的优惠券。", "我根据小敏的费用意见修改了桥梁方案。",
      "我没有同意桥梁方案的费用计划，漏掉的费用还没解决。", "我买了晚饭要用的蔬菜。"];
    for (let i = 0; i < texts.length; i++) {
      await f.pg.query('UPDATE "Event" SET "occurredAt"=$1 WHERE "id"=$2', [new Date(`2026-09-${14 + i}T12:00:00Z`), `event-${i}`]);
      await f.pg.query('UPDATE "EventMemory" SET "summary"=$1,"topics"=$2 WHERE "id"=$3',
        [texts[i], JSON.stringify([i === 1 ? "drawing" : i === 6 ? "errands" : "proposal"]), `memory-${i}`]);
    }
    f.respond(packet => Response.json(native(quotedV2(packet))));
    const result = await f.run(settings); assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(f.calls.length, 1); assert.equal(f.retrievalCalls, locale === "en" ? 1 : 0); assert.equal(f.legacyCalls, 0);
    const indices = mode === "ON" ? [0, 1, 2, 4, 5, 6] : [0, 1, 2, 6];
    const { packet, body, options } = f.calls[0];
    assert.deepEqual(packet.evidence.map(e => e.text), indices.map(i => texts[i]));
    assert.ok(packet.evidence.length <= REPORT_EVIDENCE_LIMITS.WEEKLY.maxEvidence);
    assert.ok(packet.evidence.reduce((n, e) => n + e.text.length + 96, 0) <= REPORT_EVIDENCE_LIMITS.WEEKLY.maxContextCharacters);
    assert.ok(Buffer.byteLength(JSON.stringify(body)) + 1024 <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
    assert.doesNotMatch(JSON.stringify(packet), /alice|bob|event-\d|memory-\d|sourceFence|ownerId|Journal/);
    assert.equal(body.system, REFLECTION_V2_INSTRUCTIONS.WEEKLY);
    assert.equal(options.headers["cf-aig-collect-log-payload"], "false");
    assert.equal(options.headers["cf-aig-max-attempts"], "1");
    const evidence = await f.rows("AIEvidence");
    assert.deepEqual(evidence.map(e => e.sourceEventId).sort(), indices.map(i => `event-${i}`).sort());
    for (const e of evidence) { assert.equal(e.ownerId, "alice"); assert.equal(e.sourceMemoryId, e.sourceEventId.replace("event-", "memory-")); }
    const saved = (await f.rows("WeeklyReport"))[0].document;
    await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
    assert.equal((await f.run(settings)).result.skipped, true); assert.equal(f.calls.length, 1);
    assert.deepEqual((await f.rows("WeeklyReport"))[0].document, saved);
  });
  for (const mutation of ["consent", "owner", "optout", "journal", "window", "budget"]) {
    test(`selector ${mode}/${locale}: ${mutation} blocks dispatch`, async t => {
      const f = await fixture(t, { locale });
      if (mutation === "consent") await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
      if (mutation === "owner") await f.pg.exec('UPDATE "EventMemory" SET "ownerId"=\'bob\'');
      if (mutation === "optout") await f.pg.exec('UPDATE "Event" SET "memoryProcessingAllowed"=false');
      if (mutation === "journal") await f.pg.exec('UPDATE "EventMemory" SET "memoryType"=\'JOURNAL\'');
      if (mutation === "window") await f.pg.exec('UPDATE "Event" SET "occurredAt"=\'2026-09-21\'');
      const result = await f.run({ ...settings, ...(mutation === "budget" ? { AI_WEEKLY_REPORT_DAILY_LIMIT: "0" } : {}) });
      assert.equal(f.calls.length, 0);
      assert.equal(f.retrievalCalls, locale === "en" && !["consent", "budget"].includes(mutation) ? 1 : 0);
      assert.ok(result.succeeded === false || ["INSUFFICIENT_EVIDENCE", "CONSENT_INELIGIBLE"].includes(result.result?.status));
      assert.equal((await f.rows("AIEvidence")).length, 0);
    });
  }
  for (const mutation of ["revoke", "epoch", "delete", "memory", "locale"]) {
    test(`selector ${mode}/${locale}: ${mutation} fences a late mocked response`, async t => {
      const f = await fixture(t, { locale });
      f.respond(async packet => {
        if (mutation === "revoke") await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
        if (mutation === "epoch") await f.pg.exec('UPDATE "AiConsent" SET "updatedAt"=\'2099-01-01\'');
        if (mutation === "delete") await f.pg.exec('DELETE FROM "Event" WHERE "id"=\'event-0\'');
        if (mutation === "memory") await f.pg.exec('UPDATE "EventMemory" SET "summary"=\'Changed source\'');
        if (mutation === "locale") await f.pg.exec('UPDATE "User" SET "preferredLocale"=\'ja\'');
        return Response.json(native(quotedV2(packet)));
      });
      const result = await f.run(settings);
      assert.ok(result.succeeded === false || result.result?.status === "CONSENT_INELIGIBLE");
      assert.equal(f.calls.length, 1); assert.equal((await f.rows("WeeklyReport")).length, 0);
      assert.equal((await f.rows("AIEvidence")).length, 0);
    });
  }
  for (const stage of ["evidence", "completion"]) {
    test(`selector ${mode}/${locale}: ${stage} failure rolls back the entire write`, async t => {
      const f = await fixture(t, { locale }); f.respond(packet => Response.json(native(quotedV2(packet))));
      if (stage === "evidence") f.failEvidence(); else f.expireCompletion();
      assert.equal((await f.run(settings)).succeeded, false); assert.equal(f.calls.length, 1);
      assert.equal((await f.rows("WeeklyReport")).length, 0); assert.equal((await f.rows("AIEvidence")).length, 0);
      assert.notEqual((await f.rows("AIJob"))[0].status, "SUCCEEDED");
    });
  }
  for (const count of [0, 1]) test(`selector ${mode}/${locale}: sparse week ${count} makes no request`, async t => {
    const f = await fixture(t, { locale, count }), result = await f.run(settings);
    assert.equal(result.succeeded, true, result.error?.stack); assert.equal(result.result.status, "INSUFFICIENT_EVIDENCE");
    assert.equal(f.calls.length, 0); assert.equal((await f.rows("WeeklyReport"))[0].document.summary, null);
  });
  for (const kind of ["malformed", "unknown-ref"]) test(`selector ${mode}/${locale}: ${kind} fails without a repair or replay`, async t => {
    const f = await fixture(t, { locale });
    f.respond(packet => {
      if (kind === "malformed") return new Response("invalid", { headers: { "content-type": "application/json" } });
      const data = quotedV2(packet); data.paragraphs[0].sentences[0].refs = ["E99"];
      return Response.json(native(data));
    });
    assert.equal((await f.run(settings)).succeeded, false);
    assert.equal((await f.run(settings)).error.code, "AI_INFERENCE_ALREADY_RESERVED");
    assert.equal(f.calls.length, 1); assert.equal((await f.rows("WeeklyReport")).length, 0);
  });
  test(`selector ${mode}/${locale}: late response cannot persist after the deadline`, async t => {
    const f = await fixture(t, { locale }); let release, packet;
    f.respond(value => { packet = value; return new Promise(resolve => { release = resolve; }); });
    const result = await f.run({ ...settings, AI_WEEKLY_REPORT_TIMEOUT_MS: "250" });
    assert.equal(result.error.code, "AI_GATEWAY_TIMEOUT");
    const response = Response.json(native(quotedV2(packet))), reader = t.mock.method(response.body, "getReader");
    release(response); await new Promise(setImmediate); await new Promise(setImmediate);
    assert.equal(reader.mock.callCount(), 0); assert.equal((await f.rows("WeeklyReport")).length, 0);
    assert.equal((await f.run(settings)).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.calls.length, 1);
  });
  test(`selector ${mode}/${locale}: invalid selector settings fail closed in the worker`, async t => {
    for (const change of [{ AI_WEEKLY_EVIDENCE_SELECTOR_V2: "TRUE" },
      { AI_WEEKLY_EVIDENCE_SELECTOR_V2: "true", AI_WEEKLY_REFLECTION_CONTRACT: WEEKLY_REFLECTION_CONTRACT }]) {
      const f = await fixture(t, { locale }), result = await f.run({ ...settings, ...change });
      // Gateway intentionally hides prepareInput errors behind this fixed code;
      // direct service tests assert the underlying configuration error.
      assert.equal(result.error.code, "AI_GATEWAY_INVALID_INPUT");
      assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal(f.legacyCalls, 0);
    }
  });
}

test("selector flag reaches the worker: corrected evidence, one mocked request, provenance and finalized reuse", async t => {
  const texts = [
    "I am feeling calm about the upcoming presentation after reviewing the slides.",
    "I am not feeling calm about the upcoming presentation after reviewing the slides.",
    "I am no longer feeling calm about the upcoming presentation after reviewing the slides."
  ];
  const prepare = async f => {
    for (let i = 0; i < texts.length; i++) await f.pg.query('UPDATE "EventMemory" SET "summary"=$1 WHERE "id"=$2', [texts[i], `memory-${i}`]);
  };
  const respond = packet => Response.json(native({ version: REFLECTION_V2.WEEKLY, locale: packet.locale,
    paragraphs: [{ sentences: packet.evidence.map(item => ({ text: `“${item.text}”`, refs: [item.ref] })) }] }));
  const off = await fixture(t, { locale: "en", count: 3 }); await prepare(off);
  off.respond(respond);
  const offResult = await off.run({ ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY });
  assert.equal(offResult.succeeded, true, offResult.error?.stack); assert.equal(off.calls.length, 1);
  assert.deepEqual(off.calls[0].packet.evidence.map(e => e.text), [texts[0], texts[2]]);
  const on = await fixture(t, { locale: "en", count: 3 }); await prepare(on);
  on.respond(respond);
  const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, AI_WEEKLY_EVIDENCE_SELECTOR_V2: "true" };
  const result = await on.run(settings); assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(on.calls.length, 1); assert.equal(on.retrievalCalls, 1);
  assert.equal(on.calls[0].body.system, REFLECTION_V2_INSTRUCTIONS.WEEKLY);
  assert.deepEqual(on.calls[0].packet.evidence.map(e => e.text), texts);
  assert.equal((await on.rows("AIEvidence")).length, 3);
  const saved = (await on.rows("WeeklyReport"))[0].document;
  await on.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  const reused = await on.run(settings); assert.equal(reused.result.skipped, true); assert.equal(on.calls.length, 1);
  assert.deepEqual((await on.rows("WeeklyReport"))[0].document, saved);
});

function contractInput(locale = "zh-Hans") {
  const evidence = summaries(locale).map((summary, i) => ({ ownerId: "alice", sourceEventId: `event-${i}`, sourceMemoryId: `memory-${i}`,
    summary, topics: [locale === "en" ? "drawing" : "画画"], eventDate: `2026-09-${15 + i}T00:00:00Z`,
    provenance: { sourceEventId: `event-${i}`, sourceMemoryId: `memory-${i}` } }));
  const period = { periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14"), periodEndUtc: new Date("2026-09-21") };
  return { reportType: "WEEKLY", ownerId: "alice", locale, period, aggregates: { ...period, ownerId: "alice", eventCount: 2, topTopics: [] },
    evidenceSelection: { ownerId: "alice", status: "READY", evidence },
    sourceFence: { evidencePolicy: "weekly-localized-v1", sources: evidence.map(item => ({ id: item.sourceEventId,
      occurredAt: +new Date(item.eventDate), memory: { topics: item.topics } })) } };
}

// Disposable SQL engine and synthetic fixtures only; no real models, production
// schema/migrations, accounts or external connections. SQL rollback is real;
// independent-connection PostgreSQL row-lock scheduling is not simulated here.
// node:test keeps after-hook closures until the file ends; a hook that captures the PGlite instance (or the
// fixture scope) keeps every instance's WASM heap reachable across all tests. Capture only a holder and drop it.
function closeAfter(t, pg) {
  const holder = { pg };
  t.after(async () => { const db = holder.pg; holder.pg = null; await db?.close(); });
}

async function fixture(t, { locale = "zh-CN", count = 2 } = {}) {
  const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } }); closeAfter(t, pg);
  await pg.exec(`CREATE TYPE "AIJobType" AS ENUM ('WEEKLY_REPORT','MONTHLY_REPORT');
    CREATE TYPE "AIJobStatus" AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED');
    CREATE TABLE "User" ("id" text PRIMARY KEY,"timezone" text,"preferredLocale" text);
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY,"aiProcessing" boolean,"personalization" boolean,"memoryEnabled" boolean,"updatedAt" timestamp(3));
    INSERT INTO "AiConsent" VALUES ('alice',true,true,true,'2000-01-01'),('bob',true,true,true,'2000-01-01');
    CREATE TABLE "Event" ("id" text PRIMARY KEY,"ownerId" text,"occurredAt" timestamp(3),"updatedAt" timestamp(3),"memoryProcessingAllowed" boolean);
    CREATE TABLE "EventMemory" ("id" text PRIMARY KEY,"ownerId" text,"sourceEventId" text REFERENCES "Event" ON DELETE CASCADE,
      "updatedAt" timestamp(3),"embeddingInputRevision" integer,"memoryType" text,"summary" text,"topics" json,"importanceScore" double precision,
      "embeddingStatus" text,"embeddedInputRevision" integer);
    CREATE TABLE "AIJob" ("id" text PRIMARY KEY,"ownerId" text,"jobType" "AIJobType","resourceId" text,"idempotencyKey" text,
      "status" "AIJobStatus","attemptCount" integer,"maxAttempts" integer,"lockedAt" timestamp(3),"lockedBy" text,"leaseExpiresAt" timestamp(3),
      "startedAt" timestamp(3),"completedAt" timestamp(3),"createdAt" timestamp(3),"updatedAt" timestamp(3),"nextAttemptAt" timestamp(3),"lastError" text);
    INSERT INTO "AIJob" VALUES ('job-1','alice','WEEKLY_REPORT','2026-09-14','WEEKLY_REPORT:2026-09-14:grounded-narrative-v1',
      'PENDING',0,3,NULL,NULL,NULL,NULL,NULL,now(),now(),'2000-01-01',NULL);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY,"createdAt" timestamp NOT NULL DEFAULT now(),"eventType" varchar(64),"outcome" varchar(32),
      "actorUserId" varchar(128),"targetClass" varchar(64),"targetSafeId" varchar(128),"actionCode" varchar(64),"reasonCode" varchar(64));
    CREATE TABLE "WeeklyReport" ("id" text PRIMARY KEY,"ownerId" text,"periodKey" text,"document" jsonb,UNIQUE("ownerId","periodKey"));
    CREATE TABLE "AIEvidence" ("id" serial PRIMARY KEY,"ownerId" text,"sourceEventId" text REFERENCES "Event" ON DELETE CASCADE,
      "sourceMemoryId" text,"weeklyReportId" text REFERENCES "WeeklyReport" ON DELETE CASCADE,"claimType" text);`);
  await pg.query('INSERT INTO "User" VALUES (\'alice\',\'UTC\',$1),(\'bob\',\'UTC\',\'en\')', [locale]);
  const normalized = weeklyReportLocale(locale);
  for (let i = 0; i < count; i++) {
    await pg.query('INSERT INTO "Event" VALUES ($1,\'alice\',$2,\'2026-09-21\',true)', [`event-${i}`, new Date(`2026-09-${15 + i}`)]);
    await pg.query('INSERT INTO "EventMemory" VALUES ($1,\'alice\',$2,\'2026-09-21\',1,\'EVENT\',$3,$4,0.8,\'GENERATED\',1)',
      [`memory-${i}`, `event-${i}`, summaries(normalized)[i % 2], JSON.stringify([normalized === "en" ? "drawing" : "画画"])]);
  }
  let response = packet => Response.json(native(output(packet))), retrievalHook, similarHook = () => [], failEvidence = false, expireCompletion = false;
  const calls = [], logs = []; let retrievalCalls = 0, legacyCalls = 0;
  const adapt = db => {
    const query = async (sql, ...args) => (await db.query(sql, args)).rows;
    const jobWhere = where => {
      const params = [];
      const sql = Object.entries(where).map(([key, value]) => {
        params.push(value && typeof value === "object" && !(value instanceof Date) ? value.gt : value);
        return `"${key}"${value && typeof value === "object" && !(value instanceof Date) ? ">" : "="}$${params.length}`;
      }).join(" AND "); return { sql, params };
    };
    const report = row => row ? { id: row.id, ...row.document } : null;
    return {
      $queryRawUnsafe: async (sql, ...args) => {
        if (expireCompletion && sql.includes('UPDATE "AIJob" SET "status" = \'SUCCEEDED\'')) {
          await query('UPDATE "AIJob" SET "leaseExpiresAt"=\'2000-01-01\'');
        }
        return query(sql, ...args);
      },
      user: { findUnique: async ({ where }) => (await query('SELECT * FROM "User" WHERE "id"=$1', where.id))[0] },
      aiConsent: { findUnique: async ({ where }) => (await query('SELECT * FROM "AiConsent" WHERE "userId"=$1', where.userId))[0] },
      event: { findMany: async ({ where }) => query(`SELECT event.*, row_to_json(memory) AS memory FROM "Event" event
        LEFT JOIN "EventMemory" memory ON memory."sourceEventId"=event."id" AND memory."ownerId"=event."ownerId"
        WHERE event."ownerId"=$1 AND event."memoryProcessingAllowed"=true AND event."occurredAt">=$2 AND event."occurredAt"<$3 ORDER BY event."id"`,
      where.ownerId, where.occurredAt.gte, where.occurredAt.lt) },
      aiJob: {
        findUnique: async ({ where }) => (await query('SELECT * FROM "AIJob" WHERE "id"=$1', where.id))[0],
        updateMany: async ({ where, data }) => {
          const w = jobWhere(where), changes = Object.entries(data);
          const set = changes.map(([key], i) => `"${key}"=$${w.params.length + i + 1}`).join(",");
          return { count: (await query(`UPDATE "AIJob" SET ${set} WHERE ${w.sql} RETURNING "id"`, ...w.params, ...changes.map(([, value]) => value))).length };
        }
      },
      weeklyReport: {
        findFirst: async ({ where }) => {
          const row = report((await query('SELECT * FROM "WeeklyReport" WHERE "ownerId"=$1 AND "periodKey"=$2', where.ownerId, where.periodKey))[0]);
          return row && (!where.narrativeStatus || row.narrativeStatus !== where.narrativeStatus.not) ? row : null;
        },
        findUnique: async ({ where }) => report((await query('SELECT * FROM "WeeklyReport" WHERE "ownerId"=$1 AND "periodKey"=$2',
          where.ownerId_periodKey.ownerId, where.ownerId_periodKey.periodKey))[0]),
        upsert: async ({ create }) => {
          const rows = await query('INSERT INTO "WeeklyReport" VALUES (\'report-1\',$1,$2,$3) ON CONFLICT ("ownerId","periodKey") DO UPDATE SET "document"=EXCLUDED."document" RETURNING *',
            create.ownerId, create.periodKey, JSON.stringify(create)); return report(rows[0]);
        }
      },
      aiEvidence: {
        deleteMany: async ({ where }) => query('DELETE FROM "AIEvidence" WHERE "ownerId"=$1 AND "weeklyReportId"=$2', where.ownerId, where.weeklyReportId),
        createMany: async ({ data }) => {
          if (failEvidence) throw Error("SYNTHETIC_PRIVATE_WRITE_ERROR");
          for (const item of data) await query('INSERT INTO "AIEvidence" ("ownerId","sourceEventId","sourceMemoryId","weeklyReportId","claimType") VALUES ($1,$2,$3,$4,$5)',
            item.ownerId, item.sourceEventId, item.sourceMemoryId, item.weeklyReportId, item.claimType);
        }
      }
    };
  };
  const db = { ...adapt(pg), $transaction: fn => pg.transaction(tx => fn(adapt(tx))) };
  const retrieval = { retrieve: async ({ identity, dateFrom, dateTo }) => {
    retrievalCalls++; if (retrievalHook) await retrievalHook();
    return (await db.event.findMany({ where: { ownerId: identity.userId, occurredAt: { gte: dateFrom, lt: dateTo } } }))
      .filter(event => event.memory).map(event => ({ ...event.memory, eventDate: event.occurredAt, similarity: 0.9 }));
  }, similarTo: async args => similarHook(args) };
  const fetchImpl = async (url, options) => {
    assert.equal(url, `https://gateway.ai.cloudflare.com/v1/${"a".repeat(32)}/synthetic-weekly/anthropic/v1/messages`);
    const body = JSON.parse(options.body), packet = JSON.parse(body.messages[0].content);
    calls.push({ body, packet, options }); return response(packet, options);
  };
  const embeddingProvider = { describeProfile: () => getEmbeddingProfile(PRODUCTION_EMBEDDING_PROFILE_KEY),
    embedQuery: () => assert.fail("injected retrieval only"), embedDocuments: () => assert.fail("no embedding inference") };
  const make = (env = enabled) => createProductionAiWorker({ prisma: db, env, gatewayFetchImpl: fetchImpl, embeddingProvider, semanticRetrieval: retrieval,
    workerId: "worker-1", retryDelayMs: 0, logger: { error: (...args) => logs.push(args) },
    reportNarrativeProvider: { async generateNarrative() { legacyCalls++; return { sections: [{ kind: "RECENT_MOMENTS",
      claim: summaries("en")[0], evidenceRefs: [{ sourceEventId: "event-0", sourceMemoryId: "memory-0" }], aggregateRefs: [] }] }; } } });
  const run = (env = enabled) => make(env).runJob({ jobId: "job-1", ownerId: "alice", jobType: "WEEKLY_REPORT" });
  return { pg, db, calls, logs, run, make, get retrievalCalls() { return retrievalCalls; }, get legacyCalls() { return legacyCalls; },
    respond: fn => { response = fn; }, retrievalHook: fn => { retrievalHook = fn; }, similarHook: fn => { similarHook = fn; }, failEvidence: () => { failEvidence = true; },
    expireCompletion: () => { expireCompletion = true; }, rows: table => db.$queryRawUnsafe(`SELECT * FROM "${table}"`) };
}

test("versioned localized contract renders concise grounded English and Chinese with cited overview/insights", () => {
  for (const locale of ["en", "zh-Hans"]) {
    const input = contractInput(locale), packet = buildWeeklyReflectionPacket(input), raw = output(packet);
    raw.insights = [{ kind: "RECURRING_TOPIC", topic: packet.evidence[0].topics[0], refs: ["E1", "E2"] }];
    const result = validateWeeklyReflection(raw, input, packet);
    assert.equal(result.sections.length, 2); assert.equal(result.sections[0].evidenceRefs.length, 2);
    assert.equal(result.sections[0].contractVersion, WEEKLY_REFLECTION_CONTRACT);
    for (const moment of raw.moments) assert.ok(result.narrative.includes(moment.quote));
    if (locale !== "en") assert.ok([...result.narrative].length >= 100 && [...result.narrative].length <= 180);
  }
  assert.equal(weeklyReportLocale("en-CA"), "en"); assert.throws(() => weeklyReportLocale("zh-TW"), { code: "REPORT_NARRATIVE_INVALID_INPUT" });
  assert.equal(weeklyReportLocale("zh-CN"), "zh-Hans"); assert.throws(() => weeklyReportLocale("ja"));
  for (const [locale, quote] of [["en", "I ran 3.5 kilometres, not a marathon."], ["zh-Hans", "我跑了３公里，没有参加比赛。"]]) {
    const input = contractInput(locale); input.evidenceSelection.evidence[0].summary = quote;
    const packet = buildWeeklyReflectionPacket(input);
    assert.ok(validateWeeklyReflection(output(packet), input, packet).narrative.includes(quote));
  }
});

test("Chinese and English grounding rejects fabricated facts, partial negation, numerals, unsupported insights and output fields", () => {
  for (const locale of ["en", "zh-Hans"]) {
    const input = contractInput(locale), packet = buildWeeklyReflectionPacket(input), valid = output(packet);
    for (const mutate of [data => { data.version = "invented-v2"; }, data => { data.locale = "ja"; },
      data => { data.overview = "You are improving emotionally / 你的情绪越来越好"; },
      data => { data.moments[0].quote = "我升职了，收入增加了三倍。"; }, data => { data.moments[0].quote = "你完成了２次治疗。"; },
      data => { data.moments[0].quote = "I received a promotion."; }, data => { data.moments[0].ref = "event-bob"; },
      data => { data.moments[1] = data.moments[0]; }, data => { data.moments.push(data.moments[0]); },
      data => { data.insights = [{ kind: "EMOTIONAL_PROGRESS", topic: "成长", refs: ["E1", "E2"] }]; },
      data => { data.insights = [{ kind: "RECURRING_TOPIC", topic: "unsupported", refs: ["E1", "E2"] }]; },
      data => { data.insights = [{ kind: "RECURRING_TOPIC", topic: packet.evidence[0].topics[0], refs: ["E1", "E1"] }]; }]) {
      const raw = structuredClone(valid); mutate(raw); assert.throws(() => validateWeeklyReflection(raw, input, packet));
    }
  }
  for (const [locale, summary, invented] of [["en", "I did not travel to Paris.", "travel to Paris"],
    ["zh-Hans", "我没有升职，也没有加薪。", "升职，也没有加薪。"]]) {
    const input = contractInput(locale); input.evidenceSelection.evidence[0].summary = summary;
    const packet = buildWeeklyReflectionPacket(input), raw = output(packet); raw.moments[0].quote = invented;
    assert.throws(() => validateWeeklyReflection(raw, input, packet));
  }
});

test("Sonnet stays off by default; existing Weekly provider, generation key and semantic route remain", async t => {
  assert.equal(weeklyReportProvider({}), "workers-ai");
  assert.equal(JSON.stringify(new SonnetWeeklyReflectionService({ env: enabled })), "{}");
  for (const flag of [undefined, "false", "true", "invalid"]) {
    const f = await fixture(t, { locale: "en" });
    const result = await f.run(flag === undefined ? {} : { AI_WEEKLY_EVIDENCE_SELECTOR_V2: flag });
    assert.equal(result.succeeded, true, result.error?.stack); assert.equal(f.legacyCalls, 1); assert.equal(f.calls.length, 0);
    assert.equal(f.retrievalCalls, 1); assert.equal((await f.rows("WeeklyReport"))[0].document.generationVersion, REPORT_NARRATIVE_GENERATION_VERSION);
  }
});

test("English Sonnet runs after durable admission, reuses semantic RAG and atomically saves evidence/completion", async t => {
  const f = await fixture(t, { locale: "en" });
  f.retrievalHook(async () => assert.equal((await f.rows("AuditEvent")).filter(row => row.eventType === "AI_COST_RESERVED").length, 1));
  const result = await f.run();
  assert.equal(result.succeeded, true, result.error?.stack); assert.equal(f.retrievalCalls, 1); assert.equal(f.calls.length, 1);
  assert.equal(f.legacyCalls, 0); assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED");
  assert.equal((await f.rows("AIEvidence")).length, 2);
  const report = (await f.rows("WeeklyReport"))[0].document;
  assert.equal(report.eventCount, 2); assert.equal(report.narrativeSections[0].model, SONNET_WEEKLY_MODEL);
  const ledger = await f.rows("AuditEvent");
  assert.equal(ledger.length, 4); assert.equal(ledger.find(row => row.eventType === "AI_COST_RESERVED").reasonCode, "2");
  assert.equal(ledger.find(row => row.eventType === "AI_RETRIEVAL_RESERVED").targetClass, "CLOUDFLARE_WORKERS_AI");
  const { packet, body, options } = f.calls[0];
  assert.equal(options.headers["cf-aig-collect-log-payload"], "false"); assert.equal(options.headers["cf-aig-max-attempts"], "1");
  assert.equal(body.model, SONNET_WEEKLY_MODEL); assert.doesNotMatch(JSON.stringify(packet), /alice|bob|event-0|memory-0|Journal|sourceFence/);
});

test("Chinese Weekly uses owned period memories without embedding Chinese; no Journal or cross-owner source", async t => {
  const f = await fixture(t, { locale: "zh-CN" });
  const result = await f.run();
  assert.equal(result.succeeded, true, result.error?.stack); assert.equal(f.retrievalCalls, 0); assert.equal(f.calls.length, 1);
  const report = (await f.rows("WeeklyReport"))[0].document;
  assert.ok([...report.summary].length >= 100 && [...report.summary].length <= 180);
  assert.equal(report.narrativeSections[0].locale, "zh-Hans"); assert.ok(report.summary.includes("这周"));
  assert.equal(report.eventCount, 2); assert.equal(f.legacyCalls, 0);
  const input = await new ReportInputService({ prisma: f.db, semanticRetrieval: { retrieve: () => assert.fail("no Chinese query") }, localizedWeekly: true })
    .buildWeeklyInput({ identity: { userId: "alice" }, localDate: "2026-09-14" });
  await assert.rejects(f.db.$transaction(tx => assertReportSources(tx, "alice", {
    ...input, sourceFence: { ...input.sourceFence, evidencePolicy: undefined }
  })), { code: "REPORT_SOURCE_STALE" }, "legacy source policy still excludes Chinese evidence");
});

test("explicit invalid route/model/flags/config never switches to legacy or starts retrieval", async t => {
  for (const change of [{ AI_WEEKLY_REPORT_PROVIDER: "openai" }, { AI_WEEKLY_REPORT_MODEL: "claude-opus-5-5" },
    { AI_GATEWAY_ENABLED: undefined }, { AI_GATEWAY_ANTHROPIC_ENABLED: undefined }, { AI_USER_DAILY_USD_LIMIT: undefined },
    { AI_WEEKLY_REPORT_TIMEOUT_MS: "20001" }, { AI_WEEKLY_REPORT_MAX_OUTPUT_TOKENS: "4097" }, { AI_REPORT_SUPPORTED_LOCALES: "en,ja" }, { AI_REPORT_SUPPORTED_LOCALES: "en,zh-Hans,zh-Hant" }]) {
    await t.test(JSON.stringify(change), async child => {
      const f = await fixture(child, { locale: "en" }), result = await f.run({ ...enabled, ...change });
      assert.equal(result.succeeded, false); assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal(f.legacyCalls, 0);
    });
  }
});

test("zero USD/shared call budgets deny before query embedding or narrative and roll back admission", async t => {
  const f = await fixture(t, { locale: "en" });
  for (const name of ["AI_USER_DAILY_USD_LIMIT", "AI_GLOBAL_MONTHLY_USD_LIMIT", "AI_ANTHROPIC_MONTHLY_USD_LIMIT", "AI_WEEKLY_REPORT_DAILY_LIMIT"]) {
    const result = await f.run({ ...enabled, [name]: "0" });
    assert.equal(result.error.code, "AI_QUOTA_EXCEEDED");
    await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal((await f.rows("AuditEvent")).length, 0);
  await f.pg.exec(`INSERT INTO "AuditEvent" ("id","eventType","actorUserId","targetClass","actionCode","reasonCode")
    VALUES ('prior-cf-calls','AI_COST_RESERVED','bob','CLOUDFLARE_WORKERS_AI','SPEECH_TRANSCRIPTION','100')`);
  const blocked = await f.run({ ...enabled, AI_PROVIDER_DAILY_CALL_LIMIT: "100" });
  assert.equal(blocked.error.code, "AI_QUOTA_EXCEEDED"); assert.equal(f.retrievalCalls, 0); assert.equal(f.calls.length, 0);
  assert.equal((await f.rows("AuditEvent")).length, 1, "no partial Sonnet or retrieval admission");
  await f.pg.exec('DELETE FROM "AuditEvent"');
  assert.equal((await f.run()).succeeded, true);
  await assert.rejects(new PrismaAiCostGate(f.db, { env: { AI_PROVIDER_DAILY_CALL_LIMIT: "1" } }).reserve({
    identity: { userId: "alice" }, action: "EVENT_EMOTION", key: "legacy-provider-cap" }), { code: "AI_QUOTA_EXCEEDED" });
});

test("insufficient evidence produces truthful empty report with deterministic statistics and no inference", async t => {
  for (const count of [1, 2]) {
    const f = await fixture(t, { count });
    if (count === 2) await f.pg.exec(`UPDATE "EventMemory" SET "summary"="id"||repeat('这是完整而不能截断的长句',10)`);
    const result = await f.run();
    assert.equal(result.succeeded, true, result.error?.stack); assert.equal(result.result.status, "INSUFFICIENT_EVIDENCE");
    const report = (await f.rows("WeeklyReport"))[0].document;
    assert.equal(report.summary, null); assert.equal(report.eventCount, count); assert.equal(f.calls.length, 0);
    assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED");
  }
});

test("malformed/refused/unselected/ungrounded responses retain liability and cannot replay paid inference", async t => {
  for (const response of [() => new Response("invalid", { headers: { "content-type": "application/json" } }),
    packet => Response.json({ ...native(output(packet)), stop_reason: "refusal" }),
    packet => Response.json(native({ ...output(packet), overview: "你的情绪明显改善。" })),
    () => new Response("SYNTHETIC_PRIVATE_MARKER", { status: 503 })]) {
    const f = await fixture(t); f.respond(response);
    const first = await f.run(); assert.equal(first.succeeded, false);
    const second = await f.run(); assert.equal(second.error.code, "AI_INFERENCE_ALREADY_RESERVED");
    assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0); assert.equal((await f.rows("WeeklyReport")).length, 0);
    assert.equal(JSON.stringify(f.logs).includes("SYNTHETIC_PRIVATE_MARKER"), false);
  }
});

test("timeout during retrieval prevents late Gateway dispatch and keeps duplicate-query tombstone", async t => {
  const f = await fixture(t, { locale: "en" }); let release;
  f.retrievalHook(() => new Promise(resolve => { release = resolve; }));
  const result = await f.run({ ...enabled, AI_WEEKLY_REPORT_TIMEOUT_MS: "250" });
  assert.equal(result.error.code, "AI_GATEWAY_TIMEOUT"); release();
  await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 1);
  assert.equal((await f.run()).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.retrievalCalls, 1);
});

test("late noncooperative Sonnet fetch cannot validate or persist after timeout", async t => {
  const f = await fixture(t); let release, packet;
  f.respond(value => { packet = value; return new Promise(resolve => { release = resolve; }); });
  const result = await f.run({ ...enabled, AI_WEEKLY_REPORT_TIMEOUT_MS: "250" });
  assert.equal(result.error.code, "AI_GATEWAY_TIMEOUT");
  const response = Response.json(native(output(packet))), reader = t.mock.method(response.body, "getReader");
  release(response); await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(reader.mock.callCount(), 0); assert.equal((await f.rows("WeeklyReport")).length, 0);
  assert.equal((await f.rows("AuditEvent")).length, 3);
});

test("consent revocation/regrant, Event deletion, memory change and locale change reject late results", async t => {
  for (const mutation of ["revoke", "epoch", "delete", "memory", "locale"]) {
    const f = await fixture(t);
    f.respond(async packet => {
      if (mutation === "revoke") await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
      if (mutation === "epoch") await f.pg.exec('UPDATE "AiConsent" SET "updatedAt"=\'2099-01-01\'');
      if (mutation === "delete") await f.pg.exec('DELETE FROM "Event" WHERE "id"=\'event-0\'');
      if (mutation === "memory") await f.pg.exec('UPDATE "EventMemory" SET "summary"=\'Changed source\'');
      if (mutation === "locale") await f.pg.exec('UPDATE "User" SET "preferredLocale"=\'en\'');
      return Response.json(native(output(packet)));
    });
    const result = await f.run();
    assert.ok(result.succeeded === false || result.result?.status === "CONSENT_INELIGIBLE");
    assert.equal((await f.rows("WeeklyReport")).length, 0); assert.equal((await f.rows("AuditEvent")).length, 4);
  }
});

test("duplicate execution completes only once and preserves finalized reflection across provider selection", async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.run(), f.run()]);
  assert.equal(results.filter(item => item.succeeded).length, 1); assert.equal(f.calls.length, 1);
  assert.equal((await f.run()).claimed, false);
  await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  const existing = await f.run({});
  assert.equal(existing.result.skipped, true); assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
});

test("evidence write failure and lease expiry roll back report/evidence/completion together", async t => {
  for (const stage of ["evidence", "completion"]) {
    const f = await fixture(t); if (stage === "evidence") f.failEvidence(); else f.expireCompletion();
    const result = await f.run(); assert.equal(result.succeeded, false);
    assert.equal((await f.rows("WeeklyReport")).length, 0); assert.equal((await f.rows("AIEvidence")).length, 0);
    assert.notEqual((await f.rows("AIJob"))[0].status, "SUCCEEDED"); assert.equal((await f.rows("AuditEvent")).length, 4);
  }
});

test("localized source policy rejects wrong owners, Journal memories, unsupported locale and period changes", async t => {
  for (const change of ["owner", "journal", "locale", "period", "job-period"]) {
    const f = await fixture(t);
    if (change === "owner") await f.pg.exec('UPDATE "EventMemory" SET "ownerId"=\'bob\'');
    if (change === "journal") await f.pg.exec('UPDATE "EventMemory" SET "memoryType"=\'JOURNAL\'');
    if (change === "locale") await f.pg.exec('UPDATE "User" SET "preferredLocale"=\'ja\'');
    if (change === "period") await f.pg.exec('UPDATE "Event" SET "occurredAt"=\'2026-10-01\'');
    if (change === "job-period") await f.pg.exec(`UPDATE "AIJob" SET "resourceId"='2026-09-16',"idempotencyKey"='WEEKLY_REPORT:2026-09-16:grounded-narrative-v1'`);
    const result = await f.run();
    assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0);
    assert.ok(result.succeeded === false || result.result?.status === "INSUFFICIENT_EVIDENCE");
  }
});

test("opt-in weekly-reflection-v2 saves cited Claude prose without identifiers; v1 stays default and finalized reports are reused", async t => {
  const v2env = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY };
  const written = packet => ({ version: REFLECTION_V2.WEEKLY, locale: packet.locale, paragraphs: [{ sentences: packet.evidence
    .filter(item => item.scope !== "previous").map(item => ({ text: packet.locale === "en" ? `You wrote: “${item.text}”` : `你写下：“${item.text}”`, refs: [item.ref] })) }] });
  const f = await fixture(t); f.respond(packet => Response.json(native(written(packet))));
  const result = await f.run(v2env); assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.system, REFLECTION_V2_INSTRUCTIONS.WEEKLY);
  const packet = f.calls[0].packet; assert.equal(packet.version, REFLECTION_V2.WEEKLY);
  for (const hidden of ["alice", "event-", "memory-", "prior-", "eventCount"]) assert.equal(JSON.stringify(packet).includes(hidden), false, hidden);
  const report = (await f.rows("WeeklyReport"))[0].document;
  assert.equal(report.generationVersion, REPORT_NARRATIVE_GENERATION_VERSION);
  assert.ok(report.narrativeSections.every(section => section.contractVersion === REFLECTION_V2.WEEKLY && section.claims.length));
  assert.equal(report.summary, written(packet).paragraphs[0].sentences.map(item => item.text).join(""));
  assert.deepEqual((await f.rows("AIEvidence")).map(row => row.claimType), ["NARRATIVE_CITED", "NARRATIVE_CITED"]);
  assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED");
  const invalid = await fixture(t), failed = await invalid.run({ ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: "weekly-reflection-v3" });
  assert.equal(failed.succeeded, false); assert.equal(invalid.calls.length, 0); assert.equal(invalid.retrievalCalls, 0); assert.equal(invalid.legacyCalls, 0);
  // A finalized v1 report is reused, never regenerated, after the v2 opt-in.
  const old = await fixture(t); assert.equal((await old.run()).succeeded, true);
  const before = (await old.rows("WeeklyReport"))[0].document;
  await old.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  const reused = await old.run(v2env); assert.equal(reused.result.skipped, true); assert.equal(old.calls.length, 1);
  assert.deepEqual((await old.rows("WeeklyReport"))[0].document, before);
  assert.equal(before.narrativeSections[0].contractVersion, WEEKLY_REFLECTION_CONTRACT);
});

test("Weekly composition uses one mocked dispatch per locale and never repairs a rejected plan", async t => {
  const v2env = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY };
  // Authored combined prose; two drawings are not asserted to be the same object.
  const prose = {
    en: "You shared a drawing with a friend and finished a sketch on a quiet afternoon.",
    "zh-Hans": "你和朋友分享了一幅画，聊了彼此的近况，也在一个安静的下午画完了一幅素描。",

  };
  for (const locale of Object.keys(prose)) await t.test(locale, async t => {
    for (const rejected of [false, true]) {
      const f = await fixture(t, { locale });
      f.respond(packet => Response.json(native({ version: REFLECTION_V2.WEEKLY, locale: packet.locale,
        paragraphs: [{ sentences: [{ text: prose[locale], refs: ["E2", "E1"] }] }],
        ...(rejected ? { analysis: "SYNTHETIC_PRIVATE_PLAN" } : {}) })));
      const first = await f.run(v2env);
      assert.equal(first.succeeded, !rejected);
      assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
      assert.equal(f.calls[0].body.system, REFLECTION_V2_INSTRUCTIONS.WEEKLY);
      assert.equal(f.calls[0].body.model, SONNET_WEEKLY_MODEL);
      assert.equal(f.calls[0].body.max_tokens, 2048);
      if (rejected) {
        assert.equal((await f.rows("WeeklyReport")).length, 0);
        assert.equal((await f.rows("AIEvidence")).length, 0);
        assert.equal((await f.run(v2env)).error.code, "AI_INFERENCE_ALREADY_RESERVED");
        assert.equal(JSON.stringify(f.logs).includes("SYNTHETIC_PRIVATE_PLAN"), false);
      } else {
        assert.equal((await f.rows("WeeklyReport"))[0].document.summary, prose[locale]);
        assert.equal((await f.rows("AIEvidence")).length, 2);
        await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
        assert.equal((await f.run(v2env)).result.skipped, true);
      }
      assert.equal(f.calls.length, 1, "finalized reuse and invalid output cannot buy another call");
    }
  });
});


test("Weekly refuses retired preferences for new v1/v2 generation before any provider request", async t => {
  for (const contract of ['weekly-reflection-v1', 'weekly-reflection-v2']) {
    const f=await fixture(t);
    await f.pg.exec(`UPDATE "User" SET "preferredLocale"='zh-Hant' WHERE "id"='alice'`);
    const result=await f.run({...enabled, AI_WEEKLY_REFLECTION_CONTRACT:contract});
    assert.equal(result.succeeded,false); assert.equal(f.calls.length,0); assert.equal(f.retrievalCalls,0);
    assert.equal((await f.rows('WeeklyReport')).length,0);
    assert.equal((await f.rows('User')).find(u=>u.id==='alice').preferredLocale,'zh-Hant');
  }
});

test("Weekly reuses a historical Traditional report before enforcing new generation language rules", async t => {
  const f=await fixture(t);
  const document={ownerId:'alice',periodKey:'2026-09-14',narrativeStatus:'GENERATED',
    generationVersion:REPORT_NARRATIVE_GENERATION_VERSION,summary:'你沒有說過自己不再畫畫。',
    narrativeSections:[{locale:'zh-Hant',contractVersion:'weekly-reflection-v2',claim:'你沒有說過自己不再畫畫。'}]};
  await f.pg.query('INSERT INTO "WeeklyReport" VALUES ($1,$2,$3,$4)', ['historical-report','alice','2026-09-14',JSON.stringify(document)]);
  await f.pg.exec(`UPDATE "User" SET "preferredLocale"='zh-TW' WHERE "id"='alice'`);
  const result=await f.run({...enabled, AI_WEEKLY_REFLECTION_CONTRACT:'weekly-reflection-v2'});
  assert.equal(result.succeeded,true,result.error?.stack); assert.equal(result.result.skipped,true);
  assert.equal(f.calls.length,0); assert.equal(f.retrievalCalls,0);
  assert.deepEqual((await f.rows('WeeklyReport'))[0].document,document);
});

// Authored synthetic responses only: E03 is an owner-approved provisional quality
// reference, not final human gold or evidence of actual Claude performance.
for (const locale of ["en", "zh-Hans"]) for (const selector of ["false", "true"])
  for (const format of ["false", "true"]) for (const composition of ["false", "true"]) {
    test(`editorial E03/${locale}/selector=${selector}/format=${format}/composition=${composition}: actual worker preserves one-call grounding`, async t => {
      const c = editorialCorpus.cases.find(c => c.id === "E03"), f = await fixture(t, { locale, count: c.events.length });
      for (const [i, event] of c.events.entries()) {
        await f.pg.query('UPDATE "Event" SET "occurredAt"=$1 WHERE "id"=$2', [new Date(`2026-09-${event.day}T12:00:00Z`), `event-${i}`]);
        await f.pg.query('UPDATE "EventMemory" SET "summary"=$1,"topics"=$2 WHERE "id"=$3', [event[locale], JSON.stringify(event.topics), `memory-${i}`]);
      }
      const target = editorialTargets.targets.find(t => t.caseId === "E03" && t.locale === locale);
      f.respond(packet => Response.json(native(selector === "true"
        ? { version: target.version, locale: target.locale, paragraphs: target.paragraphs }
        : quotedV2(packet))));
      const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY,
        AI_WEEKLY_EVIDENCE_SELECTOR_V2: selector, AI_WEEKLY_REFLECTION_RECORD_DAYS_SEPARATED: format,
        AI_WEEKLY_REFLECTION_RETROSPECTIVE: composition };
      const result = await f.run(settings);
      assert.equal(result.succeeded, true, result.error?.stack);
      assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
      assert.equal(f.retrievalCalls, locale === "en" ? 1 : 0);
      const { body, packet } = f.calls[0];
      assert.equal(body.system, composition === "true" ? WEEKLY_RETROSPECTIVE_INSTRUCTIONS : REFLECTION_V2_INSTRUCTIONS.WEEKLY);
      assert.equal(Boolean(packet.recordDays), format === "true");
      assert.equal(body.model, SONNET_WEEKLY_MODEL); assert.equal(body.max_tokens, 2048);
      assert.ok(Buffer.byteLength(JSON.stringify(body)) + 1024 <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
      const expected = selector === "true" ? c.events : c.events.slice(0, 2);
      assert.deepEqual(packet.evidence.map(e => e.text), expected.map(e => e[locale]));
      for (const hidden of ["alice", "sourceEventId", "sourceMemoryId", "event-", "memory-", "review"]) assert.equal(JSON.stringify(packet).includes(hidden), false);
      assert.equal((await f.rows("AIEvidence")).length, expected.length);
      assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED");
      const saved = (await f.rows("WeeklyReport"))[0].document;
      assert.ok(saved.narrativeSections.every(section => section.claims.every(claim => claim.evidenceRefs.every(ref => ref.sourceEventId.startsWith("event-")))));
      await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
      assert.equal((await f.run(settings)).result.skipped, true);
      assert.equal(f.calls.length, 1, "editorial settings do not authorize regeneration of finalized reports");
      assert.deepEqual((await f.rows("WeeklyReport"))[0].document, saved);
    });
  }

test("editorial flags reject invalid/incompatible settings before retrieval; legacy Workers AI ignores them", async t => {
  for (const change of [
    { AI_WEEKLY_REFLECTION_RECORD_DAYS_SEPARATED: "invalid" },
    { AI_WEEKLY_REFLECTION_RETROSPECTIVE: "TRUE" },
    { AI_WEEKLY_REFLECTION_RECORD_DAYS_SEPARATED: "true", AI_WEEKLY_REFLECTION_CONTRACT: WEEKLY_REFLECTION_CONTRACT },
    { AI_WEEKLY_REFLECTION_RETROSPECTIVE: "true", AI_WEEKLY_REFLECTION_CONTRACT: WEEKLY_REFLECTION_CONTRACT }
  ]) await t.test(JSON.stringify(change), async child => {
    const f = await fixture(child, { locale: "en" });
    const result = await f.run({ ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, ...change });
    assert.equal(result.error.code, "AI_GATEWAY_CONFIG_INVALID");
    assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal(f.legacyCalls, 0);
  });
  await t.test("Workers AI remains independent", async child => {
    const f = await fixture(child, { locale: "en" });
    const result = await f.run({ AI_WEEKLY_REFLECTION_RECORD_DAYS_SEPARATED: "true", AI_WEEKLY_REFLECTION_RETROSPECTIVE: "invalid" });
    assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(f.calls.length, 0); assert.equal(f.legacyCalls, 1);
  });
});

test("both editorial factors preserve zero-budget admission, rejected-output liability and late source fences", async t => {
  const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY,
    AI_WEEKLY_EVIDENCE_SELECTOR_V2: "true", AI_WEEKLY_REFLECTION_RECORD_DAYS_SEPARATED: "true", AI_WEEKLY_REFLECTION_RETROSPECTIVE: "true" };
  for (const mutation of ["budget", "bad-output", "delete", "consent"]) await t.test(mutation, async child => {
    const f = await fixture(child, { locale: "en" });
    if (mutation !== "budget") f.respond(async packet => {
      if (mutation === "delete") await f.pg.exec('DELETE FROM "Event" WHERE "id"=\'event-0\'');
      if (mutation === "consent") await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
      const data = quotedV2(packet); if (mutation === "bad-output") data.extra = "SYNTHETIC_PRIVATE_PLAN";
      return Response.json(native(data));
    });
    const result = await f.run({ ...settings, ...(mutation === "budget" ? { AI_WEEKLY_REPORT_DAILY_LIMIT: "0" } : {}) });
    if (mutation === "consent") {
      assert.equal(result.result.status, "CONSENT_INELIGIBLE");
      assert.equal((await f.rows("AIJob"))[0].status, "CANCELLED");
    } else assert.equal(result.succeeded, false);
    assert.equal(f.calls.length, mutation === "budget" ? 0 : 1);
    assert.equal((await f.rows("WeeklyReport")).length, 0); assert.equal((await f.rows("AIEvidence")).length, 0);
    assert.equal(JSON.stringify(f.logs).includes("SYNTHETIC_PRIVATE_PLAN"), false);
    if (mutation === "budget") { assert.equal(result.error.code, "AI_QUOTA_EXCEEDED"); assert.equal(f.retrievalCalls, 0); }
    if (mutation === "bad-output") {
      assert.equal((await f.run(settings)).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.calls.length, 1);
    }
  });
});

// Narrative-thread candidate: handcrafted test-double responses, not Claude output.
for (const locale of ["en", "zh-Hans"]) for (const selector of ["false", "true"]) {
  test(`narrative thread E03/${locale}/selector=${selector}: actual worker sends the candidate prompt once with the unchanged packet`, async t => {
    const c = editorialCorpus.cases.find(c => c.id === "E03"), f = await fixture(t, { locale, count: c.events.length });
    for (const [i, event] of c.events.entries()) {
      await f.pg.query('UPDATE "Event" SET "occurredAt"=$1 WHERE "id"=$2', [new Date(`2026-09-${event.day}T12:00:00Z`), `event-${i}`]);
      await f.pg.query('UPDATE "EventMemory" SET "summary"=$1,"topics"=$2 WHERE "id"=$3', [event[locale], JSON.stringify(event.topics), `memory-${i}`]);
    }
    const exemplar = threadExemplars.find(e => e.caseId === "E03" && e.locale === locale);
    // Both arms get the same valid double. All-quoted E03/en with four V2 Events is 709 >
    // 700 claim characters and is correctly rejected (AI_GATEWAY_GROUNDING_FAILED).
    const reply = packet => Response.json(native(selector === "true"
      ? { version: exemplar.version, locale: exemplar.locale, paragraphs: exemplar.paragraphs } : quotedV2(packet)));
    f.respond(reply);
    const base = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, AI_WEEKLY_EVIDENCE_SELECTOR_V2: selector };
    const off = await fixture(t, { locale, count: c.events.length });
    for (const [i, event] of c.events.entries()) {
      await off.pg.query('UPDATE "Event" SET "occurredAt"=$1 WHERE "id"=$2', [new Date(`2026-09-${event.day}T12:00:00Z`), `event-${i}`]);
      await off.pg.query('UPDATE "EventMemory" SET "summary"=$1,"topics"=$2 WHERE "id"=$3', [event[locale], JSON.stringify(event.topics), `memory-${i}`]);
    }
    off.respond(reply);
    const baseline = await off.run(base);
    assert.equal(baseline.succeeded, true, `OFF baseline: ${baseline.error?.code}`);
    assert.equal(off.calls.length, 1);
    const settings = { ...base, AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "true" };
    const result = await f.run(settings);
    assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
    const { body, packet } = f.calls[0];
    assert.equal(body.system, WEEKLY_NARRATIVE_THREAD_INSTRUCTIONS);
    assert.equal(off.calls[0].body.system, REFLECTION_V2_INSTRUCTIONS.WEEKLY);
    assert.deepEqual(packet, off.calls[0].packet, "packet is identical to default OFF");
    assert.deepEqual({ ...body, system: null }, { ...off.calls[0].body, system: null }, "only the system prompt differs");
    assert.ok(Buffer.byteLength(JSON.stringify(body)) + 1024 <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
    for (const hidden of ["alice", "sourceEventId", "sourceMemoryId", "event-", "memory-", "review"]) assert.equal(JSON.stringify(packet).includes(hidden), false);
    const saved = (await f.rows("WeeklyReport"))[0].document;
    assert.ok(saved.narrativeSections.every(section => section.claims.every(claim => claim.evidenceRefs.every(ref => ref.sourceEventId.startsWith("event-")))));
    await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
    assert.equal((await f.run(settings)).result.skipped, true); assert.equal(f.calls.length, 1);
  });
}

test("narrative thread rejects invalid or ambiguous settings before retrieval and keeps existing safeguards", async t => {
  for (const change of [{ AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "TRUE" }, { AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "1" },
    { AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "true", AI_WEEKLY_REFLECTION_RETROSPECTIVE: "true" },
    { AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "true", AI_WEEKLY_REFLECTION_CONTRACT: WEEKLY_REFLECTION_CONTRACT }
  ]) await t.test(JSON.stringify(change), async child => {
    const f = await fixture(child, { locale: "en" });
    const result = await f.run({ ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, ...change });
    assert.equal(result.error.code, "AI_GATEWAY_CONFIG_INVALID");
    assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal(f.legacyCalls, 0);
  });
  const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY,
    AI_WEEKLY_EVIDENCE_SELECTOR_V2: "true", AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "true" };
  for (const mutation of ["budget", "bad-output", "delete", "consent"]) await t.test(mutation, async child => {
    const f = await fixture(child, { locale: "en" });
    if (mutation !== "budget") f.respond(async packet => {
      if (mutation === "delete") await f.pg.exec('DELETE FROM "Event" WHERE "id"=\'event-0\'');
      if (mutation === "consent") await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
      const data = quotedV2(packet); if (mutation === "bad-output") data.extra = "SYNTHETIC_PRIVATE_PLAN";
      return Response.json(native(data));
    });
    const result = await f.run({ ...settings, ...(mutation === "budget" ? { AI_WEEKLY_REPORT_DAILY_LIMIT: "0" } : {}) });
    if (mutation === "consent") assert.equal(result.result.status, "CONSENT_INELIGIBLE");
    else assert.equal(result.succeeded, false);
    assert.equal(f.calls.length, mutation === "budget" ? 0 : 1);
    assert.equal((await f.rows("WeeklyReport")).length, 0); assert.equal((await f.rows("AIEvidence")).length, 0);
    assert.equal(JSON.stringify(f.logs).includes("SYNTHETIC_PRIVATE_PLAN"), false);
    if (mutation === "budget") { assert.equal(result.error.code, "AI_QUOTA_EXCEEDED"); assert.equal(f.retrievalCalls, 0); }
    if (mutation === "bad-output") { assert.equal((await f.run(settings)).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.calls.length, 1); }
  });
});

// Opt-in evidence significance (Selector V2 refinement): actual worker keeps one call and all fences.
test("evidence significance ON keeps one-call generation, provenance, privacy and every safeguard", async t => {
  const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY,
    AI_WEEKLY_EVIDENCE_SELECTOR_V2: "true", AI_WEEKLY_EVIDENCE_SIGNIFICANCE: "true" };
  for (const locale of ["en", "zh-Hans"]) await t.test(`success/${locale}`, async child => {
    const f = await fixture(child, { locale });
    f.respond(packet => Response.json(native(quotedV2(packet))));
    const result = await f.run(settings);
    assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0); assert.equal(f.retrievalCalls, locale === "en" ? 1 : 0);
    assert.equal(f.calls[0].body.system, REFLECTION_V2_INSTRUCTIONS.WEEKLY, "prompt untouched by the selector flag");
    for (const hidden of ["alice", "sourceEventId", "sourceMemoryId", "event-", "memory-", "importanceScore", "similarity"])
      assert.equal(JSON.stringify(f.calls[0].packet).includes(hidden), false);
    const saved = (await f.rows("WeeklyReport"))[0].document;
    assert.ok(saved.narrativeSections.every(section => section.claims.every(claim => claim.evidenceRefs.every(ref => ref.sourceEventId.startsWith("event-")))));
  });
  for (const change of [{ AI_WEEKLY_EVIDENCE_SIGNIFICANCE: "TRUE" }, { AI_WEEKLY_EVIDENCE_SELECTOR_V2: "false" }]) await t.test(`invalid ${JSON.stringify(change)}`, async child => {
    const f = await fixture(child, { locale: "en" });
    const result = await f.run({ ...settings, ...change });
    // Gateway hides the prepareInput configuration error behind this fixed code (as for Selector V2).
    assert.equal(result.error.code, "AI_GATEWAY_INVALID_INPUT"); assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0);
  });
  for (const mutation of ["budget", "bad-output", "delete", "consent"]) await t.test(mutation, async child => {
    const f = await fixture(child, { locale: "en" });
    if (mutation !== "budget") f.respond(async packet => {
      if (mutation === "delete") await f.pg.exec('DELETE FROM "Event" WHERE "id"=\'event-0\'');
      if (mutation === "consent") await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
      const data = quotedV2(packet); if (mutation === "bad-output") data.extra = "SYNTHETIC_PRIVATE_PLAN";
      return Response.json(native(data));
    });
    const result = await f.run({ ...settings, ...(mutation === "budget" ? { AI_WEEKLY_REPORT_DAILY_LIMIT: "0" } : {}) });
    if (mutation === "consent") assert.equal(result.result.status, "CONSENT_INELIGIBLE");
    else assert.equal(result.succeeded, false);
    assert.equal(f.calls.length, mutation === "budget" ? 0 : 1);
    assert.equal((await f.rows("WeeklyReport")).length, 0); assert.equal((await f.rows("AIEvidence")).length, 0);
    if (mutation === "budget") { assert.equal(result.error.code, "AI_QUOTA_EXCEEDED"); assert.equal(f.retrievalCalls, 0); }
    if (mutation === "bad-output") { assert.equal((await f.run(settings)).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.calls.length, 1); }
  });
});

// Short Weekly report (weekly-short-v1): synthetic Events, injected Gateway responses only.
const shortSettings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: WEEKLY_SHORT };
const shortOutput = packet => ({ version: WEEKLY_SHORT, locale: packet.locale, line: [{ ref: "E1", quote: packet.evidence[0].text }],
  sideBySide: [{ text: "You wrote about one afternoon.", refs: ["E1"] }, { text: "You wrote about another moment.", refs: ["E2"] }],
  question: [{ text: "What do you remember most?", refs: ["E1"] }] });
async function shortFixture(t) {
  const f = await fixture(t, { locale: "en", count: 3 });
  await f.pg.exec(`ALTER TABLE "Event" ADD COLUMN "primaryGardenMood" text; UPDATE "Event" SET "primaryGardenMood"='QUIET_BLOOM'`);
  return f;
}

test("short contract: one bounded request; each validated part is saved with its own citations", async t => {
  const f = await shortFixture(t);
  f.respond(packet => Response.json(native(shortOutput(packet))));
  const result = await f.run(shortSettings); assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
  const { body, packet } = f.calls[0];
  assert.equal(body.system, WEEKLY_SHORT_INSTRUCTIONS); assert.equal(packet.version, WEEKLY_SHORT);
  assert.deepEqual(packet.include, ["line", "sideBySide", "question"]);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) + 1024 <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
  assert.doesNotMatch(JSON.stringify(packet), /alice|event-\d|memory-\d|sourceFence|primaryGardenMood|QUIET_BLOOM/);
  const saved = (await f.rows("WeeklyReport"))[0].document;
  assert.equal(saved.narrativeStatus, "GENERATED");
  assert.deepEqual(saved.narrativeSections.map(section => section.kind), ["LINE_OF_WEEK", "MOOD_CURVE", "SIDE_BY_SIDE", "QUESTION"]);
  const curve = saved.narrativeSections[1];
  assert.equal(curve.claim, "Mon–Thu: Quiet 3 times.");
  // The curve shows every period Event; provenance rows cover only the selected evidence.
  assert.deepEqual(curve.points.map(point => point.sourceEventId), ["event-0", "event-1", "event-2"]);
  assert.equal((await f.rows("AIEvidence")).length, packet.evidence.length);
  await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  assert.equal((await f.run(shortSettings)).result.skipped, true); assert.equal(f.calls.length, 1);
});

test("short contract: malformed output saves nothing; a week needing support never reaches the model", async t => {
  const bad = await shortFixture(t);
  bad.respond(packet => Response.json(native({ ...shortOutput(packet), locale: "zh-Hans" })));
  assert.equal((await bad.run(shortSettings)).succeeded, false); assert.equal(bad.calls.length, 1);
  assert.equal((await bad.rows("WeeklyReport")).length, 0);

  const f = await shortFixture(t);
  await f.pg.exec(`UPDATE "EventMemory" SET "summary"='I cannot keep myself safe.' WHERE "id"='memory-1'`);
  f.respond(() => assert.fail("a support week must not call the model"));
  const result = await f.run(shortSettings); assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(f.calls.length, 0);
  const saved = (await f.rows("WeeklyReport"))[0].document;
  assert.equal(saved.narrativeStatus, "GENERATED");
  assert.deepEqual(saved.narrativeSections.map(section => section.kind), ["MOOD_CURVE", "SUPPORT_RESOURCES"]);
  assert.equal(saved.summary.includes("keep myself safe"), false);
  assert.equal(saved.summary.includes(summaries("en")[0]), false);
});

test("short contract: then and now reaches four earlier weeks through the source fence (zh phrase, en stored vectors)", async t => {
  for (const locale of ["zh-CN", "en"]) {
    const f = await fixture(t, { locale, count: 3 });
    await f.pg.exec(`ALTER TABLE "Event" ADD COLUMN "primaryGardenMood" text`);
    const [nowText, thenText] = locale === "en" ? ["Slept through the whole night for once.", "Awake again at 3am, staring at the ceiling."]
      : ["晚上又睡不着觉，脑子停不下来。", "搬家以后一直睡不着觉。"];
    await f.pg.query('UPDATE "EventMemory" SET "summary"=$1 WHERE "id"=\'memory-2\'', [nowText]);
    // 2026-08-25 is inside the lookback (from 2026-08-17); 2026-08-10 is outside it and must not be read.
    for (const [id, date, text] of [["old", "2026-08-25T12:00:00Z", thenText], ["older", "2026-08-10T12:00:00Z", thenText]]) {
      await f.pg.query('INSERT INTO "Event" VALUES ($1,\'alice\',$2,\'2026-09-21\',true)', [`event-${id}`, new Date(date)]);
      await f.pg.query('INSERT INTO "EventMemory" VALUES ($1,\'alice\',$2,\'2026-09-21\',1,\'EVENT\',$3,$4,0.8,\'GENERATED\',1)',
        [`memory-${id}`, `event-${id}`, text, JSON.stringify([])]);
    }
    const similar = [];
    f.similarHook(args => { similar.push(args); return args.memoryId === "memory-2"
      ? [{ id: "memory-old", ownerId: "alice", sourceEventId: "event-old", similarity: 0.92 }] : []; });
    f.respond(packet => Response.json(native(shortOutput(packet))));
    const result = await f.run(shortSettings); assert.equal(result.succeeded, true, result.error?.stack);
    const saved = (await f.rows("WeeklyReport"))[0].document, section = saved.narrativeSections.find(item => item.kind === "THEN_AND_NOW");
    assert.equal(section.match, locale === "en" ? "CHANGE" : "REPEAT");
    assert.deepEqual([section.then.sourceEventId, section.now.sourceEventId], ["event-old", "event-2"]);
    assert.equal(section.then.quote, locale === "en" ? thenText : "搬家以后一直睡不着觉。");
    assert.equal(similar.length, locale === "en" ? 3 : 0);
    for (const args of similar) assert.equal(args.dateFrom.toISOString(), "2026-08-17T00:00:00.000Z");
    assert.doesNotMatch(JSON.stringify(f.calls[0].packet), /搬家以后|ceiling|event-old|memory-old/); // earlier entries never reach the model
  }
});

test("short-report owner list: listed owners get the short report, everyone else keeps the production v2 flags", async t => {
  // The production Weekly configuration (2026-10-20 beta acceptance) plus the per-owner list.
  const production = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, AI_WEEKLY_EVIDENCE_SELECTOR_V2: "true",
    AI_WEEKLY_EVIDENCE_SIGNIFICANCE: "true", AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: "true" };
  const listed = await shortFixture(t);
  listed.respond(packet => Response.json(native(shortOutput(packet))));
  const result = await listed.run({ ...production, AI_WEEKLY_SHORT_OWNER_IDS: "bob,alice" });
  assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(listed.calls[0].body.system, WEEKLY_SHORT_INSTRUCTIONS);
  const saved = (await listed.rows("WeeklyReport"))[0].document;
  assert.ok(saved.narrativeSections.every(section => section.contractVersion === WEEKLY_SHORT));

  const other = await shortFixture(t);
  other.respond(packet => Response.json(native(quotedV2(packet))));
  const kept = await other.run({ ...production, AI_WEEKLY_SHORT_OWNER_IDS: "bob" });
  assert.equal(kept.succeeded, true, kept.error?.stack);
  assert.equal(other.calls[0].body.system, WEEKLY_NARRATIVE_THREAD_INSTRUCTIONS);
  assert.ok((await other.rows("WeeklyReport"))[0].document.narrativeSections.every(section => section.contractVersion === REFLECTION_V2.WEEKLY));

  const broken = await shortFixture(t);
  assert.equal((await broken.run({ ...production, AI_WEEKLY_SHORT_OWNER_IDS: "alice;bob" })).succeeded, false);
  assert.equal(broken.calls.length, 0); assert.equal((await broken.rows("WeeklyReport")).length, 0);
});

test("petal card owner list: a listed short-report owner gets a card after the mood curve; a malformed list only drops the card", async t => {
  const production = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, AI_WEEKLY_SHORT_OWNER_IDS: "alice" };
  for (const [list, expected] of [["bob,alice", true], ["bob", false], ["alice;bob", false], [undefined, false]]) {
    const f = await shortFixture(t);
    f.respond(packet => Response.json(native(shortOutput(packet))));
    const result = await f.run({ ...production, PETAL_CARDS_OWNER_IDS: list });
    assert.equal(result.succeeded, true, result.error?.stack);
    const kinds = (await f.rows("WeeklyReport"))[0].document.narrativeSections.map(section => section.kind);
    assert.equal(kinds.includes("PETAL_CARD"), expected, `${list}: ${kinds}`);
    if (expected) assert.equal(kinds[kinds.indexOf("MOOD_CURVE") + 1], "PETAL_CARD");
    assert.equal(f.calls.length, 1, "the card adds no model call");
  }
});

// Weekly 2.0 (docs/product/WEEKLY_2.0.md) for owners on WEEKLY_INSIGHTS_OWNER_IDS, injected responses only.
test("Weekly 2.0 owner list: one request with the 2.0 contract; a failing insight or a failed call saves the code-template report", async t => {
  const settings = { ...enabled, AI_WEEKLY_REFLECTION_CONTRACT: REFLECTION_V2.WEEKLY, AI_WEEKLY_SHORT_OWNER_IDS: "alice" };
  const insightsFixture = async () => {
    const f = await fixture(t, { locale: "zh-CN", count: 3 });
    await f.pg.exec(`ALTER TABLE "Event" ADD COLUMN "primaryGardenMood" text; UPDATE "Event" SET "primaryGardenMood"='SUNNY_BLOOM'`);
    return f;
  };
  const respond = (f, text) => f.respond(packet => {
    if (packet.version !== WEEKLY_2) return Response.json(native(shortOutput(packet)));
    const goods = packet.candidates.find(candidate => candidate.type === "SMALL_GOODS");
    return Response.json(native({ version: WEEKLY_2, locale: packet.locale, headline: "这周的晴朗来自小事", question: "下周你想留意哪一件小事？",
      insights: goods ? [{ id: goods.id, role: "main", text, evidence_ids: goods.evidence, picks: goods.quotes.slice(0, 2).map(quote => quote.id) }] : [] }));
  });
  const f = await insightsFixture();
  respond(f, "这周你记下了这些小事。");
  const result = await f.run({ ...settings, WEEKLY_INSIGHTS_OWNER_IDS: "bob,alice" });
  assert.equal(result.succeeded, true, result.error?.stack); assert.equal(f.calls.length, 1);
  const { body, packet } = f.calls[0];
  assert.equal(body.system, WEEKLY_2_INSTRUCTIONS); assert.equal(packet.version, WEEKLY_2);
  assert.ok(packet.candidates.some(candidate => candidate.type === "SMALL_GOODS"));
  assert.ok(Buffer.byteLength(JSON.stringify(body)) + 1024 <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
  assert.doesNotMatch(JSON.stringify(packet), /alice|event-\d|memory-\d|sourceFence|BLOOM|score/);
  const saved = (await f.rows("WeeklyReport"))[0].document;
  assert.deepEqual(saved.narrativeSections.map(section => section.kind), ["HEADLINE", "INSIGHT", "MOOD_CURVE", "QUESTION"]);
  assert.equal(saved.narrativeSections[0].claim, "这周的晴朗来自小事"); assert.equal(saved.narrativeSections[0].template, false);
  assert.equal(saved.narrativeSections[1].items.length, 2);
  assert.ok(saved.narrativeSections.every(section => section.contractVersion === WEEKLY_SHORT), "older apps still read the report");

  // A failing insight is dropped; the code template stands in. Never the old short report.
  const failing = await insightsFixture();
  respond(failing, "你应该多画画。");
  assert.equal((await failing.run({ ...settings, WEEKLY_INSIGHTS_OWNER_IDS: "alice" })).succeeded, true);
  const fallback = (await failing.rows("WeeklyReport"))[0].document.narrativeSections;
  assert.deepEqual(fallback.map(section => section.kind), ["HEADLINE", "INSIGHT", "MOOD_CURVE", "QUESTION"]);
  assert.ok(fallback[0].template && fallback[1].template && fallback[3].template);

  // The provider fails: the week is still saved, from code templates, with no provider.
  const down = await insightsFixture();
  down.respond(() => new Response("unavailable", { status: 500 }));
  const downResult = await down.run({ ...settings, WEEKLY_INSIGHTS_OWNER_IDS: "alice" });
  assert.equal(downResult.succeeded, true, `${downResult.error?.code} ${downResult.error?.stack}`);
  const downSaved = (await down.rows("WeeklyReport"))[0].document;
  assert.deepEqual(downSaved.narrativeSections.map(section => section.kind), ["HEADLINE", "INSIGHT", "MOOD_CURVE", "QUESTION"]);
  assert.ok(downSaved.narrativeSections.every(section => section.template !== false));

  // A week with one entry: no insufficient-evidence report, but the code-only "这周的花还在长" one, with no model call.
  const thin = await fixture(t, { locale: "zh-CN", count: 1 });
  await thin.pg.exec(`ALTER TABLE "Event" ADD COLUMN "primaryGardenMood" text; UPDATE "Event" SET "primaryGardenMood"='QUIET_BLOOM'`);
  thin.respond(() => assert.fail("no model call for a thin week"));
  const thinResult = await thin.run({ ...settings, WEEKLY_INSIGHTS_OWNER_IDS: "alice" });
  assert.equal(thinResult.succeeded, true, `${thinResult.error?.code} ${thinResult.error?.stack}`); assert.equal(thin.calls.length, 0);
  const thinSaved = (await thin.rows("WeeklyReport"))[0].document;
  assert.equal(thinSaved.narrativeStatus, "GENERATED");
  assert.deepEqual(thinSaved.narrativeSections.map(section => section.kind), ["HEADLINE", "MOOD_CURVE", "QUESTION"]);
  assert.equal(thinSaved.narrativeSections[0].claim, "这周的花还在长");

  for (const list of [undefined, "bob", "alice;bob"]) {
    const off = await insightsFixture();
    respond(off, "这周你记下了这些小事。");
    const offResult = await off.run({ ...settings, WEEKLY_INSIGHTS_OWNER_IDS: list });
    assert.equal(offResult.succeeded, true, `${list}: ${offResult.error?.code} ${offResult.error?.stack}`);
    assert.equal(off.calls[0].body.system, WEEKLY_SHORT_INSTRUCTIONS); assert.equal(off.calls[0].packet.version, WEEKLY_SHORT);
  }
});
