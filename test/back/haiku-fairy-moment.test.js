import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { fillFairyMomentCaptions, HAIKU_FAIRY_MOMENT_MODEL_ID, validFairyMomentCaption } from "../../lib/haiku-fairy-moment.js";

const enabled = {
  AI_FAIRY_MOMENT_MODEL: HAIKU_FAIRY_MOMENT_MODEL_ID,
  AI_GATEWAY_ENABLED: "true", AI_GATEWAY_ANTHROPIC_ENABLED: "true",
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_GATEWAY_ID: "synthetic-moment-test",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "synthetic-gateway", ANTHROPIC_API_KEY: "synthetic-anthropic",
  AI_USER_DAILY_USD_LIMIT: "10", AI_USER_MONTHLY_USD_LIMIT: "10", AI_GLOBAL_DAILY_USD_LIMIT: "10",
  AI_GLOBAL_MONTHLY_USD_LIMIT: "10", AI_ANTHROPIC_MONTHLY_USD_LIMIT: "10"
};
const native = (c, changes = {}) => ({ model: HAIKU_FAIRY_MOMENT_MODEL_ID, type: "message", role: "assistant",
  stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ c }) }],
  usage: { input_tokens: 400, output_tokens: 20 }, ...changes });

// Disposable PostgreSQL engine, synthetic rows and injected fetch only. No credential or model runtime.
async function fixture(t, { locale = "zh-Hans", aiProcessing = true } = {}) {
  const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } });
  t.after(() => pg.close());
  await pg.exec(`CREATE TABLE "User" ("id" text PRIMARY KEY,"timezone" text,"preferredLocale" text, "emailVerifiedAt" timestamp(3) DEFAULT now());
    INSERT INTO "User" VALUES ('alice','America/Vancouver','${locale}');
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY,"termsVersion" text,"aiProcessing" boolean,
      "personalization" boolean,"memoryEnabled" boolean,"updatedAt" timestamp(3));
    INSERT INTO "AiConsent" VALUES ('alice','synthetic',${aiProcessing},false,false,'2000-01-01');
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY,"createdAt" timestamp NOT NULL DEFAULT now(),"eventType" varchar(64),
      "outcome" varchar(32),"actorUserId" varchar(128),"targetClass" varchar(64),"targetSafeId" varchar(128),"actionCode" varchar(64),"reasonCode" varchar(64));
    CREATE TABLE "UserFairy" ("id" text PRIMARY KEY,"name" text);
    INSERT INTO "UserFairy" VALUES ('fairy','Bloom');
    CREATE TABLE "FairyMoment" ("id" text PRIMARY KEY,"userId" text,"userFairyId" text,"state" text,"spot" text,"mood" text,
      "photoKey" text,"postedAt" timestamp(3),"caption" text,"captionSource" text);
    INSERT INTO "FairyMoment" VALUES
      ('old','alice','fairy','SWINGING',NULL,'HAPPY','SWINGING/1','2026-10-15T20:00:00Z','好像比昨天荡得高一点','AI'),
      ('new','alice','fairy','TEA_TIME',NULL,'CURIOUS','TEA_TIME/1','2026-10-18T21:30:00Z','茶还有点烫，就先陪它坐一会儿','PENDING');`);
  const adapt = db => ({ $queryRawUnsafe: async (sql, ...params) => (await db.query(sql, params)).rows });
  const prisma = { ...adapt(pg), $transaction: fn => pg.transaction(tx => fn(adapt(tx))) };
  const calls = [];
  let response = () => Response.json(native("杯沿上停了一片叶子"));
  const fetchImpl = async (url, options) => {
    assert.match(url, /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/a{32}\/synthetic-moment-test\/anthropic\/v1\/messages$/);
    calls.push(JSON.parse(options.body));
    return response();
  };
  const moment = async id => (await pg.query(`SELECT "caption","captionSource" FROM "FairyMoment" WHERE "id"=$1`, [id])).rows[0];
  return { pg, prisma, calls, fetchImpl, moment, respond: fn => { response = fn; } };
}

test("Haiku caption replaces the preset once, from the Fairy's own context only", async (t) => {
  const f = await fixture(t);
  assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl }), 1);
  assert.deepEqual(await f.moment("new"), { caption: "杯沿上停了一片叶子", captionSource: "AI" });
  assert.equal(f.calls.length, 1);
  const [request] = f.calls;
  assert.equal(request.model, HAIKU_FAIRY_MOMENT_MODEL_ID);
  assert.deepEqual(JSON.parse(request.messages[0].content), {
    n: "Bloom", p: "her little tea chair under the leaves", t: "afternoon", m: "curious", k: "photo", l: "zh-Hans", r: ["好像比昨天荡得高一点"]
  });
  const reserved = (await f.pg.query(`SELECT "eventType","actionCode" FROM "AuditEvent" WHERE "actorUserId"='alice' ORDER BY "eventType"`)).rows;
  assert.ok(reserved.some(row => row.eventType === "AI_GATEWAY_USD_RESERVED" && row.actionCode === "FAIRY_MOMENT"));
  // Nothing left PENDING: a second run makes no call.
  assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl }), 0);
  assert.equal(f.calls.length, 1);
});

test("a text-only walk post asks for one small discovery and may run longer", async (t) => {
  const f = await fixture(t);
  await f.pg.exec(`UPDATE "FairyMoment" SET "state"='IDLE',"spot"='EAST_BRIDGE',"photoKey"=NULL,"mood"='CURIOUS' WHERE "id"='new'`);
  const discovery = "从桥上往下看，水里的云走得比天上的慢。想了半天也没想明白，明天再来看看是不是还这样";
  f.respond(() => Response.json(native(discovery)));
  assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl }), 1);
  assert.deepEqual(await f.moment("new"), { caption: discovery, captionSource: "AI" });
  const input = JSON.parse(f.calls[0].messages[0].content);
  assert.deepEqual([input.k, input.m, input.p], ["text", "curious", "a walk over the wooden east bridge"]);
  assert.match(f.calls[0].system, /one small, specific, slightly delightful discovery/);
  assert.match(f.calls[0].system, /Never list what she did/);
});

test("AI Processing alone is enough; Personalization and Memory are not required", async (t) => {
  const f = await fixture(t, { locale: "en" });
  f.respond(() => Response.json(native("Steam curling off the cup like a tiny cloud")));
  await f.pg.exec(`UPDATE "FairyMoment" SET "caption"='Afternoon tea under the leaves 🌿' WHERE "id"='new'`);
  assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl }), 1);
  assert.equal((await f.moment("new")).captionSource, "AI");
  assert.equal(JSON.parse(f.calls[0].messages[0].content).l, "en");
});

test("without AI Processing, the model is never called and the preset stays", async (t) => {
  const f = await fixture(t, { aiProcessing: false });
  assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl }), 0);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.moment("new"), { caption: "茶还有点烫，就先陪它坐一会儿", captionSource: "FALLBACK" });
});

test("disabled model setting or zero daily limit keeps the preset without a call", async (t) => {
  for (const env of [{ ...enabled, AI_FAIRY_MOMENT_MODEL: undefined }, { ...enabled, AI_FAIRY_MOMENT_DAILY_LIMIT: "0" },
    { ...enabled, AI_GATEWAY_ENABLED: "false" }]) {
    const f = await fixture(t);
    assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env, fetchImpl: f.fetchImpl }), 0);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.moment("new")).captionSource, "FALLBACK");
  }
});

test("rejected output and provider errors keep the preset and are never retried", async (t) => {
  for (const reply of [
    () => Response.json(native("A leaf landed on my cup")), // wrong language for a zh-Hans owner
    () => Response.json(native("好像比昨天荡得高一点")), // repeats a recent caption
    () => Response.json(native("下午茶 #花园")),
    () => new Response("upstream", { status: 500 })
  ]) {
    const f = await fixture(t);
    f.respond(reply);
    assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl }), 0);
    assert.deepEqual(await f.moment("new"), { caption: "茶还有点烫，就先陪它坐一会儿", captionSource: "FALLBACK" });
    await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "alice", env: enabled, fetchImpl: f.fetchImpl });
    assert.equal(f.calls.length, 1);
  }
});

test("another owner's Moments are never filled", async (t) => {
  const f = await fixture(t);
  assert.equal(await fillFairyMomentCaptions({ prisma: f.prisma, ownerId: "mallory", env: enabled, fetchImpl: f.fetchImpl }), 0);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.moment("new")).captionSource, "PENDING");
});

test("caption validation", () => {
  assert.equal(validFairyMomentCaption("Second cup. Nobody's counting", "en"), true);
  assert.equal(validFairyMomentCaption("  茶有点烫 🌿 ", "zh-Hans"), true);
  assert.equal(validFairyMomentCaption("", "en"), false);
  assert.equal(validFairyMomentCaption("x".repeat(121), "en"), false);
  assert.equal(validFairyMomentCaption("茶".repeat(61), "zh-Hans"), false);
  assert.equal(validFairyMomentCaption("茶".repeat(90), "zh-Hans", [], true), true);
  assert.equal(validFairyMomentCaption("茶".repeat(101), "zh-Hans", [], true), false);
  assert.equal(validFairyMomentCaption("line one\nline two", "en"), false);
  assert.equal(validFairyMomentCaption("see www.example.com", "en"), false);
  assert.equal(validFairyMomentCaption("hi @friend", "en"), false);
  assert.equal(validFairyMomentCaption("茶有点烫", "en"), false);
  assert.equal(validFairyMomentCaption("same", "en", ["same"]), false);
});
