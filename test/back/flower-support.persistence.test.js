import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { filterSocialPayload, hiddenSocialIds, sendSocialError } from "../../lib/garden-access.js";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import {
  FlowerSupportError,
  getFlowerDetail,
  getSupportCalendarDay,
  giveFlowerSupport,
  withGardenFlowerSupportState
} from "../../lib/flower-support.js";

import { contentSafetyResponse, CONTENT_REJECTED } from "../../lib/content-safety.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// This adapter runs the production business helper against the real migration,
// foreign keys, unique index, and transactions in a disposable PostgreSQL DB.
function prismaAdapter(database, fault = { failIncrement: false }) {
  const first = async (sql, params = []) => (await database.query(sql, params)).rows[0] || null;
  async function includeFlower(flower) {
    if (!flower) return null;
    const messages = (await database.query(
      'SELECT * FROM "Message" WHERE "flowerId" = $1 ORDER BY "createdAt" ASC', [flower.id]
    )).rows;
    const dailyCheckIn = flower.dailyCheckInId ? await first(
      'SELECT "id", "localDate", "timezone" FROM "DailyCheckIn" WHERE "id" = $1',
      [flower.dailyCheckInId]
    ) : null;
    if (dailyCheckIn) dailyCheckIn.journal = await first(
      'SELECT "id", "userId", "content", "createdAt", "updatedAt" FROM "Journal" WHERE "dailyCheckInId" = $1',
      [dailyCheckIn.id]
    );
    return { ...flower, messages, dailyCheckIn };
  }
  return {
    $queryRawUnsafe: async (sql, ...params) => (await database.query(sql, params)).rows,
    userBlock: {
      findFirst: ({where}) => first('SELECT "blockerId" FROM "UserBlock" WHERE ("blockerId"=$1 AND "blockedId"=$2) OR ("blockerId"=$2 AND "blockedId"=$1)',[where.OR[0].blockerId,where.OR[0].blockedId]),
      findMany: async ({where}) => (await database.query('SELECT * FROM "UserBlock" WHERE "blockerId"=$1 OR "blockedId"=$1',[where.OR[0].blockerId])).rows
    },
    friendship: { findUnique: ({ where }) => first('SELECT id FROM "Friendship" WHERE "userId"=$1 AND "friendId"=$2', [where.userId_friendId.userId, where.userId_friendId.friendId]) },
    user: {
      findUnique: ({ where }) => first('SELECT * FROM "User" WHERE "id" = $1', [where.id]),
      findFirst: ({where}) => first('SELECT id FROM "User" WHERE "socialRestricted"=true AND id=ANY($1::text[])',[where.id.in]),
      findMany: async () => (await database.query('SELECT id FROM "User" WHERE "socialRestricted"=true')).rows
    },
    flower: {
      findFirst: async ({ where }) => includeFlower(await first(
        'SELECT * FROM "Flower" WHERE "id" = $1 AND "userId" = $2', [where.id, where.userId]
      )),
      update: async ({ where, data }) => {
        if (fault.failIncrement) throw new Error("Simulated counter write failure");
        return includeFlower(await first(
          'UPDATE "Flower" SET "supportCount" = "supportCount" + $2 WHERE "id" = $1 RETURNING *',
          [where.id, data.supportCount.increment]
        ));
      }
    },
    visitRecord: {
      findFirst: ({ where }) => first(
        'SELECT * FROM "VisitRecord" WHERE "visitorId" = $1 AND "flowerId" = $2 AND "localDate" = $3 AND "action" = $4',
        [where.visitorId, where.flowerId, where.localDate, where.action]
      ),
      findMany: async ({ where }) => (await database.query(
        'SELECT "flowerId" FROM "VisitRecord" WHERE "visitorId" = $1 AND "localDate" = $2 AND "action" = $3 AND "flowerId" = ANY($4::text[])',
        [where.visitorId, where.localDate, where.action, where.flowerId.in]
      )).rows,
      create: async ({ data }) => {
        try {
          return await first(
            'INSERT INTO "VisitRecord" ("id", "visitorId", "visitorName", "visitorAvatar", "action", "gardenId", "userId", "flowerId", "localDate", "timezone") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [randomUUID(), data.visitorId, data.visitorName, data.visitorAvatar, data.action,
              data.gardenId, data.userId, data.flowerId, data.localDate, data.timezone]
          );
        } catch (error) {
          if (error.code === "23505") error.code = "P2002";
          throw error;
        }
      }
    },
    $transaction: (callback) => database.transaction((transaction) => callback(prismaAdapter(transaction, fault)))
  };
}

async function routeHandlers(database, events) {
  const source = (await readFile(path.join(projectRoot, "server.js"), "utf8")).replace(/\r\n/g, "\n");
  const start = source.indexOf('app.get("/users/:userId/flowers/:flowerId",');
  const end = source.indexOf('  app.post(\n    "/users/:userId/flowers/:flowerId/message",', start);
  assert.ok(start > 0 && end > start, "Focused route boundaries must exist");
  const handlers = new Map();
  const io = { to() { return this; }, emit(name, payload) { events.push({ name, payload }); } };
  vm.runInNewContext(source.slice(start, end), {
    app: {
      get(route, ...handlersList) { handlers.set(`GET ${route}`, handlersList.at(-1)); },
      post(route, ...handlersList) { handlers.set(`POST ${route}`, handlersList.at(-1)); }
    },
    prisma: database,
    io, realtime: io, requireSocialGardenAccess: (_req, _res, next) => next(), sendSocialError,
    getFlowerDetail, filterSocialPayload, hiddenSocialIds, contentSafetyResponse, CONTENT_REJECTED,
    giveFlowerSupport,
    FlowerSupportError,
    MAX_AVATAR_LENGTH: 256,
    validOptionalString: (value, limit) => value === undefined || (typeof value === "string" && value.trim().length <= limit),
    logServerError: () => {},
    console
  });
  return handlers;
}

async function invoke(handler, request) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler(request, response);
  return response;
}

test("Support day uses the stored supporter timezone across local midnight and DST", () => {
  assert.equal(getSupportCalendarDay("America/Vancouver", new Date("2026-09-29T06:59:59Z")).localDate,
    "2026-09-28");
  assert.equal(getSupportCalendarDay("America/Vancouver", new Date("2026-09-29T07:00:00Z")).localDate,
    "2026-09-29");
  assert.equal(getSupportCalendarDay("America/Vancouver", new Date("2026-11-01T08:30:00Z")).localDate,
    "2026-11-01");
  assert.equal(getSupportCalendarDay("America/Vancouver", new Date("2026-11-01T09:30:00Z")).localDate,
    "2026-11-01");
  assert.deepEqual(getSupportCalendarDay("Invalid/Timezone", new Date("2026-09-29T01:00:00Z")),
    { timezone: "UTC", localDate: "2026-09-29" });
});

test("a competing committed record returns its current count rather than the earlier flower read", async () => {
  let flowerReads = 0;
  const database = {
    user: { findUnique: async () => ({ id: "visitor", timezone: "UTC", name: "Visitor" }) },
    $transaction: async (callback) => callback({
      $queryRawUnsafe: async () => [],
      user: { findUnique: async () => ({ id: "owner", allowGardenVisits: true, communityTermsVersion: "petalpal-community-2026-10-15" }), findFirst: async () => null },
      userBlock: { findFirst: async () => null },
      friendship: { findUnique: async () => ({ id: "confirmed" }) },
      flower: { findFirst: async () => ({
        id: "flower-x", userId: "owner", gardenId: "garden-owner", worldX: 1100.5, worldY: 900.25, regionId: "Land09",
        supportCount: ++flowerReads === 1 ? 7 : 8
      }) },
      visitRecord: { findFirst: async () => ({ id: "competing-record" }) }
    })
  };
  const result = await giveFlowerSupport(database, {
    ownerUserId: "owner", flowerId: "flower-x", supporterUserId: "visitor"
  });
  assert.equal(result.flower.supportCount, 8);
  assert.equal(result.visitRecord, null);
});

test("Daily Support reuses persisted visit history with atomic counts and authoritative detail", async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "petalpal-support-"));
  let database = new PGlite(dataDirectory, { extensions: { vector } });
  let client;
  const now = new Date("2026-09-28T20:00:00Z");
  const support = (flowerId = "flower-x", at = now, supporterUserId = "visitor") => giveFlowerSupport(client, {
    ownerUserId: "owner", flowerId, supporterUserId, now: at
  });
  const detail = (viewerUserId = "visitor", at = now) => getFlowerDetail(client, {
    ownerUserId: "owner", flowerId: "flower-x", viewerUserId, now: at
  });
  const count = async () => (await database.query(
    'SELECT "supportCount" FROM "Flower" WHERE "id" = $1', ["flower-x"]
  )).rows[0].supportCount;
  const records = async () => (await database.query(
    'SELECT * FROM "VisitRecord" WHERE "flowerId" = $1 ORDER BY "localDate"', ["flower-x"]
  )).rows;
  try {
    const migrationRoot = path.join(projectRoot, "prisma", "migrations");
    for (const name of (await readdir(migrationRoot)).filter((name) => /^\d+_[a-z0-9_]+$/.test(name)).sort()) {
      await database.exec(await readFile(path.join(migrationRoot, name, "migration.sql"), "utf8"));
    }
    await database.exec(`
      INSERT INTO "User" ("id", "name", "timezone") VALUES
        ('owner', 'Owner', 'UTC'), ('visitor', 'Visitor', 'America/Vancouver'),
        ('other-visitor', 'Other Visitor', 'UTC');
      UPDATE "User" SET "communityTermsVersion"='petalpal-community-2026-10-15';
      INSERT INTO "Friendship" (id, "userId", "friendId") VALUES
        ('friend-a', 'owner', 'visitor'), ('friend-b', 'visitor', 'owner'),
        ('friend-c', 'owner', 'other-visitor'), ('friend-d', 'other-visitor', 'owner');
      INSERT INTO "Garden" ("id", "ownerId") VALUES ('garden-owner', 'owner');
      INSERT INTO "DailyCheckIn" ("id", "userId", "localDate", "timezone", "updatedAt")
        VALUES ('check-in-x', 'owner', '2026-09-27', 'UTC', CURRENT_TIMESTAMP);
      INSERT INTO "Journal" ("id", "userId", "dailyCheckInId", "content", "updatedAt")
        VALUES ('journal-x', 'owner', 'check-in-x', 'The actual originating memory.', CURRENT_TIMESTAMP);
      INSERT INTO "Flower" ("id", "mood", "event", "name", "meaning", "img", "left", "top", "supportCount", "userId", "gardenId", "dailyCheckInId", "worldX", "worldY", "regionId") VALUES
        ('flower-x', 'calm', 'The actual originating memory.', 'Lotus', 'Peace', '/lotus.png', 101.125, 202.875, 7, 'owner', 'garden-owner', 'check-in-x', 1100.5, 900.25, 'Land09'),
        ('flower-y', 'happy', 'Legacy memory', 'Rose', 'Joy', '/rose.png', 300, 400, 0, 'owner', 'garden-owner', NULL, 1200, 1000, 'Land09'),
        ('flower-unplanted', 'happy', '', 'Rose', 'Joy', '/rose.png', 0, 0, 0, 'owner', 'garden-owner', NULL, NULL, NULL, NULL);
      INSERT INTO "Message" ("id", "author", "text", "flowerId", "userId")
        VALUES ('message-x', 'Visitor', 'A kind prototype message', 'flower-x', 'visitor');
      INSERT INTO "VisitRecord" ("id", "visitorId", "visitorName", "visitorAvatar", "action", "gardenId", "userId") VALUES
        ('old-support', 'visitor', 'Visitor', '🦋', 'support', 'garden-owner', 'visitor'),
        ('old-visit', 'visitor', 'Visitor', '🦋', 'started visiting your garden', 'garden-owner', 'visitor');
    `);
    client = prismaAdapter(database);

    await t.test("owner self-Support and unknown identities are rejected before any write", async () => {
      await assert.rejects(support("flower-x", now, "owner"),
        (error) => error.status === 403 && error.code === "SELF_SUPPORT_FORBIDDEN");
      await assert.rejects(support("flower-x", now, "unknown-user"),
        (error) => error.status === 401);
      await assert.rejects(getFlowerDetail(client, {
        ownerUserId: undefined, flowerId: "flower-x", viewerUserId: "visitor"
      }), (error) => error.status === 404);
      await assert.rejects(giveFlowerSupport(client, {
        ownerUserId: "visitor", flowerId: "flower-x", supporterUserId: "visitor", now
      }), (error) => error.status === 404);
      assert.equal(await count(), 7);
      assert.equal((await records()).length, 0);
    });

    await t.test("visitor can Support and a same-day repeat returns unchanged authoritative count", async () => {
      const before = await detail();
      assert.deepEqual(before.supportState, {
        localDate: "2026-09-28", timezone: "America/Vancouver",
        supportedToday: false, canSupport: true, isOwner: false
      });
      const added = await support();
      assert.equal(added.flower.supportCount, 8);
      assert.equal(added.visitRecord.flowerId, "flower-x");
      assert.equal(added.visitRecord.visitorId, "visitor");
      assert.equal(added.visitRecord.localDate, "2026-09-28");
      const duplicate = await support();
      assert.equal(duplicate.flower.supportCount, 8);
      assert.equal(duplicate.visitRecord, null);
      assert.equal(duplicate.flower.supportState.supportedToday, true);
      assert.equal(duplicate.flower.supportState.canSupport, false);
      assert.equal((await records()).length, 1);
    });

    await t.test("another flower and the next local calendar day have independent limits", async () => {
      assert.equal((await support("flower-y")).flower.supportCount, 1);
      const nextDay = new Date("2026-09-29T07:00:00Z");
      assert.equal((await detail("visitor", nextDay)).supportState.canSupport, true);
      const added = await support("flower-x", nextDay);
      assert.equal(added.flower.supportCount, 9);
      assert.equal(added.visitRecord.localDate, "2026-09-29");
      assert.equal((await records()).length, 2);
    });

    await t.test("concurrent repeated calls create one visit and exactly one count increment", async () => {
      const day = new Date("2026-09-30T20:00:00Z");
      const results = await Promise.all(Array.from({ length: 8 }, () => support("flower-x", day)));
      assert.equal(results.filter((result) => result.visitRecord).length, 1);
      assert.ok(results.every((result) => result.flower.supportCount === 10));
      assert.equal(await count(), 10);
      assert.equal((await records()).length, 3);
    });

    await t.test("counter failure rolls back the inserted support record and allows a later retry", async () => {
      const day = new Date("2026-10-01T20:00:00Z");
      const fault = { failIncrement: true };
      client = prismaAdapter(database, fault);
      await assert.rejects(support("flower-x", day), /Simulated counter write failure/);
      assert.equal(await count(), 10);
      assert.equal((await records()).length, 3);
      fault.failIncrement = false;
      assert.equal((await support("flower-x", day)).flower.supportCount, 11);
      client = prismaAdapter(database);
    });

    await t.test("visitor detail and support never return private Journal or Event fields", async () => {
      for (const flower of [await detail("visitor"), (await support()).flower]) {
        for (const field of ["event", "dailyCheckIn", "dailyCheckInId", "journalEntryId", "sourceEvent", "sourceEventId"]) {
          assert.equal(Object.hasOwn(flower, field), false, field);
        }
        assert.equal(flower.userId, "owner");
        assert.ok(flower.supportState);
        assert.equal(flower.meaning, "Peace");
      }
    });

    await t.test("owner detail is read-only and resolves actual journal, meaning, messages and counts", async () => {
      const flower = await detail("owner");
      assert.equal(flower.supportState.isOwner, true);
      assert.equal(flower.supportState.canSupport, false);
      assert.equal(flower.supportCount, 11);
      assert.equal(flower.journalEntryId, "journal-x");
      assert.equal(flower.dailyCheckIn.journal.content, "The actual originating memory.");
      assert.equal(flower.event, "The actual originating memory.");
      assert.equal(flower.meaning, "Peace");
      assert.equal(flower.messages[0].text, "A kind prototype message");
      assert.equal(flower.userId, "owner");
      assert.equal(flower.left, 101.125);
      assert.equal(flower.top, 202.875);
      const otherViewer = await detail("other-visitor");
      assert.equal(otherViewer.supportState.canSupport, true);
      assert.equal(otherViewer.supportState.supportedToday, false);
      const garden = await withGardenFlowerSupportState(client, [flower], "visitor", now);
      assert.equal(garden[0].supportState.supportedToday, true);
      assert.equal(garden[0].supportState.isOwner, false);
    });

    await t.test("real HTTP handlers ignore forged supporter/day and broadcast only new support", async () => {
      const events = [];
      const handlers = await routeHandlers(client, events);
      const post = handlers.get("POST /users/:userId/flowers/:flowerId/support");
      const get = handlers.get("GET /users/:userId/flowers/:flowerId");
      const request = {
        params: { userId: "owner", flowerId: "flower-x" },
        auth: { userId: "owner" },
        body: { supporterUserId: "visitor", visitorUserId: "visitor", localDate: "2999-01-01" }
      };
      assert.equal((await invoke(post, request)).statusCode, 403);
      request.auth = { userId: "other-visitor" };
      request.body = { supporterUserId: "owner", localDate: "2999-01-01", timezone: "Invalid/Timezone" };
      const added = await invoke(post, request);
      assert.equal(added.statusCode, 200);
      assert.notEqual(added.body.supportState.localDate, "2999-01-01");
      assert.equal(added.body.supportState.timezone, "UTC");
      assert.equal(events.length, 2);
      assert.equal(events[0].name, "supportUpdated");
      assert.equal(events[0].payload.flower.supportState, undefined);
      assert.equal(events[1].payload.visitorId, "other-visitor");
      const repeated = await invoke(post, request);
      assert.equal(repeated.body.supportCount, added.body.supportCount);
      assert.equal(events.length, 2);
      const reloaded = await invoke(get, request);
      assert.equal(reloaded.body.supportState.supportedToday, true);
      assert.equal(reloaded.body.supportState.canSupport, false);
    });

    await t.test("a database uniqueness race rolls back the loser and reads the winning count", async () => {
      const raceDay = new Date("2026-10-02T20:00:00Z");
      const priorCount = await count();
      let rejected = false;
      const racedClient = {
        ...client,
        $transaction: async (callback, options) => {
          if (rejected) return client.$transaction(callback, options);
          rejected = true;
          // Commit the competing request through the actual helper/database,
          // then model PostgreSQL rejecting the loser's concurrent insertion.
          await support("flower-x", raceDay);
          throw Object.assign(new Error("Daily Support unique constraint"), { code: "P2002" });
        }
      };
      const loser = await giveFlowerSupport(racedClient, {
        ownerUserId: "owner", flowerId: "flower-x", supporterUserId: "visitor", now: raceDay
      });
      assert.equal(loser.visitRecord, null);
      assert.equal(loser.flower.supportCount, priorCount + 1);
      assert.equal(loser.flower.supportState.supportedToday, true);
      const rows = await database.query(
        'SELECT count(*)::integer AS count FROM "VisitRecord" WHERE "flowerId"=$1 AND "visitorId"=$2 AND "localDate"=$3',
        ["flower-x", "visitor", "2026-10-02"]
      );
      assert.equal(rows.rows[0].count, 1);
    });

    await t.test("database restart preserves daily state and direct duplicate inserts fail", async () => {
      await database.close();
      database = new PGlite(dataDirectory, { extensions: { vector } });
      client = prismaAdapter(database);
      const flower = await detail("visitor", new Date("2026-10-01T20:00:00Z"));
      assert.equal(flower.supportState.supportedToday, true);
      const priorCount = flower.supportCount;
      assert.equal((await support("flower-x", new Date("2026-10-01T20:00:00Z"))).flower.supportCount,
        priorCount);
      await assert.rejects(database.query(
        'INSERT INTO "VisitRecord" ("id", "visitorId", "visitorName", "visitorAvatar", "action", "gardenId", "userId", "flowerId", "localDate", "timezone") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        ["direct-duplicate", "visitor", "Visitor", "🦋", "support", "garden-owner", "visitor",
          "flower-x", "2026-10-01", "America/Vancouver"]
      ), (error) => error.code === "23505");
      assert.equal(await count(), priorCount);
      assert.equal((await database.query(
        'SELECT count(*)::integer AS count FROM "VisitRecord" WHERE "id" IN ($1,$2)',
        ["old-support", "old-visit"]
      )).rows[0].count, 2);
    });

    await t.test("deleting a flower retains its social visit history through SetNull", async () => {
      await database.query('DELETE FROM "Flower" WHERE "id" = $1', ["flower-y"]);
      const preserved = await database.query(
        'SELECT "flowerId" FROM "VisitRecord" WHERE "visitorId" = $1 AND "localDate" = $2 AND "id" NOT IN ($3,$4)',
        ["visitor", "2026-09-28", "old-support", "old-visit"]
      );
      assert.equal(preserved.rows.length, 2);
      assert.ok(preserved.rows.some((row) => row.flowerId === null));
    });
  } finally {
    await database.close().catch(() => {});
    // Only remove the explicitly created disposable test directory.
    const target = path.resolve(dataDirectory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith("petalpal-support-"));
    await rm(target, { recursive: true, force: true });
  }
});

// A visitor never reaches an unplanted (draft) flower: not its detail, not Support, not a message.
test("an unplanted flower is not found for visitors and stays readable by its owner", async () => {
  const unplanted = { id: "draft", userId: "owner", gardenId: "garden-owner", worldX: null, worldY: null, regionId: null,
    left: 400, top: 560, layoutVersion: 1, supportCount: 0, messages: [] };
  const tx = {
    $queryRawUnsafe: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, timezone: "UTC", name: where.id, allowGardenVisits: true,
      communityTermsVersion: "petalpal-community-2026-10-15" }), findFirst: async () => null, findMany: async () => [] },
    userBlock: { findFirst: async () => null, findMany: async () => [] },
    friendship: { findUnique: async () => ({ id: "confirmed" }) },
    flower: { findFirst: async () => ({ ...unplanted }) },
    visitRecord: { findFirst: async () => null },
  };
  const database = { ...tx, $transaction: async (callback) => callback(tx) };
  await assert.rejects(getFlowerDetail(database, { ownerUserId: "owner", flowerId: "draft", viewerUserId: "visitor" }),
    { status: 404, code: "FLOWER_NOT_FOUND" });
  await assert.rejects(giveFlowerSupport(database, { ownerUserId: "owner", flowerId: "draft", supporterUserId: "visitor" }),
    { status: 404, code: "FLOWER_NOT_FOUND" });
  const { sendFlowerMessage } = await import("../../lib/flower-support.js");
  await assert.rejects(sendFlowerMessage(database, { ownerUserId: "owner", flowerId: "draft", viewerUserId: "visitor", text: "hi" }),
    { status: 404, code: "FLOWER_NOT_FOUND" });
  const own = await getFlowerDetail(database, { ownerUserId: "owner", flowerId: "draft", viewerUserId: "owner" });
  assert.equal(own.id, "draft");
});
