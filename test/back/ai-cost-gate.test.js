import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PrismaAiCostGate } from "../../lib/ai-cost-gate.js";
import { PrismaAiJobRepository } from "../../lib/ai-jobs.js";
import { speechTranscriptionHandler } from "../../lib/speech-transcription.js";
import { AiJobWorker } from "../../lib/ai-worker.js";
import { EventEmbeddingService } from "../../lib/semantic-retrieval.js";
import { getEmbeddingProfile, CLOUDFLARE_EMBEDDING_PROFILE_KEY } from "../../lib/embedding-profiles.js";

// Fresh in-memory PostgreSQL tables only; no migration or local DB access.
async function fixture(t, env = {}) {
  const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } }); t.after(() => pg.close());
  await pg.exec(`
    CREATE TABLE "User" ("id" text PRIMARY KEY);
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY, "aiProcessing" boolean, "personalization" boolean, "memoryEnabled" boolean, "updatedAt" timestamp(3) DEFAULT '2000-01-01');
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "eventType" varchar(64),
      "outcome" varchar(32), "actorUserId" varchar(128), "targetClass" varchar(64), "actionCode" varchar(64), "reasonCode" varchar(64));
    CREATE TABLE "AIJob" ("id" text PRIMARY KEY, "ownerId" text, "jobType" text, "resourceId" text, "eventId" text,
      "idempotencyKey" varchar(191), "status" text DEFAULT 'PENDING', "attemptCount" integer DEFAULT 0, "maxAttempts" integer DEFAULT 3,
      "lockedBy" text, "lockedAt" timestamp(3), "leaseExpiresAt" timestamp(3), UNIQUE ("ownerId", "idempotencyKey"));
    INSERT INTO "User" VALUES ('alice'), ('bob');
    INSERT INTO "AiConsent" ("userId","aiProcessing","personalization","memoryEnabled") VALUES ('alice',true,true,true),('bob',true,true,true);
  `);
  function adapt(db) {
    return {
      $queryRawUnsafe: async (sql, ...params) => (await db.query(sql, params)).rows,
      aiJob: {
        findUnique: async ({ where }) => {
          const key = where.ownerId_idempotencyKey;
          return (await db.query('SELECT * FROM "AIJob" WHERE "ownerId"=$1 AND "idempotencyKey"=$2', [key.ownerId, key.idempotencyKey])).rows[0] || null;
        },
        createMany: async ({ data }) => {
          const d = data[0];
          await db.query(`INSERT INTO "AIJob" ("id","ownerId","jobType","resourceId","eventId","idempotencyKey","maxAttempts")
            VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("ownerId","idempotencyKey") DO NOTHING`,
          [randomUUID(),d.ownerId,d.jobType,d.resourceId,d.eventId,d.idempotencyKey,d.maxAttempts]);
        }
      }
    };
  }
  const db = { ...adapt(pg), $transaction: cb => pg.transaction(tx => cb(adapt(tx))) };
  const gate = new PrismaAiCostGate(db, { env });
  const reserve = (overrides = {}) => gate.reserve({ identity: { userId: "alice" }, action: "EVENT_EMOTION", ...overrides });
  const rows = () => db.$queryRawUnsafe('SELECT * FROM "AuditEvent"');
  async function claim(ownerId = "alice", resourceId = "2026-09-14", action = "WEEKLY_REPORT") {
    const job = await db.$transaction(tx => new PrismaAiJobRepository(db).enqueue({ identity: { userId: ownerId }, jobType: action,
      resourceId, processingVersion: "grounded-narrative-v1", transaction: tx }));
    return (await db.$queryRawUnsafe(`UPDATE "AIJob" SET "status"='RUNNING', "attemptCount"=1,
      "lockedBy"='worker-1', "lockedAt"=clock_timestamp(), "leaseExpiresAt"=clock_timestamp()+interval '1 minute'
      WHERE "id"=$1 RETURNING *`, job.id))[0];
  }
  return { pg, db, gate, reserve, rows, claim };
}

test("duplicate and concurrent report triggers share one job and one effective inference", async t => {
  const f = await fixture(t), repository = new PrismaAiJobRepository(f.db);
  const jobs = await Promise.all(Array.from({ length: 12 }, () => f.db.$transaction(tx => repository.enqueue({
    identity: { userId: "alice" }, jobType: "WEEKLY_REPORT", resourceId: "2026-09-14", processingVersion: "grounded-narrative-v1", transaction: tx
  }))));
  assert.equal(new Set(jobs.map(j => j.id)).size, 1);
  const job = await f.claim(); let calls = 0;
  const request = { identity: { userId: "alice" }, action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" };
  const instances = [f.gate, new PrismaAiCostGate(f.db, { env: {} })];
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => instances[i % 2].reserve(request).then(() => calls++)));
  assert.equal(calls, 1); assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(attempts.filter(r => r.status === "rejected").every(r => r.reason.code === "AI_INFERENCE_ALREADY_RESERVED"));
  assert.equal((await f.rows()).length, 1);
});

test("per-user shared quota blocks provider call, while another owner remains independent", async t => {
  const f = await fixture(t, { AI_USER_DAILY_CALL_LIMIT: "1" }); let calls = 0;
  const call = async gate => { await gate.reserve({ identity: { userId: "alice" }, action: "EVENT_EMOTION" }); calls++; };
  await call(f.gate);
  await assert.rejects(call(new PrismaAiCostGate(f.db, { env: { AI_USER_DAILY_CALL_LIMIT: "1" } })), { code: "AI_QUOTA_EXCEEDED" });
  assert.equal(calls, 1);
  await f.reserve({ identity: { userId: "bob" } }); assert.equal((await f.rows()).length, 2);
});

test("per-action quotas are isolated and allow ordinary legitimate actions", async t => {
  const f = await fixture(t, { AI_EVENT_EMOTION_DAILY_LIMIT: "1" });
  await f.reserve(); await assert.rejects(f.reserve(), { code: "AI_QUOTA_EXCEEDED" });
  await f.reserve({ action: "SPEECH_TRANSCRIPTION" });
  const job = await f.claim(); await f.reserve({ action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" });
  assert.equal((await f.rows()).length, 3);
});

for (const field of ["AI_GLOBAL_DAILY_CALL_LIMIT", "AI_PROVIDER_DAILY_CALL_LIMIT"]) test(`${field} bounds calls across owners/actions/instances`, async t => {
  const f = await fixture(t, { [field]: "2" });
  const job = await f.claim(); await f.reserve({ action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" });
  await assert.rejects(new PrismaAiCostGate(f.db, { env: { [field]: "2" } }).reserve({ identity: { userId: "bob" }, action: "SPEECH_TRANSCRIPTION" }), { code: "AI_QUOTA_EXCEEDED" });
  assert.equal((await f.rows()).length, 1, "report reserves its maximum two external calls");
});

test("retry, lease reclaim, midnight and recreated jobs cannot replay ambiguous inference", async t => {
  const f = await fixture(t); let calls = 0;
  const job = await f.claim(); const request = { identity: { userId: "alice" }, action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" };
  await f.gate.reserve(request); calls++;
  await f.db.$queryRawUnsafe(`UPDATE "AIJob" SET "attemptCount"=2,"lockedBy"='worker-2',"lockedAt"=clock_timestamp() WHERE "id"=$1`, job.id);
  const current = (await f.db.$queryRawUnsafe('SELECT * FROM "AIJob" WHERE "id"=$1', job.id))[0];
  await assert.rejects(f.gate.reserve(request), { code: "AI_JOB_LEASE_LOST" });
  await assert.rejects(f.gate.reserve({ ...request, job: current, workerId: "worker-2" }), { code: "AI_INFERENCE_ALREADY_RESERVED" });
  await f.db.$queryRawUnsafe(`UPDATE "AuditEvent" SET "createdAt"=clock_timestamp()-interval '2 days'`);
  await f.db.$queryRawUnsafe('DELETE FROM "AIJob"');
  const recreated = await f.claim();
  await assert.rejects(f.gate.reserve({ ...request, job: recreated }), { code: "AI_INFERENCE_ALREADY_RESERVED" });
  assert.equal(calls, 1);
});

test("expired/forged claims, unknown owners/actions and revoked consent fail before reservation", async t => {
  const f = await fixture(t), job = await f.claim();
  const request = { identity: { userId: "alice" }, action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" };
  await assert.rejects(f.gate.reserve({ ...request, identity: { userId: "bob" } }), { code: "AI_FORBIDDEN" });
  await assert.rejects(f.gate.reserve({ ...request, workerId: "forged-worker" }), { code: "AI_JOB_LEASE_LOST" });
  await f.db.$queryRawUnsafe(`UPDATE "AIJob" SET "leaseExpiresAt"=clock_timestamp()-interval '1 second'`);
  await assert.rejects(f.gate.reserve(request), { code: "AI_JOB_LEASE_LOST" });
  await assert.rejects(f.reserve({ identity: { userId: "missing" } }), { code: "AI_FORBIDDEN" });
  await assert.rejects(f.reserve({ action: "unknown" }), { code: "AI_FORBIDDEN" });
  await f.db.$queryRawUnsafe('UPDATE "AiConsent" SET "aiProcessing"=false');
  await assert.rejects(f.gate.reserve(request), { code: "AI_FORBIDDEN" });
  assert.equal((await f.rows()).length, 0);
});

test("UTC daily counters reset; reservations remain durable and are not owner-cascaded", async t => {
  const f = await fixture(t, { AI_USER_DAILY_CALL_LIMIT: "1" });
  await f.reserve({ key: "event-v1" });
  await f.db.$queryRawUnsafe(`UPDATE "AuditEvent" SET "createdAt"=clock_timestamp()-interval '2 days'`);
  await f.reserve({ key: "event-v2" });
  await f.db.$queryRawUnsafe('DELETE FROM "User" WHERE "id"=$1', "alice");
  assert.equal((await f.rows()).length, 2);
});

test("zero/invalid configuration and DB failure fail closed with no secret detail", async t => {
  const f = await fixture(t);
  for (const value of ["0", "not-a-number", "-1", "1000001"]) {
    const configured = new PrismaAiCostGate(f.db, { env: { AI_GLOBAL_DAILY_CALL_LIMIT: value } });
    await assert.rejects(configured.reserve({ identity: { userId: "alice" }, action: "EVENT_EMOTION" }), e => ["AI_QUOTA_EXCEEDED", "AI_BUDGET_UNAVAILABLE"].includes(e.code));
    assert.equal((await f.rows()).length, 0);
  }
  const gate = new PrismaAiCostGate({ $transaction: async () => { throw Error("private provider key / database URL"); } }, { env: {} });
  await assert.rejects(gate.reserve({ identity: { userId: "alice" }, action: "EVENT_EMOTION" }), e => e.code === "AI_BUDGET_UNAVAILABLE" && !/private|key|database URL/.test(e.message));
});

test("speech rejects shared cost limits before fetch and clears request-scoped audio", async t => {
  const f = await fixture(t, { AI_SPEECH_TRANSCRIPTION_DAILY_LIMIT: "0" }); let calls = 0, status, response;
  const req = { auth: { userId: "alice" }, body: { audio: Buffer.from('\0\0\0\x18ftypM4A \0\0\0\0').toString('base64'), mimeType: 'audio/mp4' } };
  const res = { set() {}, status(value) { status = value; return this; }, json(value) { response = value; } };
  await speechTranscriptionHandler({ env: { CLOUDFLARE_WORKER_AI_URL: 'https://worker.test', CLOUDFLARE_WORKER_AI_TOKEN: 'private-secret' },
    costGate: f.gate, fetchImpl: async () => { calls++; throw Error("must not call"); } })(req, res);
  assert.equal(status, 429); assert.equal(response.code, "AI_QUOTA_EXCEEDED"); assert.equal(calls, 0); assert.equal(req.body, undefined);
  assert.equal(JSON.stringify(response).includes("private-secret"), false);
});

test("worker failure persistence, result and logs never expose provider details", async t => {
  const f = await fixture(t), job = await f.claim(); let recorded; const logs = [];
  const worker = new AiJobWorker({ workerId: "worker-1", repository: {
    renewLease: async () => ({ count: 1 }), markFailed: async ({ error }) => { recorded = error; return job; }
  }, logger: { error: (...args) => logs.push(args) }, handlers: {
    WEEKLY_REPORT: async () => { await f.gate.reserve({ identity: { userId: "alice" }, action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" });
      throw Error("private provider token, account and prompt details"); }
  } });
  const result = await worker.executeClaimed(job);
  assert.equal(result.succeeded, false); assert.equal(result.error.code, "AI_JOB_FAILED");
  assert.equal(recorded.message, "AI job failed: AI_JOB_FAILED"); assert.equal(JSON.stringify(logs).includes("private"), false);
  assert.equal(result.error.message.includes("private"), false);
});

test("paid embedding quota denial happens before provider invocation", async t => {
  const f = await fixture(t, { AI_EMBEDDING_GENERATION_DAILY_LIMIT: "0" });
  const job = await f.claim("alice", "memory-1", "EMBEDDING_GENERATION"); let calls = 0, failed = false;
  const profile = getEmbeddingProfile(CLOUDFLARE_EMBEDDING_PROFILE_KEY);
  const service = new EventEmbeddingService({ prisma: { aiConsent: { findUnique: async () => ({ aiProcessing: true, personalization: true, memoryEnabled: true }) } },
    provider: { describeProfile: () => profile, embedDocuments: async () => { calls++; assert.fail("blocked paid embedding"); } },
    repository: { profile, getSource: async () => ({ id: "memory-1", sourceEventId: "event-1", summary: "synthetic Event summary", embeddingInputRevision: 1 }),
      isCurrent: () => false, begin: async () => {}, markFailed: async () => { failed = true; } }
  });
  await assert.rejects(service.generate({ identity: { userId: "alice" }, memoryId: "memory-1",
    beforeInference: () => f.gate.reserve({ identity: { userId: "alice" }, action: job.jobType, key: job.idempotencyKey, job, workerId: "worker-1" }) }), { code: "AI_QUOTA_EXCEEDED" });
  assert.equal(calls, 0); assert.equal(failed, true); assert.equal((await f.rows()).length, 0);
});

test('revoked AI-processing consent blocks speech/emotion before quota reservation or provider work',async t=>{
 const f=await fixture(t);await f.db.$transaction(tx=>tx.$queryRawUnsafe(`UPDATE "AiConsent" SET "aiProcessing"=false WHERE "userId"='alice'`));
 for(const action of ['SPEECH_TRANSCRIPTION','EVENT_EMOTION'])await assert.rejects(f.gate.reserve({identity:{userId:'alice'},action}),{code:'AI_FORBIDDEN'});
 assert.equal((await f.rows()).length,0);
});
test('speech finishing across revoke/regrant rejects old epoch and clears audio, without provider replay',async t=>{
 const f=await fixture(t);let calls=0,status,response;
 const req={auth:{userId:'alice'},body:{mimeType:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3,4,5,6,7,8]).toString('base64')}};
 const res={set(){},status(value){status=value;return this;},json(value){response=value;return this;}};
 const handler=speechTranscriptionHandler({costGate:f.gate,env:{CLOUDFLARE_WORKER_AI_URL:'https://worker.invalid',CLOUDFLARE_WORKER_AI_TOKEN:'synthetic'},fetchImpl:async()=>{
  calls++;await f.db.$transaction(tx=>tx.$queryRawUnsafe(`UPDATE "AiConsent" SET "updatedAt"='2000-01-02' WHERE "userId"='alice'`));
  return Response.json({text:'synthetic private transcript'});
 }});
 await handler(req,res);assert.equal(calls,1);assert.equal(status,403);assert.equal(response.code,'AI_FORBIDDEN');assert.equal(JSON.stringify(response).includes('private transcript'),false);assert.equal(req.body,undefined);assert.equal((await f.rows()).length,1);
});
