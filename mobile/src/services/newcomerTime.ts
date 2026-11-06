import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// How long an account has had PetalPal open, added up over every visit on this device, until it
// reaches NEWCOMER_MS. Until then the Garden's side icons glow at full strength so a new owner
// notices them (owner, 2026-11-06); after that they keep the quiet glow. Only foreground time
// counts: a backgrounded or sleeping app, or a long gap between ticks, adds nothing.
export const NEWCOMER_MS = 30 * 60_000;
const TICK_MS = 15_000;
const MAX_STEP_MS = 20_000;
const key = (owner: string) => `petalpal.newcomerTime.v1:${owner}`;

export async function readOnlineMs(owner: string): Promise<number> {
  const stored = Number(await AsyncStorage.getItem(key(owner)).catch(() => null));
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

// The time since the last tick, counted only while the app was in front and the gap was a normal tick.
export const countedStep = (sinceLast: number) => (sinceLast > 0 && sinceLast <= MAX_STEP_MS ? sinceLast : 0);

// True while this account is still within its first half hour of use. `owner` is the account id
// (signed-out visitors share 'guest'). Starts false until the stored total is read, so a returning
// owner never sees a flash of the bright glow.
export function useNewcomerGlow(owner: string | undefined, now: () => number = Date.now): boolean {
  const id = owner || 'guest';
  const [newcomer, setNewcomer] = useState(false);
  useEffect(() => {
    let total = 0, last = 0, loaded = false, active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (!loaded || total >= NEWCOMER_MS) return;
      const at = now();
      total += countedStep(at - last);
      last = at;
      AsyncStorage.setItem(key(id), String(Math.round(total))).catch(() => undefined);
      if (total >= NEWCOMER_MS) { setNewcomer(false); stop(); }
    };
    const start = () => { if (timer || total >= NEWCOMER_MS) return; last = now(); timer = setInterval(tick, TICK_MS); };
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    readOnlineMs(id).then(stored => {
      if (!active) return;
      total = stored; loaded = true;
      setNewcomer(total < NEWCOMER_MS);
      if (AppState.currentState !== 'background') start();
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') start();
      else { tick(); stop(); }
    });
    return () => { active = false; tick(); stop(); subscription.remove(); };
  }, [id, now]);
  return newcomer;
}
