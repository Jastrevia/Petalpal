import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { installMailbox, MAILBOX_LETTER_IDS } from "../../lib/mailbox.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// In-memory MailboxLetterState behind the calls the routes make.
function harness() {
  const rows = []; let failWrites = false;
  const find = (userId, letterId) => rows.find(row => row.userId === userId && row.letterId === letterId);
  const db = { mailboxLetterState: {
    findMany: async ({ where }) => rows.filter(row => row.userId === where.userId),
    findUnique: async ({ where }) => find(where.userId_letterId.userId, where.userId_letterId.letterId) ?? null,
    upsert: async ({ where, create }) => {
      const { userId, letterId } = where.userId_letterId;
      let row = find(userId, letterId);
      if (!row) { row = { ...create, readAt: new Date(), deletedAt: null }; rows.push(row); }
      return row;
    },
    updateMany: async ({ where, data }) => {
      if (failWrites) throw new Error("database down");
      const row = find(where.userId, where.letterId);
      if (!row || row.deletedAt) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
  } };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { userId: req.get("x-user") }; next(); });
  installMailbox(app, { db });
  return { app, rows, failWrites(value) { failWrites = value; } };
}
async function client(t, app) {
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/mailbox/letters`;
  const call = (method, user, suffix, body) => fetch(`${base}${suffix}`, { method,
    headers: { "x-user": user, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { state: async user => (await call("GET", user, "/state")).json(), read: (user, id) => call("PUT", user, `/${id}/read`),
    remove: (user, id, suffix = "", body) => call("DELETE", user, `/${id}${suffix}`, body) };
}
const [A, B] = MAILBOX_LETTER_IDS;

test("a letter can be deleted only after the server has it as read, and stays deleted", async t => {
  const { app } = harness(), api = await client(t, app);
  assert.deepEqual(await api.state("alice"), { read: [], deleted: [] });
  // Unread: rejected, nothing changes.
  const unread = await api.remove("alice", A);
  assert.equal(unread.status, 409); assert.equal((await unread.json()).code, "LETTER_UNREAD");
  assert.equal((await api.read("alice", A)).status, 200);
  assert.equal((await api.read("alice", A)).status, 200, "marking read twice is fine");
  assert.deepEqual(await api.state("alice"), { read: [A], deleted: [] });
  assert.deepEqual(await (await api.remove("alice", A)).json(), { success: true, letterId: A });
  assert.deepEqual(await api.state("alice"), { read: [], deleted: [A] });
  // Repeated delete is safe; the letter cannot be read back into the mailbox.
  assert.equal((await api.remove("alice", A)).status, 200);
  assert.equal((await api.read("alice", A)).status, 404);
  assert.deepEqual(await api.state("alice"), { read: [], deleted: [A] });
});

test("each mailbox is its owner's: nobody reads, deletes or sees another person's state", async t => {
  const { app, rows } = harness(), api = await client(t, app);
  await api.read("alice", A); await api.read("alice", B);
  // Bob cannot delete on the strength of Alice's read, by any parameter.
  assert.equal((await api.remove("bob", A)).status, 409);
  assert.equal((await api.remove("bob", A, "?userId=alice")).status, 400);
  assert.equal((await api.remove("bob", A, "", { userId: "alice" })).status, 400);
  assert.deepEqual(await api.state("bob"), { read: [], deleted: [] });
  await api.read("bob", A); await api.remove("bob", A);
  assert.deepEqual(await api.state("bob"), { read: [], deleted: [A] });
  assert.deepEqual(await api.state("alice"), { read: [A, B], deleted: [] }, "Alice's mailbox is untouched");
  assert.equal(rows.filter(row => row.userId === "alice" && row.deletedAt).length, 0);
});

test("only known letters; a failed write deletes nothing", async t => {
  const { app, failWrites } = harness(), api = await client(t, app);
  for (const id of ["letter-unknown", "help-feedback", "bad%20id"]) {
    assert.equal((await api.read("alice", id)).status, 400, id);
    assert.equal((await api.remove("alice", id)).status, 400, id);
  }
  await api.read("alice", A);
  failWrites(true);
  assert.equal((await api.remove("alice", A)).status, 500);
  failWrites(false);
  assert.deepEqual(await api.state("alice"), { read: [A], deleted: [] });
});

test("the server's letter ids are the app's letters", () => {
  const source = fs.readFileSync(path.join(projectRoot, "mobile/src/components/mailbox/mockLetters.ts"), "utf8");
  const app = [...source.slice(0, source.indexOf("RELEASE_LETTERS")).matchAll(/^\s+id: '([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(app, [...MAILBOX_LETTER_IDS]);
});

// The real migration (disposable PGlite): one row per owner per letter; deleting a letter touches
// no other table, and no other owner's row.
test("migration: per-owner rows; deleting a letter removes nothing else", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "petalpal-mailbox-"));
  const database = new PGlite(directory, { extensions: { vector } });
  t.after(async () => { await database.close(); await rm(directory, { recursive: true, force: true }); });
  const migrations = path.join(projectRoot, "prisma", "migrations");
  for (const name of (await readdir(migrations)).filter(name => /^\d+_[a-z0-9_]+$/.test(name)).sort()) {
    await database.exec(await readFile(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  await database.exec(`
    INSERT INTO "User" ("id", "name", "timezone") VALUES ('alice', 'Alice', 'UTC'), ('bob', 'Bob', 'UTC');
    INSERT INTO "Garden" ("id", "ownerId") VALUES ('g', 'alice');
    INSERT INTO "Flower" ("id", "mood", "name", "meaning", "img", "left", "top", "userId", "gardenId") VALUES ('f', 'calm', 'Lotus', 'Peace', 'x', 0, 0, 'alice', 'g');
    INSERT INTO "Message" ("id", "author", "text", "flowerId", "userId") VALUES ('m', 'Bob', 'Hello', 'f', 'bob');
    INSERT INTO "MailboxLetterState" ("userId", "letterId") VALUES ('alice', '${A}'), ('bob', '${A}');
  `);
  await assert.rejects(database.query(`INSERT INTO "MailboxLetterState" ("userId", "letterId") VALUES ('alice', '${A}')`), /duplicate key|unique/i);
  const removed = await database.query(`UPDATE "MailboxLetterState" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "userId" = 'alice' AND "letterId" = '${A}' AND "deletedAt" IS NULL`);
  assert.equal(removed.affectedRows, 1);
  const states = (await database.query(`SELECT "userId", "deletedAt" IS NOT NULL AS deleted FROM "MailboxLetterState" ORDER BY "userId"`)).rows;
  assert.deepEqual(states, [{ userId: "alice", deleted: true }, { userId: "bob", deleted: false }]);
  for (const table of ["Message", "Flower", "User"]) {
    assert.ok((await database.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)).rows[0].n > 0, `${table} rows are untouched`);
  }
});
