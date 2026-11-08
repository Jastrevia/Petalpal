import assert from "node:assert/strict";
import test from "node:test";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { app } from "../../server.js";

// The first-time tour's server record (lib/onboarding-tutorial.js through GET / PATCH /api/onboarding):
// every step is kept in FairyState, so a new device resumes it; a finished tour never plays again;
// accounts from before the tour are never shown it; one owner can never read or move another's.
test("onboarding tutorial progress is the server's record, per owner", async (t) => {
  const users = new Map([
    ["firebase-alice", { id: "user-alice" }],
    ["firebase-bob", { id: "user-bob" }],
    ["firebase-legacy", { id: "user-legacy" }],
    ["firebase-migrated", { id: "user-migrated" }]
  ]);
  // Alice and Bob signed up after the tour shipped (createProfile sets intro.name). The legacy owner
  // has no tour columns yet but a Garden; the migrated owner was marked done by the migration.
  const fairyStates = new Map([
    ["user-alice", { userId: "user-alice", onboardingCompleted: false, onboardingStep: "EMPTY_GARDEN", tutorialStep: "intro.name" }],
    ["user-bob", { userId: "user-bob", onboardingCompleted: false, onboardingStep: "EMPTY_GARDEN", tutorialStep: "intro.name" }],
    ["user-legacy", { userId: "user-legacy", onboardingCompleted: false, onboardingStep: "EMPTY_GARDEN", tutorialStep: null }],
    ["user-migrated", { userId: "user-migrated", onboardingCompleted: true, onboardingStep: "GARDEN_UNLOCKED",
      tutorialStep: "done", tutorialCompletedAt: new Date("2026-11-08T00:00:00Z"), fairyNamedAt: new Date("2026-11-08T00:00:00Z") }]
  ]);
  const fairies = new Map([
    ["user-alice", { id: "uf-alice", userId: "user-alice", fairyType: "BLOOM", name: "PPL", isActive: true }],
    ["user-bob", { id: "uf-bob", userId: "user-bob", fairyType: "BLOOM", name: "PPL", isActive: true }],
    ["user-legacy", { id: "uf-legacy", userId: "user-legacy", fairyType: "BLOOM", name: "Mimi", isActive: true }],
    ["user-migrated", { id: "uf-migrated", userId: "user-migrated", fairyType: "BLOOM", name: "Bloom", isActive: true }]
  ]);
  const events = [];
  const flowers = [];
  const locks = [];

  const pick = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key] ?? null])) : row);
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = {
    user: { findUnique: async ({ where }) => {
      if (where.firebaseUid) return users.get(where.firebaseUid) || null;
      return [...users.values()].find(user => user.id === where.id) || null;
    } },
    fairyState: {
      upsert: async ({ where, create, select }) => {
        if (!fairyStates.has(where.userId)) fairyStates.set(where.userId, { tutorialStep: null, onboardingCompleted: false, ...create });
        return pick(fairyStates.get(where.userId), select);
      },
      update: async ({ where, data, select }) => {
        const row = { ...fairyStates.get(where.userId), ...data };
        fairyStates.set(where.userId, row);
        return pick(row, select);
      },
      updateMany: async ({ where, data }) => {
        const row = fairyStates.get(where.userId);
        if (!row || !Object.entries(where).every(([key, value]) => key === "userId" || (row[key] ?? null) === value)) return { count: 0 };
        fairyStates.set(where.userId, { ...row, ...data });
        return { count: 1 };
      }
    },
    userFairy: {
      findUnique: async ({ where, select }) => {
        const row = fairies.get(where.userId_fairyType.userId);
        return row && row.fairyType === where.userId_fairyType.fairyType ? pick(row, select) : null;
      },
      findFirst: async ({ where, select }) => pick([...fairies.values()].find(row => matches(row, where)) || null, select),
      count: async ({ where }) => [...fairies.values()].filter(row => matches(row, where)).length,
      update: async ({ where, data }) => {
        const [key, row] = [...fairies.entries()].find(([, value]) => value.id === where.id);
        fairies.set(key, { ...row, ...data });
        return fairies.get(key);
      },
      create: async ({ data }) => {
        const { runtime, ...row } = data;
        fairies.set(data.userId, { id: `uf-${data.userId}`, ...row });
        return fairies.get(data.userId);
      }
    },
    event: {
      count: async ({ where }) => events.filter(row => matches(row, where)).length,
      findFirst: async ({ where, select }) => pick(events.find(row => matches(row, where)) || null, select)
    },
    flower: {
      count: async ({ where }) => flowers.filter(row => matches(row, where)).length,
      findFirst: async ({ where, select }) => pick(flowers.find(row => matches(row, where)) || null, select)
    }
  };
  const originals = {};
  for (const model of Object.keys(db)) {
    originals[model] = {};
    for (const method of Object.keys(db[model])) {
      originals[model][method] = prisma[model][method];
      prisma[model][method] = db[model][method];
    }
  }
  const originalTransaction = prisma.$transaction;
  const originalQueryRaw = prisma.$queryRaw;
  const tx = { ...db, $queryRaw: async (strings, ...values) => { locks.push(values.join(",")); return [{ locked: "" }]; } };
  prisma.$transaction = async fn => fn(tx);
  prisma.$queryRaw = tx.$queryRaw;

  setFirebaseTokenVerifierForTests(async token => {
    const uid = { "token-alice": "firebase-alice", "token-bob": "firebase-bob", "token-legacy": "firebase-legacy", "token-migrated": "firebase-migrated" }[token];
    if (!uid) throw new Error("Invalid token");
    return { uid, email: `${uid}@example.test`, email_verified: true };
  });
  const httpServer = app.listen(0, "127.0.0.1");
  await new Promise(resolve => httpServer.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  t.after(async () => {
    for (const model of Object.keys(originals)) for (const method of Object.keys(originals[model])) prisma[model][method] = originals[model][method];
    prisma.$transaction = originalTransaction;
    prisma.$queryRaw = originalQueryRaw;
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => httpServer.close(resolve));
  });

  const call = async (token, method = "GET", body) => {
    const res = await fetch(`${baseUrl}/api/onboarding`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  await t.test("signed-out requests are refused", async () => {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(null, "PATCH", { step: "garden.zoom" })).status, 401);
  });

  await t.test("a new account starts at naming", async () => {
    const res = await call("token-alice");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "active", step: "intro.name", fairyName: "PPL", fairyNamed: false,
      firstEventId: null, firstFlowerId: null, flowerPlanted: false });
  });

  await t.test("the tour names her starter fairy and refuses to move on before she is named", async () => {
    assert.equal((await call("token-alice", "PATCH", { step: "garden.zoom" })).body.code, "FAIRY_NAME_REQUIRED");
    assert.equal((await call("token-alice", "PATCH", { fairyName: "" })).status, 400);
    assert.equal((await call("token-alice", "PATCH", { fairyName: "x".repeat(17) })).body.code, "FAIRY_NAME_TOO_LONG");
    assert.equal((await call("token-alice", "PATCH", { unknown: true })).status, 400, "only the tour's own fields are accepted");
    const named = await call("token-alice", "PATCH", { fairyName: "小花", step: "intro.celebrate" });
    assert.equal(named.status, 200);
    assert.equal(named.body.fairyName, "小花");
    assert.equal(named.body.fairyNamed, true);
    assert.equal(named.body.step, "intro.celebrate");
    assert.equal(fairies.get("user-alice").name, "小花", "her name is the starter UserFairy's real name");
    assert.ok(locks.some(lock => lock.includes("onboarding-tutorial:user-alice")), "the update is serialized per owner");
  });

  await t.test("every step is stored and a new device resumes from it; steps never rewind", async () => {
    assert.equal((await call("token-alice", "PATCH", { step: "event.write" })).body.step, "event.write");
    assert.equal((await call("token-alice", "PATCH", { step: "plant.place" })).body.code, "FIRST_EVENT_REQUIRED");
    assert.equal((await call("token-alice", "PATCH", { complete: true })).body.code, "TOUR_UNFINISHED", "the tour cannot be skipped to the end");
    events.push({ id: "evt-a", ownerId: "user-alice" });
    flowers.push({ id: "flw-a", userId: "user-alice", sourceEventId: "evt-a" });
    assert.equal((await call("token-alice", "PATCH", { firstEventId: "evt-b" })).body.code, "EVENT_NOT_FOUND");
    const linked = await call("token-alice", "PATCH", { firstEventId: "evt-a", firstFlowerId: "flw-a", step: "event.flower" });
    assert.equal(linked.body.firstFlowerId, "flw-a");
    assert.equal((await call("token-alice", "PATCH", { step: "plant.growth" })).body.code, "FIRST_FLOWER_REQUIRED");
    assert.equal((await call("token-alice", "PATCH", { flowerPlanted: true, step: "treehouse.enter" })).body.step, "treehouse.enter");
    assert.equal((await call("token-alice", "PATCH", { step: "event.nav" })).body.step, "treehouse.enter", "an older device cannot rewind it");
    assert.equal((await call("token-alice", "PATCH", { fairyName: "Again" })).body.code, "FAIRY_ALREADY_NAMED");
    const otherDevice = await call("token-alice");
    assert.equal(otherDevice.body.step, "treehouse.enter");
    assert.equal(otherDevice.body.fairyName, "小花");
    assert.equal(fairyStates.get("user-alice").tutorialStep, "treehouse.enter", "kept in the database row");
  });

  await t.test("finishing the finale completes it once, everywhere", async () => {
    assert.equal((await call("token-alice", "PATCH", { step: "finale" })).body.step, "finale");
    const done = await call("token-alice", "PATCH", { complete: true });
    assert.equal(done.body.status, "completed");
    assert.equal(fairyStates.get("user-alice").onboardingCompleted, true);
    assert.ok(fairyStates.get("user-alice").tutorialCompletedAt);
    assert.equal((await call("token-alice")).body.status, "completed");
    assert.equal((await call("token-alice", "PATCH", { step: "intro.name" })).body.status, "completed", "nothing reopens it");
  });

  await t.test("existing owners never see the tour and keep their fairy's name", async () => {
    const migrated = await call("token-migrated");
    assert.equal(migrated.body.status, "completed");
    assert.equal(migrated.body.fairyName, "Bloom");
    const legacy = await call("token-legacy");
    assert.equal(legacy.body.status, "completed", "an owner from before the tour has a Garden already");
    assert.equal(legacy.body.fairyName, "Mimi");
    assert.equal(fairies.get("user-legacy").name, "Mimi");
  });

  await t.test("owners are isolated", async () => {
    const bob = await call("token-bob");
    assert.equal(bob.body.status, "active");
    assert.equal(bob.body.step, "intro.name");
    assert.equal((await call("token-bob", "PATCH", { fairyName: "Pip", firstEventId: "evt-a" })).body.code, "EVENT_NOT_FOUND",
      "another owner's Event can never be linked");
    assert.equal(fairies.get("user-alice").name, "小花");
    assert.equal(fairyStates.get("user-alice").tutorialFirstEventId, "evt-a");
  });
});
