import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { loadAvatarCollection, onAvatarsChanged, type AvatarCollection } from './avatars';
import { loadCheckInMonth, onClosenessChanged, type CheckInMonth } from './fairyCloseness';

// What lights the Collection icon's red dot in the Garden (owner, 2026-11-06):
// - keepsakes her check-in gave today that the owner has not looked at in the keepsake book yet;
// - an avatar reward that can be chosen now, until the owner has seen the avatar collection once
//   (choosing is not required; a reward for a newly reached level lights it again).
// What was seen is remembered per account on this device, by today's date and ids, and by the
// waiting reward levels, so nothing personal is stored.
export interface CollectionAlerts { newKeepsakes: string[]; keepsakes: boolean; avatars: boolean }
const NONE: CollectionAlerts = { newKeepsakes: [], keepsakes: false, avatars: false };

export function todayKeepsakes(month: CheckInMonth | null): { date: string; ids: string[] } | null {
  const day = month?.days.find(entry => entry.localDate === month.today);
  const ids = [...new Set(day?.keepsakes.map(keepsake => keepsake.id) ?? [])];
  return month && ids.length ? { date: month.today, ids } : null;
}
export const keepsakeMark = (today: { date: string; ids: string[] } | null) => (today ? `${today.date}|${[...today.ids].sort().join(',')}` : '');
export const avatarMark = (collection: AvatarCollection | null) =>
  collection?.bondOn ? collection.pending.filter(reward => reward.eligible > 0).map(reward => reward.level).join(',') : '';

export function collectionAlerts(month: CheckInMonth | null, collection: AvatarCollection | null, seen: { keepsakes: string; avatars: string }): CollectionAlerts {
  const today = todayKeepsakes(month);
  const kMark = keepsakeMark(today), aMark = avatarMark(collection);
  return { newKeepsakes: today?.ids ?? [], keepsakes: Boolean(kMark) && kMark !== seen.keepsakes, avatars: Boolean(aMark) && aMark !== seen.avatars };
}

const seenKey = (owner: string) => `petalpal.collection.seen.v1:${owner}`;
let owner = '', month: CheckInMonth | null = null, avatars: AvatarCollection | null = null;
let seen = { keepsakes: '', avatars: '' }, current = NONE, generation = 0;
const listeners = new Set<() => void>();
const publish = () => { current = collectionAlerts(month, avatars, seen); listeners.forEach(listener => listener()); };

async function refresh(forOwner: string) {
  const asked = generation;
  const [nextMonth, nextAvatars, stored] = await Promise.all([
    loadCheckInMonth().catch(() => month),
    loadAvatarCollection().catch(() => avatars),
    AsyncStorage.getItem(seenKey(forOwner)).catch(() => null),
  ]);
  if (asked !== generation || forOwner !== owner) return;
  month = nextMonth; avatars = nextAvatars;
  try { const parsed = JSON.parse(stored || 'null'); if (parsed && typeof parsed === 'object') seen = { keepsakes: String(parsed.keepsakes ?? ''), avatars: String(parsed.avatars ?? '') }; } catch { /* keep */ }
  publish();
}
function remember() { if (owner) AsyncStorage.setItem(seenKey(owner), JSON.stringify(seen)).catch(() => undefined); publish(); }

// The owner opened the keepsake book (today's keepsakes are seen) or the avatar collection.
export function markKeepsakesSeen() { const mark = keepsakeMark(todayKeepsakes(month)); if (mark && mark !== seen.keepsakes) { seen = { ...seen, keepsakes: mark }; remember(); } }
export function markAvatarsSeen() { const mark = avatarMark(avatars); if (mark && mark !== seen.avatars) { seen = { ...seen, avatars: mark }; remember(); } }

// The alerts for the signed-in owner; reloads on a check-in, an avatar change or a return to the app.
export function useCollectionAlerts(ownerId: string | undefined): CollectionAlerts {
  useEffect(() => {
    if (!ownerId) return;
    if (owner !== ownerId) { generation++; owner = ownerId; month = null; avatars = null; seen = { keepsakes: '', avatars: '' }; publish(); }
    void refresh(ownerId);
    const again = () => void refresh(ownerId);
    const offCloseness = onClosenessChanged(again), offAvatars = onAvatarsChanged(again);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') again(); });
    return () => { offCloseness(); offAvatars(); subscription.remove(); };
  }, [ownerId]);
  const alerts = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => current);
  return ownerId && owner === ownerId ? alerts : NONE;
}
