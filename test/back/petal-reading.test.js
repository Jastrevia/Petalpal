import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { dailyDeck, drawPetalCard, reversedAt } from "../../lib/petal-card-draw.js";
import { PETAL_READING_MODEL_ID, petalReadingFor, requestPetalReading, validPetalReading } from "../../lib/petal-reading.js";

const ZH = ["死神正位说的是结束与转变：骑着白马的身影慢慢走过，远处的太阳正在升起，一段旧的故事走到尽头，空出来的地方正好留给新的东西。",
  "放在今天的运势里，它像是在提醒你，可以轻轻放下一件拖了很久的小事。这几天你常常选「安静」，也许心里已经在为改变腾出地方了。",
  "今天不必急着把一切想清楚，留一点时间给自己，看看哪些东西其实已经可以放手。"];
const EN = ["Death upright speaks of endings and change: a figure on a white horse passes slowly while the sun rises, and an old chapter closes to make room.",
  "For today's fortune it suggests a gentle clearing, a good day to let a long unfinished thing rest. Your recent quiet days may already be preparing the ground for something new.",
  "Keep a little space today to notice what you are ready to set down."];

test("a reading is three paragraphs in the right language and length, with no numbers, fate or advice words", () => {
  assert.equal(validPetalReading(ZH, "zh-Hans"), true);
  assert.equal(validPetalReading(EN, "en"), true);
  assert.equal(validPetalReading(ZH.slice(0, 2), "zh-Hans"), false, "three paragraphs");
  assert.equal(validPetalReading(ZH, "en"), false, "language");
  assert.equal(validPetalReading(EN, "zh-Hans"), false, "language");
  assert.equal(validPetalReading(["短。", "短。", "短。"], "zh-Hans"), false, "too short");
  assert.equal(validPetalReading([ZH[0], ZH[1], ZH[2] + ZH[0] + ZH[1]], "zh-Hans"), false, "too long");
  assert.equal(validPetalReading([ZH[0], ZH[1], "今天你一定会遇到对的人，留一点时间给自己，看看哪些东西其实已经可以放手。"], "zh-Hans"), false, "certainty");
  assert.equal(validPetalReading([ZH[0], ZH[1], "可以考虑买入一点股票，留一点时间给自己，看看哪些东西其实已经可以放手。"], "zh-Hans"), false, "finance");
  assert.equal(validPetalReading([ZH[0], ZH[1].replace("这几天", "这3天"), ZH[2]], "zh-Hans"), false, "numbers");
  assert.equal(validPetalReading([EN[0], EN[1], "You should quit your job today and keep a little space to notice what you are ready to set down."], "en"), false);
  assert.equal(validPetalReading([EN[0], EN[1], "What is ready? What can wait? Keep a little space today to notice what you are ready to set down."], "en"), false, "one question at most");
  assert.equal(validPetalReading([EN[0], `${EN[1]}\nMore.`, EN[2]], "en"), false, "no line breaks inside a paragraph");
});

const enabled = {
  PETAL_CARDS_OWNER_IDS: "*", PETAL_READING_OWNER_IDS: "alice", AI_PETAL_READING_MODEL: PETAL_READING_MODEL_ID,
  AI_GATEWAY_ENABLED: "true", AI_GATEWAY_ANTHROPIC_ENABLED: "true",
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_GATEWAY_ID: "synthetic-petal-test",
  CLOUDFLARE_AI_GATEWAY_TOKEN: "synthetic-gateway", ANTHROPIC_API_KEY: "synthetic-anthropic",
  AI_USER_DAILY_USD_LIMIT: "10", AI_USER_MONTHLY_USD_LIMIT: "10", AI_GLOBAL_DAILY_USD_LIMIT: "10",
  AI_GLOBAL_MONTHLY_USD_LIMIT: "10", AI_ANTHROPIC_MONTHLY_USD_LIMIT: "10"
};
const native = p => ({ model: PETAL_READING_MODEL_ID, type: "message", role: "assistant", stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify({ p }) }], usage: { input_tokens: 700, output_tokens: 300 } });
const NOW = new Date("2026-10-30T20:00:00Z"); // 13:00 on the 30th in Vancouver

// Disposable PostgreSQL engine with just the tables the draw, the reading and the cost gate touch,
// behind a small Prisma-shaped adapter. Injected fetch only: no credential or model runtime.
async function fixture(t, { personalization = true, aiProcessing = true, locale = "zh-Hans" } = {}) {
  const pg = new PGlite({ parsers: { 1114: value => new Date(`${value}Z`) } });
  t.after(() => pg.close());
  await pg.exec(`CREATE TABLE "User" ("id" text PRIMARY KEY,"timezone" text,"preferredLocale" text);
    INSERT INTO "User" VALUES ('alice','America/Vancouver','${locale}'), ('bob','America/Vancouver','en');
    CREATE TABLE "AiConsent" ("userId" text PRIMARY KEY,"termsVersion" text,"aiProcessing" boolean,
      "personalization" boolean,"memoryEnabled" boolean,"updatedAt" timestamp(3));
    INSERT INTO "AiConsent" VALUES ('alice','synthetic',${aiProcessing},${personalization},false,'2000-01-01'),
      ('bob','synthetic',true,true,true,'2000-01-01');
    CREATE TABLE "SubscriptionEntitlement" ("userId" text PRIMARY KEY,"tier" text,"status" text);
    CREATE TABLE "AuditEvent" ("id" text PRIMARY KEY,"createdAt" timestamp NOT NULL DEFAULT now(),"eventType" varchar(64),
      "outcome" varchar(32),"actorUserId" varchar(128),"targetClass" varchar(64),"targetSafeId" varchar(128),"actionCode" varchar(64),"reasonCode" varchar(64));
    CREATE TABLE "Event" ("id" text PRIMARY KEY,"ownerId" text,"localDate" text,"primaryGardenMood" text,"content" text);
    INSERT INTO "Event" VALUES ('e1','alice','2026-10-29','QUIET_BLOOM','A private sentence that must never be sent'),
      ('e2','alice','2026-10-27','QUIET_BLOOM','x'), ('e3','alice','2026-10-24','HEALING_BLOOM','x'),
      ('e4','alice','2026-10-20','SUNNY_BLOOM','too old'), ('e5','alice','2026-10-28',NULL,'no mood');
    CREATE TABLE "PetalCardDraw" ("id" text PRIMARY KEY,"userId" text,"localDate" text,"position" int,"cardId" text,
      "topic" text,"reversed" boolean,"createdAt" timestamp(3) DEFAULT now(), UNIQUE ("userId","localDate"));
    CREATE TABLE "PetalCardReading" ("id" text PRIMARY KEY,"userId" text,"drawId" text UNIQUE,"locale" text,"status" text,
      "attempts" int DEFAULT 1,"paragraphs" jsonb DEFAULT '[]',"model" text,"createdAt" timestamp(3) DEFAULT now(),"updatedAt" timestamp(3));`);
  let ids = 0;
  const one = async (db, sql, params) => (await db.query(sql, params)).rows[0] ?? null;
  const adapt = db => ({
    $queryRawUnsafe: async (sql, ...params) => (await db.query(sql, params)).rows,
    $queryRaw: async () => [{ locked: "" }],
    user: { findUnique: ({ where }) => one(db, `SELECT * FROM "User" WHERE "id"=$1`, [where.id]) },
    aiConsent: { findUnique: ({ where }) => one(db, `SELECT * FROM "AiConsent" WHERE "userId"=$1`, [where.userId]) },
    subscriptionEntitlement: { findUnique: ({ where }) => one(db, `SELECT * FROM "SubscriptionEntitlement" WHERE "userId"=$1`, [where.userId]) },
    event: { findMany: async ({ where }) => (await db.query(`SELECT "primaryGardenMood" FROM "Event" WHERE "ownerId"=$1
      AND "localDate">=$2 AND "localDate"<=$3 AND "primaryGardenMood" = ANY($4)`,
      [where.ownerId, where.localDate.gte, where.localDate.lte, where.primaryGardenMood.in])).rows },
    petalCardDraw: {
      findUnique: ({ where: { userId_localDate: key } }) => one(db, `SELECT * FROM "PetalCardDraw" WHERE "userId"=$1 AND "localDate"=$2`, [key.userId, key.localDate]),
      create: ({ data }) => one(db, `INSERT INTO "PetalCardDraw" ("id","userId","localDate","position","cardId","topic","reversed")
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [`d${++ids}`, data.userId, data.localDate, data.position, data.cardId, data.topic, data.reversed])
    },
    petalCardReading: {
      count: async ({ where }) => (await one(db, `SELECT count(*)::int AS n FROM "PetalCardReading" WHERE "userId"=$1 AND "status"=$2
        AND "drawId" <> $3`, [where.userId, where.status, where.drawId.not])).n,
      findUnique: ({ where }) => one(db, `SELECT * FROM "PetalCardReading" WHERE "drawId"=$1`, [where.drawId]),
      create: ({ data }) => one(db, `INSERT INTO "PetalCardReading" ("id","userId","drawId","locale","status","attempts","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *`, [`r${++ids}`, data.userId, data.drawId, data.locale, data.status, data.attempts]),
      update: ({ where, data }) => {
        const keys = Object.keys(data);
        return one(db, `UPDATE "PetalCardReading" SET ${keys.map((key, i) => `"${key}"=$${i + 2}`).join(",")},"updatedAt"=now()
          WHERE "id"=$1 RETURNING *`, [where.id, ...keys.map(key => key === "paragraphs" ? JSON.stringify(data[key]) : data[key])]);
      }
    }
  });
  const prisma = { ...adapt(pg), $transaction: fn => pg.transaction(tx => fn(adapt(tx))) };
  const calls = [];
  let response = () => Response.json(native(ZH));
  const fetchImpl = async (url, options) => {
    assert.match(url, /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/a{32}\/synthetic-petal-test\/anthropic\/v1\/messages$/);
    calls.push(JSON.parse(options.body));
    return response();
  };
  const draw = (userId = "alice", position = 0, topic = "FORTUNE", now = NOW) => drawPetalCard(prisma, { userId, position, topic, heavy: true, now });
  const reading = async drawId => one(pg, `SELECT "status","attempts","paragraphs" FROM "PetalCardReading" WHERE "drawId"=$1`, [drawId]);
  return { pg, prisma, calls, fetchImpl, draw, reading, respond: fn => { response = fn; } };
}
const ask = (f, env = enabled, userId = "alice", now = NOW) => requestPetalReading(f.prisma, { userId, env, now, fetchImpl: f.fetchImpl });
const day = n => new Date(NOW.getTime() + n * 86_400_000);
const place = (userId, id) => dailyDeck(userId, "2026-10-30", { heavy: true }).indexOf(id);

test("a listed owner's reading is written once from the card, its orientation, the topic and the week's moods", async (t) => {
  const f = await fixture(t);
  const at = place("alice", "major-13"), drawn = await f.draw("alice", at, "FORTUNE");
  assert.deepEqual(await petalReadingFor(f.prisma, { userId: "alice", drawId: drawn.id, env: enabled, now: NOW }),
    { available: true, needsConsent: false, locked: false, freeLeft: null, status: "NONE" });
  assert.deepEqual(await ask(f), { available: true, needsConsent: false, locked: false, freeLeft: null, status: "READY", paragraphs: ZH });
  assert.equal(f.calls.length, 1);
  const input = JSON.parse(f.calls[0].messages[0].content);
  assert.deepEqual(input, { l: "zh-Hans", q: "FORTUNE", c: { n: "死神", o: reversedAt("alice", "2026-10-30", at) ? "reversed" : "upright",
    k: drawn.card.keywords, s: "一段结束，腾出新的位置。", d: drawn.card.text }, m: { 低落: 2, 治愈: 1 } });
  assert.doesNotMatch(f.calls[0].messages[0].content, /private sentence/);
  assert.equal(f.calls[0].model, PETAL_READING_MODEL_ID);
  assert.match(f.calls[0].system, /never as certain outcomes/);
  const reserved = (await f.pg.query(`SELECT "actionCode" FROM "AuditEvent" WHERE "eventType"='AI_GATEWAY_USD_RESERVED'`)).rows;
  assert.deepEqual(reserved.map(row => row.actionCode), ["PETAL_READING"]);
  // Kept: asking again shows the same reading without another call.
  assert.equal((await ask(f)).status, "READY");
  assert.equal(f.calls.length, 1);
});

test("without Personalization the reading uses the card and topic only", async (t) => {
  const f = await fixture(t, { personalization: false, locale: "en" });
  f.respond(() => Response.json(native(EN)));
  await f.draw("alice", 3, "LOVE");
  assert.equal((await ask(f)).status, "READY");
  const input = JSON.parse(f.calls[0].messages[0].content);
  assert.equal(input.m, null);
  assert.equal(input.q, "LOVE");
});

test("an output that fails the checks gets one more try, then the reading is hidden", async (t) => {
  const f = await fixture(t);
  const drawn = await f.draw();
  f.respond(() => Response.json(native(["你注定会遇到好运。", "一定会。", "就这样。"])));
  assert.equal((await ask(f)).status, "NONE", "one attempt left");
  assert.deepEqual(await f.reading(drawn.id), { status: "FAILED", attempts: 1, paragraphs: [] });
  assert.equal((await ask(f)).status, "FAILED");
  assert.equal(f.calls.length, 2);
  assert.equal((await ask(f)).status, "FAILED");
  assert.equal(f.calls.length, 2, "no third call");
});

test("a second try after a failure can succeed", async (t) => {
  const f = await fixture(t);
  await f.draw();
  f.respond(() => new Response("upstream", { status: 500 }));
  assert.equal((await ask(f)).status, "NONE");
  f.respond(() => Response.json(native(ZH)));
  assert.equal((await ask(f)).status, "READY");
  assert.equal(f.calls.length, 2);
});

test("everyone gets three free readings, then only unlocked owners; a written reading stays", async (t) => {
  const f = await fixture(t);
  f.respond(() => Response.json(native(EN)));
  const drawIds = [];
  for (let n = 0; n < 3; n++) {
    drawIds.push((await f.draw("bob", n, "WORK", day(n))).id);
    const reading = await ask(f, enabled, "bob", day(n));
    assert.equal(reading.status, "READY", `free reading ${n + 1}`);
    assert.equal(reading.freeLeft, 2 - n, "the draw's own reading is not counted against it");
  }
  // A fourth day: locked, no call; the earlier readings still show.
  const fourth = await f.draw("bob", 4, "LOVE", day(3));
  const calls = f.calls.length;
  assert.deepEqual(await ask(f, enabled, "bob", day(3)), { available: true, needsConsent: false, locked: true, freeLeft: 0, status: "NONE" });
  assert.equal(f.calls.length, calls);
  assert.equal((await petalReadingFor(f.prisma, { userId: "bob", drawId: drawIds[0], env: enabled, now: day(3) })).status, "READY");
  // Failed attempts never use up a free reading.
  const failing = await fixture(t);
  failing.respond(() => new Response("upstream", { status: 500 }));
  await failing.draw("bob", 1, "WORK");
  await ask(failing, enabled, "bob"); await ask(failing, enabled, "bob");
  assert.equal((await petalReadingFor(failing.prisma, { userId: "bob", drawId: (await failing.draw("bob", 1, "WORK")).id, env: enabled, now: NOW })).freeLeft, 3);
  // Unlocking (Premium, the one-time purchase) lifts the limit; an expired one does not.
  await f.pg.exec(`INSERT INTO "SubscriptionEntitlement" VALUES ('bob','PREMIUM','EXPIRED')`);
  assert.equal((await ask(f, enabled, "bob", day(3))).locked, true);
  await f.pg.exec(`UPDATE "SubscriptionEntitlement" SET "status"='ACTIVE' WHERE "userId"='bob'`);
  // The cost gate counts calls by the database's real day, where these simulated days all fall.
  const unlocked = await ask(f, { ...enabled, AI_PETAL_READING_DAILY_LIMIT: "10" }, "bob", day(3));
  assert.equal(unlocked.status, "READY");
  assert.equal(unlocked.freeLeft, null);
  assert.equal((await f.reading(fourth.id)).status, "READY");
});

test("only with the switches, only with AI Processing", async (t) => {
  const f = await fixture(t);
  await f.draw("alice", 2, "PEOPLE");
  assert.deepEqual(await ask(f, { ...enabled, AI_PETAL_READING_MODEL: undefined }), { available: false });
  assert.deepEqual(await ask(f, { ...enabled, AI_PETAL_READING_MODEL: "claude-haiku-5-5" }), { available: false }, "only the Opus model");
  assert.equal(await ask(f, { ...enabled, PETAL_CARDS_OWNER_IDS: "bob" }), null, "petal cards off for alice");
  await f.pg.exec(`UPDATE "AiConsent" SET "aiProcessing"=false WHERE "userId"='alice'`);
  assert.deepEqual(await ask(f), { available: true, needsConsent: true, locked: false, freeLeft: null, status: "NONE" });
  assert.equal(f.calls.length, 0, "no call without AI Processing");
});

test("nothing drawn today: nothing to read", async (t) => {
  const f = await fixture(t);
  assert.equal(await ask(f), null);
  assert.equal(f.calls.length, 0);
});
