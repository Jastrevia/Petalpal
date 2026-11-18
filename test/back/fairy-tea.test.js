import assert from "node:assert/strict";
import test from "node:test";
import { finishTea, startTea, teaState, TEA_RULES } from "../../lib/fairy-tea.js";

const USER = "user_1762000000001";
const T0 = new Date("2026-11-18T02:00:00Z"); // 10:00 in Shanghai
const later = ms => new Date(T0.getTime() + ms);

function fakeDb() {
  const sessions = [];
  let ids = 0;
  const match = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const sorted = (rows, orderBy) => {
    const [key, dir] = Object.entries(orderBy ?? {})[0] ?? [];
    return key ? [...rows].sort((a, b) => (dir === "desc" ? -1 : 1) * ((a[key]?.getTime?.() ?? 0) - (b[key]?.getTime?.() ?? 0))) : rows;
  };
  const db = {
    sessions,
    $queryRaw: async () => [{ locked: "" }],
    user: { findUnique: async () => ({ timezone: "Asia/Shanghai", preferredLocale: "zh-Hans" }) },
    fairyTeaSession: {
      findMany: async ({ where, orderBy }) => sorted(sessions.filter(row => match(row, where)), orderBy),
      findFirst: async ({ where, orderBy }) => sorted(sessions.filter(row => match(row, where)), orderBy)[0] ?? null,
      create: async ({ data }) => { const row = { id: `tea${String(++ids).padStart(10, "0")}`, finishedAt: null, ...data }; sessions.push(row); return row; },
      updateMany: async ({ where, data }) => {
        const rows = sessions.filter(row => match(row, where));
        rows.forEach(row => Object.assign(row, data)); return { count: rows.length };
      }
    }
  };
  db.$transaction = fn => fn(db);
  return db;
}
const award = calls => async (db, args) => { calls.push(args); return { awarded: 3, levelUp: null }; };

test("tea: start, second tap reuses the session, no instant finish, Bond points once per tea", async () => {
  const db = fakeDb(), calls = [];
  const state = await teaState(db, USER, { now: T0 });
  assert.deepEqual(state.drinks.map(drink => drink.name), ["花草茶", "玫瑰茶", "蜂蜜咖啡"]);
  assert.equal(state.session, null); assert.equal(state.nextAvailableAt, null);
  const session = await startTea(db, USER, { drink: "rose-tea" }, { now: T0 });
  assert.equal((await startTea(db, USER, { drink: "flower-tea" }, { now: later(1000) })).id, session.id);
  await assert.rejects(finishTea(db, USER, session.id, { now: later(TEA_RULES.minBrewMs - 1), award: award(calls) }), { code: "TEA_TOO_FAST" });
  const done = await finishTea(db, USER, session.id, { now: later(TEA_RULES.minBrewMs), award: award(calls) });
  assert.equal(done.session.status, "FINISHED"); assert.equal(done.awarded, 3); assert.equal(done.repeated, false);
  assert.deepEqual(calls[0], { userId: USER, source: "TEA", key: `tea:${session.id}`, now: later(TEA_RULES.minBrewMs) });
  assert.equal((await finishTea(db, USER, session.id, { now: later(9000), award: award(calls) })).repeated, true);
  await assert.rejects(finishTea(db, "user_1762000000002", session.id, { now: later(9000), award: award(calls) }), { code: "TEA_NOT_FOUND" });
  await assert.rejects(startTea(db, USER, { drink: "beer" }, { now: T0 }), { code: "TEA_INVALID" });
});

test("tea: cooldown between teas, three a local day, cold after 10 minutes", async () => {
  const db = fakeDb(), calls = [];
  let t = 0;
  for (let i = 0; i < TEA_RULES.dailyLimit; i++) {
    const session = await startTea(db, USER, { drink: "flower-tea" }, { now: later(t) });
    await finishTea(db, USER, session.id, { now: later(t + 10_000), award: award(calls) });
    if (i === 0) await assert.rejects(startTea(db, USER, { drink: "flower-tea" }, { now: later(t + 60_000) }), { code: "TEA_COOLDOWN" });
    t += 10_000 + TEA_RULES.cooldownMs;
  }
  await assert.rejects(startTea(db, USER, { drink: "flower-tea" }, { now: later(t) }), error =>
    error.code === "TEA_DAILY_LIMIT" && error.extra.nextAvailableAt === "2026-11-18T16:00:00.000Z"); // local midnight in Shanghai
  const tomorrow = new Date("2026-11-18T16:00:01Z");
  const fresh = await startTea(db, USER, { drink: "honey-coffee" }, { now: tomorrow });
  await assert.rejects(finishTea(db, USER, fresh.id, { now: new Date(tomorrow.getTime() + TEA_RULES.expireMs + 1), award: award(calls) }), { code: "TEA_EXPIRED" });
  assert.equal((await teaState(db, USER, { now: new Date(tomorrow.getTime() + TEA_RULES.expireMs + 2) })).session, null);
});
