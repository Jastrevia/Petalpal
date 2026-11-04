import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { app } from "../../server.js";
import {
  FAIRY_NAME_MAX_LENGTH, normalizeFairyName, onboardingTutorialState, OnboardingTutorialError,
  TUTORIAL_STEPS, updateOnboardingTutorial
} from "../../lib/onboarding-tutorial.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-10-26T19:00:00.000Z");
const MIGRATION = "202610260001_onboarding_tutorial";

// An owner-scoped in-memory store with the Prisma calls the tour makes.
function fakeDatabase({ events = [], flowers = [], fairies = [], fairyState = {} } = {}) {
  const state = {
    fairyStates: new Map([["owner-1", { userId: "owner-1", onboardingCompleted: false, onboardingStep: "EMPTY_GARDEN",
      tutorialStep: null, tutorialCompletedAt: null, fairyNamedAt: null, tutorialFirstEventId: null,
      tutorialFirstFlowerId: null, tutorialFlowerPlantedAt: null, ...fairyState }]]),
    events, flowers, fairies, locks: []
  };
  const pick = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row });
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const fairyFor = where => where.userId_fairyType
    ? state.fairies.find(f => f.userId === where.userId_fairyType.userId && f.fairyType === where.userId_fairyType.fairyType)
    : state.fairies.find(f => f.id === where.id);
  state.db = {
    $transaction: async operation => operation(state.db),
    fairyState: {
      upsert: async ({ where, create, select }) => {
        if (!state.fairyStates.has(where.userId)) state.fairyStates.set(where.userId, { onboardingCompleted: false, ...create });
        return pick(state.fairyStates.get(where.userId), select);
      },
      update: async ({ where, data, select }) => pick(Object.assign(state.fairyStates.get(where.userId), data), select),
      updateMany: async ({ where, data }) => {
        const row = state.fairyStates.get(where.userId);
        const { userId, ...rest } = where;
        if (!row || !matches(row, rest)) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      }
    },
    event: {
      count: async ({ where }) => state.events.filter(row => matches(row, where)).length,
      findFirst: async ({ where, select }) => pick(state.events.find(row => matches(row, where)), select) || null
    },
    flower: {
      count: async ({ where }) => state.flowers.filter(row => matches(row, where)).length,
      findFirst: async ({ where, select }) => pick(state.flowers.find(row => matches(row, where)), select) || null
    },
    userFairy: {
      count: async ({ where }) => state.fairies.filter(row => matches(row, where)).length,
      findUnique: async ({ where, select }) => pick(fairyFor(where), select) || null,
      findFirst: async ({ where, select }) => pick(state.fairies.find(row => matches(row, where)), select) || null,
      update: async ({ where, data }) => Object.assign(fairyFor(where), data),
      create: async ({ data }) => {
        const { runtime, ...row } = data;
        const created = { id: `fairy-${state.fairies.length + 1}`, ...row, runtimeCreated: Boolean(runtime?.create) };
        state.fairies.push(created); return created;
      }
    }
  };
  return state;
}
const lock = state => async (_tx, namespace, value) => { state.locks.push(`${namespace}:${value}`); };
const update = (state, body) => updateOnboardingTutorial(state.db, { userId: "owner-1", body, now: NOW, lock: lock(state) });
const rejects = (promise, status, code) => assert.rejects(promise, error =>
  error instanceof OnboardingTutorialError && error.status === status && error.code === code);

test("the server step list matches the app's tour", async () => {
  const source = await readFile(path.join(root, "mobile/src/components/onboarding/onboardingSteps.ts"), "utf8");
  const list = source.slice(source.indexOf("ONBOARDING_STEPS = ["), source.indexOf("] as const"));
  assert.deepEqual([...list.matchAll(/'([a-z.]+)'/g)].map(match => match[1]), [...TUTORIAL_STEPS]);
});

test("fairy names are trimmed, bounded, kind and made of name characters", () => {
  assert.equal(normalizeFairyName("  Ming   Yue "), "Ming Yue");
  assert.equal(normalizeFairyName("小花"), "小花");
  assert.equal(normalizeFairyName("Amélie-Rose"), "Amélie-Rose");
  assert.equal(normalizeFairyName("花".repeat(FAIRY_NAME_MAX_LENGTH)).length, FAIRY_NAME_MAX_LENGTH);
  for (const [value, code] of [["", "FAIRY_NAME_REQUIRED"], ["   ", "FAIRY_NAME_REQUIRED"], [null, "FAIRY_NAME_REQUIRED"],
    ["花".repeat(FAIRY_NAME_MAX_LENGTH + 1), "FAIRY_NAME_TOO_LONG"], ["<b>Ann</b>", "FAIRY_NAME_INVALID"],
    ["line\nbreak\u0007", "FAIRY_NAME_INVALID"], ["傻逼", "FAIRY_NAME_REJECTED"]]) {
    assert.throws(() => normalizeFairyName(value), error => error.code === code, String(value));
  }
});

test("a new owner starts the tour; established owners are marked complete and never see it", async () => {
  const fresh = fakeDatabase();
  assert.deepEqual(await onboardingTutorialState(fresh.db, { userId: "owner-1", now: NOW }), {
    status: "active", step: "intro.name", fairyName: null, fairyNamed: false,
    firstEventId: null, firstFlowerId: null, flowerPlanted: false
  });
  for (const setup of [{ fairyState: { onboardingCompleted: true } }, { events: [{ id: "e1", ownerId: "owner-1" }] },
    { flowers: [{ id: "f1", userId: "owner-1" }] }, { fairies: [{ id: "u1", userId: "owner-1", fairyType: "BLOOM", name: "PPL" }] }]) {
    const established = fakeDatabase(setup);
    const view = await onboardingTutorialState(established.db, { userId: "owner-1", now: NOW });
    assert.equal(view.status, "completed");
    assert.equal(view.step, "done");
    assert.equal(established.fairyStates.get("owner-1").tutorialCompletedAt, NOW);
  }
  // Another owner's activity never counts.
  const other = fakeDatabase({ events: [{ id: "e1", ownerId: "owner-2" }] });
  assert.equal((await onboardingTutorialState(other.db, { userId: "owner-1", now: NOW })).status, "active");
});

test("naming saves her name on the starter Fairy and gates the rest of the tour", async () => {
  const state = fakeDatabase();
  await rejects(update(state, { step: "garden.zoom" }), 409, "FAIRY_NAME_REQUIRED");
  const named = await update(state, { fairyName: " Lumière ", step: "intro.celebrate" });
  assert.equal(named.fairyName, "Lumière");
  assert.equal(named.fairyNamed, true);
  assert.equal(named.step, "intro.celebrate");
  assert.deepEqual(state.fairies.map(({ fairyType, name, isActive, unlockSource, runtimeCreated }) =>
    ({ fairyType, name, isActive, unlockSource, runtimeCreated })), [
    { fairyType: "BLOOM", name: "Lumière", isActive: true, unlockSource: "ONBOARDING", runtimeCreated: true }]);
  assert.ok(state.locks.includes("onboarding-tutorial:owner-1") && state.locks.includes("fairy-owner:owner-1"));
  // Retrying the same name is harmless; it renames the same row, never a second Fairy.
  await update(state, { fairyName: "Lumière" });
  assert.equal(state.fairies.length, 1);
  await update(state, { step: "garden.zoom" });
  await rejects(update(state, { fairyName: "Other" }), 409, "FAIRY_ALREADY_NAMED");
});

test("steps only move forward and real Event, Flower and planting are required in order", async () => {
  const state = fakeDatabase({
    events: [{ id: "event-1", ownerId: "owner-1" }, { id: "event-x", ownerId: "owner-2" }],
    flowers: [{ id: "flower-1", userId: "owner-1", sourceEventId: "event-1" }, { id: "flower-x", userId: "owner-2", sourceEventId: "event-x" }]
  });
  await update(state, { fairyName: "Bloom", step: "intro.celebrate" });
  assert.equal((await update(state, { step: "event.save" })).step, "event.save");
  // Going back is ignored, not an error, so a resumed device cannot rewind the saved step.
  assert.equal((await update(state, { step: "garden.zoom" })).step, "event.save");
  await rejects(update(state, { step: "event.flower" }), 409, "FIRST_EVENT_REQUIRED");
  await rejects(update(state, { firstEventId: "event-x" }), 404, "EVENT_NOT_FOUND");
  await rejects(update(state, { firstEventId: "event-1", firstFlowerId: "flower-x" }), 404, "FLOWER_NOT_FOUND");
  const linked = await update(state, { firstEventId: "event-1", firstFlowerId: "flower-1", step: "event.flower" });
  assert.deepEqual([linked.firstEventId, linked.firstFlowerId, linked.step], ["event-1", "flower-1", "event.flower"]);
  // The same Event again is idempotent; a different one is refused (no duplicate first Event).
  await update(state, { firstEventId: "event-1" });
  await rejects(update(state, { firstEventId: "event-2" }), 409, "FIRST_EVENT_RECORDED");
  await rejects(update(state, { step: "plant.growth" }), 409, "FIRST_FLOWER_REQUIRED");
  const planted = await update(state, { flowerPlanted: true, step: "plant.growth" });
  assert.equal(planted.flowerPlanted, true);
  await rejects(update(state, { complete: true }), 409, "TOUR_UNFINISHED");
  assert.equal((await update(state, { step: "finale" })).step, "finale");
  const done = await update(state, { complete: true });
  assert.equal(done.status, "completed");
  const row = state.fairyStates.get("owner-1");
  assert.equal(row.onboardingCompleted, true);
  assert.equal(row.onboardingStep, "GARDEN_UNLOCKED");
  // Finished is final.
  assert.equal((await update(state, { step: "mailbox" })).status, "completed");
});

test("an Event that grew no Flower (daily limit) does not block the tour", async () => {
  const state = fakeDatabase({ events: [{ id: "event-1", ownerId: "owner-1" }] });
  await update(state, { fairyName: "Bloom", step: "intro.celebrate" });
  await update(state, { firstEventId: "event-1", step: "plant.growth" });
  await rejects(update(state, { flowerPlanted: true }), 409, "FLOWER_REQUIRED");
  assert.equal((await update(state, { step: "finale" })).step, "finale");
});

test("an Event saved just before the app closed is picked up as the tour's first Event", async () => {
  const state = fakeDatabase({ fairyState: { tutorialStep: "event.save", fairyNamedAt: NOW },
    events: [{ id: "event-1", ownerId: "owner-1", createdAt: NOW }],
    flowers: [{ id: "flower-1", userId: "owner-1", sourceEventId: "event-1" }] });
  const view = await onboardingTutorialState(state.db, { userId: "owner-1", now: NOW });
  assert.deepEqual([view.status, view.firstEventId, view.firstFlowerId], ["active", "event-1", "flower-1"]);
});

test("malformed updates are rejected before any write", async () => {
  const state = fakeDatabase();
  for (const [body, code] of [[{ step: "nowhere" }, "INVALID_STEP"], [{ step: "done" }, "INVALID_STEP"], [{ step: 3 }, "INVALID_STEP"],
    [{ firstEventId: "" }, "INVALID_REFERENCE"], [{ firstFlowerId: "x".repeat(129) }, "INVALID_REFERENCE"],
    [{ flowerPlanted: false }, "INVALID_FLAG"], [{ complete: "yes" }, "INVALID_FLAG"]]) {
    await rejects(update(state, body), 400, code);
  }
  assert.equal(state.locks.length, 0);
});

test("HTTP routes are owner-scoped, strict-bodied and uncached", async (t) => {
  const state = fakeDatabase();
  const restore = [];
  const stub = (model, method, implementation) => {
    const target = model ? prisma[model] : prisma, original = target[method];
    restore.push(() => { target[method] = original; });
    target[method] = implementation;
  };
  stub(null, "$transaction", async operation => operation({ ...state.db, $queryRaw: async () => [{ locked: "" }] }));
  stub("user", "findUnique", async ({ where }) => where.firebaseUid === "owner-uid" || where.id === "owner-1"
    ? { id: "owner-1", firebaseUid: "owner-uid", timezone: "UTC" } : null);
  for (const [model, methods] of Object.entries({ fairyState: ["upsert", "update", "updateMany"], event: ["count", "findFirst"],
    flower: ["count", "findFirst"], userFairy: ["count", "findUnique", "findFirst", "update", "create"] })) {
    for (const method of methods) stub(model, method, state.db[model][method]);
  }
  setFirebaseTokenVerifierForTests(async () => ({ uid: "owner-uid", email: "owner@example.test", email_verified: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    restore.forEach(fn => fn());
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, body, headers = { Authorization: "Bearer owner-token" }) => fetch(`${base}/api/onboarding`, {
    method, headers: { ...headers, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {})
  });

  const anonymous = await call("GET", null, {});
  assert.equal(anonymous.status, 401);
  const first = await call("GET");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal((await first.json()).step, "intro.name");
  // Identity is never taken from the body.
  assert.equal((await call("PATCH", { userId: "owner-2", fairyName: "Bloom" })).status, 400);
  const invalid = await call("PATCH", { fairyName: "" });
  assert.deepEqual([invalid.status, (await invalid.json()).code], [400, "FAIRY_NAME_REQUIRED"]);
  const named = await call("PATCH", { fairyName: "Bloom", step: "intro.celebrate" });
  assert.equal(named.status, 200);
  assert.deepEqual(await named.json(), { status: "active", step: "intro.celebrate", fairyName: "Bloom", fairyNamed: true,
    firstEventId: null, firstFlowerId: null, flowerPlanted: false });
  const blocked = await call("PATCH", { step: "event.flower" });
  assert.deepEqual([blocked.status, (await blocked.json()).code], [409, "FIRST_EVENT_REQUIRED"]);
});

test("migration adds nullable tour columns and completes the tour for every established owner", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
      .filter(item => item.isDirectory()).map(item => item.name).sort();
    assert.ok(names.includes(MIGRATION));
    for (const name of names.filter(name => name < MIGRATION)) {
      await db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    }
    await db.exec(`INSERT INTO "User" (id, name) VALUES ('new', 'N'), ('flag', 'F'), ('evt', 'E'), ('flw', 'W'), ('fry', 'Y');
      INSERT INTO "FairyState" (id, "userId", "onboardingCompleted", "updatedAt") VALUES
        ('s1', 'new', false, CURRENT_TIMESTAMP), ('s2', 'flag', true, CURRENT_TIMESTAMP), ('s3', 'evt', false, CURRENT_TIMESTAMP),
        ('s4', 'flw', false, CURRENT_TIMESTAMP), ('s5', 'fry', false, CURRENT_TIMESTAMP);
      INSERT INTO "Event" (id, "ownerId", content, "occurredAt", timezone, "localDate", "idempotencyKey", "updatedAt")
        VALUES ('e1', 'evt', 'x', CURRENT_TIMESTAMP, 'UTC', '2026-10-01', 'k1', CURRENT_TIMESTAMP);
      INSERT INTO "UserFairy" (id, "userId", "fairyType", name, "unlockSource", "updatedAt")
        VALUES ('uf', 'fry', 'BLOOM', 'PPL', 'ONBOARDING', CURRENT_TIMESTAMP);`);
    // Fill only the columns a row requires, so the test follows the real schema.
    const insert = async (table, values) => {
      const required = (await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'
        AND is_nullable = 'NO' AND column_default IS NULL`)).rows.filter(row => !(row.column_name in values));
      const filler = type => /int|numeric|double|real/.test(type) ? "0" : /timestamp/.test(type) ? "CURRENT_TIMESTAMP"
        : /bool/.test(type) ? "false" : /json/.test(type) ? "'{}'" : "'x'";
      await db.exec(`INSERT INTO "${table}" (${[...Object.keys(values), ...required.map(row => row.column_name)].map(c => `"${c}"`).join(", ")})
        VALUES (${[...Object.values(values), ...required.map(row => filler(row.data_type))].join(", ")})`);
    };
    await insert("Garden", { id: "'g1'", ownerId: "'flw'" });
    await insert("Flower", { id: "'f1'", userId: "'flw'", gardenId: "'g1'" });
    await db.exec(await readFile(path.join(root, "prisma/migrations", MIGRATION, "migration.sql"), "utf8"));
    const rows = (await db.query(`SELECT "userId", "tutorialStep", "tutorialCompletedAt" IS NOT NULL AS done, "fairyNamedAt",
      "tutorialFirstEventId", "tutorialFirstFlowerId", "tutorialFlowerPlantedAt" FROM "FairyState" ORDER BY "userId"`)).rows;
    assert.deepEqual(rows.map(row => [row.userId, row.done, row.tutorialStep]),
      [["evt", true, "done"], ["flag", true, "done"], ["flw", true, "done"], ["fry", true, "done"], ["new", false, null]]);
    assert.ok(rows.every(row => row.fairyNamedAt === null && row.tutorialFirstEventId === null && row.tutorialFlowerPlantedAt === null));
  } finally { await db.close(); }
});
