import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";
const test = (name, fn) => nodeTest(name, { timeout: 10000 }, fn);
import { setTimeout as delay } from "node:timers/promises";
import { io as connectSocket } from "socket.io-client";
import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { server, setFirebaseUserDeleterForTests } from "../../server.js";
import { createSocketBudget, SOCKET_MAX_PACKET_BYTES } from "../../lib/socket-security.js";

async function fixture(t) {
  const state = { users: Object.fromEntries(["owner", "friend", "outsider"].map(id => [id, {
    id, firebaseUid: `firebase-${id}`, name: `${id} name`, avatar: "🦋", allowGardenVisits: true
  }])), friends: new Set(["owner:friend", "friend:owner"]), revoked: new Set(), pauseFriend: null, calls: 0 };
  const restore = [], clients = [];
  const deletions = new Map();
  function stub(object, method, fn) { const original = object[method]; object[method] = fn; restore.push(() => { object[method] = original; }); }
  stub(prisma.userBlock, "findFirst", async () => null);
  stub(prisma.userBlock, "findMany", async () => []);
  stub(prisma.user, "findFirst", async () => null);
  stub(prisma.user, "findMany", async () => []);
  stub(prisma.accountDeletion, "update", async ({where,data}) => Object.assign(deletions.get(where.userId),data));
  stub(prisma.user, "findUnique", async ({ where }) => {
    state.calls += 1;
    const id = where.id || Object.keys(state.users).find(key => state.users[key].firebaseUid === where.firebaseUid);
    return state.users[id] ? { ...state.users[id] } : null;
  });
  stub(prisma.user, "update", async ({ where, data }) => { Object.assign(state.users[where.id], data); return { ...state.users[where.id] }; });
  stub(prisma.friendship, "findUnique", async ({ where }) => {
    const { userId, friendId } = where.userId_friendId;
    const result = state.friends.has(`${userId}:${friendId}`) ? { id: "confirmed-friend" } : null;
    if (state.pauseFriend && friendId === "friend") {
      if (state.pauseFriend.skip > 0) state.pauseFriend.skip--;
      else { const pause = state.pauseFriend; state.pauseFriend = null; pause.enter(); await pause.wait; }
    }
    return result;
  });
  function deleteFriendships(friends, { where }) {
    let count = 0;
    for (const key of friends) {
      const [userId, friendId] = key.split(":");
      if (where.OR.some(row => (row.userId === undefined || row.userId === userId)
        && (row.friendId === undefined || row.friendId === friendId))) {
        friends.delete(key); count++;
      }
    }
    return { count };
  }
  stub(prisma.friendship, "deleteMany", async args => deleteFriendships(state.friends, args));
  stub(prisma.garden, "findUnique", async () => null);
  stub(prisma.auditEvent, "create", async () => ({ id: "synthetic-audit" }));
  stub(prisma, "$transaction", async (callback, options) => {
    // Stage writes until success. This models fixture commit/rollback, not PostgreSQL locking.
    const users = structuredClone(state.users), friends = new Set(state.friends);
    const result = await callback({
      $queryRawUnsafe: async (sql, ...ids) => {
        if (sql === "SELECT pg_advisory_xact_lock(73001605)::text") { assert.equal(options, undefined); return []; }
        assert.deepEqual(options, { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 });
        if (sql === "SELECT set_config('lock_timeout', '1500ms', true), set_config('statement_timeout', '4000ms', true)") {
          assert.equal(ids.length, 0); return [{ set_config: "4000ms" }];
        }
        assert.ok(ids.length > 0 && ids.length <= 2);
        assert.equal(sql, `SELECT id FROM "User" WHERE id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')}) ORDER BY id COLLATE "C" FOR NO KEY UPDATE`);
        return [...new Set(ids)].filter(id => users[id]).sort().map(id => ({ id }));
      },
      accountDeletion: { findUnique: async ({where}) => deletions.get(where.userId), create: async ({data}) => { deletions.set(data.userId, {...data}); return deletions.get(data.userId); } },
      report: { deleteMany: async () => ({count:0}) },
      user: {
        findUnique: async ({ where }) => users[where.id] ? { ...users[where.id] } : null,
        update: async ({ where, data, select }) => {
          assert.ok(users[where.id], "transaction update requires an existing user");
          Object.assign(users[where.id], data);
          return select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, users[where.id][key]])) : { ...users[where.id] };
        },
        delete: async ({ where }) => { const user = users[where.id]; delete users[where.id]; return user; }
      },
      friendship: { deleteMany: async args => deleteFriendships(friends, args) },
      friendRequest: { deleteMany: async () => ({ count: 0 }) },
      garden: { findUnique: async () => null },
      visitRecord: { deleteMany: async () => ({ count: 0 }) }, message: { deleteMany: async () => ({ count: 0 }) }
    });
    state.users = users; state.friends = friends;
    return result;
  });
  setFirebaseTokenVerifierForTests(async token => {
    const id = token?.replace(/-token$/, "");
    if (!state.users[id] || state.revoked.has(id)) throw Object.assign(new Error("private verifier detail"), { code: "auth/id-token-revoked" });
    return { uid: `firebase-${id}`, email_verified: true, auth_time: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 };
  });
  setFirebaseUserDeleterForTests(async uid => { state.revoked.add(uid.replace("firebase-", "")); });
  server.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    for (const socket of clients) socket.disconnect();
    await new Promise(resolve => server.close(resolve));
    restore.reverse().forEach(fn => fn()); setFirebaseTokenVerifierForTests(); setFirebaseUserDeleterForTests();
  });
  async function socket(id, transports = ["websocket"]) {
    const client = connectSocket(base, { auth: { token: `${id}-token` }, transports, reconnection: false }); clients.push(client);
    await new Promise((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
    return client;
  }
  async function call(path, id, body, method = "POST") {
    const res = await fetch(base+path, { method, headers: { Authorization: `Bearer ${id}-token`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  }
  return { state, socket, call, base, clients };
}
function action(socket, event, payload) {
  return new Promise((resolve, reject) => socket.timeout(1500).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
}
const move = { gardenOwnerId: "owner", x: 10, y: 20 };
async function assertNoNewEvents(socket, run, event = "avatarMoved") {
  let count = 0; const collect = () => count++; socket.on(event, collect);
  try { await run(); await delay(35); assert.equal(count, 0); } finally { socket.off(event, collect); }
}

test("authorized joins/movement use token actor and do not leak to outsider/user rooms", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend"), outsider = await f.socket("outsider");
  assert.equal((await action(owner, "join-user", "owner")).ok, true);
  assert.equal((await action(friend, "join-user", "friend")).ok, true);
  assert.equal((await action(owner, "join-garden", "owner")).ok, true);
  assert.equal((await action(friend, "join-garden", "owner")).ok, true);
  assert.equal((await action(outsider, "join-garden", "owner")).ok, false);
  const received = new Promise(resolve => owner.once("avatarMoved", resolve));
  await assertNoNewEvents(outsider, () => action(friend, "move-avatar", { ...move, userId: "friend", visitorId: "friend", ownerId: "owner", name: "untrusted name", avatar: "wrong" }));
  const payload = await received;
  assert.equal(payload.userId, "friend"); assert.equal(payload.visitorId, "friend");
  assert.equal(payload.name, "friend name"); assert.equal(payload.avatar, "🦋");
  assert.equal((await action(friend, "join-user", { userId: "owner" })).code, "INVALID_PAYLOAD");
  await assertNoNewEvents(owner, async () => {
    assert.equal((await action(friend, "move-avatar", { ...move, visitorId: "owner" })).code, "INVALID_PAYLOAD");
    assert.equal((await action(friend, "move-avatar", { ...move, ownerId: "outsider" })).code, "INVALID_PAYLOAD");
  });
  await assertNoNewEvents(outsider, async () => {
    assert.equal((await f.call("/friends/remove", "owner", { friendId: "friend" })).status, 200);
    assert.equal(f.state.friends.has("owner:friend"), false);
    assert.equal(f.state.friends.has("friend:owner"), false);
  }, "friendListUpdated");
  assert.equal((await action(friend, "join-garden", "owner")).ok, false);
});

for (const reason of ["privacy", "friendship"]) test(`${reason} revocation rejects later actions/broadcasts and reconnect join`, async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(owner, "join-garden", "owner"); await action(friend, "join-garden", "owner");
  const revoke = () => reason === "privacy" ? f.call("/users/me/garden-privacy", "owner", { allowGardenVisits: false }, "PATCH")
    : f.call("/friends/remove", "owner", { friendId: "friend" });
  assert.equal((await revoke()).status, 200);
  await assertNoNewEvents(friend, () => action(owner, "move-avatar", move));
  await assertNoNewEvents(owner, async () => { assert.equal((await action(friend, "move-avatar", move)).ok, false); });
  friend.disconnect(); const fresh = await f.socket("friend");
  assert.equal((await action(fresh, "join-garden", "owner")).ok, false);
});

for (const reason of ["privacy", "friendship"]) test(`paused join cannot finish after ${reason} revoke/regrant`, async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(owner, "join-garden", "owner");
  let enter, release; const entered = new Promise(resolve => { enter = resolve; }); const wait = new Promise(resolve => { release = resolve; });
  f.state.pauseFriend = { enter, wait };
  const pending = action(friend, "join-garden", "owner"); await entered;
  if (reason === "privacy") {
    assert.equal((await f.call("/users/me/garden-privacy", "owner", { allowGardenVisits: false }, "PATCH")).status, 200);
    assert.equal((await f.call("/users/me/garden-privacy", "owner", { allowGardenVisits: true }, "PATCH")).status, 200);
  } else {
    assert.equal((await f.call("/friends/remove", "owner", { friendId: "friend" })).status, 200);
    f.state.friends.add("owner:friend"); f.state.friends.add("friend:owner");
  }
  release(); assert.equal((await pending).ok, false);
  await assertNoNewEvents(friend, () => action(owner, "move-avatar", move));
  assert.equal((await action(friend, "join-garden", "owner")).ok, true, "fresh join after regrant still works");
});

test("provider session revocation rejects existing actions and inbound recipient delivery", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(owner, "join-garden", "owner"); await action(friend, "join-user", "friend"); await action(friend, "join-garden", "owner");
  f.state.revoked.add("friend");
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  await assertNoNewEvents(friend, () => action(owner, "move-avatar", move)); await disconnected;
  assert.equal(friend.connected, false);
  await assert.rejects(f.socket("friend"), /Invalid or expired/);
});

test("account deletion disconnects subscriptions; old identity cannot reconnect", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(friend, "join-user", "friend"); await action(friend, "join-garden", "owner");
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  assert.equal((await f.call("/users/friend", "friend", undefined, "DELETE")).status, 200);
  await disconnected; assert.equal(friend.connected, false);
  await action(owner, "join-garden", "owner"); await assertNoNewEvents(friend, () => action(owner, "move-avatar", move));
  await assert.rejects(f.socket("friend"), /Invalid or expired/);
});

test("malformed/schema-large movement rejected before authorization work", async t => {
  const f = await fixture(t), friend = await f.socket("friend"); await action(friend, "join-garden", "owner");
  for (const payload of [null, [], { ...move, x: "10" }, { ...move, x: 2001 }, { ...move, y: null }, { ...move, admin: true }, { ...move, name: "x".repeat(3000) }]) {
    const before = f.state.calls;
    assert.equal((await action(friend, "move-avatar", payload)).code, "INVALID_PAYLOAD");
    assert.equal(f.state.calls, before);
  }
});

for (const binary of [false, true]) test(`transport rejects ${binary ? "binary attachment" : "oversized frame"} movement`, async t => {
  const f = await fixture(t), friend = await f.socket("friend"); await action(friend, "join-garden", "owner");
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  friend.emit("move-avatar", { ...move, name: binary ? Buffer.alloc(10) : "x".repeat(SOCKET_MAX_PACKET_BYTES+100) });
  await disconnected; assert.equal(friend.connected, false);
});

test("movement flood is bounded while normal movement still succeeds after refill", async t => {
  const f = await fixture(t), friend = await f.socket("friend"); await action(friend, "join-garden", "owner");
  const results = await Promise.all(Array.from({ length: 180 }, (_, x) => action(friend, "move-avatar", { ...move, x })));
  assert.ok(results.some(reply => reply.code === "RATE_LIMITED"));
  assert.ok(results.filter(reply => reply.ok).length <= 90);
  await delay(1050); assert.equal((await action(friend, "move-avatar", move)).ok, true);
});

test("60Hz normal movement cadence delivers every action in the web socket runtime", async t => {
  const f = await fixture(t), friend = await f.socket("friend"); await action(friend, "join-garden", "owner");
  let count = 0; friend.on("avatarMoved", () => count++);
  const requests = [];
  for (let x=0;x<60;x++) { requests.push(action(friend, "move-avatar", { ...move, x })); await delay(1000/60); }
  assert.ok((await Promise.all(requests)).every(reply => reply.ok));
  assert.equal(count, 60);
});

test("user budgets span sockets/reconnects; unknown/join floods and concurrency are bounded", () => {
  let timestamp = 0; const budget = createSocketBudget({ now: () => timestamp });
  const a = { data: { currentUserId: "same" } }, b = { data: { currentUserId: "same" } };
  assert.equal(budget.attach(a), true); assert.equal(budget.attach(b), true);
  let accepted = 0;
  for (let i=0;i<90;i++) accepted += Number(budget.packet(a, "move-avatar"));
  for (let i=0;i<90;i++) accepted += Number(budget.packet(b, "move-avatar"));
  budget.detach(a); const fresh = { data: { currentUserId: "same" } }; budget.attach(fresh);
  assert.equal(budget.packet(fresh, "move-avatar"), false); assert.equal(accepted, 180);
  timestamp = 1100; assert.equal(budget.packet(fresh, "move-avatar"), true);
  for (let i=0;i<30;i++) budget.packet(fresh, "join-garden");
  assert.equal(budget.packet(fresh, "join-garden"), false);
  assert.equal(budget.packet(fresh, "unknown-event"), false);
  const releases = Array.from({ length: 32 }, () => budget.enter(fresh));
  assert.ok(releases.every(Boolean)); assert.equal(budget.enter(fresh), null); releases.forEach(release => release());
  assert.ok(budget.enter(fresh));
});

test("revoked session cannot issue later movement or rejoin its private user room", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(owner, "join-garden", "owner"); await action(friend, "join-garden", "owner");
  f.state.revoked.add("friend");
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  await assertNoNewEvents(owner, async () => { friend.emit("move-avatar", move); await disconnected; });
  assert.equal(friend.connected, false);
});

test("JSON polling transport retains authorized joins and normal movement", async t => {
  const f = await fixture(t), friend = await f.socket("friend", ["polling"]);
  assert.equal((await action(friend, "join-user", "friend")).ok, true);
  assert.equal((await action(friend, "join-garden", "owner")).ok, true);
  assert.equal((await action(friend, "move-avatar", { ...move, visitorId: "friend", userId: "friend", ownerId: "owner", name: "Visitor", avatar: "🦋" })).ok, true);
});

test("revoked recipient cannot receive private user-room friend notifications", async t => {
  const f = await fixture(t), friend = await f.socket("friend");
  await action(friend, "join-user", "friend"); f.state.revoked.add("friend");
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  await assertNoNewEvents(friend, async () => {
    assert.equal((await f.call("/friends/remove", "owner", { friendId: "friend" })).status, 200);
    await disconnected;
  }, "friendListUpdated");
});

test("friend removal revokes both directional garden subscriptions", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  assert.equal((await action(owner, "join-garden", "friend")).ok, true);
  assert.equal((await action(friend, "join-garden", "owner")).ok, true);
  assert.equal((await f.call("/friends/remove", "owner", { friendId: "friend" })).status, 200);
  assert.equal((await action(owner, "move-avatar", { ...move, gardenOwnerId: "friend" })).ok, false);
  assert.equal((await action(friend, "move-avatar", move)).ok, false);
  assert.equal((await action(owner, "join-garden", "friend")).ok, false);
});

test("ending a friendship keeps each person's own Garden subscription", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  assert.equal((await action(owner, "join-garden", "owner")).ok, true);
  assert.equal((await action(friend, "join-garden", "owner")).ok, true);
  assert.equal((await f.call("/friends/remove", "owner", { friendId: "friend" })).status, 200);
  assert.equal((await action(friend, "move-avatar", move)).ok, false);
  // No rejoin: the owner is still in their own Garden after the friend is gone.
  assert.equal((await action(owner, "move-avatar", move)).ok, true);
});

test("paused authorized movement cannot publish after privacy revocation", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(owner, "join-garden", "owner"); await action(friend, "join-garden", "owner");
  let enter, release; const entered = new Promise(resolve => { enter = resolve; }); const wait = new Promise(resolve => { release = resolve; });
  f.state.pauseFriend = { enter, wait };
  await assertNoNewEvents(owner, async () => {
    const pending = action(friend, "move-avatar", move); await entered;
    try {
      const response = await f.call("/users/me/garden-privacy", "owner", { allowGardenVisits: false }, "PATCH");
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { allowGardenVisits: false });
      assert.equal(f.state.users.owner.allowGardenVisits, false);
    } finally { release(); }
    assert.equal((await pending).ok, false);
    assert.equal((await action(friend, "move-avatar", move)).ok, false);
    assert.equal((await action(friend, "join-garden", "owner")).ok, false);
    const reconnect = await f.socket("friend");
    assert.equal((await action(reconnect, "join-garden", "owner")).ok, false);
    assert.equal((await action(owner, "join-garden", "owner")).ok, true);
  });
});

test("deleting a Garden owner evicts visiting subscriptions too", async t => {
  const f = await fixture(t), friend = await f.socket("friend");
  await action(friend, "join-garden", "owner");
  assert.equal((await f.call("/users/owner", "owner", undefined, "DELETE")).status, 200);
  assert.equal((await action(friend, "move-avatar", move)).ok, false);
  assert.equal((await action(friend, "join-garden", "owner")).ok, false);
});

test("session revoked during paused movement is rechecked before any delivery", async t => {
  const f = await fixture(t), owner = await f.socket("owner"), friend = await f.socket("friend");
  await action(owner, "join-garden", "owner"); await action(friend, "join-garden", "owner");
  let enter, release; const entered = new Promise(resolve => { enter = resolve; }); const wait = new Promise(resolve => { release = resolve; });
  f.state.pauseFriend = { enter, wait };
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  await assertNoNewEvents(owner, async () => {
    friend.emit("move-avatar", move); await entered;
    f.state.revoked.add("friend"); release(); await disconnected;
  });
  assert.equal(friend.connected, false);
});

test("idle revoked session is disconnected without requiring another client event", async t => {
  const f = await fixture(t), friend = await f.socket("friend"); await action(friend, "join-user", "friend");
  const disconnected = new Promise(resolve => friend.once("disconnect", resolve));
  f.state.revoked.add("friend"); await disconnected;
  assert.equal(friend.connected, false);
});

test("a stale concurrent join cannot remove the latest same-garden subscription", async t => {
  const f = await fixture(t), friend = await f.socket("friend");
  let enter, release; const entered = new Promise(resolve => { enter = resolve; }); const wait = new Promise(resolve => { release = resolve; });
  f.state.pauseFriend = { enter, wait, skip: 1 };
  const older = action(friend, "join-garden", "owner"); await entered;
  assert.equal((await action(friend, "join-garden", "owner")).ok, true);
  release(); assert.equal((await older).ok, false);
  assert.equal((await action(friend, "move-avatar", move)).ok, true);
});
