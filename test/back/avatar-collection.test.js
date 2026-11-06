import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { AVATAR_IDS, AVATAR_TIERS, LEGACY_AVATAR_IDS, avatarTier, avatarsOfTier, isLibraryAvatar } from "../../lib/avatars.js";
import { avatarCollection, claimLevelAvatar, grantWelcomeAvatars, rewardTier } from "../../lib/avatar-collection.js";
import { closenessLevel, pointsToNextLevel } from "../../lib/fairy-closeness.js";
import { app } from "../../server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ON = { FAIRY_CLOSENESS_OWNER_IDS: "*" };
const plain = value => JSON.parse(JSON.stringify(value));
const pointsFor = level => Array.from({ length: level - 1 }, (_, i) => pointsToNextLevel(i + 1)).reduce((a, b) => a + b, 0);

// In-memory stand-in for the tables the collection touches. Transactions run one at a time,
// as the per-owner advisory lock makes them in Postgres; the unique keys throw like P2002.
function fakeDatabase(users) {
  const tables = { avatarOwnership: [], fairyClosenessAward: [] };
  const unique = () => Object.assign(new Error("unique"), { code: "P2002" });
  const ownership = {
    findMany: async ({ where }) => tables.avatarOwnership.filter(row => row.userId === where.userId)
      .sort((a, b) => a.createdAt - b.createdAt).map(row => ({ ...row })),
    findUnique: async ({ where }) => tables.avatarOwnership.find(row => row.userId === where.userId_avatarId.userId && row.avatarId === where.userId_avatarId.avatarId) || null,
    create: async ({ data }) => {
      const row = { rewardLevel: null, createdAt: new Date(), ...data };
      if (tables.avatarOwnership.some(r => r.userId === row.userId && (r.avatarId === row.avatarId || (row.rewardLevel !== null && r.rewardLevel === row.rewardLevel)))) throw unique();
      tables.avatarOwnership.push(row); return { ...row };
    },
    createMany: async ({ data, skipDuplicates }) => {
      let count = 0;
      for (const row of data) {
        try { await ownership.create({ data: row }); count += 1; } catch (error) { if (!skipDuplicates) throw error; }
      }
      return { count };
    }
  };
  let queue = Promise.resolve();
  const db = {
    tables, users,
    user: {
      findUnique: async ({ where }) => (users[where.id] ? { ...users[where.id] } : null),
      updateMany: async ({ where, data }) => {
        const user = users[where.id];
        if (!user || (where.avatarWelcomeAt === null && user.avatarWelcomeAt)) return { count: 0 };
        Object.assign(user, data); return { count: 1 };
      }
    },
    avatarOwnership: ownership,
    fairyClosenessAward: {
      aggregate: async ({ where }) => ({ _sum: { points: tables.fairyClosenessAward.filter(r => r.userId === where.userId).reduce((s, r) => s + r.points, 0) || null } })
    },
    $queryRaw: async () => [{ locked: "" }],
    setLevel(userId, level) {
      tables.fairyClosenessAward = tables.fairyClosenessAward.filter(r => r.userId !== userId);
      tables.fairyClosenessAward.push({ userId, points: pointsFor(level) });
    }
  };
  db.$transaction = operation => { const run = queue.then(() => operation(db)); queue = run.catch(() => undefined); return run; };
  return db;
}
const newUser = () => ({ avatar: "fairy-1", avatarWelcomeAt: null });
const sequence = values => { let i = 0; return n => values[i++ % values.length] % n; };

test("registry: 32 Level 1 (the 8 originals kept), 16 Level 2, 27 Level 3, unique ids, art for each", () => {
  assert.deepEqual(AVATAR_TIERS.map(t => [t.tier, t.unlockLevel, t.ids.length]), [[1, 1, 32], [2, 6, 16], [3, 14, 27]]);
  assert.equal(new Set(AVATAR_IDS).size, 75);
  assert.deepEqual(avatarsOfTier(1).slice(0, 8), [...LEGACY_AVATAR_IDS], "existing ids keep their place in Level 1");
  for (const id of AVATAR_IDS) {
    assert.match(id, /^(fairy-[1-8]|l[123]-\d{2})$/);
    assert.ok(fs.statSync(path.join(root, "mobile/assets/avatars", `${id}.webp`)).size < 40_000, id);
  }
  assert.equal(avatarTier("l3-27"), 3);
  assert.equal(isLibraryAvatar("l3-28"), false);
  assert.equal(isLibraryAvatar("🦋"), false);
  // Level 3 leaves out exactly level3-1 row 1 columns 1 and 2 and row 4 column 2 (30 cut, 27 kept).
  const script = fs.readFileSync(path.join(root, "scripts/crop-avatar-sheets.py"), "utf8");
  assert.match(script, /EXCLUDE = \{\("level3-1", 1, 1\), \("level3-1", 1, 2\), \("level3-1", 4, 2\)\}/);
  const cells = [...script.matchAll(/\("(level[\d-]+)", (\d), (\d), (\d), "\w+"\)/g)].map(m => [m[1], m[2] * m[3], +m[4]]);
  assert.equal(cells.filter(c => c[2] === 3).reduce((s, c) => s + c[1], 0), 30);
});

test("reward tiers: Lv 2–5 Level 1, Lv 6–13 up to Level 2, Lv 14–20 up to Level 3", () => {
  assert.deepEqual([2, 5, 6, 13, 14, 20].map(rewardTier), [1, 1, 2, 2, 3, 3]);
});

test("welcome: one chosen and three distinct random Level 1 avatars, once per account", async () => {
  const db = fakeDatabase({ u: newUser() });
  assert.equal((await avatarCollection(db, { userId: "u", env: ON })).welcome.needed, true);
  await assert.rejects(grantWelcomeAvatars(db, { userId: "u", avatar: "l2-01", env: ON }), { code: "NOT_ELIGIBLE" });
  await assert.rejects(grantWelcomeAvatars(db, { userId: "u", avatar: "nope", env: ON }), { code: "NOT_ELIGIBLE" });
  // A draw that would repeat itself still gives three different avatars, none the chosen one.
  const first = await grantWelcomeAvatars(db, { userId: "u", avatar: "l1-05", env: ON, pick: sequence([0, 0, 0]) });
  assert.equal(first.created, true);
  assert.equal(first.equipped, "l1-05");
  assert.equal(first.welcome.selected, "l1-05");
  assert.equal(first.welcome.gifted.length, 3);
  assert.equal(new Set([...first.welcome.gifted, "l1-05"]).size, 4);
  assert.ok(first.welcome.gifted.every(id => avatarTier(id) === 1));
  assert.equal(first.owned.length, 4);
  assert.equal(first.welcome.needed, false);
  assert.deepEqual(first.pending, [], "Lv 1 itself brings no reward");
  // Signing in again (or a retried request) never gives the gift twice.
  const again = await grantWelcomeAvatars(db, { userId: "u", avatar: "l1-09", env: ON });
  assert.equal(again.created, false);
  assert.deepEqual(plain(again.welcome), plain(first.welcome));
  assert.equal(again.equipped, "l1-05");
  assert.equal(db.tables.avatarOwnership.length, 4);
  // Concurrent first requests: one gift.
  const db2 = fakeDatabase({ v: newUser() });
  const results = await Promise.all([1, 2, 3].map(() => grantWelcomeAvatars(db2, { userId: "v", avatar: "fairy-2", env: ON })));
  assert.deepEqual(results.map(r => r.created).sort(), [false, false, true]);
  assert.equal(db2.tables.avatarOwnership.length, 4);
  // Random gifts differ between accounts drawn with the real generator (not a fixed set).
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    const d = fakeDatabase({ w: newUser() });
    (await grantWelcomeAvatars(d, { userId: "w", avatar: "fairy-1", env: ON })).welcome.gifted.forEach(id => seen.add(id));
  }
  assert.ok(seen.size > 6);
});

test("level rewards: tiers by level, chosen not random, owned once, equipped avatar kept", async () => {
  const db = fakeDatabase({ u: newUser() });
  await grantWelcomeAvatars(db, { userId: "u", avatar: "l1-01", env: ON, pick: sequence([0]) });
  const owned = (await avatarCollection(db, { userId: "u", env: ON })).owned;
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l1-10", env: ON }), { code: "NOT_EARNED" }, "Lv 2 not reached yet");

  db.setLevel("u", 2);
  let state = await avatarCollection(db, { userId: "u", env: ON });
  assert.deepEqual(plain(state.pending), [{ level: 2, tier: 1, eligible: 32 - 4 }]);
  assert.equal(state.nextRewardLevel, 3);
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l2-01", env: ON }), { code: "NOT_ELIGIBLE" }, "Lv 2 offers Level 1 only");
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 2, avatar: owned[1], env: ON }), { code: "OWNED" });
  const claimed = await claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l1-20", env: ON });
  assert.equal(claimed.created, true);
  assert.equal(claimed.equipped, "l1-01", "claiming never equips");
  assert.deepEqual(claimed.pending, []);
  assert.equal((await claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l1-20", env: ON })).created, false, "a retry is a no-op");
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l1-21", env: ON }), { code: "ALREADY_CLAIMED" });
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 3, avatar: "l1-20", env: ON }), { code: "NOT_EARNED" });

  db.setLevel("u", 6);
  state = await avatarCollection(db, { userId: "u", env: ON });
  assert.deepEqual(state.pending.map(r => [r.level, r.tier]), [[3, 1], [4, 1], [5, 1], [6, 2]]);
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 5, avatar: "l2-02", env: ON }), { code: "NOT_ELIGIBLE" }, "an older reward keeps its own tiers");
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 6, avatar: "l3-01", env: ON }), { code: "NOT_ELIGIBLE" }, "Lv 6 stops at Level 2");
  assert.equal((await claimLevelAvatar(db, { userId: "u", level: 6, avatar: "l2-02", env: ON })).created, true);
  assert.equal((await claimLevelAvatar(db, { userId: "u", level: 3, avatar: "fairy-8", env: ON })).created, true, "Lv 6 also offers Level 1");
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 4, avatar: "l2-02", env: ON }), { code: "NOT_ELIGIBLE" });
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 4, avatar: "fairy-8", env: ON }), { code: "OWNED" });

  db.setLevel("u", 14);
  state = await avatarCollection(db, { userId: "u", env: ON });
  assert.deepEqual(state.pending.map(r => r.level), [4, 5, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(state.pending.at(-1).tier, 3);
  assert.equal((await claimLevelAvatar(db, { userId: "u", level: 14, avatar: "l3-27", env: ON })).created, true);
  assert.equal((await claimLevelAvatar(db, { userId: "u", level: 13, avatar: "l2-16", env: ON })).created, true);
  state = await avatarCollection(db, { userId: "u", env: ON });
  assert.equal(state.equipped, "l1-01");
  assert.deepEqual(plain(state.claims.map(c => [c.level, c.avatar])), [[2, "l1-20"], [3, "fairy-8"], [6, "l2-02"], [13, "l2-16"], [14, "l3-27"]]);
  assert.ok(["l1-20", "fairy-8", "l2-02", "l2-16", "l3-27"].every(id => state.owned.includes(id)), "claimed avatars stay owned");
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 21, avatar: "l1-02", env: ON }), { code: "INVALID_LEVEL" });
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: "4", avatar: "l1-02", env: ON }), { code: "INVALID_LEVEL" });
});

test("level jumps keep one reward per level; dismissed rewards wait; Lv 1 → 20 is 19 rewards", async () => {
  const db = fakeDatabase({ u: newUser() });
  await grantWelcomeAvatars(db, { userId: "u", avatar: "fairy-1", env: ON });
  db.setLevel("u", 9);
  const jumped = await avatarCollection(db, { userId: "u", env: ON });
  assert.deepEqual(jumped.pending.map(r => [r.level, r.tier]), [[2, 1], [3, 1], [4, 1], [5, 1], [6, 2], [7, 2], [8, 2], [9, 2]]);
  assert.equal(jumped.ready, 8);
  // Nothing claimed (the celebration was dismissed): every reward is still there later.
  assert.deepEqual(plain((await avatarCollection(db, { userId: "u", env: ON })).pending), plain(jumped.pending));
  db.setLevel("u", 20);
  const top = await avatarCollection(db, { userId: "u", env: ON });
  assert.equal(closenessLevel(pointsFor(20)).level, 20);
  assert.equal(top.pending.length, 19);
  assert.equal(top.nextRewardLevel, null);
  const free = AVATAR_IDS.filter(id => !top.owned.includes(id));
  for (const reward of top.pending) {
    const pick = free.find(id => avatarTier(id) <= reward.tier);
    free.splice(free.indexOf(pick), 1);
    assert.equal((await claimLevelAvatar(db, { userId: "u", level: reward.level, avatar: pick, env: ON })).created, true);
  }
  const done = await avatarCollection(db, { userId: "u", env: ON });
  assert.equal(done.pending.length, 0);
  assert.equal(done.owned.length, 4 + 19);
});

test("concurrent claims of one reward grant one avatar", async () => {
  const db = fakeDatabase({ u: newUser() });
  await grantWelcomeAvatars(db, { userId: "u", avatar: "fairy-1", env: ON, pick: sequence([0]) });
  db.setLevel("u", 2);
  const outcomes = await Promise.allSettled(["l1-10", "l1-11", "l1-10"].map(avatar => claimLevelAvatar(db, { userId: "u", level: 2, avatar, env: ON })));
  const created = outcomes.filter(o => o.status === "fulfilled" && o.value.created);
  assert.equal(created.length, 1);
  assert.equal(db.tables.avatarOwnership.filter(r => r.rewardLevel === 2).length, 1);
});

test("no eligible avatar left: the reward stays listed with nothing to choose and does not count as ready", async () => {
  const db = fakeDatabase({ u: newUser() });
  for (const avatarId of avatarsOfTier(1)) db.tables.avatarOwnership.push({ userId: "u", avatarId, source: "LEGACY", rewardLevel: null, createdAt: new Date(0) });
  db.users.u.avatarWelcomeAt = new Date(0);
  db.setLevel("u", 3);
  const state = await avatarCollection(db, { userId: "u", env: ON });
  assert.deepEqual(plain(state.pending), [{ level: 2, tier: 1, eligible: 0 }, { level: 3, tier: 1, eligible: 0 }]);
  assert.equal(state.ready, 0);
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l2-01", env: ON }), { code: "NOT_ELIGIBLE" });
  db.setLevel("u", 6);
  assert.equal((await avatarCollection(db, { userId: "u", env: ON })).ready, 1, "the Lv 6 reward can still choose Level 2");
});

test("outside the closeness switch: no level, no level rewards, the welcome still works", async () => {
  const db = fakeDatabase({ u: newUser() });
  db.setLevel("u", 10);
  assert.equal((await grantWelcomeAvatars(db, { userId: "u", avatar: "fairy-3", env: {} })).created, true);
  const state = await avatarCollection(db, { userId: "u", env: {} });
  assert.equal(state.bondOn, false);
  assert.equal(state.level, null);
  assert.deepEqual(state.pending, []);
  await assert.rejects(claimLevelAvatar(db, { userId: "u", level: 2, avatar: "l1-10", env: {} }), { code: "NOT_FOUND" });
});

test("migration: existing accounts keep their avatar and the original eight, skip the welcome; keys hold", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
      .filter(item => item.isDirectory()).map(item => item.name).sort();
    const mine = "202611040001_avatar_collection";
    assert.ok(names.includes(mine));
    const run = async name => db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    for (const name of names.filter(name => name < mine)) await run(name);
    await db.exec(`INSERT INTO "User" (id, name, avatar) VALUES ('old-emoji', 'Old', '🐝'), ('old-portrait', 'Older', 'fairy-6');
      INSERT INTO "FairyClosenessAward" (id, "userId", source, "awardKey", "localDate", points) VALUES ('a1', 'old-portrait', 'CHECK_IN', 'k', '2026-10-22', 400);`);
    for (const name of names.filter(name => name >= mine)) await run(name);
    const users = (await db.query(`SELECT id, avatar, "avatarWelcomeAt" IS NOT NULL AS welcomed FROM "User" ORDER BY id`)).rows;
    assert.deepEqual(users, [{ id: "old-emoji", avatar: "🐝", welcomed: true }, { id: "old-portrait", avatar: "fairy-6", welcomed: true }]);
    const owned = (await db.query(`SELECT "userId", "avatarId", source FROM "AvatarOwnership" ORDER BY "userId", "avatarId"`)).rows;
    assert.equal(owned.length, 16);
    assert.ok(owned.every(row => row.source === "LEGACY" && LEGACY_AVATAR_IDS.includes(row.avatarId)));
    assert.equal((await db.query(`SELECT points FROM "FairyClosenessAward"`)).rows[0].points, 400, "Bond progress untouched");
    // An account made after the migration still has its welcome to do.
    await db.exec(`INSERT INTO "User" (id, name) VALUES ('new', 'New')`);
    assert.equal((await db.query(`SELECT "avatarWelcomeAt" FROM "User" WHERE id = 'new'`)).rows[0].avatarWelcomeAt, null);
    await db.exec(`INSERT INTO "AvatarOwnership" ("userId", "avatarId", source, "rewardLevel") VALUES ('new', 'l1-01', 'LEVEL', 2)`);
    await assert.rejects(db.exec(`INSERT INTO "AvatarOwnership" ("userId", "avatarId", source) VALUES ('new', 'l1-01', 'WELCOME_GIFT')`), /unique|duplicate/i);
    await assert.rejects(db.exec(`INSERT INTO "AvatarOwnership" ("userId", "avatarId", source, "rewardLevel") VALUES ('new', 'l1-02', 'LEVEL', 2)`), /unique|duplicate/i);
    await db.exec(`INSERT INTO "AvatarOwnership" ("userId", "avatarId", source) VALUES ('new', 'l1-03', 'WELCOME_GIFT'), ('new', 'l1-04', 'WELCOME_GIFT')`);
    await db.exec(`DELETE FROM "User" WHERE id = 'new'`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM "AvatarOwnership" WHERE "userId" = 'new'`)).rows[0].n, 0);
  } finally { await db.close(); }
});

test("avatar routes and wearing only owned avatars", async (t) => {
  const db = fakeDatabase({ "owner-1": { avatar: "🐝", avatarWelcomeAt: null, communityTermsVersion: null } });
  const restore = [];
  const stub = (target, key, value) => { const original = target[key]; restore.push(() => { target[key] = original; }); target[key] = value; };
  const { COMMUNITY_VERSION } = await import("../../lib/community-policy.js");
  db.users["owner-1"].communityTermsVersion = COMMUNITY_VERSION;
  stub(prisma, "$transaction", async operation => db.$transaction(operation));
  stub(prisma, "avatarOwnership", db.avatarOwnership);
  stub(prisma.user, "findUnique", async args => (args.where?.firebaseUid === "owner-uid" ? { id: "owner-1", firebaseUid: "owner-uid" }
    : args.where?.id === "owner-1" ? { ...db.users["owner-1"], socialRestricted: false } : null));
  stub(prisma.user, "update", async ({ data }) => { Object.assign(db.users["owner-1"], data); return { id: "owner-1", avatar: db.users["owner-1"].avatar }; });
  setFirebaseTokenVerifierForTests(async () => ({ uid: "owner-uid", email: "owner@example.test", email_verified: true }));
  process.env.FAIRY_CLOSENESS_OWNER_IDS = "*";
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    delete process.env.FAIRY_CLOSENESS_OWNER_IDS;
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

  const fresh = await call("/api/avatars");
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.welcome.needed, true);
  assert.equal(fresh.body.total, 75);
  assert.deepEqual(fresh.body.tiers.map(t => [t.tier, t.unlockLevel, t.total, t.unlocked]), [[1, 1, 32, true], [2, 6, 16, false], [3, 14, 27, false]]);
  assert.equal((await call("/api/avatars/welcome", "POST", { avatar: "l1-02", extra: 1 })).status, 400);
  assert.equal((await call("/api/avatars/welcome", "POST", { avatar: "l3-01" })).status, 400);
  assert.equal((await call("/users/avatar", "PUT", { avatar: "l1-02" })).status, 403, "not owned yet");
  const welcome = await call("/api/avatars/welcome", "POST", { avatar: "l1-02" });
  assert.equal(welcome.status, 200);
  assert.equal(welcome.body.created, true);
  assert.equal(db.users["owner-1"].avatar, "l1-02");
  assert.equal((await call("/api/avatars/welcome", "POST", { avatar: "l1-03" })).body.created, false);
  const gift = welcome.body.welcome.gifted[0];
  assert.deepEqual((await call("/users/avatar", "PUT", { avatar: gift })).body, { id: "owner-1", avatar: gift });
  assert.equal((await call("/users/avatar", "PUT", { avatar: "l2-05" })).status, 403);
  assert.equal((await call("/users/avatar", "PUT", { avatar: "🦋" })).status, 200, "legacy emoji avatars keep working");

  // The client cannot pick its own level: Lv 1 so far, so no reward exists to claim.
  assert.equal((await call("/api/avatars/claim", "POST", { level: 2, avatar: "l1-10" })).status, 403);
  assert.equal((await call("/api/avatars/claim", "POST", { level: 2, avatar: "l1-10", bondLevel: 20 })).status, 400);
  db.setLevel("owner-1", 6);
  const ready = await call("/api/avatars");
  assert.deepEqual(ready.body.pending.map(r => r.level), [2, 3, 4, 5, 6]);
  assert.equal((await call("/api/avatars/claim", "POST", { level: 6, avatar: "l3-02" })).status, 403);
  const claim = await call("/api/avatars/claim", "POST", { level: 6, avatar: "l2-05" });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.equipped, "🦋", "claiming leaves the worn avatar alone");
  assert.equal((await call("/api/avatars/claim", "POST", { level: 6, avatar: "l2-06" })).status, 409);
  assert.equal((await call("/users/avatar", "PUT", { avatar: "l2-05" })).status, 200, "an unlocked avatar can be worn");
  assert.equal((await call("/api/avatars")).body.equipped, "l2-05");
});
