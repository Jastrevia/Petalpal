import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { loadFriendRequests, loadFriends } from './friends';
import { subscribeUserRealtime } from './userRealtime';

// The dot on the Friends icon: requests still waiting for an answer, and people who became friends
// since the list was last looked at. A request's dot goes once it is answered; a new friend's goes
// when Friends is left after seeing them, and their row looks like everyone else's again. The ids
// already seen stay on this device, per account (ids only), so a friend accepted while away counts.
export interface FriendAlerts { incoming: number; newFriends: readonly string[] }
const NONE: FriendAlerts = { incoming: 0, newFriends: [] };
const key = (ownerId: string) => `petalpal.friends.seen.v1.${ownerId}`;
let alerts = NONE, owner: string | null = null, friends: string[] = [];
let seen: Set<string> | null = null, syncing: Promise<void> | null = null, again = false, stop: (() => void) | null = null;
const listeners = new Set<() => void>();
function publish(next: FriendAlerts) {
  if (next.incoming === alerts.incoming && next.newFriends.join() === alerts.newFriends.join()) return;
  alerts = next; listeners.forEach(listener => listener());
}
const remember = (ownerId: string) => { if (seen) AsyncStorage.setItem(key(ownerId), JSON.stringify([...seen])).catch(() => undefined); };

async function loadSeen(ownerId: string) {
  const stored = await AsyncStorage.getItem(key(ownerId)).catch(() => null);
  try { const ids: unknown = stored ? JSON.parse(stored) : null; return Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === 'string')) : null; }
  catch { return null; }
}
// A failed read (the API still waking, offline) keeps what is showing and asks again shortly.
const RETRY_MS = 20_000;
let retry: ReturnType<typeof setTimeout> | null = null;
export function syncFriendAlerts(): Promise<void> {
  if (syncing) { again = true; return syncing; }
  const ownerId = owner;
  if (!ownerId) return Promise.resolve();
  syncing = (async () => {
    const stored = seen ?? await loadSeen(ownerId);
    const [list, requests] = await Promise.all([loadFriends(ownerId), loadFriendRequests(ownerId)]);
    if (owner !== ownerId) return;
    friends = list.map(friend => friend.id);
    // First time on this device: everyone already here counts as seen.
    seen = stored ?? new Set(friends);
    if (!stored) remember(ownerId);
    publish({ incoming: requests.incoming.length, newFriends: friends.filter(id => !seen!.has(id)) });
  })().catch(() => {
    if (retry) clearTimeout(retry);
    retry = setTimeout(() => { retry = null; void syncFriendAlerts(); }, RETRY_MS);
  }).finally(() => {
    syncing = null;
    if (again) { again = false; void syncFriendAlerts(); }
  });
  return syncing;
}
export function startFriendAlerts(ownerId: string) {
  if (owner === ownerId) return;
  stopFriendAlerts();
  owner = ownerId;
  const unsubscribe = subscribeUserRealtime({ friendChanged: () => void syncFriendAlerts(), connection: connected => { if (connected) void syncFriendAlerts(); } });
  const foreground = AppState.addEventListener('change', state => { if (state === 'active') void syncFriendAlerts(); });
  stop = () => { unsubscribe(); foreground.remove(); };
  void syncFriendAlerts();
}
export function stopFriendAlerts() {
  stop?.(); stop = null; owner = null; if (retry) { clearTimeout(retry); retry = null; } seen = null; friends = []; again = false; publish(NONE);
}
// Someone this owner just accepted is no news to them.
export function noteFriendAcceptedHere(friendId: string) {
  seen?.add(friendId);
  if (owner) remember(owner);
}
export function markNewFriendsSeen() {
  if (!owner || !seen || !alerts.newFriends.length) return;
  friends.forEach(id => seen!.add(id));
  remember(owner);
  publish({ ...alerts, newFriends: [] });
}
export function useFriendAlerts() {
  const [current, setCurrent] = useState(alerts);
  useEffect(() => {
    const update = () => setCurrent(alerts);
    listeners.add(update); update();
    return () => { listeners.delete(update); };
  }, []);
  return current;
}
