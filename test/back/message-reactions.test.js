import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { installSocialSafety } from "../../lib/social-safety.js";

// In-memory stand-in for the tables these routes touch.
function harness() {
  const messages = [
    { id: "m1", userId: "friend", flower: { userId: "owner" } },
    { id: "m2", userId: "owner", flower: { userId: "owner" } },
    { id: "m3", userId: "stranger", flower: { userId: "closed" } },
  ];
  const reactions = [];
  const friendships = new Set(["owner:friend", "owner:viewer"]);
  const tx = {
    $queryRawUnsafe: async () => [],
    user: { findUnique: async ({ where }) => ({ id: where.id, allowGardenVisits: where.id !== "closed" }), findFirst: async () => null },
    userBlock: { findFirst: async () => null, findUnique: async () => null, count: async () => 0 },
    friendship: { findUnique: async ({ where }) => friendships.has(`${where.userId_friendId.userId}:${where.userId_friendId.friendId}`) ? { id: "f" } : null },
    message: { findMany: async ({ where }) => messages.filter(message => where.id.in.includes(message.id)) },
    messageReaction: {
      upsert: async ({ where, create }) => {
        const { messageId, userId } = where.messageId_userId;
        const found = reactions.find(row => row.messageId === messageId && row.userId === userId);
        if (found) return found;
        reactions.push(create); return create;
      },
      groupBy: async ({ where }) => where.messageId.in.map(messageId => ({ messageId, _count: { _all: reactions.filter(row => row.messageId === messageId && row.kind === where.kind).length } })),
      findMany: async ({ where }) => reactions.filter(row => where.messageId.in.includes(row.messageId) && row.userId === where.userId),
    },
  };
  const db = { ...tx, $transaction: callback => callback(tx) };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { userId: req.get("x-user") }; next(); });
  installSocialSafety(app, { db, realtime: {}, clearVisitors: async () => {} });
  app.use((error, _req, res, _next) => { if (!error.status) console.error(error); res.status(error.status ?? 500).json({ error: error.message }); });
  return { app, reactions };
}
async function withServer(t, app) {
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    put: (user, id, body) => fetch(`${base}/messages/${id}/reaction`, { method: "PUT", headers: { "content-type": "application/json", "x-user": user }, body: JSON.stringify(body) }),
    get: (user, ids) => fetch(`${base}/messages/reactions?ids=${ids}`, { headers: { "x-user": user } }),
  };
}

test("one reaction per person per message, and the first one stands", async t => {
  const { app, reactions } = harness(), api = await withServer(t, app);
  let reply = await api.put("viewer", "m1", { kind: "LIKE" });
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), { likes: 1, mine: "LIKE" });
  reply = await api.put("viewer", "m1", { kind: "DISLIKE" });
  assert.deepEqual(await reply.json(), { likes: 1, mine: "LIKE" });
  assert.equal(reactions.length, 1);
  reply = await api.put("owner", "m1", { kind: "DISLIKE" });
  assert.deepEqual(await reply.json(), { likes: 1, mine: "DISLIKE" });
  assert.deepEqual(await (await api.get("viewer", "m1")).json(), { reactions: { m1: { likes: 1, mine: "LIKE" } } });
});

test("nobody reacts to their own message or to a Garden they cannot visit", async t => {
  const { app, reactions } = harness(), api = await withServer(t, app);
  assert.equal((await api.put("owner", "m2", { kind: "LIKE" })).status, 404);
  assert.equal((await api.put("viewer", "m3", { kind: "LIKE" })).status, 404);
  assert.deepEqual(await (await api.get("viewer", "m3")).json(), { reactions: {} });
  assert.equal(reactions.length, 0);
});

test("only LIKE or DISLIKE, with no other fields; ids are checked and bounded", async t => {
  const { app } = harness(), api = await withServer(t, app);
  assert.equal((await api.put("viewer", "m1", { kind: "LOVE" })).status, 400);
  assert.equal((await api.put("viewer", "m1", { kind: "LIKE", userId: "someone" })).status, 400);
  assert.equal((await api.get("viewer", "bad%20id")).status, 400);
  assert.equal((await api.get("viewer", Array.from({ length: 51 }, (_, i) => `m${i}`).join(","))).status, 400);
});
