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
    message: {
      findMany: async ({ where }) => messages.filter(message => where.id.in.includes(message.id)),
      findFirst: async ({ where }) => {
        const message = messages.find(row => row.id === where.id && row.userId === where.userId);
        return message ? { id: message.id, flowerId: `flower-of-${message.id}`, flower: message.flower } : null;
      },
      deleteMany: async ({ where }) => {
        const index = messages.findIndex(row => row.id === where.id && row.userId === where.userId);
        if (index < 0) return { count: 0 };
        messages.splice(index, 1);
        // ON DELETE CASCADE on MessageReaction.messageId.
        for (let i = reactions.length - 1; i >= 0; i--) if (reactions[i].messageId === where.id) reactions.splice(i, 1);
        return { count: 1 };
      },
    },
    messageReaction: {
      upsert: async ({ where, create, update }) => {
        const { messageId, userId } = where.messageId_userId;
        const found = reactions.find(row => row.messageId === messageId && row.userId === userId);
        if (found) { Object.assign(found, update); return found; }
        reactions.push({ ...create }); return create;
      },
      deleteMany: async ({ where }) => {
        const before = reactions.length;
        for (let i = reactions.length - 1; i >= 0; i--) {
          if (reactions[i].messageId === where.messageId && reactions[i].userId === where.userId) reactions.splice(i, 1);
        }
        return { count: before - reactions.length };
      },
      groupBy: async ({ where }) => where.messageId.in.map(messageId => ({ messageId, _count: { _all: reactions.filter(row => row.messageId === messageId && row.kind === where.kind).length } })),
      findMany: async ({ where }) => reactions.filter(row => where.messageId.in.includes(row.messageId) && row.userId === where.userId),
    },
  };
  const db = { ...tx, $transaction: callback => callback(tx) };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { userId: req.get("x-user") }; next(); });
  const emitted = [];
  const realtime = { to(room) { const rooms = [room]; const target = { to(next) { rooms.push(next); return target; },
    emit: async (event, payload) => { emitted.push({ rooms, event, payload }); } }; return target; } };
  installSocialSafety(app, { db, realtime, clearVisitors: async () => {} });
  app.use((error, _req, res, _next) => { if (!error.status) console.error(error); res.status(error.status ?? 500).json({ error: error.message }); });
  return { app, reactions, messages, emitted };
}
async function withServer(t, app) {
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    put: (user, id, body) => fetch(`${base}/messages/${id}/reaction`, { method: "PUT", headers: { "content-type": "application/json", "x-user": user }, body: JSON.stringify(body) }),
    get: (user, ids) => fetch(`${base}/messages/reactions?ids=${ids}`, { headers: { "x-user": user } }),
    remove: (user, id, query = "", body) => fetch(`${base}/messages/${id}${query}`, { method: "DELETE",
      headers: { "x-user": user, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }),
  };
}

// Like and Dislike toggle: one reaction per person per message, LIKE, DISLIKE or none.
test("reactions toggle: none ↔ like, none ↔ dislike, like ↔ dislike, one row per person", async t => {
  const { app, reactions } = harness(), api = await withServer(t, app);
  const set = async (user, kind) => (await api.put(user, "m1", { kind })).json();
  assert.deepEqual(await set("viewer", "LIKE"), { likes: 1, mine: "LIKE" });        // none → like
  assert.deepEqual(await set("viewer", null), { likes: 0, mine: null });            // like → none
  assert.deepEqual(await set("viewer", "DISLIKE"), { likes: 0, mine: "DISLIKE" });  // none → dislike
  assert.deepEqual(await set("viewer", null), { likes: 0, mine: null });            // dislike → none
  assert.deepEqual(await set("viewer", "LIKE"), { likes: 1, mine: "LIKE" });
  assert.deepEqual(await set("viewer", "DISLIKE"), { likes: 0, mine: "DISLIKE" });  // like → dislike
  assert.deepEqual(await set("viewer", "LIKE"), { likes: 1, mine: "LIKE" });        // dislike → like
  assert.equal(reactions.filter(row => row.userId === "viewer").length, 1, "never two reactions from one person");
  // Repeating a request changes nothing (rapid taps can never double count).
  assert.deepEqual(await set("viewer", "LIKE"), { likes: 1, mine: "LIKE" });
  assert.deepEqual(await set("viewer", null), { likes: 0, mine: null });
  assert.deepEqual(await set("viewer", null), { likes: 0, mine: null });
  assert.equal(reactions.length, 0);
  // Each person sees their own state and the same total.
  await set("viewer", "LIKE"); await set("owner", "LIKE");
  assert.deepEqual(await (await api.get("viewer", "m1")).json(), { reactions: { m1: { likes: 2, mine: "LIKE" } } });
  assert.deepEqual(await (await api.get("owner", "m1")).json(), { reactions: { m1: { likes: 2, mine: "LIKE" } } });
  await set("owner", null);
  assert.deepEqual(await (await api.get("viewer", "m1")).json(), { reactions: { m1: { likes: 1, mine: "LIKE" } } }, "removing mine never touches yours");
});

test("only the author deletes a message; its reactions go with it; others get the same 404", async t => {
  const { app, reactions, messages, emitted } = harness(), api = await withServer(t, app);
  await api.put("viewer", "m1", { kind: "LIKE" }); await api.put("owner", "m1", { kind: "DISLIKE" });
  // Not the author: not the garden owner, not another visitor, not via smuggled parameters.
  for (const user of ["owner", "viewer", "stranger"]) assert.equal((await api.remove(user, "m1")).status, 404, user);
  assert.equal((await api.remove("viewer", "m1", "?userId=friend")).status, 400);
  assert.equal((await api.remove("viewer", "m1", "", { userId: "friend" })).status, 400);
  assert.equal((await api.remove("friend", "bad%20id")).status, 400);
  assert.equal(messages.some(message => message.id === "m1"), true);
  assert.equal(reactions.length, 2);
  assert.equal(emitted.length, 0);
  // The author deletes it, once.
  const reply = await api.remove("friend", "m1");
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), { success: true, messageId: "m1" });
  assert.equal(messages.some(message => message.id === "m1"), false);
  assert.equal(reactions.length, 0, "its reactions are deleted with it");
  assert.deepEqual(emitted, [{ rooms: ["garden:owner", "user:owner"], event: "messageDeleted",
    payload: { messageId: "m1", flowerId: "flower-of-m1", gardenOwnerId: "owner" } }]);
  assert.equal((await api.remove("friend", "m1")).status, 404, "already gone");
  assert.deepEqual(await (await api.get("viewer", "m1")).json(), { reactions: {} });
  assert.equal((await api.put("viewer", "m1", { kind: "LIKE" })).status, 404);
});

test("nobody reacts to their own message or to a Garden they cannot visit", async t => {
  const { app, reactions } = harness(), api = await withServer(t, app);
  assert.equal((await api.put("owner", "m2", { kind: "LIKE" })).status, 404);
  assert.equal((await api.put("viewer", "m3", { kind: "LIKE" })).status, 404);
  assert.deepEqual(await (await api.get("viewer", "m3")).json(), { reactions: {} });
  assert.equal(reactions.length, 0);
});

test("only LIKE, DISLIKE or null, with no other fields; ids are checked and bounded", async t => {
  const { app } = harness(), api = await withServer(t, app);
  assert.equal((await api.put("viewer", "m1", { kind: "LOVE" })).status, 400);
  assert.equal((await api.put("viewer", "m1", {})).status, 400, "kind is required (null to remove)");
  assert.equal((await api.put("viewer", "m1", { kind: "LIKE", userId: "someone" })).status, 400);
  assert.equal((await api.get("viewer", "bad%20id")).status, 400);
  assert.equal((await api.get("viewer", Array.from({ length: 51 }, (_, i) => `m${i}`).join(","))).status, 400);
});
