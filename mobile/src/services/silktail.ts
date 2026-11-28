import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';
import { foxReason, localDateOf, type FoxReason, type HolidayId, type SilktailState } from '../components/garden/critters/silktailDays';

// The Silktail Fox's milestone state (GET /api/garden/silktail, lib/silktail.js). A server from
// before the route (404), a guest or no network: no milestone, holidays still count.
export async function loadSilktail() {
  try { return await apiRequest<SilktailState>('/api/garden/silktail'); }
  catch (error) { if (error instanceof ApiError && (error.status === 404 || error.status === 401)) return null; throw error; }
}

// Saving an Event may reach the 14th day: the journal calls silktailChanged() so the fox comes at once.
const changeListeners = new Set<() => void>();
export function onSilktailChanged(listener: () => void) { changeListeners.add(listener); return () => { changeListeners.delete(listener); }; }
export const silktailChanged = () => changeListeners.forEach(listener => listener());

const REFRESH_MS = 15 * 60 * 1000;

// Why the fox is in the Garden today (null: it is not), rechecked whenever the Garden becomes
// active, after an Event is saved, and every 15 minutes while it is open (so a holiday or a
// milestone day ends at local midnight). `signedIn` false (a guest): holidays only.
export function useSilktailReason(active: boolean, signedIn: boolean) {
  const [state, setState] = useState<SilktailState | null>(null);
  const [date, setDate] = useState(() => localDateOf(new Date()));
  const [changes, setChanges] = useState(0);
  useEffect(() => onSilktailChanged(() => setChanges(count => count + 1)), []);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const check = () => {
      setDate(localDateOf(new Date()));
      if (!signedIn) { setState(null); return; }
      loadSilktail().then(next => { if (live) setState(next); }).catch(() => undefined); // offline: keep what we knew
    };
    check();
    const timer = setInterval(check, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [active, signedIn, changes]);
  // A milestone answer from an earlier day no longer counts.
  const milestone = state && state.today === date ? state : null;
  return { reason: previewReason() ?? foxReason(milestone, date), date } as { reason: FoxReason | null; date: string };
}

// Dev web only, to see the fox on any day: ?silktail=milestone (14 days) or ?silktail=<holiday id>
// (christmas, springFestival ...). Release builds never read it.
const HOLIDAY_IDS: readonly HolidayId[] = ['newYear', 'valentines', 'halloween', 'christmas', 'springFestival', 'lantern', 'dragonBoat', 'qixi', 'midAutumn'];
function previewReason(): FoxReason | null {
  if (!__DEV__ || typeof window === 'undefined' || !window.location?.search) return null;
  const value = new URLSearchParams(window.location.search).get('silktail');
  if (value === 'milestone') return { kind: 'milestone', days: 14 };
  return value && (HOLIDAY_IDS as readonly string[]).includes(value) ? { kind: 'holiday', holiday: value as HolidayId } : null;
}
