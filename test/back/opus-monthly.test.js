import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createProductionAiWorker } from "../../lib/ai-worker.js";
import { PrivateEventRepository } from "../../lib/ai-events.js";
import { DeterministicMemoryExtractor } from "../../lib/event-memory.js";
import { ReportInputService, buildMonthlyReport, REPORT_EVIDENCE_LIMITS } from "../../lib/report-foundation.js";
import { getEmbeddingProfile, PRODUCTION_EMBEDDING_PROFILE_KEY } from "../../lib/embedding-profiles.js";
import { REPORT_NARRATIVE_GENERATION_VERSION } from "../../lib/report-narrative.js";
import { weeklyReportLocale as monthlyReportLocale } from "../../lib/report-locale.js";
import { PrismaAiCostGate } from "../../lib/ai-cost-gate.js";
import { assertReportSources, reportSourceSnapshot } from "../../lib/report-write-fence.js";
import { monthlyPeriodFor } from "../../lib/ai-periods.js";
import { selectMonthlyEvidence, MONTHLY_EVIDENCE_POLICY, monthlyWeek } from "../../lib/monthly-evidence.js";
import { buildMonthlyReflectionPacket, validateMonthlyReflection, monthlyReportProvider, monthlyTextLength,
  MONTHLY_REFLECTION_CONTRACT, OPUS_MONTHLY_MODEL, OpusMonthlyReflectionService } from "../../lib/opus-monthly.js";
import { REFLECTION_V2, REFLECTION_V2_INSTRUCTIONS } from "../../lib/reflection-v2.js";

const enabled = { AI_MONTHLY_REPORT_PROVIDER: "anthropic", AI_MONTHLY_REPORT_MODEL: OPUS_MONTHLY_MODEL,
  AI_GATEWAY_ENABLED: "true", AI_GATEWAY_ANTHROPIC_ENABLED: "true",
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_GATEWAY_ID: "synthetic-monthly",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "synthetic-gateway", ANTHROPIC_API_KEY: "synthetic-provider",
  AI_USER_DAILY_USD_LIMIT: "10", AI_USER_MONTHLY_USD_LIMIT: "10", AI_GLOBAL_DAILY_USD_LIMIT: "10",
  AI_GLOBAL_MONTHLY_USD_LIMIT: "10", AI_ANTHROPIC_MONTHLY_USD_LIMIT: "10" };
const summaries = locale => locale === "en" ? ["I finished a sketch. It was a quiet afternoon.", "I shared my drawing with a friend.", "I tried charcoal in the studio.", "I kept the drawing on my desk."]
  : locale === "zh-Hant" ? ["今天畫完了一幅素描。那個下午很安靜。", "我把畫分享給朋友，聊了彼此的近況。", "在畫室試用了炭筆。", "把畫留在了書桌上。"]
    : ["今天画完了一幅素描。那个下午很安静。", "我把画分享给朋友，聊了彼此的近况。", "在画室试用了炭笔。", "把画留在了书桌上。"];
function output(packet) {
  const insights = [];
  for (const kind of ["CROSS_WEEK_TOPIC", "SELECTED_TOPIC_CHANGE"]) {
    const fact = packet.facts.find(item => item.kind === kind);
    if (fact) insights.push({ kind, factId: fact.id });
  }
  if (!insights.length) {
    const fact = packet.facts.find(item => item.kind === "CROSS_WEEK_MOMENTS");
    if (fact) insights.push({ kind: fact.kind, factId: fact.id });
  }
  return { version: MONTHLY_REFLECTION_CONTRACT, locale: packet.locale, overview: "O1", insights,
    closing: { factId: insights[0].factId, style: "OPEN" } };
}
const native = data => ({ model: OPUS_MONTHLY_MODEL, type: "message", role: "assistant", stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(data) }], usage: { input_tokens: 500, output_tokens: 200 } });

test("Weekly selector OFF/ON does not change actual Monthly worker requests or saved claims", async t => {
  const mode = process.env.PETALPAL_WEEKLY_SELECTOR_TEST_MODE;
  if (mode !== undefined && !["OFF", "ON"].includes(mode)) throw Error("Invalid selector test mode");
  const flags = mode ? [mode === "ON" ? "true" : "false"] : ["false", "true", "invalid"];
  for (const locale of ["en", "zh-CN"]) for (const contract of [undefined, REFLECTION_V2.MONTHLY]) {
    const execute = async flag => {
      let actual;
      // Close each disposable database before constructing the next one. The
      // deployment-image verification runs in a memory-bounded Docker VM.
      await t.test(`${locale}/${contract ?? "v1"}/${flag ?? "default"}`, async child => {
        const f = await fixture(child, { locale });
        if (contract) f.respond(packet => Response.json(native({ version: REFLECTION_V2.MONTHLY, locale: packet.locale,
          paragraphs: [{ sentences: packet.evidence.filter(e => e.scope !== "previous")
            .map(e => ({ text: `“${e.text}”`, refs: [e.ref] })) }] })));
        const settings = { ...enabled, ...(contract ? { AI_MONTHLY_REFLECTION_CONTRACT: contract } : {}),
          ...(flag === undefined ? {} : { AI_WEEKLY_EVIDENCE_SELECTOR_V2: flag,
            AI_WEEKLY_REFLECTION_RECORD_DAYS_SEPARATED: flag, AI_WEEKLY_REFLECTION_RETROSPECTIVE: flag,
            AI_WEEKLY_REFLECTION_NARRATIVE_THREAD: flag }) };
        const result = await f.run(settings); assert.equal(result.succeeded, true, result.error?.stack);
        assert.equal(f.calls.length, 1); assert.equal(f.retrievalCalls, locale === "en" ? 1 : 0);
        const report = (await f.rows("MonthlyReport"))[0].document;
        actual = { body: f.calls[0].body, summary: report.summary, sections: report.narrativeSections,
          evidence: await f.rows("AIEvidence") };
      });
      return actual;
    };
    const baseline = await execute(undefined);
    for (const flag of flags) assert.deepEqual(await execute(flag), baseline, `${locale}/${contract ?? "v1"}/${flag}`);
  }
});
function source(id, date, topics = ["drawing"], ownerId = "alice", summary = `Synthetic moment ${id}.`) {
  return { id, ownerId, occurredAt: new Date(date), updatedAt: new Date("2026-10-01"), memoryProcessingAllowed: true,
    memory: { id: `memory-${id}`, ownerId, sourceEventId: id, updatedAt: new Date("2026-10-01"), embeddingInputRevision: 1,
      memoryType: "EVENT", summary, topics, importanceScore: 0.8, embeddingStatus: "GENERATED", embeddedInputRevision: 1 } };
}
function contractInput(locale = "zh-Hans") {
  const identity = { userId: "alice" }, period = monthlyPeriodFor({ year: 2026, month: 9, timezone: "UTC" });
  const topic = locale === "en" ? "drawing" : locale === "zh-Hant" ? "畫畫" : "画画";
  const events = [2, 9, 16, 27].map((day, i) => source(`event-${i}`, `2026-09-${String(day).padStart(2, "0")}`, [topic], "alice", summaries(locale)[i % 4]));
  const previousEvents = [source("previous", "2026-08-15", [topic], "alice", summaries(locale)[0])];
  const aggregates = buildMonthlyReport({ identity, ...period, year: 2026, month: 9, currentEvents: events, previousEvents, status: "COMPLETE" });
  return { reportType: "MONTHLY", ownerId: "alice", locale, period, aggregates,
    evidenceSelection: selectMonthlyEvidence({ identity, period, events, previousEvents, limits: REPORT_EVIDENCE_LIMITS.MONTHLY }),
    sourceFence: { evidencePolicy: MONTHLY_EVIDENCE_POLICY, sources: reportSourceSnapshot([...events, ...previousEvents]) } };
}

// Disposable SQL engine and synthetic fixtures only; no real models, production
// schema/migrations, accounts or external connections. SQL rollback is real;
// independent-connection PostgreSQL row-lock scheduling is not simulated here.
// Match Weekly's cleanup: node:test retains after-hook closures until file end.
// Keep a holder, not the fixture/PGlite instance, reachable from those hooks.
function closeAfter(t, pg) {
  const holder = { pg };
  t.after(async () => { const db = holder.pg; holder.pg = null; await db?.close(); });
}

async function fixture(t, { locale = "zh-CN", count = 4, previousCount = 1 } = {}) {
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
    INSERT INTO "AIJob" VALUES ('job-1','alice','MONTHLY_REPORT','2026-09','MONTHLY_REPORT:2026-09:grounded-narrative-v1',
      'PENDING',0,3,NULL,NULL,NULL,NULL,NULL,now(),now(),'2000-01-01',NULL);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY,"createdAt" timestamp NOT NULL DEFAULT now(),"eventType" varchar(64),"outcome" varchar(32),
      "actorUserId" varchar(128),"targetClass" varchar(64),"targetSafeId" varchar(128),"actionCode" varchar(64),"reasonCode" varchar(64));
    CREATE TABLE "MonthlyReport" ("id" text PRIMARY KEY,"ownerId" text,"periodKey" text,"document" jsonb,UNIQUE("ownerId","periodKey"));
    CREATE TABLE "AIEvidence" ("id" serial PRIMARY KEY,"ownerId" text,"sourceEventId" text REFERENCES "Event" ON DELETE CASCADE,
      "sourceMemoryId" text,"monthlyReportId" text REFERENCES "MonthlyReport" ON DELETE CASCADE,"claimType" text);`);
  await pg.query('INSERT INTO "User" VALUES (\'alice\',\'UTC\',$1),(\'bob\',\'UTC\',\'en\')', [locale]);
  const normalized = monthlyReportLocale(locale);
  for (let i = 0; i < count; i++) {
    await pg.query('INSERT INTO "Event" VALUES ($1,\'alice\',$2,\'2026-09-21\',true)', [`event-${i}`, new Date(`2026-09-${String([2, 9, 16, 27, 30][i % 5]).padStart(2, "0")}`)]);
    await pg.query('INSERT INTO "EventMemory" VALUES ($1,\'alice\',$2,\'2026-09-21\',1,\'EVENT\',$3,$4,0.8,\'GENERATED\',1)',
      [`memory-${i}`, `event-${i}`, summaries(normalized)[i % 4], JSON.stringify([normalized === "en" ? "drawing" : "画画"])]);
  }
  for (let i = 0; i < previousCount; i++) {
    await pg.query('INSERT INTO "Event" VALUES ($1,\'alice\',$2,\'2026-09-01\',true)', [`prior-${i}`, new Date(`2026-08-${15 + i}`)]);
    await pg.query('INSERT INTO "EventMemory" VALUES ($1,\'alice\',$2,\'2026-09-01\',1,\'EVENT\',$3,$4,0.8,\'GENERATED\',1)',
      [`prior-memory-${i}`, `prior-${i}`, summaries(normalized)[i % 4], JSON.stringify([normalized === "en" ? "drawing" : "画画"])]);
  }
  let response = packet => Response.json(native(output(packet))), retrievalHook, failEvidence = false, expireCompletion = false;
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
      event: {
        findFirst: async ({ where }) => (await query('SELECT * FROM "Event" WHERE "id"=$1 AND "ownerId"=$2', where.id, where.ownerId))[0],
        deleteMany: async ({ where }) => query('DELETE FROM "Event" WHERE "id"=$1 AND "ownerId"=$2', where.id, where.ownerId),
        findMany: async ({ where }) => query(`SELECT event.*, row_to_json(memory) AS memory FROM "Event" event
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
      weeklyReport: { findMany: async () => [] }, // no Weekly reports in this Monthly fixture
      monthlyReport: {
        findMany: async () => [], // no Monthly 2.0 report shows the Event
        deleteMany: async ({ where }) => query('DELETE FROM "MonthlyReport" WHERE "ownerId"=$1 AND "id"=ANY($2)', where.ownerId, where.id.in),
        findFirst: async ({ where }) => {
          const row = report((await query('SELECT * FROM "MonthlyReport" WHERE "ownerId"=$1 AND "periodKey"=$2', where.ownerId, where.periodKey))[0]);
          return row && (!where.narrativeStatus || row.narrativeStatus !== where.narrativeStatus.not) ? row : null;
        },
        findUnique: async ({ where }) => report((await query('SELECT * FROM "MonthlyReport" WHERE "ownerId"=$1 AND "periodKey"=$2',
          where.ownerId_year_month.ownerId, `${where.ownerId_year_month.year}-${String(where.ownerId_year_month.month).padStart(2, "0")}`))[0]),
        upsert: async ({ create }) => {
          const rows = await query('INSERT INTO "MonthlyReport" VALUES (\'report-1\',$1,$2,$3) ON CONFLICT ("ownerId","periodKey") DO UPDATE SET "document"=EXCLUDED."document" RETURNING *',
            create.ownerId, create.periodKey, JSON.stringify(create)); return report(rows[0]);
        }
      },
      aiEvidence: {
        findMany: async ({ where }) => query('SELECT * FROM "AIEvidence" WHERE "ownerId"=$1 AND "sourceEventId"=$2', where.ownerId, where.sourceEventId),
        deleteMany: async ({ where }) => query('DELETE FROM "AIEvidence" WHERE "ownerId"=$1 AND "monthlyReportId"=$2', where.ownerId, where.monthlyReportId),
        createMany: async ({ data }) => {
          if (failEvidence) throw Error("SYNTHETIC_PRIVATE_WRITE_ERROR");
          for (const item of data) await query('INSERT INTO "AIEvidence" ("ownerId","sourceEventId","sourceMemoryId","monthlyReportId","claimType") VALUES ($1,$2,$3,$4,$5)',
            item.ownerId, item.sourceEventId, item.sourceMemoryId, item.monthlyReportId, item.claimType);
        }
      }
    };
  };
  const db = { ...adapt(pg), $transaction: fn => pg.transaction(tx => fn(adapt(tx))) };
  const retrieval = { retrieve: async ({ identity, dateFrom, dateTo }) => {
    retrievalCalls++; if (retrievalHook) await retrievalHook();
    return (await db.event.findMany({ where: { ownerId: identity.userId, occurredAt: { gte: dateFrom, lt: dateTo } } }))
      .filter(event => event.memory).map(event => ({ ...event.memory, eventDate: event.occurredAt, similarity: 0.9 }));
  } };
  const fetchImpl = async (url, options) => {
    assert.equal(url, `https://gateway.ai.cloudflare.com/v1/${"a".repeat(32)}/synthetic-monthly/anthropic/v1/messages`);
    const body = JSON.parse(options.body), packet = JSON.parse(body.messages[0].content);
    calls.push({ body, packet, options }); return response(packet, options);
  };
  const embeddingProvider = { describeProfile: () => getEmbeddingProfile(PRODUCTION_EMBEDDING_PROFILE_KEY),
    embedQuery: () => assert.fail("injected retrieval only"), embedDocuments: () => assert.fail("no embedding inference") };
  const make = (env = enabled) => createProductionAiWorker({ prisma: db, env, gatewayFetchImpl: fetchImpl, embeddingProvider, semanticRetrieval: retrieval,
    workerId: "worker-1", retryDelayMs: 0, logger: { error: (...args) => logs.push(args) },
    reportNarrativeProvider: { async generateNarrative() { legacyCalls++; return { sections: [{ kind: "MAJOR_EXPERIENCES",
      claim: summaries("en")[0], evidenceRefs: [{ sourceEventId: "event-0", sourceMemoryId: "memory-0" }], aggregateRefs: [] }] }; } } });
  const run = (env = enabled) => make(env).runJob({ jobId: "job-1", ownerId: "alice", jobType: "MONTHLY_REPORT" });
  return { pg, db, calls, logs, run, make, get retrievalCalls() { return retrievalCalls; }, get legacyCalls() { return legacyCalls; },
    respond: fn => { response = fn; }, retrievalHook: fn => { retrievalHook = fn; }, failEvidence: () => { failEvidence = true; },
    expireCompletion: () => { expireCompletion = true; }, rows: table => db.$queryRawUnsafe(`SELECT * FROM "${table}"`) };
}

test("Monthly contract composes localized grounded patterns, sample changes and closing without source quotations", () => {
  for (const locale of ["en", "zh-Hans"]) {
    const input = contractInput(locale), packet = buildMonthlyReflectionPacket(input), raw = output(packet);
    const result = validateMonthlyReflection(raw, input);
    assert.equal(packet.facts.some(fact => fact.kind === "CROSS_WEEK_MOMENTS"), false, "supported synthesis takes precedence over quotations");
    assert.equal(result.sections.length, 3); assert.equal(result.sections[0].contractVersion, MONTHLY_REFLECTION_CONTRACT);
    assert.equal(packet.coverage.representedWeeks.length, 4);
    assert.ok(result.sections[2].evidenceRefs.some(ref => ref.sourceEventId === "previous"));
    assert.ok(result.narrative.includes(locale === "en" ? "selected" : locale === "zh-Hant" ? "所選" : "所选"));
    assert.ok(!result.narrative.includes(summaries(locale)[0]));
    if (locale !== "en") assert.ok(monthlyTextLength(result.narrative) >= 250 && monthlyTextLength(result.narrative) <= 350, result.narrative);
  }
  assert.equal(monthlyTextLength(" 中 👩‍👩‍👧‍👦 e\u0301\n"), 3);
});

test("Monthly schema rejects invented multilingual facts, altered counts, unknown cards and unsupported interpretations", () => {
  for (const locale of ["en", "zh-Hans"]) {
    const input = contractInput(locale), packet = buildMonthlyReflectionPacket(input), valid = output(packet);
    for (const mutate of [raw => { raw.version = "v2"; }, raw => { raw.locale = "ja"; }, raw => { raw.overview = "O99"; },
      raw => { raw.text = "You became happier / 你的情绪改善了 / 你的情緒改善了"; },
      raw => { raw.insights[0].text = "You received a promotion"; }, raw => { raw.insights[0].count = 99; },
      raw => { raw.insights[0].quotes = ["I received a promotion / 我升職了"]; },
      raw => { raw.insights[0].factId = "bob"; }, raw => { raw.insights[0].kind = "EMOTIONAL_TREND"; },
      raw => { raw.insights[0].factId = "C1"; }, raw => { raw.insights[1] = raw.insights[0]; },
      raw => { raw.closing.factId = "O1"; }, raw => { raw.closing.style = "PREDICT_IMPROVEMENT"; },
      raw => { raw.insights = []; }, raw => { raw.insights.push(raw.insights[0]); }]) {
      const raw = structuredClone(valid); mutate(raw); assert.throws(() => validateMonthlyReflection(raw, input));
    }
    // Cards are recomputed locally; changed caller-provided packets cannot make
    // an unknown card or fabricated quantitative claim acceptable.
    packet.facts.push({ id: "X1", kind: "CROSS_WEEK_TOPIC", count: 99 });
    const raw = structuredClone(valid); raw.insights[0].factId = "X1";
    assert.throws(() => validateMonthlyReflection(raw, input, packet));
  }
});

test("bounded Monthly selector spans early, middle and late weeks despite recent-only semantic ranking", () => {
  const identity = { userId: "alice" }, period = monthlyPeriodFor({ year: 2026, month: 9, timezone: "UTC" });
  const events = Array.from({ length: 100 }, (_, i) => source(`late-${i}`, "2026-09-29", ["late"]));
  events.push(source("early", "2026-09-02", ["early"]), source("middle", "2026-09-14", ["middle"]));
  const semanticCandidates = events.slice(0, 64).map(event => ({ ...event.memory, similarity: 1 }));
  const result = selectMonthlyEvidence({ identity, period, events, previousEvents: [], semanticCandidates, limits: REPORT_EVIDENCE_LIMITS.MONTHLY });
  assert.equal(result.status, "READY"); assert.ok(result.candidateCount <= 64);
  assert.ok(result.evidence.some(item => item.sourceEventId === "early"));
  assert.ok(result.evidence.some(item => item.sourceEventId === "middle"));
  assert.equal(result.coverage.representedWeeks.length, 3); assert.equal(result.coverage.missingWeeks.length, 0);
  assert.ok(result.evidence.length <= 16); assert.ok(result.contextCharacters <= 8000);
  const wrongOwner = [{ ...semanticCandidates[0], ownerId: "bob" }];
  assert.throws(() => selectMonthlyEvidence({ identity, period, events, previousEvents: [], semanticCandidates: wrongOwner, limits: REPORT_EVIDENCE_LIMITS.MONTHLY }));
});

test("Monthly week coverage uses owner-local Monday weeks and preserves all six week anchors within hard limits", () => {
  const identity = { userId: "alice" }, period = monthlyPeriodFor({ year: 2026, month: 8, timezone: "America/Vancouver" });
  assert.equal(monthlyWeek("2026-08-03T06:59:00Z", period.timezone), "2026-07-27");
  assert.equal(monthlyWeek("2026-08-03T07:00:00Z", period.timezone), "2026-08-03");
  const events = [1, 3, 10, 17, 24, 31].map(day => source(`e${day}`, `2026-08-${String(day).padStart(2, "0")}T12:00:00Z`));
  const selected = selectMonthlyEvidence({ identity, period, events, previousEvents: [], limits: REPORT_EVIDENCE_LIMITS.MONTHLY });
  assert.equal(selected.status, "READY"); assert.equal(selected.evidence.length, 6);
  assert.equal(selected.coverage.representedWeeks.length, 6);
  const limited = selectMonthlyEvidence({ identity, period, events, previousEvents: [],
    limits: { ...REPORT_EVIDENCE_LIMITS.MONTHLY, maxContextCharacters: 300 } });
  assert.equal(limited.status, "INSUFFICIENT_EVIDENCE"); assert.ok(limited.coverage.missingWeeks.length > 0);
});

test("Monthly cards cannot generalize sample counts or turn missing previous evidence into a change", () => {
  const input = contractInput("en");
  input.evidenceSelection.evidence = input.evidenceSelection.evidence.filter(item => !item.sourceEventId.startsWith("previous"));
  const packet = buildMonthlyReflectionPacket(input);
  assert.equal(packet.facts.some(fact => fact.kind === "SELECTED_TOPIC_CHANGE"), false);
  const raw = output(packet); raw.insights.push({ kind: "SELECTED_TOPIC_CHANGE", factId: "C1" });
  assert.throws(() => validateMonthlyReflection(raw, input));
  const missingWeek = contractInput(); missingWeek.evidenceSelection.evidence.splice(2, 1);
  assert.throws(() => buildMonthlyReflectionPacket(missingWeek), { code: "REPORT_NARRATIVE_INSUFFICIENT_EVIDENCE" });
  for (const mutate of [value => { value.aggregates.eventCount = 99; }, value => { value.sourceFence.sources[0].ownerId = "bob"; },
    value => { value.aggregates.month = 8; }, value => { value.sourceFence.sources.push(value.sourceFence.sources[0]); }]) {
    const changed = contractInput(); mutate(changed); assert.throws(() => buildMonthlyReflectionPacket(changed));
  }
});

test("Opus stays disabled by default and explicit Workers routing preserves the production Monthly path", async t => {
  assert.equal(monthlyReportProvider({}), "workers-ai");
  assert.equal(JSON.stringify(new OpusMonthlyReflectionService({ env: enabled })), "{}");
  for (const env of [{}, { AI_MONTHLY_REPORT_PROVIDER: "workers-ai" }]) {
    const f = await fixture(t, { locale: "en" }), result = await f.run(env);
    assert.equal(result.succeeded, true, result.error?.stack); assert.equal(f.calls.length, 0); assert.equal(f.legacyCalls, 1);
    assert.equal(f.retrievalCalls, 1); assert.equal((await f.rows("MonthlyReport"))[0].document.generationVersion, REPORT_NARRATIVE_GENERATION_VERSION);
  }
});

test("English Opus preserves BGE retrieval and reserves durable provider-aware budgets before preparation", async t => {
  const f = await fixture(t, { locale: "en" });
  f.retrievalHook(async () => {
    const ledger = await f.rows("AuditEvent"); assert.equal(ledger.filter(row => row.eventType === "AI_COST_RESERVED").length, 1);
    assert.equal(ledger.filter(row => row.eventType === "AI_GATEWAY_USD_RESERVED").length, 1);
  });
  const result = await f.run(); assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(f.retrievalCalls, 1); assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
  assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED"); assert.equal((await f.rows("AIEvidence")).length, 5);
  const report = (await f.rows("MonthlyReport"))[0].document;
  assert.equal(report.eventCount, 4); assert.equal(report.narrativeSections[0].model, OPUS_MONTHLY_MODEL);
  const { packet, body, options } = f.calls[0];
  assert.equal(body.model, OPUS_MONTHLY_MODEL); assert.equal(body.temperature, undefined); assert.equal(body.tools, undefined);
  assert.equal(body.output_config.effort, "low"); assert.equal(body.max_tokens, 4096);
  assert.equal(options.headers["cf-aig-max-attempts"], "1"); assert.equal(options.headers["cf-aig-collect-log-payload"], "false");
  assert.equal(packet.evidence.filter(item => item.scope === "PREVIOUS").length, 1);
  assert.doesNotMatch(JSON.stringify(packet), /alice|bob|event-0|memory-0|Journal|sourceFence/);
  const ledger = await f.rows("AuditEvent"); assert.equal(ledger.length, 4);
  assert.equal(ledger.find(row => row.eventType === "AI_COST_RESERVED").reasonCode, "2");
});

test("Simplified Chinese Monthly aliases use independently bounded owned memories without multilingual embeddings", async t => {
  for (const locale of ["zh-CN", "zh-Hans"]) {
    const f = await fixture(t, { locale }), result = await f.run();
    assert.equal(result.succeeded, true, result.error?.stack); assert.equal(f.retrievalCalls, 0); assert.equal(f.calls.length, 1);
    const report = (await f.rows("MonthlyReport"))[0].document;
    assert.ok(monthlyTextLength(report.summary) >= 250 && monthlyTextLength(report.summary) <= 350);
    assert.equal(report.narrativeSections[0].locale, monthlyReportLocale(locale));
    assert.ok(report.summary.includes("这个月"));
    const input = await new ReportInputService({ prisma: f.db, semanticRetrieval: { retrieve: () => assert.fail("no Chinese embedding") }, localizedMonthly: true })
      .buildMonthlyInput({ identity: { userId: "alice" }, year: 2026, month: 9 });
    await assert.rejects(f.db.$transaction(tx => assertReportSources(tx, "alice", {
      ...input, sourceFence: { ...input.sourceFence, evidencePolicy: undefined }
    })), { code: "REPORT_SOURCE_STALE" });
  }
});

test("invalid Monthly provider, model, flags, token and locale configuration fails before retrieval without fallback", async t => {
  for (const change of [{ AI_MONTHLY_REPORT_PROVIDER: "openai" }, { AI_MONTHLY_REPORT_PROVIDER: "" },
    { AI_MONTHLY_REPORT_MODEL: "claude-sonnet-5-5" }, { AI_GATEWAY_ENABLED: undefined }, { AI_GATEWAY_ANTHROPIC_ENABLED: undefined },
    { AI_USER_DAILY_USD_LIMIT: undefined }, { AI_MONTHLY_REPORT_TIMEOUT_MS: "20001" }, { AI_MONTHLY_REPORT_TIMEOUT_MS: "0" },
    { AI_MONTHLY_REPORT_MAX_OUTPUT_TOKENS: "8193" }, { AI_MONTHLY_REPORT_MAX_OUTPUT_TOKENS: "2.5" },
    { AI_REPORT_SUPPORTED_LOCALES: "en,ja" }, { AI_REPORT_SUPPORTED_LOCALES: "en,zh-Hans,zh-Hant" }]) {
    await t.test(JSON.stringify(change), async child => {
      const f = await fixture(child, { locale: "en" }), result = await f.run({ ...enabled, ...change });
      assert.equal(result.succeeded, false); assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal(f.legacyCalls, 0);
    });
  }
});

test("Monthly USD, owner, global, action and provider cost admission blocks both query and Opus dispatch", async t => {
  const f = await fixture(t, { locale: "en" });
  for (const name of ["AI_USER_DAILY_USD_LIMIT", "AI_USER_MONTHLY_USD_LIMIT", "AI_GLOBAL_DAILY_USD_LIMIT", "AI_GLOBAL_MONTHLY_USD_LIMIT",
    "AI_ANTHROPIC_MONTHLY_USD_LIMIT", "AI_MONTHLY_REPORT_DAILY_LIMIT", "AI_USER_DAILY_CALL_LIMIT", "AI_GLOBAL_DAILY_CALL_LIMIT", "AI_PROVIDER_DAILY_CALL_LIMIT"]) {
    const result = await f.run({ ...enabled, [name]: "0" }); assert.equal(result.error.code, "AI_QUOTA_EXCEEDED", name);
    await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0); assert.equal((await f.rows("AuditEvent")).length, 0);
  await f.pg.exec(`INSERT INTO "AuditEvent" ("id","eventType","actorUserId","targetClass","actionCode","reasonCode")
    VALUES ('prior-cf','AI_COST_RESERVED','bob','CLOUDFLARE_WORKERS_AI','SPEECH_TRANSCRIPTION','100')`);
  const denied = await f.run({ ...enabled, AI_PROVIDER_DAILY_CALL_LIMIT: "100" });
  assert.equal(denied.error.code, "AI_QUOTA_EXCEEDED"); assert.equal(f.retrievalCalls, 0); assert.equal((await f.rows("AuditEvent")).length, 1);
});

test("sparse or single-week Monthly evidence abstains without inference while preserving deterministic statistics", async t => {
  for (const mode of ["few", "one-week", "unquotable", "long-anchor"]) {
    const f = await fixture(t, { count: mode === "few" ? 2 : 4, previousCount: 0 });
    if (mode === "one-week") await f.pg.exec('UPDATE "Event" SET "occurredAt"=\'2026-09-02\'');
    if (mode === "unquotable") await f.pg.exec('UPDATE "EventMemory" SET "topics"=\'[]\',"summary"=repeat(\'合成的长句\',60)');
    if (mode === "long-anchor") await f.pg.exec('UPDATE "EventMemory" SET "summary"=repeat(\'synthetic\',1000) WHERE "sourceEventId"=\'event-0\'');
    const result = await f.run(); assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(result.result.status, "INSUFFICIENT_EVIDENCE"); assert.equal(f.calls.length, 0);
    const report = (await f.rows("MonthlyReport"))[0].document;
    assert.equal(report.summary, null); assert.equal(report.eventCount, mode === "few" ? 2 : 4);
    assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED");
  }
});

test("malformed, refused, ungrounded and provider-error Monthly responses cannot replay paid work", async t => {
  for (const response of [() => new Response("invalid"), packet => Response.json({ ...native(output(packet)), stop_reason: "refusal" }),
    packet => Response.json({ ...native(output(packet)), stop_reason: "max_tokens" }),
    packet => Response.json(native({ ...output(packet), reflection: "你已经走出了低谷。" })),
    () => new Response("SYNTHETIC_PRIVATE_MARKER", { status: 503 }), () => new Response("no", { status: 429 })]) {
    const f = await fixture(t); f.respond(response);
    assert.equal((await f.run()).succeeded, false);
    assert.equal((await f.run()).error.code, "AI_INFERENCE_ALREADY_RESERVED");
    assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0); assert.equal((await f.rows("MonthlyReport")).length, 0);
    assert.equal(JSON.stringify(f.logs).includes("SYNTHETIC_PRIVATE_MARKER"), false);
  }
});

test("Monthly retrieval timeout prevents late dispatch and retains the spent operation tombstone", async t => {
  const f = await fixture(t, { locale: "en" }); let release;
  f.retrievalHook(() => new Promise(resolve => { release = resolve; }));
  const result = await f.run({ ...enabled, AI_MONTHLY_REPORT_TIMEOUT_MS: "250" });
  assert.equal(result.error.code, "AI_GATEWAY_TIMEOUT"); release(); await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 1);
  assert.equal((await f.run()).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.retrievalCalls, 1);
});

test("late Opus fetch ignoring AbortSignal cannot read output, validate, charge usage or persist after timeout", async t => {
  const f = await fixture(t); let release, packet;
  f.respond(value => { packet = value; return new Promise(resolve => { release = resolve; }); });
  const result = await f.run({ ...enabled, AI_MONTHLY_REPORT_TIMEOUT_MS: "250" }); assert.equal(result.error.code, "AI_GATEWAY_TIMEOUT");
  const response = Response.json(native(output(packet))), reader = t.mock.method(response.body, "getReader");
  release(response); await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(reader.mock.callCount(), 0); assert.equal((await f.rows("MonthlyReport")).length, 0);
  assert.equal((await f.rows("AuditEvent")).length, 3); assert.equal((await f.rows("AIEvidence")).length, 0);
});

test("consent withdrawal or epoch change before dispatch prevents Monthly inference", async t => {
  for (const stage of ["before", "retrieval", "epoch"]) {
    const f = await fixture(t, { locale: "en" });
    const revoke = () => f.pg.exec(stage === "epoch" ? 'UPDATE "AiConsent" SET "updatedAt"=\'2099-01-01\'' : 'UPDATE "AiConsent" SET "aiProcessing"=false');
    if (stage === "before") await revoke(); else f.retrievalHook(revoke);
    const result = await f.run(); assert.ok(result.succeeded === false || result.result?.status === "CONSENT_INELIGIBLE");
    assert.equal(f.calls.length, 0); assert.equal((await f.rows("MonthlyReport")).length, 0);
  }
});

test("source deletion, previous-source deletion, source edits, locale and consent revocation reject returned Monthly output", async t => {
  for (const mutation of ["revoke", "epoch", "delete", "prior-delete", "memory", "locale", "timezone", "permission"]) {
    const f = await fixture(t);
    f.respond(async packet => {
      const sql = { revoke: 'UPDATE "AiConsent" SET "memoryEnabled"=false', epoch: 'UPDATE "AiConsent" SET "updatedAt"=\'2099-01-01\'',
        delete: 'DELETE FROM "Event" WHERE "id"=\'event-0\'', "prior-delete": 'DELETE FROM "Event" WHERE "id"=\'prior-0\'',
        memory: 'UPDATE "EventMemory" SET "summary"=\'Changed source\'', locale: 'UPDATE "User" SET "preferredLocale"=\'en\'',
        timezone: 'UPDATE "User" SET "timezone"=\'Asia/Shanghai\'', permission: 'UPDATE "Event" SET "memoryProcessingAllowed"=false' }[mutation];
      await f.pg.exec(sql); return Response.json(native(output(packet)));
    });
    const result = await f.run(); assert.ok(result.succeeded === false || result.result?.status === "CONSENT_INELIGIBLE", mutation);
    assert.equal((await f.rows("MonthlyReport")).length, 0); assert.equal((await f.rows("AuditEvent")).length, 4);
  }
});

test("Monthly duplicate execution saves once and reuses finalized reports across provider selection", async t => {
  const f = await fixture(t), results = await Promise.all([f.run(), f.run()]);
  assert.equal(results.filter(item => item.succeeded).length, 1); assert.equal(f.calls.length, 1);
  assert.equal((await f.run()).claimed, false);
  const before = (await f.rows("MonthlyReport"))[0].document;
  await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  const result = await f.run({}); assert.equal(result.result.skipped, true); assert.equal(f.calls.length, 1); assert.equal(f.legacyCalls, 0);
  assert.deepEqual((await f.rows("MonthlyReport"))[0].document, before);
});

test("Monthly evidence failure and completion lease expiry roll back report, citations and job completion atomically", async t => {
  for (const stage of ["evidence", "completion"]) {
    const f = await fixture(t); if (stage === "evidence") f.failEvidence(); else f.expireCompletion();
    const result = await f.run(); assert.equal(result.succeeded, false);
    assert.equal((await f.rows("MonthlyReport")).length, 0); assert.equal((await f.rows("AIEvidence")).length, 0);
    assert.notEqual((await f.rows("AIJob"))[0].status, "SUCCEEDED"); assert.equal((await f.rows("AuditEvent")).length, 4);
  }
});

test("Monthly owner, Journal, period and localization policies fail closed without admitting foreign content", async t => {
  for (const change of ["owner", "journal", "locale", "period", "job-period"]) {
    const f = await fixture(t);
    if (change === "owner") await f.pg.exec('UPDATE "EventMemory" SET "ownerId"=\'bob\'');
    if (change === "journal") await f.pg.exec('UPDATE "EventMemory" SET "memoryType"=\'JOURNAL\',"summary"=\'SYNTHETIC_JOURNAL_EXCLUDED\'');
    if (change === "locale") await f.pg.exec('UPDATE "User" SET "preferredLocale"=\'ja\'');
    if (change === "period") await f.pg.exec('UPDATE "Event" SET "occurredAt"=\'2026-10-01\'');
    if (change === "job-period") await f.pg.exec(`UPDATE "AIJob" SET "resourceId"='2026-09-extra',"idempotencyKey"='MONTHLY_REPORT:2026-09-extra:grounded-narrative-v1'`);
    const result = await f.run(); assert.equal(f.calls.length, 0); assert.equal(f.retrievalCalls, 0);
    assert.ok(result.succeeded === false || result.result?.status === "INSUFFICIENT_EVIDENCE");
  }
});

test("deleting a saved Monthly comparison source removes its report but preserves the no-replay cost ledger", async t => {
  const f = await fixture(t); assert.equal((await f.run()).succeeded, true);
  assert.ok((await f.rows("AIEvidence")).some(row => row.sourceEventId === "prior-0"));
  const repository = new PrivateEventRepository(f.db);
  assert.equal(await repository.deleteEventAndAffectedReports({ identity: { userId: "bob" }, eventId: "prior-0" }), null);
  assert.equal((await f.rows("MonthlyReport")).length, 1);
  const result = await repository.deleteEventAndAffectedReports({ identity: { userId: "alice" }, eventId: "prior-0" });
  assert.equal(result.deletedReports.monthly, 1); assert.equal((await f.rows("MonthlyReport")).length, 0);
  assert.equal((await f.rows("AIEvidence")).length, 0); assert.equal((await f.rows("AuditEvent")).length, 4);
  await f.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  assert.equal((await f.run()).error.code, "AI_INFERENCE_ALREADY_RESERVED"); assert.equal(f.calls.length, 1);
});

test("canonical deterministic extraction without topics supports verified cross-week Monthly moments in every locale", async t => {
  for (const locale of ["en", "zh-CN"]) {
    const extracted = await new DeterministicMemoryExtractor().extract({ kind: "EVENT", id: "ordinary", content: summaries(monthlyReportLocale(locale))[0] });
    assert.deepEqual(extracted.topics, []);
    const f = await fixture(t, { locale, previousCount: 0 });
    await f.pg.exec('UPDATE "EventMemory" SET "topics"=\'[]\'');
    const result = await f.run(); assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(f.calls.length, 1); assert.equal(f.retrievalCalls, locale === "en" ? 1 : 0);
    const packet = f.calls[0].packet, plan = output(packet);
    assert.deepEqual(plan.insights.map(item => item.kind), ["CROSS_WEEK_MOMENTS"]);
    const moment = packet.facts.find(item => item.id === plan.insights[0].factId);
    assert.ok(moment.refs.every(ref => packet.evidence.some(item => item.ref === ref)));
    assert.notEqual(packet.evidence.find(item => item.ref === moment.refs[0]).week, packet.evidence.find(item => item.ref === moment.refs[1]).week);
    const report = (await f.rows("MonthlyReport"))[0].document;
    assert.ok(moment.quotes.every(quote => report.summary.includes(quote)));
    if (locale !== "en") assert.ok(monthlyTextLength(report.summary) >= 250 && monthlyTextLength(report.summary) <= 350);
  }
});

test("Monthly moment cards preserve whole-source negation and numbers and reject altered or truncated evidence", () => {
  for (const locale of ["en", "zh-Hans"]) {
    const input = contractInput(locale), quotes = locale === "en" ? ["I did not run 3 miles.", "I walked 2 miles, without racing."]
      : locale === "zh-Hant" ? ["我沒有升職，也沒有加薪。", "我走了２公里，沒有參加比賽。"] : ["我没有升职，也没有加薪。", "我走了２公里，没有参加比赛。"];
    for (const source of input.sourceFence.sources) { source.memory.topics = []; }
    for (const [i, item] of input.evidenceSelection.evidence.entries()) {
      item.topics = []; item.summary = quotes[i % 2];
      input.sourceFence.sources.find(source => source.id === item.sourceEventId).memory.summary = item.summary;
    }
    const packet = buildMonthlyReflectionPacket(input), raw = output(packet), result = validateMonthlyReflection(raw, input);
    const card = packet.facts.find(fact => fact.id === raw.insights[0].factId);
    assert.ok(card.quotes.every(quote => quotes.includes(quote) && result.narrative.includes(quote)));
    const altered = structuredClone(raw); altered.insights[0].quote = "I ran a marathon / 我升职了";
    assert.throws(() => validateMonthlyReflection(altered, input));
    for (const item of input.evidenceSelection.evidence) {
      item.summary = "x".repeat(500);
      input.sourceFence.sources.find(source => source.id === item.sourceEventId).memory.summary = item.summary;
    }
    assert.throws(() => buildMonthlyReflectionPacket(input), { code: "REPORT_NARRATIVE_INSUFFICIENT_EVIDENCE" });
  }
});

test("opt-in monthly-reflection-v2 saves cited cross-week Claude prose; v1 stays default and finalized reports are reused", async t => {
  const v2env = { ...enabled, AI_MONTHLY_REFLECTION_CONTRACT: REFLECTION_V2.MONTHLY };
  const written = packet => ({ version: REFLECTION_V2.MONTHLY, locale: packet.locale, paragraphs: [{ sentences: packet.evidence
    .filter(item => item.scope !== "previous").map(item => ({ text: packet.locale === "en" ? `You wrote: “${item.text}”` : `你写下：“${item.text}”`, refs: [item.ref] })) }] });
  const f = await fixture(t); f.respond(packet => Response.json(native(written(packet))));
  const result = await f.run(v2env); assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.system, REFLECTION_V2_INSTRUCTIONS.MONTHLY);
  const packet = f.calls[0].packet; assert.equal(packet.version, REFLECTION_V2.MONTHLY);
  for (const hidden of ["alice", "event-", "memory-", "prior-", "eventCount"]) assert.equal(JSON.stringify(packet).includes(hidden), false, hidden);
  const report = (await f.rows("MonthlyReport"))[0].document;
  assert.equal(report.generationVersion, REPORT_NARRATIVE_GENERATION_VERSION);
  assert.ok(report.narrativeSections.every(section => section.contractVersion === REFLECTION_V2.MONTHLY && section.claims.length));
  assert.equal(report.summary, written(packet).paragraphs[0].sentences.map(item => item.text).join(""));
  assert.deepEqual(packet.evidence.map(item => item.week ?? item.scope), ["previous", "W1", "W2", "W3", "W4"]);
  assert.deepEqual((await f.rows("AIEvidence")).map(row => row.claimType).sort(), ["NARRATIVE_CITED", "NARRATIVE_CITED", "NARRATIVE_CITED", "NARRATIVE_CITED", "NARRATIVE_SELECTED"]);
  assert.equal((await f.rows("AIJob"))[0].status, "SUCCEEDED");
  const invalid = await fixture(t), failed = await invalid.run({ ...enabled, AI_MONTHLY_REFLECTION_CONTRACT: "monthly-reflection-v3" });
  assert.equal(failed.succeeded, false); assert.equal(invalid.calls.length, 0); assert.equal(invalid.retrievalCalls, 0); assert.equal(invalid.legacyCalls, 0);
  // A finalized v1 report is reused, never regenerated, after the v2 opt-in.
  const old = await fixture(t); assert.equal((await old.run()).succeeded, true);
  const before = (await old.rows("MonthlyReport"))[0].document;
  await old.pg.exec(`UPDATE "AIJob" SET "status"='PENDING',"attemptCount"=0,"nextAttemptAt"='2000-01-01'`);
  const reused = await old.run(v2env); assert.equal(reused.result.skipped, true); assert.equal(old.calls.length, 1);
  assert.deepEqual((await old.rows("MonthlyReport"))[0].document, before);
  assert.equal(before.narrativeSections[0].contractVersion, MONTHLY_REFLECTION_CONTRACT);
});


test("Monthly refuses retired preferences for new v1/v2 generation before any provider request", async t => {
  for (const contract of ['monthly-reflection-v1', 'monthly-reflection-v2']) {
    const f=await fixture(t);
    await f.pg.exec(`UPDATE "User" SET "preferredLocale"='zh-Hant' WHERE "id"='alice'`);
    const result=await f.run({...enabled, AI_MONTHLY_REFLECTION_CONTRACT:contract});
    assert.equal(result.succeeded,false); assert.equal(f.calls.length,0); assert.equal(f.retrievalCalls,0);
    assert.equal((await f.rows('MonthlyReport')).length,0);
    assert.equal((await f.rows('User')).find(u=>u.id==='alice').preferredLocale,'zh-Hant');
  }
});

test("Monthly reuses a historical Traditional report before enforcing new generation language rules", async t => {
  const f=await fixture(t);
  const document={ownerId:'alice',periodKey:'2026-09',narrativeStatus:'GENERATED',
    generationVersion:REPORT_NARRATIVE_GENERATION_VERSION,summary:'你沒有說過自己不再畫畫。',
    narrativeSections:[{locale:'zh-Hant',contractVersion:'monthly-reflection-v2',claim:'你沒有說過自己不再畫畫。'}]};
  await f.pg.query('INSERT INTO "MonthlyReport" VALUES ($1,$2,$3,$4)', ['historical-report','alice','2026-09',JSON.stringify(document)]);
  await f.pg.exec(`UPDATE "User" SET "preferredLocale"='zh-TW' WHERE "id"='alice'`);
  const result=await f.run({...enabled, AI_MONTHLY_REFLECTION_CONTRACT:'monthly-reflection-v2'});
  assert.equal(result.succeeded,true,result.error?.stack); assert.equal(result.result.skipped,true);
  assert.equal(f.calls.length,0); assert.equal(f.retrievalCalls,0);
  assert.deepEqual((await f.rows('MonthlyReport'))[0].document,document);
});
