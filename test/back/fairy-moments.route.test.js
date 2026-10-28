import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { FAIRY_MOMENT_CAPTIONS } from "../../lib/fairy-moment-captions.js";
import { fairyMomentTopic } from "../../lib/fairy-moments.js";
const zhCaptions = moment => FAIRY_MOMENT_CAPTIONS["zh-Hans"][moment.photoKey ? "photo" : "text"][fairyMomentTopic(moment.state, moment.spot)]
  .map(entry => Array.isArray(entry) ? entry[1] : entry);
import { app, setFairyMomentCaptionFillerForTests } from "../../server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-10-20T19:00:00.000Z");

test("migration adds owner-scoped, cascading Fairy Moments with one post per runtime transition", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
      .filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of names) await db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    await db.exec(`INSERT INTO "User" (id, name) VALUES ('owner', 'Owner');
      INSERT INTO "UserFairy" (id, "userId", "fairyType", name, "unlockSource", "updatedAt")
        VALUES ('fairy', 'owner', 'BLOOM', 'Bloom', 'ONBOARDING', CURRENT_TIMESTAMP);
      INSERT INTO "FairyMoment" (id, "userId", "userFairyId", "runtimeVersion", state, "photoKey", caption, "postedAt")
        VALUES ('m1', 'owner', 'fairy', 7, 'TEA_TIME', 'TEA_TIME/1', 'hi', CURRENT_TIMESTAMP);`);
    assert.equal((await db.query(`SELECT "momentsSeenAt", "captionSource" FROM "UserFairy", "FairyMoment"`)).rows[0].captionSource, "FALLBACK");
    await db.exec(`INSERT INTO "FairyMoment" (id, "userId", "userFairyId", "runtimeVersion", state, spot, mood, caption, "postedAt")
      VALUES ('text', 'owner', 'fairy', 8, 'IDLE', 'EAST_BRIDGE', 'CURIOUS', 'a discovery', CURRENT_TIMESTAMP)`);
    assert.equal((await db.query(`SELECT "photoKey" FROM "FairyMoment" WHERE id = 'text'`)).rows[0].photoKey, null);
    await assert.rejects(db.exec(`INSERT INTO "FairyMoment" (id, "userId", "userFairyId", "runtimeVersion", state, "photoKey", caption, "postedAt")
      VALUES ('m2', 'owner', 'fairy', 7, 'SWINGING', 'SWINGING/1', 'again', CURRENT_TIMESTAMP)`), /unique/i);
    await db.exec(`UPDATE "UserFairy" SET "momentsAvatar" = 'fairy-3', "momentsCover" = 'cover-02' WHERE id = 'fairy'`);
    await db.exec(`DELETE FROM "UserFairy" WHERE id = 'fairy'`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM "FairyMoment"`)).rows[0].n, 0);
  } finally { await db.close(); }
});

test("migration renames only starter Fairies still called Bloom to PPL", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
      .filter(item => item.isDirectory()).map(item => item.name).sort();
    const rename = "202610220002_rename_starter_fairy_ppl";
    assert.ok(names.includes(rename));
    for (const name of names.filter(name => name < rename)) await db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    await db.exec(`INSERT INTO "User" (id, name) VALUES ('a', 'A'), ('b', 'B'), ('c', 'C');
      INSERT INTO "UserFairy" (id, "userId", "fairyType", name, "unlockSource", "updatedAt") VALUES
        ('starter', 'a', 'BLOOM', 'Bloom', 'ONBOARDING', CURRENT_TIMESTAMP),
        ('renamed', 'b', 'BLOOM', 'Petal', 'ONBOARDING', CURRENT_TIMESTAMP),
        ('other', 'c', 'LUMI', 'Bloom', 'MONTHLY_ACTIVITY', CURRENT_TIMESTAMP);`);
    await db.exec(await readFile(path.join(root, "prisma/migrations", rename, "migration.sql"), "utf8"));
    const rows = (await db.query(`SELECT id, name FROM "UserFairy" ORDER BY id`)).rows;
    assert.deepEqual(rows.map(row => [row.id, row.name]), [["other", "Bloom"], ["renamed", "Petal"], ["starter", "PPL"]]);
  } finally { await db.close(); }
});

function timeMatches(value, filter) {
  const time = value.getTime();
  return (filter.gte === undefined || time >= filter.gte.getTime()) && (filter.gt === undefined || time > filter.gt.getTime()) &&
    (filter.lte === undefined || time <= filter.lte.getTime()) && (filter.lt === undefined || time < filter.lt.getTime());
}
const matches = (row, where) => Object.entries(where).every(([key, value]) =>
  value && typeof value === "object" && !(value instanceof Date) ? timeMatches(row[key], value) : row[key] === value);
const pick = (row, select) => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row };

function fakeDatabase() {
  const fairy = { id: "fairy-1", userId: "owner-1", fairyType: "BLOOM", name: "Bloom", level: 1, progression: 0, isActive: true, momentsSeenAt: null, momentsAvatar: null, momentsCover: null };
  const initialRuntime = {
    id: "runtime-1", userFairyId: "fairy-1", currentState: "IDLE", currentLocation: "DEFAULT_AREA",
    stateStartedAt: new Date(NOW.getTime() - 10 * 24 * 3_600_000), nextTransitionAt: null, runtimeVersion: 0, transitionId: null
  };
  const state = { fairy, runtime: { ...initialRuntime }, moments: [], initialRuntime };
  const withRuntime = include => ({ ...fairy, ...(include?.runtime ? { runtime: { ...state.runtime } } : {}) });
  const ordered = (rows, orderBy) => orderBy ? rows.sort((a, b) => (a.postedAt - b.postedAt) * (orderBy.postedAt === "desc" ? -1 : 1)) : rows;
  state.db = {
    $queryRaw: async () => [{ locked: "" }],
    user: {
      findUnique: async ({ where }) => where.firebaseUid === "owner-uid" || where.id === "owner-1"
        ? { id: "owner-1", timezone: "America/Vancouver", preferredLocale: "zh-Hans" } : null
    },
    fairyState: { findUnique: async () => ({ onboardingCompleted: true }) },
    userFairy: {
      findUnique: async ({ where, include }) => where.id === fairy.id || where.userId_fairyType?.userId === fairy.userId ? withRuntime(include) : null,
      findFirst: async ({ where, include, select }) => where.userId === fairy.userId ? pick(withRuntime(include), select) : null,
      update: async ({ data }) => Object.assign(fairy, data),
      updateMany: async ({ where, data }) => where.userId === fairy.userId && where.isActive === fairy.isActive
        ? (Object.assign(fairy, data), { count: 1 }) : { count: 0 }
    },
    fairyRuntime: { update: async ({ data }) => Object.assign(state.runtime, data) },
    fairyMoment: {
      findMany: async ({ where, orderBy, take, select }) =>
        ordered(state.moments.filter(row => matches(row, where)), orderBy).slice(0, take).map(row => pick(row, select)),
      findFirst: async ({ where, select }) => { const row = state.moments.find(item => matches(item, where)); return row ? pick(row, select) : null; },
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const row of data) {
          if (state.moments.some(item => item.userFairyId === row.userFairyId && item.runtimeVersion === row.runtimeVersion)) {
            assert.equal(skipDuplicates, true); continue;
          }
          state.moments.push({ id: `moment-${state.moments.length + 1}`, likedAt: null, ...row }); count++;
        }
        return { count };
      },
      updateMany: async ({ where, data }) => {
        const rows = state.moments.filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      }
    }
  };
  return state;
}

test("Fairy Moments routes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const state = fakeDatabase();
  const restore = [];
  const stub = (model, method, implementation) => {
    const target = model ? prisma[model] : prisma, original = target[method];
    restore.push(() => { target[method] = original; });
    target[method] = implementation;
  };
  stub(null, "$transaction", async operation => operation(state.db));
  for (const [model, methods] of Object.entries({ user: ["findUnique"], fairyState: ["findUnique"],
    userFairy: ["findFirst", "update", "updateMany"], fairyMoment: ["findMany", "findFirst", "updateMany"] })) {
    for (const method of methods) stub(model, method, state.db[model][method]);
  }
  setFirebaseTokenVerifierForTests(async () => ({ uid: "owner-uid", email: "owner@example.test", email_verified: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    delete process.env.FAIRY_MOMENTS_OWNER_IDS;
    delete process.env.AI_FAIRY_MOMENT_MODEL;
    setFairyMomentCaptionFillerForTests();
    restore.forEach(fn => fn());
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const call = async (urlPath, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${urlPath}`, {
      method, headers: { Authorization: "Bearer owner-token", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };

  await t.test("off unless the owner is listed: no Moments, routes 404", async () => {
    const runtime = await call("/api/fairy/runtime");
    assert.equal(runtime.status, 200);
    assert.equal("moments" in runtime.body, false);
    assert.equal(runtime.body.gardenSchedule, true, "every Garden follows her day, listed or not");
    assert.equal(state.moments.length, 0);
    assert.equal((await call("/api/fairy/moments")).status, 404);
    assert.equal((await call("/api/fairy/moments/moment-1/like", "POST", { liked: true })).status, 404);
    assert.equal((await call("/api/fairy/moments/avatar", "PUT", { avatar: "fairy-2" })).status, 404);
    assert.equal((await call("/api/fairy/moments/cover", "PUT", { cover: "cover-01" })).status, 404);
  });

  await t.test("runtime records seeded posts in the owner's locale, once per transition", async () => {
    process.env.FAIRY_MOMENTS_OWNER_IDS = "someone_else,owner-1";
    Object.assign(state.runtime, state.initialRuntime);
    const runtime = await call("/api/fairy/runtime");
    assert.equal(runtime.status, 200);
    assert.ok(state.moments.length > 0, "a week of visits produces at least one post");
    assert.equal(runtime.body.moments.unread, state.moments.some(moment => moment.postedAt <= NOW));
    assert.equal(runtime.body.gardenSchedule, true);
    // Her schedule runs in the owner's zone (America/Vancouver): asleep at local night, awake by day.
    const asleep = ["SLEEPING"].includes(runtime.body.currentState);
    const localHour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", hour: "2-digit", hourCycle: "h23" }).format(NOW));
    if (localHour >= 8 && localHour < 22) assert.equal(asleep, false, `awake at ${localHour}:00`);
    if (localHour >= 1 && localHour < 6) assert.equal(asleep, true, `asleep at ${localHour}:00`);
    const since = NOW.getTime() - 7 * 24 * 3_600_000;
    for (const moment of state.moments) {
      assert.equal(moment.userId, "owner-1");
      assert.ok(["TEA_TIME", "SWINGING", "AT_MAILBOX", "IN_TREEHOUSE", "IDLE", "SLEEPING"].includes(moment.state));
      assert.ok(zhCaptions(moment).includes(moment.caption));
      assert.ok(moment.mood);
      assert.ok(moment.postedAt.getTime() > since && moment.postedAt.getTime() <= NOW.getTime() + 25 * 60_000);
    }
    const count = state.moments.length;
    Object.assign(state.runtime, state.initialRuntime);
    await call("/api/fairy/runtime");
    assert.equal(state.moments.length, count, "replaying the same transitions adds nothing");
  });

  await t.test("feed lists visible posts newest first and marks them seen", async () => {
    const feed = await call("/api/fairy/moments");
    assert.equal(feed.status, 200);
    assert.deepEqual(feed.body.fairy, { id: "fairy-1", type: "BLOOM", name: "Bloom", avatar: null, cover: null });
    assert.equal(feed.body.locale, "zh-Hans", "the panel follows the owner's chosen language, like her captions");
    const visible = state.moments.filter(moment => moment.postedAt <= NOW).sort((a, b) => b.postedAt - a.postedAt);
    assert.deepEqual(feed.body.posts.map(post => post.id), visible.map(moment => moment.id));
    assert.deepEqual(Object.keys(feed.body.posts[0]).sort(), ["caption", "id", "liked", "location", "mood", "photoKey", "postedAt", "state"]);
    assert.equal(feed.body.nextBefore, null);
    assert.equal(state.fairy.momentsSeenAt.getTime(), visible[0].postedAt.getTime());
    assert.equal((await call("/api/fairy/runtime")).body.moments.unread, false);
    assert.equal((await call("/api/fairy/moments?before=not-a-date")).status, 400);
    const older = await call(`/api/fairy/moments?before=${encodeURIComponent(visible[0].postedAt.toISOString())}`);
    assert.deepEqual(older.body.posts.map(post => post.id), visible.slice(1).map(moment => moment.id));
  });

  await t.test("likes toggle only the owner's visible posts", async () => {
    const [post] = (await call("/api/fairy/moments")).body.posts;
    assert.deepEqual((await call(`/api/fairy/moments/${post.id}/like`, "POST", { liked: true })), { status: 200, body: { liked: true } });
    assert.equal((await call("/api/fairy/moments")).body.posts[0].liked, true);
    assert.equal((await call(`/api/fairy/moments/${post.id}/like`, "POST", { liked: false })).status, 200);
    assert.equal(state.moments.find(moment => moment.id === post.id).likedAt, null);
    assert.equal((await call(`/api/fairy/moments/${post.id}/like`, "POST", { liked: "yes" })).status, 400);
    assert.equal((await call("/api/fairy/moments/missing/like", "POST", { liked: true })).status, 404);
    state.moments.push({ id: "foreign", userId: "other", userFairyId: "fairy-9", runtimeVersion: 1, state: "TEA_TIME",
      photoKey: "TEA_TIME/1", caption: "x", postedAt: new Date(NOW.getTime() - 3_600_000), likedAt: null });
    assert.equal((await call("/api/fairy/moments/foreign/like", "POST", { liked: true })).status, 404);
    assert.equal(state.moments.find(moment => moment.id === "foreign").likedAt, null);
  });

  await t.test("her Moments avatar is a library id or null, chosen apart from the owner's avatar", async () => {
    assert.deepEqual(await call("/api/fairy/moments/avatar", "PUT", { avatar: "fairy-3" }), { status: 200, body: { avatar: "fairy-3" } });
    assert.equal((await call("/api/fairy/moments")).body.fairy.avatar, "fairy-3");
    for (const avatar of ["fairy-9", "🦋", "https://example.test/a.png", 3]) {
      assert.equal((await call("/api/fairy/moments/avatar", "PUT", { avatar })).status, 400, String(avatar));
    }
    assert.equal(state.fairy.momentsAvatar, "fairy-3");
    assert.deepEqual(await call("/api/fairy/moments/avatar", "PUT", { avatar: null }), { status: 200, body: { avatar: null } });
    assert.equal((await call("/api/fairy/moments")).body.fairy.avatar, null);
  });

  await t.test("her Moments cover comes from the cover library, or null for her photo", async () => {
    assert.deepEqual(await call("/api/fairy/moments/cover", "PUT", { cover: "cover-08" }), { status: 200, body: { cover: "cover-08" } });
    assert.equal((await call("/api/fairy/moments")).body.fairy.cover, "cover-08");
    for (const cover of ["cover-13", "cover-1", "fairy-1", "https://example.test/a.jpg", 8]) {
      assert.equal((await call("/api/fairy/moments/cover", "PUT", { cover })).status, 400, String(cover));
    }
    assert.equal((await call("/api/fairy/moments/cover", "PUT", { cover: "cover-01", extra: 1 })).status, 400);
    assert.equal(state.fairy.momentsCover, "cover-08");
    assert.deepEqual(await call("/api/fairy/moments/cover", "PUT", { cover: null }), { status: 200, body: { cover: null } });
    assert.equal(state.fairy.momentsAvatar, null, "the cover never touches her avatar");
  });

  await t.test("with model captions on, new posts start PENDING and the filler runs after the response", async () => {
    const fills = [];
    setFairyMomentCaptionFillerForTests(async args => { fills.push(args); });
    process.env.AI_FAIRY_MOMENT_MODEL = "claude-haiku-5-5";
    state.moments.length = 0;
    Object.assign(state.runtime, state.initialRuntime);
    assert.equal((await call("/api/fairy/runtime")).status, 200);
    assert.ok(state.moments.length > 0);
    assert.ok(state.moments.every(moment => moment.captionSource === "PENDING"));
    assert.ok(state.moments.every(moment => zhCaptions(moment).includes(moment.caption)));
    assert.equal(fills.length, 1);
    assert.equal(fills[0].ownerId, "owner-1");
    assert.equal(fills[0].prisma, prisma);
    delete process.env.AI_FAIRY_MOMENT_MODEL;
    state.moments.length = 0;
    Object.assign(state.runtime, state.initialRuntime);
    await call("/api/fairy/runtime");
    assert.ok(state.moments.every(moment => moment.captionSource === "FALLBACK"));
    assert.equal(fills.length, 1, "no filler without the model setting");
  });
});
