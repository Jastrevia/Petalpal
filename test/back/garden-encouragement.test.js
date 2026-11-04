import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import {
  GARDEN_NOTE_MAX_LENGTH,
  encouragementDay,
  getGardenEncouragementState,
  giveGardenSupport,
  leaveGardenNote,
  listGardenEncouragements,
  markGardenEncouragementsRead,
  validateGardenNote
} from "../../lib/garden-encouragement.js";
import { server } from "../../server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COMMUNITY = "petalpal-community-2026-10-15";

// Real migrations in a disposable PostgreSQL (PGlite): the unique index, CHECK
// constraints, cascades and ON CONFLICT behavior are the production ones.
async function migratedDatabase() {
  const db = new PGlite({ extensions: { vector } });
  const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
    .filter(item => item.isDirectory()).map(item => item.name).sort();
  for (const name of names) await db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
  // Alice (Vancouver) and Cara are Bea's friends; Dan is Alice's friend; Eve is not a friend.
  await db.exec(`
    INSERT INTO "User" (id, name, avatar, timezone, "firebaseUid", "communityTermsVersion") VALUES
      ('alice', 'Alice', 'fairy-3', 'America/Vancouver', 'alice', '${COMMUNITY}'),
      ('bea', 'Bea', '🌷', 'Asia/Shanghai', 'bea', '${COMMUNITY}'),
      ('cara', 'Cara', '🦋', 'UTC', 'cara', '${COMMUNITY}'),
      ('dan', 'Dan', '🦋', 'UTC', 'dan', '${COMMUNITY}'),
      ('eve', 'Eve', '🦋', 'UTC', 'eve', '${COMMUNITY}'),
      ('newbie', 'Newbie', '🦋', 'UTC', 'newbie', NULL);
    INSERT INTO "Friendship" (id, "userId", "friendId") VALUES
      ('f1', 'bea', 'alice'), ('f2', 'alice', 'bea'), ('f3', 'bea', 'cara'), ('f4', 'cara', 'bea'),
      ('f5', 'dan', 'alice'), ('f6', 'alice', 'dan'), ('f7', 'bea', 'newbie'), ('f8', 'newbie', 'bea');
  `);
  return db;
}

const project = (row, select) => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row;

// Translates the where clauses garden-encouragement.js uses into SQL.
function encouragementWhere(where, params, alias = "e") {
  const clauses = [];
  const add = value => { params.push(value instanceof Date ? value.toISOString() : value); return `$${params.length}`; };
  for (const [key, value] of Object.entries(where)) {
    const column = `${alias}."${key}"`;
    if (key === "OR") clauses.push(`(${value.map(part => encouragementWhere(part, params, alias)).join(" OR ")})`);
    else if (value === null) clauses.push(`${column} IS NULL`);
    else if (value?.in) clauses.push(`${column} = ANY(${add(value.in)}::text[])`);
    else if (value?.notIn) clauses.push(`NOT (${column} = ANY(${add(value.notIn)}::text[]))`);
    else if (value?.gte || value?.lt) {
      if (value.gte) clauses.push(`${column} >= ${add(value.gte)}`);
      if (value.lt) clauses.push(`${column} < ${add(value.lt)}`);
    } else clauses.push(`${column} = ${add(value)}`);
  }
  return clauses.length ? clauses.join(" AND ") : "TRUE";
}

function adapter(db, calls = { creates: 0 }) {
  const first = async (sql, params = []) => (await db.query(sql, params)).rows[0] || null;
  return {
    $queryRawUnsafe: async (sql, ...params) => (await db.query(sql, params)).rows,
    $transaction: callback => db.transaction(tx => callback(adapter(tx, calls))),
    user: {
      findUnique: async ({ where, select }) => {
        const row = await first(`SELECT * FROM "User" WHERE ${where.firebaseUid ? '"firebaseUid"' : "id"} = $1`,
          [where.firebaseUid || where.id]);
        return row ? project(row, select) : null;
      },
      findFirst: ({ where }) => first('SELECT id FROM "User" WHERE "socialRestricted" = true AND id = ANY($1::text[])', [where.id.in]),
      findMany: async () => (await db.query('SELECT id FROM "User" WHERE "socialRestricted" = true')).rows
    },
    userBlock: {
      findFirst: ({ where }) => first('SELECT "blockerId" FROM "UserBlock" WHERE ("blockerId"=$1 AND "blockedId"=$2) OR ("blockerId"=$2 AND "blockedId"=$1)',
        [where.OR[0].blockerId, where.OR[0].blockedId]),
      findMany: async ({ where }) => (await db.query('SELECT * FROM "UserBlock" WHERE "blockerId"=$1 OR "blockedId"=$1', [where.OR[0].blockerId])).rows
    },
    friendship: {
      findUnique: ({ where }) => first('SELECT id FROM "Friendship" WHERE "userId"=$1 AND "friendId"=$2',
        [where.userId_friendId.userId, where.userId_friendId.friendId])
    },
    gardenEncouragement: {
      async createMany({ data, skipDuplicates }) {
        assert.equal(skipDuplicates, true, "inserts must not abort the social transaction on a duplicate");
        calls.creates++;
        let count = 0;
        for (const row of data) {
          const result = await db.query(`INSERT INTO "GardenEncouragement"
            (id, "senderId", "ownerId", kind, text, "localDate", timezone, "createdAt")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [randomUUID(), row.senderId, row.ownerId, row.kind, row.text, row.localDate, row.timezone, row.createdAt.toISOString()]);
          count += result.affectedRows;
        }
        return { count };
      },
      async findMany({ where, select, orderBy, take, cursor, skip }) {
        const params = [];
        // Timestamps are UTC (as Prisma reads them), whatever this machine's zone.
        let sql = `SELECT e.id, e.kind, e.text, e."senderId", e."localDate",
          e."createdAt" AT TIME ZONE 'UTC' AS "createdAt", e."readAt" AT TIME ZONE 'UTC' AS "readAt",
          u.name AS "senderName", u.avatar AS "senderAvatar" FROM "GardenEncouragement" e
          JOIN "User" u ON u.id = e."senderId" WHERE ${encouragementWhere(where, params)}`;
        if (cursor) {
          params.push(cursor.id);
          sql += ` AND (e."createdAt", e.id) <= (SELECT "createdAt", id FROM "GardenEncouragement" WHERE id = $${params.length})`;
        }
        if (orderBy) sql += ' ORDER BY e."createdAt" DESC, e.id DESC';
        let rows = (await db.query(sql, params)).rows;
        if (skip) rows = rows.slice(skip);
        if (take) rows = rows.slice(0, take);
        return rows.map(row => {
          const value = { ...row, sender: { id: row.senderId, name: row.senderName, avatar: row.senderAvatar } };
          return project(value, select);
        });
      },
      async count({ where }) {
        const params = [];
        return (await db.query(`SELECT count(*)::int AS n FROM "GardenEncouragement" e WHERE ${encouragementWhere(where, params)}`, params)).rows[0].n;
      },
      async updateMany({ where, data }) {
        const params = [data.readAt.toISOString()];
        const result = await db.query(`UPDATE "GardenEncouragement" e SET "readAt" = $1 WHERE ${encouragementWhere(where, params)}`, params);
        return { count: result.affectedRows };
      }
    }
  };
}

const NOON_VANCOUVER = new Date("2026-10-25T19:00:00Z"); // 12:00 in Vancouver, 03:00 next day in Shanghai

test("note validation trims, rejects empty, overlong and malformed text, and counts emoji as one", () => {
  assert.equal(validateGardenNote("  Your flowers look peaceful today.  "), "Your flowers look peaceful today.");
  assert.equal(validateGardenNote("line one\r\nline two"), "line one\nline two");
  for (const empty of ["", "   ", "\n\t "]) {
    assert.throws(() => validateGardenNote(empty), error => error.status === 400 && error.code === "NOTE_EMPTY");
  }
  for (const invalid of [undefined, null, 42, ["hi"], { text: "hi" }, "bell\u0007", "rtl‮trick"]) {
    assert.throws(() => validateGardenNote(invalid), error => error.status === 400 && error.code === "NOTE_INVALID");
  }
  assert.equal(validateGardenNote("🌷".repeat(GARDEN_NOTE_MAX_LENGTH)).length, GARDEN_NOTE_MAX_LENGTH * 2);
  assert.throws(() => validateGardenNote("a".repeat(GARDEN_NOTE_MAX_LENGTH + 1)),
    error => error.status === 413 && error.code === "NOTE_TOO_LONG");
});

test("the day is the visitor's account-timezone date and resets at their local midnight", () => {
  const day = encouragementDay("America/Vancouver", NOON_VANCOUVER);
  assert.equal(day.localDate, "2026-10-25");
  assert.equal(day.startsAt.toISOString(), "2026-10-25T07:00:00.000Z");
  assert.equal(day.resetsAt.toISOString(), "2026-10-26T07:00:00.000Z");
  // British Columbia stays on UTC-7 from 2026-11-01 (time.md §5): no 25-hour day.
  const change = encouragementDay("America/Vancouver", new Date("2026-11-01T12:00:00Z"));
  assert.equal(change.resetsAt.getTime() - change.startsAt.getTime(), 24 * 3_600_000);
  assert.equal(encouragementDay("Not/AZone", NOON_VANCOUVER).timezone, "UTC");
});

test("daily Support and notes persist with per-friend, per-day limits", async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());
  const client = adapter(db);
  const state = (viewer = "alice", owner = "bea", now = NOON_VANCOUVER) =>
    getGardenEncouragementState(client, { ownerUserId: owner, viewerUserId: viewer, now });
  const rows = async () => (await db.query('SELECT * FROM "GardenEncouragement" ORDER BY "createdAt", id')).rows;

  await t.test("opening a friend's Garden starts with nothing given today", async () => {
    const before = await state();
    assert.deepEqual({ ...before, owner: before.owner.name }, {
      owner: "Bea", localDate: "2026-10-25", timezone: "America/Vancouver", resetsAt: "2026-10-26T07:00:00.000Z",
      hasSupportedToday: false, hasMessagedToday: false, messageMaxLength: 200
    });
  });

  await t.test("a visitor can support a friend once; a second Support the same day is rejected", async () => {
    const supported = await giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "alice", now: NOON_VANCOUVER });
    assert.equal(supported.hasSupportedToday, true);
    assert.equal(supported.hasMessagedToday, false, "supported but not messaged");
    await assert.rejects(giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "alice", now: new Date(NOON_VANCOUVER.getTime() + 60_000) }),
      error => error.status === 409 && error.code === "ALREADY_SUPPORTED_TODAY" && error.state.hasSupportedToday === true);
    assert.equal((await rows()).length, 1);
  });

  await t.test("refreshing reads the same server state", async () => {
    const refreshed = await state();
    assert.equal(refreshed.hasSupportedToday, true);
    assert.equal(refreshed.hasMessagedToday, false);
  });

  await t.test("the same visitor can still support another friend that day", async () => {
    assert.equal((await giveGardenSupport(client, { ownerUserId: "dan", viewerUserId: "alice", now: NOON_VANCOUVER })).hasSupportedToday, true);
    assert.equal((await state("alice", "dan")).hasSupportedToday, true);
  });

  await t.test("a visitor can leave one note; a second note the same day is rejected", async () => {
    const left = await leaveGardenNote(client, { ownerUserId: "bea", viewerUserId: "alice",
      text: "  Your flowers look especially peaceful today.  ", now: new Date(NOON_VANCOUVER.getTime() + 120_000) });
    assert.deepEqual([left.hasSupportedToday, left.hasMessagedToday], [true, true], "support and message on the same day");
    await assert.rejects(leaveGardenNote(client, { ownerUserId: "bea", viewerUserId: "alice", text: "Another one", now: NOON_VANCOUVER }),
      error => error.status === 409 && error.code === "ALREADY_MESSAGED_TODAY" && error.state.hasMessagedToday === true);
    const notes = (await rows()).filter(row => row.kind === "MESSAGE");
    assert.equal(notes.length, 1);
    assert.equal(notes[0].text, "Your flowers look especially peaceful today.");
  });

  await t.test("a visitor can message without supporting", async () => {
    const left = await leaveGardenNote(client, { ownerUserId: "bea", viewerUserId: "cara", text: "Thinking of you 🌷", now: NOON_VANCOUVER });
    assert.deepEqual([left.hasSupportedToday, left.hasMessagedToday], [false, true]);
  });

  await t.test("empty, overlong and malformed notes write nothing", async () => {
    const count = (await rows()).length;
    for (const text of ["   ", "x".repeat(201), 7, "\u0000"]) {
      await assert.rejects(leaveGardenNote(client, { ownerUserId: "bea", viewerUserId: "dan", text, now: NOON_VANCOUVER }),
        error => [400, 413].includes(error.status));
    }
    assert.equal((await rows()).length, count);
  });

  await t.test("rapid repeated and parallel submissions create exactly one record each", async () => {
    const tomorrow = new Date("2026-10-26T19:00:00Z");
    const attempts = await Promise.allSettled([
      ...Array.from({ length: 6 }, () => giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "alice", now: tomorrow })),
      ...Array.from({ length: 6 }, () => leaveGardenNote(client, { ownerUserId: "bea", viewerUserId: "alice", text: "Again tomorrow", now: tomorrow }))
    ]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 2);
    assert.ok(attempts.filter(result => result.status === "rejected").every(result => result.reason.status === 409));
    const tomorrowRows = (await rows()).filter(row => row.localDate === "2026-10-26");
    assert.deepEqual(tomorrowRows.map(row => row.kind).sort(), ["MESSAGE", "SUPPORT"]);
  });

  await t.test("the database itself refuses a duplicate and a self-addressed row", async () => {
    await assert.rejects(db.query(`INSERT INTO "GardenEncouragement" (id, "senderId", "ownerId", kind, "localDate", timezone)
      VALUES ('dup', 'alice', 'bea', 'SUPPORT', '2026-10-25', 'UTC')`), /unique/i);
    await assert.rejects(db.query(`INSERT INTO "GardenEncouragement" (id, "senderId", "ownerId", kind, "localDate", timezone)
      VALUES ('self', 'bea', 'bea', 'SUPPORT', '2030-01-01', 'UTC')`), /check/i);
    await assert.rejects(db.query(`INSERT INTO "GardenEncouragement" (id, "senderId", "ownerId", kind, text, "localDate", timezone)
      VALUES ('blank', 'dan', 'alice', 'MESSAGE', '  ', '2030-01-01', 'UTC')`), /check/i);
  });

  await t.test("the next local day allows Support again", async () => {
    const nextDay = new Date("2026-10-27T07:00:00Z"); // 00:00 on the 27th in Vancouver
    assert.equal((await state("alice", "bea", nextDay)).hasSupportedToday, false);
    assert.equal((await giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "alice", now: nextDay })).localDate, "2026-10-27");
  });

  await t.test("non-friends, the owner, unknown Gardens and unaccepted guidelines are refused", async () => {
    await assert.rejects(giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "eve", now: NOON_VANCOUVER }), error => error.status === 403);
    await assert.rejects(giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "bea", now: NOON_VANCOUVER }),
      error => error.status === 403 && error.code === "OWN_GARDEN");
    await assert.rejects(getGardenEncouragementState(client, { ownerUserId: "gone", viewerUserId: "alice", now: NOON_VANCOUVER }), error => error.status === 404);
    await assert.rejects(giveGardenSupport(client, { ownerUserId: "bea", viewerUserId: "newbie", now: NOON_VANCOUVER }),
      error => error.status === 428 && error.code === "COMMUNITY_ACCEPTANCE_REQUIRED");
  });

  await t.test("the owner sees today's and total Support, unread counts and notes with their senders", async () => {
    // 2026-10-25T19:00Z is already the 26th in Shanghai: the owner's today runs 2026-10-25T16:00Z–2026-10-26T16:00Z.
    const received = await listGardenEncouragements(client, { ownerUserId: "bea", now: new Date("2026-10-25T20:00:00Z") });
    assert.equal(received.localDate, "2026-10-26");
    assert.deepEqual(received.support, { today: 1, total: 3, unread: 3 });
    assert.equal(received.messages.today, 2);
    assert.equal(received.messages.unread, 3);
    assert.deepEqual(received.messages.items.map(note => [note.sender.name, note.text]), [
      ["Alice", "Again tomorrow"],
      ["Alice", "Your flowers look especially peaceful today."],
      ["Cara", "Thinking of you 🌷"]
    ]);
    const alice = received.messages.items[1];
    assert.deepEqual(alice.sender, { id: "alice", name: "Alice", avatar: "fairy-3" });
    assert.equal(alice.read, false);
    assert.equal(alice.createdAt, "2026-10-25T19:02:00.000Z");
    assert.equal(received.messages.nextCursor, null);
  });

  await t.test("reading a note and seeing Support clears only the owner's unread state", async () => {
    const ids = (await listGardenEncouragements(client, { ownerUserId: "bea", now: NOON_VANCOUVER })).messages.items.map(note => note.id);
    assert.deepEqual(await markGardenEncouragementsRead(client, { ownerUserId: "dan", messageIds: ids, supports: true }), { updated: 1 },
      "Dan can only mark his own received Support");
    assert.deepEqual(await markGardenEncouragementsRead(client, { ownerUserId: "bea", messageIds: [ids[0]] }), { updated: 1 });
    assert.deepEqual(await markGardenEncouragementsRead(client, { ownerUserId: "bea", supports: true }), { updated: 3 });
    const after = await listGardenEncouragements(client, { ownerUserId: "bea", now: NOON_VANCOUVER });
    assert.equal(after.support.unread, 0);
    assert.equal(after.messages.unread, 2);
    assert.deepEqual(after.messages.items.map(note => note.read), [true, false, false]);
  });

  await t.test("a blocked sender's notes and Support are hidden from the owner", async () => {
    await db.exec(`INSERT INTO "UserBlock" ("blockerId", "blockedId") VALUES ('bea', 'cara')`);
    const received = await listGardenEncouragements(client, { ownerUserId: "bea", now: NOON_VANCOUVER });
    assert.ok(received.messages.items.every(note => note.sender.id !== "cara"));
    await db.exec(`DELETE FROM "UserBlock"`);
  });

  await t.test("an owner with nothing received gets zero counts and an empty list", async () => {
    const received = await listGardenEncouragements(client, { ownerUserId: "eve", now: NOON_VANCOUVER });
    assert.deepEqual(received.support, { today: 0, total: 0, unread: 0 });
    assert.deepEqual(received.messages, { today: 0, unread: 0, items: [], nextCursor: null });
  });

  await t.test("many notes page newest first, 50 at a time", async () => {
    // Sixty days of notes from Alice to Dan, one per day.
    const values = Array.from({ length: 60 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10);
      return `('n${index}', 'alice', 'dan', 'MESSAGE', 'Note ${index}', '${day}', 'UTC', '${day}T12:00:00Z')`;
    });
    await db.exec(`INSERT INTO "GardenEncouragement" (id, "senderId", "ownerId", kind, text, "localDate", timezone, "createdAt")
      VALUES ${values.join(",")}`);
    const first = await listGardenEncouragements(client, { ownerUserId: "dan", now: NOON_VANCOUVER });
    assert.equal(first.messages.items.length, 50);
    assert.equal(first.messages.items[0].text, "Note 59");
    const second = await listGardenEncouragements(client, { ownerUserId: "dan", cursor: first.messages.nextCursor, now: NOON_VANCOUVER });
    assert.equal(second.messages.items.length, 10);
    assert.equal(second.messages.items.at(-1).text, "Note 0");
    assert.equal(second.messages.nextCursor, null);
  });

  await t.test("deleting an account removes what it sent and received", async () => {
    await db.exec(`DELETE FROM "User" WHERE id = 'cara'`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM "GardenEncouragement" WHERE "senderId" = 'cara'`)).rows[0].n, 0);
    await assert.rejects(getGardenEncouragementState(client, { ownerUserId: "cara", viewerUserId: "bea", now: NOON_VANCOUVER }),
      error => error.status === 404);
  });
});

test("HTTP routes enforce the daily limit on the server and survive refresh", { timeout: 30000 }, async (t) => {
  const db = await migratedDatabase();
  const client = adapter(db);
  const restore = [];
  const stub = (model, method, implementation) => {
    const target = model ? prisma[model] : prisma, original = target[method];
    restore.push(() => { target[method] = original; });
    target[method] = implementation;
  };
  stub(null, "$transaction", client.$transaction);
  stub(null, "$queryRawUnsafe", client.$queryRawUnsafe);
  for (const model of ["user", "userBlock", "friendship", "gardenEncouragement"]) {
    for (const [method, implementation] of Object.entries(client[model])) stub(model, method, implementation);
  }
  setFirebaseTokenVerifierForTests(async token => ({ uid: token, email_verified: true }));
  server.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    restore.forEach(fn => fn());
    setFirebaseTokenVerifierForTests();
    await db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(route, token = "alice", method = "GET", body) {
    const response = await fetch(`${base}${route}`, { method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }

  const opened = await call("/users/bea/garden-encouragement");
  assert.equal(opened.status, 200);
  assert.deepEqual([opened.body.hasSupportedToday, opened.body.hasMessagedToday], [false, false]);

  const doubleTap = await Promise.all([1, 2, 3].map(() => call("/users/bea/garden-encouragement/support", "alice", "POST", {})));
  assert.deepEqual(doubleTap.map(result => result.status).sort(), [201, 409, 409]);
  const rejected = doubleTap.find(result => result.status === 409).body;
  assert.equal(rejected.code, "ALREADY_SUPPORTED_TODAY");
  assert.equal(rejected.state.hasSupportedToday, true);

  const refreshed = await call("/users/bea/garden-encouragement");
  assert.deepEqual([refreshed.body.hasSupportedToday, refreshed.body.hasMessagedToday], [true, false]);

  assert.equal((await call("/users/bea/garden-encouragement/message", "alice", "POST", { text: "   " })).status, 400);
  assert.equal((await call("/users/bea/garden-encouragement/message", "alice", "POST", { text: "x".repeat(201) })).status, 413);
  assert.equal((await call("/users/bea/garden-encouragement/message", "alice", "POST", { text: "hi", senderId: "cara" })).status, 400,
    "identity fields cannot be supplied by the client");
  assert.equal((await call("/users/bea/garden-encouragement/support", "alice", "POST", { localDate: "2020-01-01" })).status, 400,
    "the day cannot be supplied by the client");
  const sent = await call("/users/bea/garden-encouragement/message", "alice", "POST", { text: "Your flowers look peaceful today." });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.hasMessagedToday, true);
  const again = await call("/users/bea/garden-encouragement/message", "alice", "POST", { text: "One more" });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "ALREADY_MESSAGED_TODAY");

  assert.equal((await call("/users/bea/garden-encouragement/support", "eve", "POST", {})).status, 403, "not a friend");
  assert.equal((await call("/users/nobody/garden-encouragement", "alice")).status, 404, "friend account no longer exists");
  assert.equal((await call("/users/bea/garden-encouragement", "bea")).body.code, "OWN_GARDEN");

  const received = await call("/users/me/garden-encouragements", "bea");
  assert.equal(received.status, 200);
  assert.equal(received.body.support.total, 1);
  assert.equal(received.body.messages.items[0].sender.name, "Alice");
  assert.equal(received.body.messages.items[0].text, "Your flowers look peaceful today.");
  assert.equal((await call("/users/me/garden-encouragements?cursor=../x", "bea")).status, 400);
  assert.equal((await call("/users/me/garden-encouragements/read", "bea", "POST", { messageIds: "all" })).status, 400);
  const read = await call("/users/me/garden-encouragements/read", "bea", "POST",
    { messageIds: [received.body.messages.items[0].id], supports: true });
  assert.deepEqual(read.body, { updated: 2 });
  const after = await call("/users/me/garden-encouragements", "bea");
  assert.deepEqual([after.body.support.unread, after.body.messages.unread], [0, 0]);
});
