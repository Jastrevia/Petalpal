import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';

// Closeness with PPL, the calendar check-in and her keepsakes. Contract and screen mapping:
// docs/product/FAIRY_CLOSENESS_API.md. Every route answers 404 while the server switch
// (FAIRY_CLOSENESS_OWNER_IDS) leaves the owner out; that reads as "off" here, not an error.
export type ClosenessSource = 'CHECK_IN' | 'STREAK_7' | 'EVENT' | 'MOMENT_LIKE' | 'FAIRY_TAP' | 'WEEKLY_READ';
export interface Keepsake {
  id: string; rarity: 'COMMON' | 'RARE' | 'MONTHLY'; name: string; note?: string; month?: number;
}
export interface LevelUp { level: number; title: string }
export interface ClosenessSummary {
  locale: 'en' | 'zh-Hans'; localDate: string;
  level: number; title: string; total: number; pointsIntoLevel: number; pointsForNextLevel: number | null;
  nextTitle: { level: number; title: string } | null; maxed: boolean;
  greeting: string; daysTogether: number | null;
  today: { source: ClosenessSource; count: number; dailyCap: number; points: number; pointsEach: number }[];
  checkIn: { checkedInToday: boolean; streak: number; cycleDay: number; graceAvailable: boolean; checkInsToStreakReward: number };
  monthly: { month: string; checkIns: number; needed: number; earned: boolean; keepsake: Keepsake } | null;
  collection: { owned: number; received: number; total: number };
  unlocks: { level: number; key: string; status: 'live' | 'coming_soon'; unlocked: boolean }[];
}
export interface CheckInResult {
  created: boolean; locale: 'en' | 'zh-Hans';
  checkIn: { localDate: string; streak: number; graceUsed: boolean };
  keepsakes: (Keepsake & { reason: 'DAILY' | 'STREAK_7' | 'MONTHLY'; firstTime: boolean })[];
  awarded: number; levelUp: LevelUp | null;
}
export interface CheckInMonth {
  locale: 'en' | 'zh-Hans'; month: string; today: string;
  days: { localDate: string; streak: number; graceUsed: boolean; points: number; keepsakes: (Keepsake & { reason: string })[] }[];
  petalCards?: { localDate: string; id: string; name: string }[]; // the day's drawn petal card, when petal cards are on
}
export interface KeepsakeBook {
  locale: 'en' | 'zh-Hans'; owned: number; received: number; total: number;
  keepsakes: (Keepsake & { owned: boolean; count: number; firstLocalDate: string | null })[];
}

const off = (error: unknown) => error instanceof ApiError && error.status === 404;
async function orOff<T>(request: Promise<T>): Promise<T | null> {
  try { return await request; } catch (error) { if (off(error)) return null; throw error; }
}

// Screens that show closeness (the Fairy card dot, Our Bond, the calendar) reload together
// whenever something changed it here, such as a check-in.
const changeListeners = new Set<() => void>();
export function onClosenessChanged(listener: () => void) { changeListeners.add(listener); return () => { changeListeners.delete(listener); }; }
export const closenessChanged = () => changeListeners.forEach(listener => listener());

export const loadClosenessSummary = () => orOff(apiRequest<ClosenessSummary>('/api/fairy/closeness'));
export async function checkInWithFairy() {
  const result = await orOff(apiRequest<CheckInResult>('/api/fairy/check-in', 'POST', {}));
  if (result?.created) closenessChanged();
  return result;
}
export const loadCheckInMonth = (month?: string) =>
  orOff(apiRequest<CheckInMonth>(`/api/fairy/check-ins${month ? `?month=${encodeURIComponent(month)}` : ''}`));
export const loadKeepsakeBook = () => orOff(apiRequest<KeepsakeBook>('/api/fairy/keepsakes'));

// The summary for the Fairy entry card, reloaded whenever `refreshKey` changes.
// `on` is null until the server has answered, false when the switch leaves the owner out.
export function useClosenessSummary(refreshKey: unknown) {
  const [state, setState] = useState<{ on: boolean | null; summary: ClosenessSummary | null }>({ on: null, summary: null });
  const [changes, setChanges] = useState(0);
  useEffect(() => onClosenessChanged(() => setChanges(count => count + 1)), []);
  useEffect(() => {
    let active = true;
    loadClosenessSummary()
      .then(summary => { if (active) setState({ on: Boolean(summary), summary }); })
      .catch(() => undefined); // offline: keep what we had
    return () => { active = false; };
  }, [refreshKey, changes]);
  return state;
}

// Directing PPL in the Garden (tea, swing, treehouse …) earns closeness, capped at 5 a day by
// the server. At most one request a minute; none after the server says off or capped today.
const TAP_INTERVAL_MS = 60_000;
let lastTapAt = 0, quietUntilDay = '', switchedOff = false;
export function noteFairyInteraction(now = Date.now()) {
  const day = new Date(now).toDateString();
  if (switchedOff || quietUntilDay === day || now - lastTapAt < TAP_INTERVAL_MS) return;
  lastTapAt = now;
  apiRequest<{ awarded: number }>('/api/fairy/closeness/tap', 'POST', {})
    .then(result => { if (!result.awarded) quietUntilDay = day; })
    .catch(error => { if (off(error)) switchedOff = true; });
}

// Calendar marks for one month (YYYY-MM): reloads when the month changes or after a check-in.
export function useCheckInMonth(month: string, enabled: boolean) {
  const [data, setData] = useState<CheckInMonth | null>(null);
  const [changes, setChanges] = useState(0);
  useEffect(() => onClosenessChanged(() => setChanges(count => count + 1)), []);
  // Disabled: no data (cleared while rendering).
  if (!enabled && data !== null) setData(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadCheckInMonth(month).then(result => { if (active) setData(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [month, enabled, changes]);
  return data;
}
