import { hiddenSocialIds, filterSocialPayload, canVisitGarden } from "./garden-access.js";

export const SOCKET_MAX_PACKET_BYTES = 8192;
export const SOCKET_LIMITS = Object.freeze({
  movement: { rate: 90, burst: 90, userRate: 180, userBurst: 180 },
  control: { rate: 5, burst: 10, userRate: 10, userBurst: 20 },
  all: { rate: 120, burst: 120, userRate: 240, userBurst: 240 }
});
const ACTIONS = new Set(["join-user", "leave-user", "join-garden", "move-avatar"]);
const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const coordinate = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 2000;
const pair = (a, b) => [a, b].sort().join("|");

export function validSocketPayload(action, payload, userId) {
  if (action === "join-user" || action === "leave-user") {
    if (payload === undefined || payload === userId) return true;
    return payload !== null && typeof payload === "object" && !Array.isArray(payload) &&
      Object.keys(payload).every((key) => ["userId", "ownerId"].includes(key) && payload[key] === userId);
  }
  if (action === "join-garden") return validId(payload);
  if (action !== "move-avatar" || !payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = new Set(["gardenOwnerId", "x", "y", "visitorId", "userId", "ownerId", "name", "avatar"]);
  if (Object.keys(payload).some((key) => !keys.has(key)) || Buffer.byteLength(JSON.stringify(payload)) > 2048) return false;
  return validId(payload.gardenOwnerId) && coordinate(payload.x) && coordinate(payload.y) &&
    ["visitorId", "userId"].every((key) => payload[key] === undefined || payload[key] === userId) &&
    (payload.ownerId === undefined || payload.ownerId === payload.gardenOwnerId) &&
    (payload.name === undefined || (typeof payload.name === "string" && payload.name.length <= 256)) &&
    (payload.avatar === undefined || (typeof payload.avatar === "string" && payload.avatar.length <= 256));
}

function take(buckets, key, rate, burst, now) {
  const bucket = buckets.get(key) || { tokens: burst, at: now };
  bucket.tokens = Math.min(burst, bucket.tokens + Math.max(0, now - bucket.at) * rate / 1000);
  bucket.at = now;
  buckets.set(key, bucket);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// One bounded process-local budget per verified user, retained across reconnects.
export function createSocketBudget({ now = Date.now } = {}) {
  const users = new Map(), sockets = new WeakMap();
  function attach(socket) {
    const timestamp = now(), userId = socket.data.currentUserId;
    if (users.size >= 10000) {
      for (const [id, user] of users) if (!user.connections && !user.inflight && timestamp - user.last > 60000) users.delete(id);
    }
    if (!users.has(userId) && users.size >= 10000) return false;
    const user = users.get(userId) || { buckets: new Map(), connections: 0, inflight: 0, last: timestamp };
    if (user.connections >= 8) return false;
    user.connections += 1; user.last = timestamp; users.set(userId, user);
    sockets.set(socket, { user, buckets: new Map(), inflight: 0 });
    return true;
  }
  function packet(socket, action) {
    const state = sockets.get(socket);
    if (!state) return false;
    const timestamp = now(); state.user.last = timestamp;
    const limits = action === "move-avatar" ? SOCKET_LIMITS.movement : SOCKET_LIMITS.control;
    return take(state.buckets, "all", SOCKET_LIMITS.all.rate, SOCKET_LIMITS.all.burst, timestamp) &&
      take(state.user.buckets, "all", SOCKET_LIMITS.all.userRate, SOCKET_LIMITS.all.userBurst, timestamp) &&
      ACTIONS.has(action) && take(state.buckets, action, limits.rate, limits.burst, timestamp) &&
      take(state.user.buckets, action, limits.userRate, limits.userBurst, timestamp);
  }
  function enter(socket) {
    const state = sockets.get(socket);
    if (!state || state.inflight >= 32 || state.user.inflight >= 64) return null;
    state.inflight += 1; state.user.inflight += 1;
    return () => { state.inflight -= 1; state.user.inflight -= 1; };
  }
  function detach(socket) {
    const state = sockets.get(socket);
    if (state) { state.user.connections -= 1; state.user.last = now(); sockets.delete(socket); }
  }
  return { attach, packet, enter, detach };
}

export function createRealtimeSecurity({ io, db, authenticate, logger, budget = createSocketBudget(), recheckMs = 5000 }) {
  // These client actions are JSON-only. Reject binary envelopes/attachments
  // before Socket.IO can accumulate an unbounded attachment sequence.
  io.engine.on("connection", (connection) => {
    connection.on("packet", (packet) => {
      if (packet.type === "message" && (typeof packet.data !== "string" || /^[56]/.test(packet.data))) connection.close();
    });
  });
  const blockedUsers = new Map(), blockedGardens = new Map(), blockedPairs = new Map();
  const bump = (socket) => { socket.data.realtimeVersion = (socket.data.realtimeVersion || 0) + 1; };
  function blocked(socket, ownerId) {
    const userId = socket.data.currentUserId;
    return blockedUsers.has(userId) || blockedUsers.has(ownerId) || (userId !== ownerId &&
      (blockedGardens.has(ownerId) || blockedPairs.has(pair(userId, ownerId))));
  }
  function current(socket, version, ownerId) {
    return socket.connected && socket.data.realtimeVersion === version && !blocked(socket, ownerId);
  }
  async function leaveGarden(socket, ownerId) {
    if (socket.data.currentGarden === ownerId) { socket.data.currentGarden = undefined; bump(socket); }
    await socket.leave(`garden:${ownerId}`);
  }
  async function gardenAllowed(socket, ownerId, version = socket.data.realtimeVersion) {
    if (!current(socket, version, ownerId)) return false;
    const owner = await db.user.findUnique({ where: { id: ownerId }, select: { id: true, allowGardenVisits: true } });
    const allowed = await canVisitGarden(db, owner, socket.data.currentUserId);
    return allowed && current(socket, version, ownerId);
  }
  function connection(socket) {
    socket.data.realtimeVersion = 0;
    if (blockedUsers.has(socket.data.currentUserId) || !budget.attach(socket)) { socket.disconnect(true); return false; }
    socket.use((packet, next) => {
      const action = packet[0], ack = typeof packet.at(-1) === "function" ? packet.at(-1) : null;
      if (!budget.packet(socket, action)) { ack?.({ ok: false, code: "RATE_LIMITED" }); return; }
      const args = packet.slice(1, ack ? -1 : undefined);
      if (args.length > 1 || !validSocketPayload(action, args[0], socket.data.currentUserId)) {
        ack?.({ ok: false, code: "INVALID_PAYLOAD" }); return;
      }
      next();
    });
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return; checking = true;
      try {
        if (!await authenticate(socket)) return;
        const owner = socket.data.currentGarden;
        if (owner && !await gardenAllowed(socket, owner)) await leaveGarden(socket, owner);
      } catch { socket.disconnect(true); } finally { checking = false; }
    }, recheckMs);
    timer.unref?.();
    socket.once("disconnect", () => { bump(socket); clearInterval(timer); budget.detach(socket); });
    return true;
  }
  async function run(socket, payload, ack, operation) {
    if (typeof payload === "function") { ack = payload; payload = undefined; }
    const reply = (code) => { if (typeof ack === "function") ack(code ? { ok: false, code } : { ok: true }); };
    const release = budget.enter(socket);
    if (!release) { reply("RATE_LIMITED"); return; }
    const version = socket.data.realtimeVersion;
    try {
      if (!await authenticate(socket) || !current(socket, version)) { reply("UNAUTHORIZED"); return; }
      const ok = await operation(payload, version);
      reply(ok === false ? "FORBIDDEN" : null);
    } catch (error) {
      logger?.("Realtime authorization error", error);
      reply("UNAVAILABLE");
    } finally { release(); }
  }
  async function broadcast(rooms, event, data, actor = null) {
    try {
      const subscribers = await io.in(rooms).fetchSockets();
      const movementOwner = event === "avatarMoved" ? rooms.find(room => room.startsWith("garden:"))?.slice(7) : null;
      async function actorAllowed() {
        if (actor) return await authenticate(actor.socket) && actor.socket.data.currentGarden === actor.ownerId &&
          await gardenAllowed(actor.socket, actor.ownerId, actor.version);
        if (!movementOwner) return true;
        // HTTP movement publications use the server-derived actor too.
        const visitorId = data.visitorId;
        if (!validId(visitorId) || blocked({ data: { currentUserId: visitorId } }, movementOwner)) return false;
        const owner = await db.user.findUnique({ where: { id: movementOwner }, select: { id: true, allowGardenVisits: true } });
        const visitor = await db.user.findUnique({ where: { id: visitorId }, select: { id: true } });
        return Boolean(visitor) && await canVisitGarden(db, owner, visitorId);
      }
      for (const subscriber of subscribers) {
        // Default deployment uses local sockets. Never trust adapter-visible identity alone.
        const socket = io.sockets.sockets.get(subscriber.id);
        if (!socket || !await authenticate(socket)) continue;
        const version = socket.data.realtimeVersion;
        let allowed = false;
        for (const room of rooms) {
          if (!socket.rooms.has(room)) continue;
          if (room === `user:${socket.data.currentUserId}` && current(socket, version)) allowed = true;
          if (room.startsWith("garden:")) {
            const ownerId = room.slice(7);
            if (socket.data.currentGarden === ownerId && await gardenAllowed(socket, ownerId, version)) allowed = true;
            else await leaveGarden(socket, ownerId);
          }
        }
        if (!await actorAllowed()) {
          if (actor) await leaveGarden(actor.socket, actor.ownerId);
          return false;
        }
        if (allowed && current(socket, version) && (!actor || current(actor.socket, actor.version, actor.ownerId))) {
          const hidden = await hiddenSocialIds(db, socket.data.currentUserId);
          if (hidden.has(actor?.socket.data.currentUserId) || hidden.has(movementOwner)) continue;
          const safe = filterSocialPayload(data, hidden);
          // A filtered social record must not become an empty notification.
          if (data?.record && !safe?.record) continue;
          // Recheck after database awaits: a concurrent revocation invalidates version.
          if (safe && current(socket, version) && (!actor || current(actor.socket, actor.version, actor.ownerId))) socket.emit(event, safe);
        }
      }
      return true;
    } catch (error) { logger?.("Realtime broadcast authorization error", error); return false; }
  }
  function to(room, rooms = []) {
    const selected = [...rooms, room];
    return { to: (next) => to(next, selected), emit: (event, data) => broadcast(selected, event, data) };
  }
  async function withRevocation({ userId, gardenOwnerId, friends }, operation) {
    const entries = userId ? [[blockedUsers, userId]] : gardenOwnerId ? [[blockedGardens, gardenOwnerId]] : [[blockedPairs, pair(...friends)], ...friends.map(id => [blockedUsers, id])];
    for (const [map, key] of entries) map.set(key, (map.get(key) || 0) + 1);
    const affected = (socket) => {
      const actor = socket.data.currentUserId, gardens = [socket.data.currentGarden, socket.data.pendingGarden];
      if (userId) return actor === userId || gardens.includes(userId);
      if (gardenOwnerId) return actor !== gardenOwnerId && gardens.includes(gardenOwnerId);
      return friends.includes(actor);
    };
    async function evict() {
      for (const socket of io.sockets.sockets.values()) {
        if (!affected(socket)) continue;
        bump(socket);
        if (userId && socket.data.currentUserId === userId) { socket.disconnect(true); continue; }
        const owner = socket.data.currentGarden;
        // Ending a friendship (block or remove) takes each person out of the other's Garden, never
        // out of their own: otherwise their own Garden stopped updating until a reload.
        if (owner && !(friends && owner === socket.data.currentUserId)) await leaveGarden(socket, owner);
      }
    }
    try { await evict(); return await operation(); }
    finally {
      try { await evict(); } finally {
        for (const [map, key] of entries) { const count = map.get(key) - 1; if (count) map.set(key, count); else map.delete(key); }
      }
    }
  }
  return { connection, run, current, gardenAllowed, leaveGarden, to, broadcast, withRevocation };
}
