import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { classifyHaikuEventSecondaryEmotions, eventEmotionProvider, HAIKU_EVENT_MODEL_ID,
  withHaikuEventWriteFence } from "../../lib/haiku-event-emotion.js";
import { CANONICAL_PRIMARY_GARDEN_MOODS, PRIMARY_GARDEN_MOOD_CONFIG,
  SECONDARY_EMOTION_LABELS, EXCLUDED_SECONDARY_EMOTIONS } from "../../lib/flower-variant-config.js";
import { DeterministicMemoryExtractor } from "../../lib/event-memory.js";
import { PrismaAiCostGate } from "../../lib/ai-cost-gate.js";
import prisma from "../../lib/prisma.js";
import { app, setAiJobDispatcherForTests, setEventEmotionClassifierForTests } from "../../server.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";

const httpFetch = globalThis.fetch;
const productLabels = SECONDARY_EMOTION_LABELS.filter(label => !EXCLUDED_SECONDARY_EMOTIONS.includes(label));
const enabled = {
  AI_EVENT_EMOTION_PROVIDER: "anthropic", AI_EVENT_EMOTION_MODEL: HAIKU_EVENT_MODEL_ID,
  AI_GATEWAY_ENABLED: "true", AI_GATEWAY_ANTHROPIC_ENABLED: "true",
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_GATEWAY_ID: "synthetic-event-test",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "synthetic-gateway", ANTHROPIC_API_KEY: "synthetic-anthropic",
  AI_USER_DAILY_USD_LIMIT: "10", AI_USER_MONTHLY_USD_LIMIT: "10", AI_GLOBAL_DAILY_USD_LIMIT: "10",
  AI_GLOBAL_MONTHLY_USD_LIMIT: "10", AI_ANTHROPIC_MONTHLY_USD_LIMIT: "10"
};
const native = (e = ["gratitude"], changes = {}) => ({ model: HAIKU_EVENT_MODEL_ID, type: "message", role: "assistant",
  stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ e }) }],
  usage: { input_tokens: 100, output_tokens: 20 }, ...changes });

// A disposable PostgreSQL engine, synthetic Events and injected fetch only.
// No production schema/migration, external socket, credential or model runtime is used.
async function fixture(t) {
  const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } });
  t.after(() => pg.close());
  await pg.exec(`CREATE TABLE "User" ("id" text PRIMARY KEY,"timezone" text);
    INSERT INTO "User" VALUES ('alice','UTC'),('bob','UTC');
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY,"termsVersion" text,"aiProcessing" boolean,
      "personalization" boolean,"memoryEnabled" boolean,"updatedAt" timestamp(3));
    INSERT INTO "AiConsent" VALUES ('alice','synthetic',true,true,true,'2000-01-01'),('bob','synthetic',true,true,true,'2000-01-01');
    CREATE TABLE "Event" ("id" text PRIMARY KEY,"ownerId" text,"content" text,"primaryGardenMood" text,
      "emotionStatus" text,"document" jsonb);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY,"createdAt" timestamp NOT NULL DEFAULT now(),"eventType" varchar(64),
      "outcome" varchar(32),"actorUserId" varchar(128),"targetClass" varchar(64),"targetSafeId" varchar(128),"actionCode" varchar(64),"reasonCode" varchar(64));
    CREATE TABLE "Flower" ("id" text PRIMARY KEY,"sourceEventId" text UNIQUE,"document" jsonb);
    CREATE TABLE "AIJob" ("id" text PRIMARY KEY,"document" jsonb);`);
  let sequence = 0, response = () => Response.json(native());
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.match(url, /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/a{32}\/synthetic-event-test\/anthropic\/v1\/messages$/);
    calls.push({ url, options, body: JSON.parse(options.body) });
    return response(url, options);
  };
  const adapt = db => {
    const query = async (sql, ...params) => (await db.query(sql, params)).rows;
    const eventWhere = where => {
      const entries = Object.entries(where);
      assert.ok(entries.every(([key]) => ["id", "ownerId", "content", "primaryGardenMood", "emotionStatus"].includes(key)));
      return { sql: entries.map(([key], i) => `"${key}"=$${i + 1}`).join(" AND "), params: entries.map(([, value]) => value) };
    };
    const eventRows = async where => {
      const w = eventWhere(where);
      return (await query(`SELECT * FROM "Event" WHERE ${w.sql}`, ...w.params))
        .map(({ document, ...row }) => ({ ...document, ...row }));
    };
    const updateEvents = async ({ where, data }) => {
      const events = await eventRows(where);
      for (const event of events) {
        const next = { ...event, ...data };
        await query(`UPDATE "Event" SET "document"=$2,"emotionStatus"=$3,"content"=$4,"primaryGardenMood"=$5 WHERE "id"=$1`,
          event.id, JSON.stringify(next), next.emotionStatus, next.content, next.primaryGardenMood);
      }
      return events.map(event => ({ ...event, ...data }));
    };
    return {
      $queryRawUnsafe: query,
      $queryRaw: async () => [{ locked: "" }],
      dailyFlowerQuota: { findUnique: async ({ where }) => {
        const { userId, localDate } = where.userId_localDate;
        return (await query('SELECT * FROM "DailyFlowerQuota" WHERE "userId"=$1 AND "localDate"=$2', userId, localDate))[0] || null;
      } },
      user: { findUnique: async ({ where }) => {
        const id = where.firebaseUid ? where.firebaseUid.replace("firebase-", "") : where.id;
        const user = (await query('SELECT * FROM "User" WHERE "id"=$1', id))[0];
        return user ? { ...user, aiConsent: (await query('SELECT * FROM "AiConsent" WHERE "userId"=$1', id))[0] } : null;
      } },
      event: {
        findFirst: async ({ where }) => (await eventRows(where))[0] || null,
        findUnique: async ({ where }) => {
          const { ownerId, idempotencyKey } = where.ownerId_idempotencyKey;
          return (await eventRows({ ownerId })).find(event => event.idempotencyKey === idempotencyKey) || null;
        },
        create: async ({ data }) => {
          const event = { id: `event-${++sequence}`, secondaryEmotions: [], ...data };
          await query('INSERT INTO "Event" VALUES ($1,$2,$3,$4,$5,$6)', event.id, event.ownerId, event.content,
            event.primaryGardenMood, event.emotionStatus, JSON.stringify(event));
          return event;
        },
        update: async args => { const rows = await updateEvents(args); if (rows.length !== 1) throw Error("Synthetic missing Event"); return rows[0]; },
        updateMany: async args => ({ count: (await updateEvents(args)).length }),
        count: async ({ where }) => (await eventRows({ ownerId: where.ownerId })).filter(event => event.localDate === where.localDate).length
      },
      garden: { findUnique: async ({ where }) => ({ id: `garden-${where.ownerId}` }) },
      flower: {
        findMany: async () => [],
        findUnique: async ({ where }) => (await query('SELECT "document" FROM "Flower" WHERE "sourceEventId"=$1', where.sourceEventId))[0]?.document || null,
        upsert: async ({ where, create }) => {
          const document = { id: `flower-${++sequence}`, ...create };
          await query('INSERT INTO "Flower" VALUES ($1,$2,$3) ON CONFLICT ("sourceEventId") DO NOTHING', document.id, where.sourceEventId, JSON.stringify(document));
          return (await query('SELECT "document" FROM "Flower" WHERE "sourceEventId"=$1', where.sourceEventId))[0].document;
        }
      },
      aiJob: {
        findUnique: async ({ where }) => {
          const { ownerId, idempotencyKey } = where.ownerId_idempotencyKey;
          return (await query('SELECT "document" FROM "AIJob"')).map(r => r.document)
            .find(job => job.ownerId === ownerId && job.idempotencyKey === idempotencyKey) || null;
        },
        create: async ({ data }) => {
          const job = { id: `job-${++sequence}`, status: "PENDING", ...data };
          await query('INSERT INTO "AIJob" VALUES ($1,$2)', job.id, JSON.stringify(job)); return job;
        }
      }
    };
  };
  const db = { ...adapt(pg), $transaction: fn => pg.transaction(tx => fn(adapt(tx))) };
  const event = (changes = {}) => db.event.create({ data: { ownerId: "alice", content: "A friend helped me and I felt thankful.",
    primaryGardenMood: "SUNNY_BLOOM", emotionStatus: "PENDING", localDate: "2026-10-13", ...changes } });
  const classify = async (source, changes = {}) => classifyHaikuEventSecondaryEmotions({ prisma: db,
    identity: { userId: source.ownerId }, eventId: source.id, text: source.content, primaryGardenMood: source.primaryGardenMood,
    aiProcessingAllowed: true, createdConsentUpdatedAt: (await db.$queryRawUnsafe('SELECT "updatedAt" FROM "AiConsent" WHERE "userId"=$1', source.ownerId))[0]?.updatedAt,
    env: enabled, fetchImpl, ...changes });
  return { pg, db, event, classify, fetchImpl, calls, respond: fn => { response = fn; },
    ledger: () => db.$queryRawUnsafe('SELECT * FROM "AuditEvent"') };
}

test("selection defaults to legacy; Haiku needs explicit route, model and both Gateway flags", async t => {
  assert.equal(eventEmotionProvider({}), "workers-ai");
  const f = await fixture(t), source = await f.event();
  for (const change of [
    { AI_EVENT_EMOTION_PROVIDER: undefined }, { AI_EVENT_EMOTION_PROVIDER: "openai" }, { AI_EVENT_EMOTION_PROVIDER: "" },
    { AI_EVENT_EMOTION_MODEL: undefined }, { AI_EVENT_EMOTION_MODEL: "claude-sonnet-5-5" }, { AI_EVENT_EMOTION_MODEL: "gpt-6-sol" },
    { AI_GATEWAY_ENABLED: undefined }, { AI_GATEWAY_ANTHROPIC_ENABLED: undefined }, { AI_GATEWAY_ENABLED: "yes" }
  ]) {
    const result = await f.classify(source, { env: { ...enabled, ...change } });
    assert.notEqual(result.status, "SUCCESS"); assert.deepEqual(result.labels, []);
  }
  assert.equal(f.calls.length, 0); assert.equal((await f.ledger()).length, 0);
});

test("all 8 Primaries keep Product-18, schema excludes redundant labels and output stays ordered", async t => {
  assert.equal(productLabels.length, 18); assert.equal(CANONICAL_PRIMARY_GARDEN_MOODS.length, 8);
  const f = await fixture(t);
  for (const primaryGardenMood of CANONICAL_PRIMARY_GARDEN_MOODS) {
    const source = await f.event({ primaryGardenMood });
    const eligible = productLabels.filter(label => !PRIMARY_GARDEN_MOOD_CONFIG[primaryGardenMood].redundantSecondaryEmotions.includes(label));
    f.respond(() => Response.json(native(eligible.slice(0, 2))));
    const result = await f.classify(source);
    assert.equal(result.status, "SUCCESS"); assert.deepEqual(result.labels, eligible.slice(0, 2));
    assert.equal(source.primaryGardenMood, primaryGardenMood);
    assert.deepEqual(f.calls.at(-1).body.output_config.format.schema.properties.e.items.enum, eligible);
  }
});

test("canonical labels and abstention are valid; no experimental labels or cluster restrictions added", async t => {
  const f = await fixture(t);
  for (const labels of [[], ...productLabels.map(label => [label]), ["gratitude", "caring"], ["fear", "annoyance"]]) {
    f.respond(() => Response.json(native(labels)));
    const result = await f.classify(await f.event({ primaryGardenMood: "HEALING_BLOOM" }));
    assert.equal(result.status, "SUCCESS"); assert.deepEqual(result.labels, labels);
  }
});

test("closed schema rejects malformed, noncanonical, duplicate, Primary-redundant and oversized outputs", async t => {
  const f = await fixture(t);
  for (const output of [{}, { e: null }, { e: "gratitude" }, { e: [1] }, { e: ["GRATITUDE"] }, { e: ["fake"] },
    ...EXCLUDED_SECONDARY_EMOTIONS.map(label => ({ e: [label] })), { e: ["joy"] }, { e: ["gratitude", "gratitude"] },
    { e: ["fear", "sadness", "love"] }, { e: ["gratitude"], primaryGardenMood: "FIRE_BLOOM" }]) {
    f.respond(() => Response.json(native([], { content: [{ type: "text", text: JSON.stringify(output) }] })));
    const result = await f.classify(await f.event());
    assert.equal(result.status, "FAILED"); assert.deepEqual(result.labels, []);
    assert.ok(["AI_GATEWAY_INVALID_OUTPUT", "AI_GATEWAY_GROUNDING_FAILED"].includes(result.fallbackReason));
  }
});

test("source policy excludes wrong owners, spoofed text/moods, non-Events, finalized Events and preview", async t => {
  const f = await fixture(t), source = await f.event();
  for (const change of [{ identity: { userId: "bob" } }, { text: "spoofed Journal" }, { eventId: "journal-1" },
    { primaryGardenMood: "FIRE_BLOOM" }, { primaryGardenMood: "happy" }, { identity: {} }, { text: "x".repeat(4001) }]) {
    assert.deepEqual((await f.classify(source, change)).labels, []);
  }
  assert.equal((await f.classify(source, { eventId: null })).fallbackReason, "EVENT_REQUIRED");
  await f.db.event.update({ where: { id: source.id }, data: { emotionStatus: "SUCCESS" } });
  assert.deepEqual((await f.classify(source)).labels, []);
  assert.equal(f.calls.length, 0); assert.equal((await f.ledger()).length, 0);
});

test("only minimized Event text and Primary reach the provider; no logs or upstream details leak", async t => {
  const f = await fixture(t), source = await f.event();
  const entries = [];
  for (const name of ["log", "info", "warn", "error"]) t.mock.method(console, name, (...args) => entries.push(args));
  f.respond(() => { throw Error("SYNTHETIC_PRIVATE_MARKER"); });
  const result = await f.classify(source);
  const { body, options } = f.calls[0];
  assert.deepEqual(JSON.parse(body.messages[0].content), { p: source.primaryGardenMood, e: source.content });
  assert.equal(options.headers["cf-aig-max-attempts"], "1");
  assert.equal(options.headers["cf-aig-collect-log-payload"], "false");
  assert.match(body.system, /untrusted data/); assert.match(body.system, /neutral, unclear/);
  assert.doesNotMatch(JSON.stringify(body), /alice|event-\d|journal|memory|SYNTHETIC_PRIVATE_MARKER/i);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE_MARKER"), false); assert.deepEqual(entries, []);
  assert.ok((await f.ledger()).every(row => !JSON.stringify(row).includes(source.content)));
});

test("emotion requires AI-processing consent only and rechecks actual consent before dispatch", async t => {
  const f = await fixture(t), source = await f.event();
  const off = await f.classify(source, { aiProcessingAllowed: false });
  assert.equal(off.status, "SKIPPED"); assert.equal(f.calls.length, 0);
  await f.pg.exec('UPDATE "AiConsent" SET "aiProcessing"=false');
  assert.equal((await f.classify(source)).status, "FAILED"); assert.equal(f.calls.length, 0);
  await f.pg.exec('UPDATE "AiConsent" SET "aiProcessing"=true,"memoryEnabled"=false,"personalization"=false');
  const stale = await f.classify(source, { createdConsentUpdatedAt: new Date("1999-01-01") });
  assert.equal(stale.status, "FAILED"); assert.equal(f.calls.length, 0, "regrant cannot authorize a pre-revocation creation epoch");
  assert.equal((await f.classify(source, { createdConsentUpdatedAt: null })).status, "FAILED");
  assert.equal((await f.classify(source)).status, "SUCCESS"); assert.equal(f.calls.length, 1);
});

test("zero dollar/call limits deny before network without partial reservations", async t => {
  const f = await fixture(t), source = await f.event();
  for (const name of ["AI_USER_DAILY_USD_LIMIT", "AI_USER_MONTHLY_USD_LIMIT", "AI_GLOBAL_DAILY_USD_LIMIT",
    "AI_GLOBAL_MONTHLY_USD_LIMIT", "AI_ANTHROPIC_MONTHLY_USD_LIMIT", "AI_EVENT_EMOTION_DAILY_LIMIT",
    "AI_USER_DAILY_CALL_LIMIT", "AI_GLOBAL_DAILY_CALL_LIMIT", "AI_PROVIDER_DAILY_CALL_LIMIT"]) {
    assert.equal((await f.classify(source, { env: { ...enabled, [name]: "0" } })).fallbackReason, "AI_QUOTA_EXCEEDED");
  }
  assert.equal(f.calls.length, 0); assert.equal((await f.ledger()).length, 0);
});

test("unset budget, invalid timeout and conservative long-input admission fail safely", async t => {
  const f = await fixture(t), source = await f.event();
  for (const change of [{ AI_USER_DAILY_USD_LIMIT: undefined }, { AI_REQUEST_TIMEOUT_MS: "3001" },
    { AI_REQUEST_TIMEOUT_MS: "bad" }, { AI_REQUEST_TIMEOUT_MS: "0" }, { AI_REQUEST_TIMEOUT_MS: "1e3" }]) {
    assert.deepEqual((await f.classify(source, { env: { ...enabled, ...change } })).labels, []);
  }
  assert.equal((await f.classify(await f.event({ content: "花".repeat(4000) }))).fallbackReason, "AI_GATEWAY_INVALID_INPUT");
  assert.equal(f.calls.length, 0); assert.equal((await f.ledger()).length, 0);
});

test("concurrent duplicate classification, failed attempts and legacy reservations cannot replay", async t => {
  const f = await fixture(t), source = await f.event();
  const results = await Promise.all([f.classify(source), f.classify(source)]);
  assert.equal(results.filter(r => r.status === "SUCCESS").length, 1);
  assert.equal(results.find(r => r.status !== "SUCCESS").fallbackReason, "AI_INFERENCE_ALREADY_RESERVED");
  assert.equal(f.calls.length, 1);
  const legacy = await f.event();
  await new PrismaAiCostGate(f.db, { env: {} }).reserve({ identity: { userId: "alice" }, action: "EVENT_EMOTION", key: `${legacy.id}:event-secondary-v1` });
  assert.equal((await f.classify(legacy)).fallbackReason, "AI_INFERENCE_ALREADY_RESERVED");
  f.respond(() => new Response("synthetic upstream detail", { status: 503 }));
  const failed = await f.event();
  assert.equal((await f.classify(failed)).status, "FAILED");
  assert.equal((await f.classify(failed)).fallbackReason, "AI_INFERENCE_ALREADY_RESERVED");
  assert.equal(f.calls.length, 2);
});

test("provider errors, refusal, malformed JSON and timeout abstain without retries or alternate egress", async t => {
  const f = await fixture(t);
  for (const response of [() => new Response("private", { status: 401 }), () => new Response("private", { status: 429 }),
    () => Response.json(native([], { stop_reason: "max_tokens" })), () => Response.json(native([], { stop_reason: "refusal" })),
    () => Response.json(native([], { model: "claude-sonnet-5-5" })),
    () => new Response("invalid", { headers: { "content-type": "application/json" } }), () => new Promise(() => {})]) {
    f.respond(response); const source = await f.event(), before = f.calls.length;
    const result = await f.classify(source, { env: { ...enabled, AI_REQUEST_TIMEOUT_MS: "15" } });
    assert.equal(result.status, "FAILED"); assert.deepEqual(result.labels, []); assert.equal(f.calls.length, before + 1);
    assert.equal((await f.classify(source)).fallbackReason, "AI_INFERENCE_ALREADY_RESERVED");
  }
});

test("late noncooperative Haiku fetch remains empty and never resumes source authorization", async t => {
  const f = await fixture(t), source = await f.event(); let resolve;
  f.respond(() => new Promise(done => { resolve = done; }));
  const result = await f.classify(source, { env: { ...enabled, AI_REQUEST_TIMEOUT_MS: "15" } });
  assert.equal(result.fallbackReason, "AI_GATEWAY_TIMEOUT");
  const response = Response.json(native()); const reader = t.mock.method(response.body, "getReader");
  resolve(response); await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(reader.mock.callCount(), 0); assert.deepEqual(result.labels, []);
  assert.equal((await f.ledger()).length, 2);
});

test("late consent epochs, source edits and deletion reject output while retaining liability", async t => {
  const f = await fixture(t);
  for (const mutation of ["epoch", "delete", "content", "primary"]) {
    const source = await f.event();
    f.respond(async () => {
      if (mutation === "epoch") await f.pg.exec(`UPDATE "AiConsent" SET "updatedAt"="updatedAt"+interval '1 second'`);
      else if (mutation === "delete") await f.db.$queryRawUnsafe('DELETE FROM "Event" WHERE "id"=$1', source.id);
      else await f.db.event.update({ where: { id: source.id }, data: mutation === "content" ? { content: "Changed Event" } : { primaryGardenMood: "FIRE_BLOOM" } });
      return Response.json(native());
    });
    const result = await f.classify(source);
    assert.equal(result.status, "FAILED"); assert.deepEqual(result.labels, []);
    assert.equal((await f.classify(source)).status, "FAILED");
  }
  assert.equal(f.calls.length, 4); assert.equal((await f.ledger()).length, 12);
});

test("final write fence rechecks consent epoch after inference and serializes atomic derived writes", async t => {
  const f = await fixture(t), source = await f.event(), emotion = await f.classify(source);
  assert.equal(emotion.status, "SUCCESS");
  await f.pg.exec(`UPDATE "AiConsent" SET "updatedAt"="updatedAt"+interval '1 millisecond'`);
  let received;
  await withHaikuEventWriteFence(f.db, { event: source, emotion }, async (tx, safeEmotion) => {
    received = safeEmotion;
    await tx.event.update({ where: { id: source.id, ownerId: source.ownerId }, data: { secondaryEmotions: safeEmotion.labels } });
  });
  assert.deepEqual(received.labels, []); assert.equal(received.fallbackReason, "AI_FORBIDDEN");
  assert.deepEqual((await f.db.event.findFirst({ where: { id: source.id } })).secondaryEmotions, []);
  const locks = [];
  const raw = f.db.$transaction;
  f.db.$transaction = fn => raw(tx => { const query = tx.$queryRawUnsafe; tx.$queryRawUnsafe = (sql, ...args) => { locks.push(sql); return query(sql, ...args); }; return fn(tx); });
  await withHaikuEventWriteFence(f.db, { event: source, emotion }, async () => {});
  assert.match(locks[0], /AiConsent.*FOR SHARE/s); assert.match(locks[1], /Event.*FOR UPDATE/s);
});

test("final fence blocks deleted/changed/finalized Events and rolls back failed writes", async t => {
  const f = await fixture(t);
  for (const mutation of ["delete", "content", "finalized"]) {
    const source = await f.event(), emotion = await f.classify(source);
    if (mutation === "delete") await f.db.$queryRawUnsafe('DELETE FROM "Event" WHERE "id"=$1', source.id);
    else await f.db.event.update({ where: { id: source.id }, data: mutation === "content" ? { content: "Changed" } : { emotionStatus: "SUCCESS" } });
    await assert.rejects(withHaikuEventWriteFence(f.db, { event: source, emotion }, () => assert.fail("late writes forbidden")), { code: "AI_FORBIDDEN" });
  }
  const source = await f.event(), emotion = await f.classify(source);
  await assert.rejects(withHaikuEventWriteFence(f.db, { event: source, emotion }, async (tx, safe) => {
    await tx.event.update({ where: { id: source.id }, data: { emotionStatus: "SUCCESS", secondaryEmotions: safe.labels } });
    throw Error("synthetic write failure");
  }));
  assert.equal((await f.db.event.findFirst({ where: { id: source.id } })).emotionStatus, "PENDING");
  assert.equal((await f.ledger()).length, 12);
});

test("two Flowers a day are taken by planting, not writing; four Events a day", async t => {
  const f = await fixture(t);
  await f.pg.exec(`CREATE TABLE "DailyFlowerQuota" ("userId" text,"localDate" varchar(10),"planted" integer NOT NULL DEFAULT 0,
    "updatedAt" timestamp(3) NOT NULL, PRIMARY KEY ("userId","localDate"))`);
  for (const [name, value] of Object.entries({ ...enabled, AI_ASYNC_EXECUTION_MODE: "manual", NODE_ENV: "test", DAILY_GROW_LIMIT_ENABLED: undefined })) {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const replace = (object, name, implementation) => {
    const original = object[name]; object[name] = implementation;
    t.after(() => { object[name] = original; });
  };
  replace(prisma, "$transaction", f.db.$transaction);
  for (const name of ["user", "event", "garden", "flower", "aiJob"]) {
    for (const [method, implementation] of Object.entries(f.db[name])) replace(prisma[name], method, implementation);
  }
  setAiJobDispatcherForTests(async () => {});
  setFirebaseTokenVerifierForTests(async token => ({ uid: `firebase-${token}`, email_verified: true, email: "synthetic@example.com" }));
  t.after(() => { setAiJobDispatcherForTests(); setFirebaseTokenVerifierForTests(); });
  t.mock.method(globalThis, "fetch", f.fetchImpl);
  const listener = app.listen(0, "127.0.0.1"); await new Promise(resolve => listener.once("listening", resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  const save = async key => {
    const response = await httpFetch(`http://127.0.0.1:${listener.address().port}/events`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `synthetic-${key}-0001`, Authorization: "Bearer alice" },
      body: JSON.stringify({ content: `Synthetic moment ${key}`, primaryGardenMood: "SUNNY_BLOOM" })
    });
    return { status: response.status, data: await response.json() };
  };
  const first = await save("quota-1"), second = await save("quota-2");
  assert.ok(first.data.flower); assert.ok(second.data.flower);
  assert.deepEqual(second.data.dailyFlowers, { limit: 2, planted: 0, limitReached: false }, "writing an Event takes no flower");
  const replay = await save("quota-2");
  assert.equal(replay.status, 200); assert.equal(replay.data.flower.id, second.data.flower.id);
  const third = await save("quota-3");
  assert.equal(third.status, 201);
  assert.ok(third.data.flower, "a third Event's flower can wait to be planted");
  assert.equal((await f.pg.query('SELECT * FROM "DailyFlowerQuota"')).rows.length, 0);
  // With the day's plantings used, an Event is still saved but grows no flower.
  await f.pg.query(`INSERT INTO "DailyFlowerQuota" VALUES ('alice',$1,2,CURRENT_TIMESTAMP)`, [first.data.event.localDate]);
  const full = await save("quota-4");
  assert.equal(full.status, 201, "the Event itself is still saved");
  assert.equal(full.data.flower, null);
  assert.deepEqual(full.data.dailyFlowers, { limit: 2, planted: 2, limitReached: true });
  // four Events a day: the fifth is refused before anything is written, and a replay is never counted.
  const beyond = await save("quota-5");
  assert.equal(beyond.status, 429); assert.equal(beyond.data.code, "DAILY_EVENT_LIMIT");
  assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "Event"')).rows[0].n, 4);
  assert.equal((await save("quota-2")).status, 200);
});

test("Event HTTP pipeline saves one Flower, keeps memory deterministic and isolates Haiku from legacy/preview/Journal", async t => {
  const f = await fixture(t);
  for (const [name, value] of Object.entries({ ...enabled, AI_ASYNC_EXECUTION_MODE: "manual", NODE_ENV: "test", AUTH_E2E_TEST_EMAIL: "synthetic@example.com",
    CLOUDFLARE_WORKER_AI_URL: "https://synthetic-worker.invalid", CLOUDFLARE_WORKER_AI_TOKEN: "synthetic-worker-token",
    // Several same-day Events each need their Flower here; the 2-a-day limit is test/back/flower-quota.test.js.
    DAILY_GROW_LIMIT_ENABLED: "false" })) {
    const previous = process.env[name]; process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  // Prisma exposes methods through a proxy; replace/restore its callable values.
  const replace = (object, name, implementation) => {
    const original = object[name]; object[name] = implementation;
    t.after(() => { object[name] = original; });
  };
  replace(prisma, "$transaction", f.db.$transaction);
  for (const name of ["user", "event", "garden", "flower", "aiJob"]) {
    for (const [method, implementation] of Object.entries(f.db[name])) replace(prisma[name], method, implementation);
  }
  let legacyCalls = 0, dispatches = 0;
  setEventEmotionClassifierForTests(async () => { legacyCalls++; return { status: "SUCCESS", labels: ["fear"], latencyMs: 1 }; });
  setAiJobDispatcherForTests(async () => { dispatches++; });
  setFirebaseTokenVerifierForTests(async token => {
    if (!["alice", "bob"].includes(token)) throw Error("synthetic invalid token");
    return { uid: `firebase-${token}`, email_verified: true, email: "synthetic@example.com" };
  });
  t.after(() => { setEventEmotionClassifierForTests(); setAiJobDispatcherForTests(); setFirebaseTokenVerifierForTests(); });
  t.mock.method(globalThis, "fetch", f.fetchImpl);
  const listener = app.listen(0, "127.0.0.1"); await new Promise(resolve => listener.once("listening", resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  const request = async (key, body = {}, path = "/events", token = "alice") => {
    const response = await httpFetch(`http://127.0.0.1:${listener.address().port}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ content: "A friend helped me.", primaryGardenMood: "SUNNY_BLOOM", ...body })
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request("forged-owner", { ownerId: "bob" })).status, 400);
  assert.equal((await request("anonymous", {}, "/events", null)).status, 401);
  assert.equal((await request("invalid-token", {}, "/events", "invalid")).status, 401);
  const saved = await request("source-event-1");
  assert.equal(saved.status, 201); assert.deepEqual(saved.data.emotion.labels, ["gratitude"]);
  assert.equal(saved.data.event.primaryGardenMood, "SUNNY_BLOOM"); assert.equal(saved.data.flower.sourceEventId, saved.data.event.id);
  assert.equal(saved.data.event.emotionModelId, HAIKU_EVENT_MODEL_ID); assert.equal(saved.data.event.emotionModelStatus, "gateway");
  assert.equal(saved.data.event.emotionProvenance, "INFERRED_UNCONFIRMED");
  assert.equal(saved.data.event.emotionProbabilities, null);
  assert.equal(JSON.stringify(saved.data).includes("consentUpdatedAt"), false);
  const reservedCalls = (await f.ledger()).filter(row => row.eventType === "AI_COST_RESERVED");
  assert.equal(reservedCalls.length, 1, "the route must not reserve again outside Gateway");
  assert.equal(reservedCalls[0].targetClass, "ANTHROPIC");
  const again = await request("source-event-1");
  assert.equal(again.status, 200); assert.equal(again.data.flower.id, saved.data.flower.id); assert.equal(f.calls.length, 1);
  assert.equal((await request("source-event-1", { content: "Different content" })).status, 409);
  assert.equal((await request("huge-event", { content: "x".repeat(4001) })).status, 413);
  const preview = await request("preview", { text: "Synthetic preview" }, "/dev/emotion-preview");
  assert.equal(preview.status, 200); assert.equal(preview.data.classifierEnabled, false);
  assert.equal(preview.data.fallbackReason, "EVENT_REQUIRED"); assert.equal(f.calls.length, 1);
  const deniedRead = await httpFetch(`http://127.0.0.1:${listener.address().port}/events/${saved.data.event.id}`, { headers: { Authorization: "Bearer bob" } });
  assert.equal(deniedRead.status, 404);
  const extracted = await new DeterministicMemoryExtractor().extract({ ...saved.data.event, kind: "EVENT" });
  assert.equal(extracted.summary, saved.data.event.content); assert.equal(extracted.emotionModelId, HAIKU_EVENT_MODEL_ID);
  assert.deepEqual(extracted.secondaryEmotions, ["gratitude"]);
  await assert.rejects(new DeterministicMemoryExtractor().extract({ ...saved.data.event, kind: "JOURNAL" }), { code: "AI_SOURCE_NOT_ALLOWED" });
  f.respond(() => new Response("synthetic private provider details", { status: 503 }));
  const failed = await request("failed-event");
  assert.equal(failed.status, 201); assert.deepEqual(failed.data.emotion.labels, []); assert.ok(failed.data.flower);
  assert.equal(failed.data.event.emotionOutcome, "FAILED"); assert.equal(failed.data.memoryJob.status, "PENDING");
  assert.equal((await request("failed-event")).status, 200); assert.equal(f.calls.length, 2);
  const failureMemory = await new DeterministicMemoryExtractor().extract({ ...failed.data.event, kind: "EVENT" });
  assert.equal(failureMemory.summary, failed.data.event.content); assert.deepEqual(failureMemory.secondaryEmotions, []);
  await f.pg.exec('UPDATE "AiConsent" SET "aiProcessing"=false');
  const noConsent = await request("no-consent-event");
  assert.equal(noConsent.status, 201); assert.equal(noConsent.data.emotion.status, "SKIPPED"); assert.ok(noConsent.data.flower);
  assert.equal(noConsent.data.memoryJob, null); assert.equal(f.calls.length, 2);
  await f.pg.exec('UPDATE "AiConsent" SET "aiProcessing"=true');
  process.env.AI_EVENT_EMOTION_DAILY_LIMIT = "0"; t.after(() => { delete process.env.AI_EVENT_EMOTION_DAILY_LIMIT; });
  const quota = await request("quota-event");
  assert.equal(quota.status, 201); assert.equal(quota.data.emotion.fallbackReason, "AI_QUOTA_EXCEEDED"); assert.ok(quota.data.flower);
  delete process.env.AI_EVENT_EMOTION_DAILY_LIMIT;
  assert.equal(f.calls.length, 2); assert.equal(legacyCalls, 0);
  f.respond(async (_url, options) => {
    const text = JSON.parse(JSON.parse(options.body).messages[0].content).e;
    await f.db.$queryRawUnsafe('DELETE FROM "Event" WHERE "content"=$1', text);
    return Response.json(native());
  });
  const deleted = await request("deleted-event", { content: "Synthetic Event deleted during inference." });
  assert.equal(deleted.status, 201); assert.deepEqual(deleted.data.emotion.labels, []); assert.equal(deleted.data.flower, null);
  assert.equal((await f.db.$queryRawUnsafe('SELECT "id" FROM "Event" WHERE "id"=$1', deleted.data.event.id)).length, 0);
  assert.equal(f.calls.length, 3); assert.equal(legacyCalls, 0);
  delete process.env.AI_EVENT_EMOTION_PROVIDER;
  const legacy = await request("legacy-event");
  assert.deepEqual(legacy.data.emotion.labels, ["fear"]); assert.equal(legacy.data.event.emotionModelId, "@cf/meta/llama-3.1-8b-instruct-fast");
  assert.equal(legacyCalls, 1); assert.equal(f.calls.length, 3); assert.equal(dispatches, 0);
  assert.equal((await f.db.$queryRawUnsafe('SELECT * FROM "Flower"')).length, 5);
});
