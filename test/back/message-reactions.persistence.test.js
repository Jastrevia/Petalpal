import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

// The database rules the message routes rely on, on the real migrations (disposable PGlite):
// one reaction row per person per message, a reaction changes kind in place or is removed, and
// deleting a message deletes its reactions and keeps any report about it.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("reactions are one row per person; deleting a message cascades its reactions and keeps reports", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "petalpal-message-"));
  const database = new PGlite(directory, { extensions: { vector } });
  t.after(async () => { await database.close(); await rm(directory, { recursive: true, force: true }); });
  const migrations = path.join(projectRoot, "prisma", "migrations");
  for (const name of (await readdir(migrations)).filter((name) => /^\d+_[a-z0-9_]+$/.test(name)).sort()) {
    await database.exec(await readFile(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  await database.exec(`
    INSERT INTO "User" ("id", "name", "timezone") VALUES ('owner', 'Owner', 'UTC'), ('author', 'Author', 'UTC'), ('viewer', 'Viewer', 'UTC');
    INSERT INTO "Garden" ("id", "ownerId") VALUES ('garden-owner', 'owner');
    INSERT INTO "Flower" ("id", "mood", "name", "meaning", "img", "left", "top", "userId", "gardenId", "worldX", "worldY", "regionId")
      VALUES ('flower', 'calm', 'Lotus', 'Peace', '/lotus.png', 0, 0, 'owner', 'garden-owner', 1100, 900, 'Land09');
    INSERT INTO "Message" ("id", "author", "text", "flowerId", "userId") VALUES ('m1', 'Author', 'Hello', 'flower', 'author');
  `);
  const rows = async () => (await database.query(`SELECT "userId", "kind" FROM "MessageReaction" WHERE "messageId" = 'm1' ORDER BY "userId"`)).rows;
  const setKind = (user, kind) => database.query(`INSERT INTO "MessageReaction" ("id", "messageId", "userId", "kind") VALUES ($1, 'm1', $2, $3)
    ON CONFLICT ("messageId", "userId") DO UPDATE SET "kind" = EXCLUDED."kind"`, [`r-${user}-${kind}`, user, kind]);
  await setKind("viewer", "LIKE");
  await setKind("viewer", "DISLIKE");
  await setKind("owner", "LIKE");
  assert.deepEqual(await rows(), [{ userId: "owner", kind: "LIKE" }, { userId: "viewer", kind: "DISLIKE" }]);
  await assert.rejects(database.query(`INSERT INTO "MessageReaction" ("id", "messageId", "userId", "kind") VALUES ('dup', 'm1', 'viewer', 'LIKE')`),
    /duplicate key|unique/i, "a second row for the same person is impossible");
  await database.query(`DELETE FROM "MessageReaction" WHERE "messageId" = 'm1' AND "userId" = 'viewer'`);
  assert.deepEqual(await rows(), [{ userId: "owner", kind: "LIKE" }]);
  await database.query(`INSERT INTO "Report" ("id", "reporterId", "reportedUserId", "messageId", "category", "updatedAt")
    VALUES ('report-1', 'viewer', 'author', 'm1', 'OTHER', CURRENT_TIMESTAMP)`).catch(async () => {
    await database.query(`INSERT INTO "Report" ("id", "reporterId", "reportedUserId", "messageId", "category")
      VALUES ('report-1', 'viewer', 'author', 'm1', 'OTHER')`);
  });
  // The route deletes with the author in the WHERE clause: anyone else deletes nothing.
  for (const user of ["owner", "viewer"]) {
    assert.equal((await database.query(`DELETE FROM "Message" WHERE "id" = 'm1' AND "userId" = $1`, [user])).affectedRows, 0, user);
  }
  assert.equal((await database.query(`DELETE FROM "Message" WHERE "id" = 'm1' AND "userId" = 'author'`)).affectedRows, 1);
  assert.deepEqual(await rows(), [], "its reactions are deleted with it");
  const report = (await database.query(`SELECT "messageId", "reportedUserId" FROM "Report" WHERE "id" = 'report-1'`)).rows[0];
  assert.deepEqual(report, { messageId: null, reportedUserId: "author" }, "a report about it stays for moderation");
});
