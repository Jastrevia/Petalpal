import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CloudflareAiGateway } from "../../lib/ai-gateway.js";
import { PrismaAiCostGate } from "../../lib/ai-cost-gate.js";
import { gatewayQuote, readGatewayConfig } from "../../lib/ai-gateway-config.js";

const schema = { type: "object", properties: { summary: { type: "string", minLength: 1, maxLength: 80 } }, required: ["summary"], additionalProperties: false };
const enabled = {
  AI_GATEWAY_ENABLED: "true", AI_GATEWAY_ANTHROPIC_ENABLED: "true", AI_GATEWAY_OPENAI_ENABLED: "true",
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_GATEWAY_ID: "petalpal-test",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "synthetic-gateway-token", ANTHROPIC_API_KEY: "synthetic-anthropic-key", OPENAI_API_KEY: "synthetic-openai-key",
  AI_USER_DAILY_USD_LIMIT: "10", AI_USER_MONTHLY_USD_LIMIT: "10", AI_GLOBAL_DAILY_USD_LIMIT: "10", AI_GLOBAL_MONTHLY_USD_LIMIT: "10",
  AI_ANTHROPIC_MONTHLY_USD_LIMIT: "10", AI_OPENAI_MONTHLY_USD_LIMIT: "10"
};
function native(model, { data = { summary: "A synthetic reflection" }, usage = {}, ...overrides } = {}) {
  return model === "gpt-6-sol" ? {
    model, status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(data) }] }],
    usage: { input_tokens: 100, output_tokens: 50, ...usage }, ...overrides
  } : {
    model, type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(data) }],
    usage: { input_tokens: 100, output_tokens: 50, ...usage }, ...overrides
  };
}
async function fixture(t, { env = enabled, fetchImpl, authorize = async () => true } = {}) {
  // Disposable in-memory PostgreSQL only. No environment files, sockets, migrations or provider calls.
  const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } }); t.after(() => pg.close());
  await pg.exec(`CREATE TABLE "User" ("id" text PRIMARY KEY, "emailVerifiedAt" timestamp(3) DEFAULT now());
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY,"aiProcessing" boolean,"personalization" boolean,"memoryEnabled" boolean,"updatedAt" timestamp(3));
    CREATE TABLE "Event" ("id" text PRIMARY KEY,"ownerId" text);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY,"createdAt" timestamp NOT NULL DEFAULT now(),"eventType" varchar(64),"outcome" varchar(32),
      "actorUserId" varchar(128),"targetClass" varchar(64),"targetSafeId" varchar(128),"actionCode" varchar(64),"reasonCode" varchar(64));
    CREATE TABLE "AIJob" ("id" text PRIMARY KEY,"ownerId" text,"jobType" text,"resourceId" text,"idempotencyKey" text,"status" text,
      "lockedBy" text,"attemptCount" integer,"lockedAt" timestamp(3),"leaseExpiresAt" timestamp(3));
    INSERT INTO "User" VALUES ('alice'),('bob');
    INSERT INTO "AiConsent" VALUES ('alice',true,true,true,'2000-01-01'),('bob',true,true,true,'2000-01-01');
    INSERT INTO "Event" VALUES ('event-alice','alice'),('event-bob','bob');`);
  const adapt = db => ({ $queryRawUnsafe: async (sql, ...params) => (await db.query(sql, params)).rows });
  const prisma = { ...adapt(pg), $transaction: cb => pg.transaction(tx => cb(adapt(tx))) };
  const calls = [];
  const fetchMock = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, options, body });
    return fetchImpl ? fetchImpl(url, options) : Response.json(native(body.model));
  };
  const make = (overrides = {}) => new CloudflareAiGateway({ prisma, env, fetchImpl: fetchMock, authorize, ...overrides });
  async function request(model = "claude-haiku-5-5", owner = "alice", suffix = "1") {
    const action = model.includes("haiku") ? "EVENT_EMOTION" : model.includes("opus") ? "MONTHLY_REPORT" : "WEEKLY_REPORT";
    let job = null;
    if (action !== "EVENT_EMOTION") {
      [job] = await prisma.$queryRawUnsafe(`INSERT INTO "AIJob" VALUES ($1,$2,$3,$4,$5,'RUNNING','worker-1',1,clock_timestamp(),clock_timestamp()+interval '1 minute') RETURNING *`,
        `job-${owner}-${suffix}`, owner, action, `period-${suffix}`, `${action}:period-${suffix}:grounded-narrative-v1`);
    }
    return { identity: { userId: owner }, model, action, job, workerId: job ? "worker-1" : null,
      key: job?.idempotencyKey || `event-${owner}:event-secondary-v1`, eventId: job ? null : `event-${owner}`,
      instructions: "Use only the supplied synthetic Event evidence.", input: { evidence: "A synthetic Event" }, schema,
      validateOutput: value => value.summary === "A synthetic reflection" };
  }
  const rows = () => prisma.$queryRawUnsafe('SELECT * FROM "AuditEvent"');
  return { pg, prisma, make, calls, request, rows };
}

for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "gpt-6-sol"]) {
  test(`native ${model} adapter authenticates Gateway/provider and validates normalized output`, async t => {
    const f = await fixture(t), req = await f.request(model), result = await f.make().generate(req);
    assert.equal(result.model, model); assert.deepEqual(result.data, { summary: "A synthetic reflection" });
    assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 });
    assert.equal(f.calls.length, 1);
    const { url, options, body } = f.calls[0], h = options.headers;
    assert.equal(url, `https://gateway.ai.cloudflare.com/v1/${"a".repeat(32)}/petalpal-test/${model === "gpt-6-sol" ? "openai/responses" : "anthropic/v1/messages"}`);
    assert.equal(h["cf-aig-authorization"], "Bearer synthetic-gateway-token");
    assert.equal(h["cf-aig-max-attempts"], "1"); assert.equal(h["cf-aig-skip-cache"], "true");
    assert.equal(h["cf-aig-collect-log"], "false"); assert.equal(h["cf-aig-collect-log-payload"], "false");
    assert.equal(options.redirect, "error"); assert.equal(body.temperature, undefined); assert.equal(body.tools, undefined);
    if (model === "gpt-6-sol") {
      assert.equal(h.Authorization, "Bearer synthetic-openai-key"); assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true); assert.equal(body.text.format.type, "json_schema");
    } else {
      assert.equal(h["x-api-key"], "synthetic-anthropic-key"); assert.equal(h["anthropic-version"], "2023-06-01");
      assert.equal(body.output_config.format.type, "json_schema");
      assert.equal(body.output_config.format.schema.properties.summary.maxLength, undefined, "unsupported provider bounds stay local");
    }
    assert.equal(options.body.includes("alice"), false, "owner identity is not provider metadata");
    const rows = await f.rows(); assert.equal(rows.length, 3);
    assert.equal(rows.find(r => r.eventType === "AI_COST_RESERVED").targetClass, result.provider);
    assert.equal(rows.find(r => r.eventType === "AI_GATEWAY_USAGE").reasonCode, "100:50:0");
    assert.ok(rows.every(r => !JSON.stringify(r).includes("synthetic reflection")));
  });
}

test("all new routes default off, credentials alone never enable them", async t => {
  const f = await fixture(t), req = await f.request();
  for (const env of [{}, { ...enabled, AI_GATEWAY_ENABLED: undefined }, { ...enabled, AI_GATEWAY_ANTHROPIC_ENABLED: undefined }]) {
    await assert.rejects(f.make({ env }).generate(req), { code: "AI_GATEWAY_DISABLED", outcome: "NOT_DISPATCHED" });
  }
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
});

test("configuration rejects malformed flags, missing credentials, endpoint injection and invalid/unset budgets", async t => {
  const f = await fixture(t), req = await f.request();
  for (const change of [
    { AI_GATEWAY_ENABLED: "1" }, { AI_GATEWAY_ANTHROPIC_ENABLED: "yes" }, { ANTHROPIC_API_KEY: undefined },
    { CLOUDFLARE_AI_GATEWAY_TOKEN: "bad\r\nheader" }, { CLOUDFLARE_AI_GATEWAY_ID: "../openai" },
    { CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "https://attacker.invalid" }, { AI_USER_DAILY_USD_LIMIT: undefined },
    { AI_USER_DAILY_USD_LIMIT: "-1" }, { AI_USER_DAILY_USD_LIMIT: "1e9" }, { AI_USER_DAILY_USD_LIMIT: "0.0000000001" }
  ]) await assert.rejects(f.make({ env: { ...enabled, ...change } }).generate(req), { code: "AI_GATEWAY_CONFIG_INVALID" });
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
});

test("missing identity, denied provider policy, wrong Event owner and revoked consent cannot dispatch", async t => {
  const f = await fixture(t), req = await f.request();
  await assert.rejects(f.make({ authorize: undefined }).generate(req), { code: "AI_GATEWAY_INVALID_INPUT" });
  await assert.rejects(f.make({ authorize: async () => false }).generate(req), { code: "AI_GATEWAY_FORBIDDEN" });
  await assert.rejects(f.make().generate({ ...req, identity: {} }), { code: "AI_BUDGET_UNAVAILABLE" });
  await assert.rejects(f.make().generate({ ...req, eventId: "event-bob", key: "event-bob:event-secondary-v1" }), { code: "AI_FORBIDDEN" });
  await assert.rejects(f.make().generate({ ...req, key: "new-key-to-replay" }), { code: "AI_FORBIDDEN" });
  await f.pg.exec('UPDATE "AiConsent" SET "aiProcessing"=false');
  await assert.rejects(f.make().generate(req), { code: "AI_FORBIDDEN" });
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
});

test("reports require current owner job claim and full memory consent", async t => {
  const f = await fixture(t), req = await f.request("claude-sonnet-5-5");
  for (const change of [{ job: null }, { identity: { userId: "bob" } }, { workerId: "another-worker" }]) {
    await assert.rejects(f.make().generate({ ...req, ...change }), e => ["AI_FORBIDDEN", "AI_JOB_LEASE_LOST"].includes(e.code));
  }
  await f.pg.exec('UPDATE "AiConsent" SET "memoryEnabled"=false');
  await assert.rejects(f.make().generate(req), { code: "AI_FORBIDDEN" });
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
});

for (const field of ["AI_USER_DAILY_USD_LIMIT", "AI_USER_MONTHLY_USD_LIMIT", "AI_GLOBAL_DAILY_USD_LIMIT", "AI_GLOBAL_MONTHLY_USD_LIMIT", "AI_ANTHROPIC_MONTHLY_USD_LIMIT",
  "AI_USER_DAILY_CALL_LIMIT", "AI_GLOBAL_DAILY_CALL_LIMIT", "AI_PROVIDER_DAILY_CALL_LIMIT", "AI_EVENT_EMOTION_DAILY_LIMIT"]) {
  test(`${field} denies before network and rolls back both reservations`, async t => {
    const f = await fixture(t, { env: { ...enabled, [field]: "0" } });
    await assert.rejects(f.make().generate(await f.request()), { code: "AI_QUOTA_EXCEEDED" });
    assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
  });
}

test("concurrent service instances share one durable reservation; cross-provider replay stays blocked", async t => {
  const f = await fixture(t), req = await f.request("claude-sonnet-5-5");
  const results = await Promise.allSettled([f.make().generate(req), f.make().generate({ ...req, model: "gpt-6-sol" })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "AI_INFERENCE_ALREADY_RESERVED");
  assert.equal(f.calls.length, 1);
  await f.pg.exec(`UPDATE "AuditEvent" SET "createdAt"=clock_timestamp()-interval '40 days'`);
  await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
  assert.equal(f.calls.length, 1);
});

test("shared USD caps cover owners and providers; provider caps are distinct", async t => {
  const f = await fixture(t), a = await f.request("claude-sonnet-5-5"), b = await f.request("gpt-6-sol", "bob");
  await f.make().generate(a);
  const usd = (await f.rows()).find(r => r.eventType === "AI_GATEWAY_USD_RESERVED");
  const exact = (Number(usd.reasonCode) / 1e9).toFixed(9);
  await assert.rejects(f.make({ env: { ...enabled, AI_GLOBAL_MONTHLY_USD_LIMIT: exact } }).generate(b), { code: "AI_QUOTA_EXCEEDED" });
  await f.make({ env: { ...enabled, AI_ANTHROPIC_MONTHLY_USD_LIMIT: "0" } }).generate(b);
  assert.equal(f.calls.length, 2);
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`HTTP ${status} is sanitized, retains liability and never retries/falls back`, async t => {
    const f = await fixture(t, { fetchImpl: async () => new Response("synthetic private upstream diagnostics", { status }) });
    const req = await f.request();
    await assert.rejects(f.make().generate(req), e => e.outcome === "AMBIGUOUS" && e.retryable === false && !e.message.includes("diagnostics"));
    await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
    assert.equal(f.calls.length, 1); assert.equal((await f.rows()).length, 2);
  });
}

test("transport reset and timeout stay ambiguous even when fetch ignores abort", async t => {
  for (const fetchImpl of [async () => { throw Error("synthetic private token"); }, async () => new Promise(() => {})]) {
    const f = await fixture(t, { fetchImpl }), req = await f.request();
    await assert.rejects(f.make().generate({ ...req, timeoutMs: 15 }), e => e.outcome === "AMBIGUOUS" && e.retryable === false && !e.message.includes("token"));
    await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
    assert.equal(f.calls.length, 1); assert.equal((await f.rows()).length, 2);
  }
});

test("body timeout is bounded after headers; oversized body is rejected", async t => {
  for (const response of [
    () => new Response(new ReadableStream({ start() {}, cancel() {} }), { headers: { "content-type": "application/json" } }),
    () => Response.json({ padding: "x".repeat(512 * 1024) })
  ]) {
    const f = await fixture(t, { fetchImpl: async () => response() });
    await assert.rejects(f.make().generate({ ...await f.request(), timeoutMs: 15 }), e => ["AI_GATEWAY_TIMEOUT", "AI_GATEWAY_INVALID_OUTPUT"].includes(e.code));
    assert.equal(f.calls.length, 1);
  }
});

for (const model of ["claude-haiku-5-5", "gpt-6-sol"]) {
  test(`late ${model} fetch ignoring abort cannot read output or invoke application callbacks`, async t => {
    let releaseFetch, validations = 0;
    const phases = [];
    const f = await fixture(t, {
      fetchImpl: () => new Promise(resolve => { releaseFetch = resolve; }),
      authorize: async ({ phase }) => { phases.push(phase); return true; }
    });
    const req = await f.request(model);
    await assert.rejects(f.make().generate({ ...req, timeoutMs: 15,
      validateOutput: () => { validations++; return true; }
    }), { code: "AI_GATEWAY_TIMEOUT", outcome: "AMBIGUOUS", retryable: false });
    assert.equal(f.calls[0].options.signal.aborted, true);
    const response = Response.json(native(model));
    const reads = t.mock.method(response.body, "getReader");
    const cancellations = t.mock.method(response.body, "cancel");
    releaseFetch(response);
    // Drain the detached continuation after the public request has already rejected.
    await new Promise(setImmediate); await new Promise(setImmediate);
    assert.equal(reads.mock.callCount(), 0);
    assert.equal(cancellations.mock.callCount(), 1);
    assert.equal(validations, 0);
    assert.deepEqual(phases, ["before", "dispatch"]);
    assert.equal((await f.rows()).length, 2, "liability retained, no late usage/output processing");
    await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
    assert.equal(f.calls.length, 1);
  });
}

for (const stage of ["usage", "grounding", "consent"]) {
  test(`timeout during ${stage} prevents subsequent application processing`, { timeout: 5000 }, async t => {
    let release, enter, validations = 0, consentChecks = 0;
    const pending = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { enter = resolve; });
    const pause = async () => { enter(); await pending; };
    const phases = [];
    const f = await fixture(t, { authorize: async ({ phase }) => { phases.push(phase); return true; } });
    const originalUsage = PrismaAiCostGate.prototype.recordGatewayUsage;
    t.mock.method(PrismaAiCostGate.prototype, "recordGatewayUsage", async function (...args) {
      await originalUsage.apply(this, args);
      if (stage === "usage") await pause();
    });
    const originalConsent = PrismaAiCostGate.prototype.checkGatewayConsent;
    t.mock.method(PrismaAiCostGate.prototype, "checkGatewayConsent", async function (...args) {
      consentChecks++;
      await originalConsent.apply(this, args);
      if (stage === "consent" && consentChecks === 2) await pause();
    });
    const req = await f.request();
    const rejected = assert.rejects(f.make().generate({ ...req, timeoutMs: 100,
      validateOutput: async () => { validations++; if (stage === "grounding") await pause(); return true; }
    }), { code: "AI_GATEWAY_TIMEOUT", outcome: "AMBIGUOUS", retryable: false });
    await entered;
    await rejected;
    release();
    await new Promise(setImmediate); await new Promise(setImmediate);
    assert.equal(validations, stage === "usage" ? 0 : 1);
    assert.equal(consentChecks, stage === "consent" ? 2 : 1);
    assert.deepEqual(phases, ["before", "dispatch"]);
    assert.equal((await f.rows()).length, 3, "already recorded usage and liability remain");
    await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
    assert.equal(f.calls.length, 1);
  });
}

test("schema, malformed JSON, refusal, truncation and model mismatch reject without repair", async t => {
  for (const raw of [
    native("claude-haiku-5-5", { data: { summary: 3 } }), native("claude-haiku-5-5", { data: { summary: "x".repeat(81) } }),
    native("claude-haiku-5-5", { data: { summary: "A synthetic reflection", extra: true } }),
    native("claude-haiku-5-5", { stop_reason: "max_tokens" }), native("claude-haiku-5-5", { stop_reason: "refusal" }),
    native("claude-haiku-5-5", { content: [{ type: "text", text: "invalid json" }] }), native("wrong-model"), native("claude-haiku-5-5", { content: [null] })
  ]) {
    const f = await fixture(t, { fetchImpl: async () => Response.json(raw) }), req = await f.request();
    await assert.rejects(f.make().generate(req), { code: "AI_GATEWAY_INVALID_OUTPUT", outcome: "RESPONSE_REJECTED" });
    await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" }); assert.equal(f.calls.length, 1);
  }
});

test("OpenAI rejects incomplete responses, refusals, tools and invalid usage", async t => {
  for (const change of [
    { status: "incomplete" }, { output: [null] }, { output: [{ type: "function_call" }] }, { usage: { input_tokens: "100", output_tokens: 50 } },
    { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private" }] }] }
  ]) {
    const f = await fixture(t, { fetchImpl: async () => Response.json(native("gpt-6-sol", change)) });
    await assert.rejects(f.make().generate(await f.request("gpt-6-sol")), { code: "AI_GATEWAY_INVALID_OUTPUT" });
    assert.equal(f.calls.length, 1);
  }
});

test("grounding callback is mandatory and rejection preserves reservation without another call", async t => {
  const f = await fixture(t), req = await f.request();
  await assert.rejects(f.make().generate({ ...req, validateOutput: undefined }), { code: "AI_GATEWAY_INVALID_INPUT" });
  await assert.rejects(f.make().generate({ ...req, validateOutput: () => false }), { code: "AI_GATEWAY_GROUNDING_FAILED" });
  assert.equal(f.calls.length, 1); assert.equal((await f.rows()).length, 3);
});

test("invalid schemas, model/task mismatch, input/token limits, retry and fallback options never dispatch", async t => {
  const f = await fixture(t), req = await f.request();
  for (const change of [
    { schema: { ...schema, additionalProperties: true } }, { schema: { ...schema, required: [] } },
    { schema: { type: "object", $ref: "https://attacker.invalid/schema" } }, { model: "claude-opus-5-5" },
    { model: "@cf/baai/bge-small-en-v1.5" }, { maxOutputTokens: 513 }, { input: { evidence: "x".repeat(21000) } },
    { maxAttempts: 2 }, { fallback: true }, { timeoutMs: 3001 }, { input: { toJSON: () => undefined } }
  ]) await assert.rejects(f.make().generate({ ...req, ...change }), e => ["AI_GATEWAY_INVALID_INPUT", "AI_GATEWAY_REPLAY_BLOCKED"].includes(e.code));
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
});

test("consent revoke/regrant, deleted Event and lost report lease reject late results", async t => {
  for (const mutation of ["epoch", "event", "lease"]) {
    let f;
    f = await fixture(t, { fetchImpl: async (_url, options) => {
      const sql = mutation === "epoch" ? `UPDATE "AiConsent" SET "updatedAt"='2000-01-02'` : mutation === "event" ? 'DELETE FROM "Event"' : `UPDATE "AIJob" SET "leaseExpiresAt"=clock_timestamp()-interval '1 second'`;
      await f.pg.exec(sql); return Response.json(native(JSON.parse(options.body).model));
    } });
    const req = await f.request(mutation === "lease" ? "claude-sonnet-5-5" : "claude-haiku-5-5");
    await assert.rejects(f.make().generate(req), e => ["AI_FORBIDDEN", "AI_JOB_LEASE_LOST"].includes(e.code));
    assert.equal(f.calls.length, 1); assert.equal((await f.rows()).length, 3);
  }
});

test("provider authorization is checked at dispatch and after inference, with no policy error leakage", async t => {
  for (const deniedPhase of ["dispatch", "after"]) {
    const f = await fixture(t, { authorize: async ({ phase }) => { if (phase === deniedPhase) throw Error("synthetic private policy details"); return true; } });
    await assert.rejects(f.make().generate(await f.request()), e => e.code === "AI_GATEWAY_FORBIDDEN" && !e.message.includes("details"));
    assert.equal(f.calls.length, deniedPhase === "dispatch" ? 0 : 1);
  }
});

test("budget database failure fails closed; credentials do not serialize on service instances", async () => {
  let calls = 0;
  const gateway = new CloudflareAiGateway({ env: enabled, authorize: async () => true,
    prisma: { $transaction: async () => { throw Error("synthetic connection credential"); } }, fetchImpl: async () => { calls++; } });
  assert.equal(JSON.stringify(gateway), "{}");
  await assert.rejects(gateway.generate({ identity: { userId: "alice" }, action: "EVENT_EMOTION", key: "event-alice:event-secondary-v1", eventId: "event-alice",
    model: "claude-haiku-5-5", instructions: "Synthetic", input: { evidence: "Synthetic" }, schema, validateOutput: () => true }),
  e => e.code === "AI_BUDGET_UNAVAILABLE" && !e.message.includes("credential"));
  assert.equal(calls, 0);
});

test("quotes include input cache-write headroom and zero budget config is valid but denies admission", () => {
  assert.equal(gatewayQuote({ model: "claude-haiku-5-5", action: "EVENT_EMOTION", inputTokens: 1000, maxOutputTokens: 512 }).reservedNanoUsd, 381000);
  assert.doesNotThrow(() => readGatewayConfig({ ...enabled, AI_USER_DAILY_USD_LIMIT: "0" }, "ANTHROPIC"));
});


test("legacy Workers AI Event reservation blocks new-provider replay of that Event", async t => {
  const f = await fixture(t), req = await f.request();
  await new PrismaAiCostGate(f.prisma, { env: {} }).reserve({ identity: req.identity, action: req.action, key: req.key });
  await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 1);
});

test("pre-aborted requests never reserve or dispatch; cancellation after send remains ambiguous", async t => {
  const f = await fixture(t), req = await f.request(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.make().generate({ ...req, signal: controller.signal }), { outcome: "NOT_DISPATCHED" });
  assert.equal((await f.rows()).length, 0);
  const active = new AbortController();
  const g = await fixture(t, { fetchImpl: async () => { active.abort(); return new Promise(() => {}); } });
  await assert.rejects(g.make().generate({ ...await g.request(), signal: active.signal }), { outcome: "AMBIGUOUS" });
  assert.equal(g.calls.length, 1); assert.equal((await g.rows()).length, 2);
});

test("sensitive provider text and exception details never enter logs or public errors", async t => {
  const f = await fixture(t, { fetchImpl: async () => { throw Error("SYNTHETIC_PRIVATE_MARKER"); } }), req = await f.request();
  const entries = []; const methods = ["log", "info", "warn", "error"], saved = methods.map(m => console[m]);
  try {
    methods.forEach(m => { console[m] = (...args) => entries.push(args); });
    await assert.rejects(f.make().generate(req), e => !JSON.stringify({ message: e.message, ...e }).includes("SYNTHETIC_PRIVATE_MARKER"));
  } finally { methods.forEach((m,i) => { console[m] = saved[i]; }); }
  assert.deepEqual(entries, []);
});

test("trusted input preparation requires admission first and sanitizes preparation failures", async t => {
  const f = await fixture(t), req = await f.request("claude-sonnet-5-5"); let preparations = 0;
  await assert.rejects(f.make({ env: { ...enabled, AI_USER_DAILY_USD_LIMIT: "0" } }).generate({ ...req,
    prepareInput: async () => { preparations++; return {}; } }), { code: "AI_QUOTA_EXCEEDED" });
  assert.equal(preparations, 0); assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 0);
  await assert.rejects(f.make().generate({ ...req, prepareInput: async () => { throw Error("SYNTHETIC_PRIVATE_PREPARATION"); } }),
    e => e.code === "AI_GATEWAY_INVALID_INPUT" && !e.message.includes("PRIVATE"));
  assert.equal(f.calls.length, 0); assert.equal((await f.rows()).length, 3);
  await assert.rejects(f.make().generate(req), { code: "AI_INFERENCE_ALREADY_RESERVED" });
});

test("input preparation deadline and final byte bounds block late or oversized dispatch", async t => {
  for (const mode of ["late", "large"]) {
    const f = await fixture(t), req = await f.request("claude-sonnet-5-5"); let release, validations = 0;
    const promise = f.make().generate({ ...req, timeoutMs: 15,
      prepareInput: () => mode === "late" ? new Promise(resolve => { release = resolve; }) : { evidence: "x".repeat(10000) },
      validateOutput: () => { validations++; return true; } });
    await assert.rejects(promise, { code: mode === "late" ? "AI_GATEWAY_TIMEOUT" : "AI_GATEWAY_INVALID_INPUT" });
    if (release) release({ evidence: "Synthetic" });
    await new Promise(setImmediate); await new Promise(setImmediate);
    assert.equal(f.calls.length, 0); assert.equal(validations, 0); assert.equal((await f.rows()).length, 3);
  }
});
