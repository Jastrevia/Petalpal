// Who is online: a user is online while at least one of their sockets is in their private user
// room. Kept in memory like the active Garden visitors (one API instance). Going offline waits a
// short grace period so a page reload or a brief network drop does not flicker for friends.
export function createPresence({ offlineDelayMs = 15_000, onChange = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const sockets = new Map(), pendingOffline = new Map();
  return {
    join(userId, socketId) {
      const set = sockets.get(userId) || new Set();
      const wasOnline = set.size > 0 || pendingOffline.has(userId);
      set.add(socketId); sockets.set(userId, set);
      if (pendingOffline.has(userId)) { clearTimer(pendingOffline.get(userId)); pendingOffline.delete(userId); }
      if (!wasOnline) onChange(userId, true);
    },
    leave(userId, socketId) {
      const set = sockets.get(userId);
      if (!set?.delete(socketId) || set.size) return;
      sockets.delete(userId);
      const timer = setTimer(() => {
        pendingOffline.delete(userId);
        if (!sockets.has(userId)) onChange(userId, false);
      }, offlineDelayMs);
      timer?.unref?.();
      pendingOffline.set(userId, timer);
    },
    isOnline(userId) { return sockets.has(userId) || pendingOffline.has(userId); },
  };
}
