import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { DAILY_FLOWER_LIMIT, flowerQuotaToday, reserveFlowerPlanting } from "../../lib/flower-quota.js";

// Behaves like the conditional upsert: a new day starts at 1; an existing day goes up only
// while it is under the limit, and returns no row once the day is full.
function fakeQuotaDb() {
  const days = new Map();
  return {
    days,
    async $queryRawUnsafe(sql, userId, localDate, limit) {
      assert.match(sql, /flower-quota:reserve/);
      const key = `${userId}|${localDate}`;
      if (!days.has(key)) { days.set(key, 1); return [{ planted: 1 }]; }
      if (days.get(key) >= limit) return [];
      days.set(key, days.get(key) + 1);
      return [{ planted: days.get(key) }];
    },
    dailyFlowerQuota: {
      async findUnique({ where }) {
        const { userId, localDate } = where.userId_localDate;
        const planted = days.get(`${userId}|${localDate}`);
        return planted === undefined ? null : { userId, localDate, planted };
      }
    }
  };
}

test("two flowers a day; the third is refused and the next day starts fresh", async (t) => {
  const previous = process.env.DAILY_GROW_LIMIT_ENABLED;
  delete process.env.DAILY_GROW_LIMIT_ENABLED;
  t.after(() => { if (previous === undefined) delete process.env.DAILY_GROW_LIMIT_ENABLED; else process.env.DAILY_GROW_LIMIT_ENABLED = previous; });
  const db = fakeQuotaDb();
  const day = { userId: "alice", localDate: "2026-10-22" };
  assert.equal(DAILY_FLOWER_LIMIT, 2);
  assert.deepEqual(await flowerQuotaToday(db, day), { localDate: "2026-10-22", limit: 2, planted: 0, remaining: 2 });
  assert.deepEqual(await reserveFlowerPlanting(db, day), { granted: true, limit: 2, planted: 1 });
  assert.deepEqual(await reserveFlowerPlanting(db, day), { granted: true, limit: 2, planted: 2 });
  assert.deepEqual(await reserveFlowerPlanting(db, day), { granted: false, limit: 2, planted: 2 });
  assert.equal((await flowerQuotaToday(db, day)).remaining, 0);
  // Deleting a flower touches Flower rows only, so the day stays full.
  assert.equal(db.days.get("alice|2026-10-22"), 2);
  assert.equal((await reserveFlowerPlanting(db, { userId: "alice", localDate: "2026-10-23" })).granted, true);
  assert.equal((await reserveFlowerPlanting(db, { userId: "bob", localDate: "2026-10-22" })).granted, true);
});

test("DAILY_GROW_LIMIT_ENABLED=false lifts the limit without touching the table", async (t) => {
  const previous = process.env.DAILY_GROW_LIMIT_ENABLED;
  process.env.DAILY_GROW_LIMIT_ENABLED = "false";
  t.after(() => { if (previous === undefined) delete process.env.DAILY_GROW_LIMIT_ENABLED; else process.env.DAILY_GROW_LIMIT_ENABLED = previous; });
  const untouched = { $queryRawUnsafe: () => assert.fail("no query"), dailyFlowerQuota: { findUnique: () => assert.fail("no query") } };
  assert.deepEqual(await reserveFlowerPlanting(untouched, { userId: "alice", localDate: "2026-10-22" }), { granted: true, limit: null, planted: null });
  assert.equal((await flowerQuotaToday(untouched, { userId: "alice", localDate: "2026-10-22" })).limit, null);
});

test("the reserve SQL runs on Postgres with the real migration and stops at two", async (t) => {
  const previous = process.env.DAILY_GROW_LIMIT_ENABLED;
  delete process.env.DAILY_GROW_LIMIT_ENABLED;
  const pg = new PGlite();
  t.after(async () => { await pg.close(); if (previous === undefined) delete process.env.DAILY_GROW_LIMIT_ENABLED; else process.env.DAILY_GROW_LIMIT_ENABLED = previous; });
  await pg.exec('CREATE TABLE "User" ("id" text PRIMARY KEY, "emailVerifiedAt" timestamp(3) DEFAULT now()); INSERT INTO "User" VALUES (\'alice\');');
  await pg.exec(await readFile(new URL("../../prisma/migrations/202610240001_daily_flower_quota/migration.sql", import.meta.url), "utf8"));
  const tx = { $queryRawUnsafe: async (sql, ...params) => (await pg.query(sql, params)).rows };
  const day = { userId: "alice", localDate: "2026-10-22" };
  const results = await Promise.all([1, 2, 3, 4].map(() => reserveFlowerPlanting(tx, day)));
  assert.equal(results.filter(result => result.granted).length, 2);
  assert.deepEqual(results.filter(result => result.granted).map(result => result.planted).sort(), [1, 2]);
  assert.deepEqual((await pg.query('SELECT "planted" FROM "DailyFlowerQuota"')).rows, [{ planted: 2 }]);
  assert.equal((await reserveFlowerPlanting(tx, { userId: "alice", localDate: "2026-10-23" })).planted, 1);
});
