import {runtimeAudit} from '../performance/runtimeAudit';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export const DAY_START_HOUR = 6;
export const EVENING_START_HOUR = 19;
export const NIGHT_START_HOUR = 22;
export const WORLD_TIME_REFRESH_MS = 60_000;

export type WorldTimePhase = 'day' | 'evening' | 'night';
export type WorldTimeOverride = 'auto' | 'day' | 'evening' | 'night';

export type WorldTimeState = {
  now: Date;
  localHour: number;
  localMinute: number;
  phase: WorldTimePhase;
  isDay: boolean;
  isEvening: boolean;
  isNight: boolean;
  isTreehouseLightingTime: boolean;
  override: WorldTimeOverride;
  setOverride: (override: WorldTimeOverride) => void;
};

export function getWorldTimePhase(localHour: number): WorldTimePhase {
  if (localHour >= NIGHT_START_HOUR || localHour < DAY_START_HOUR) return 'night';
  if (localHour >= EVENING_START_HOUR) return 'evening';
  return 'day';
}

const WorldTimeContext = createContext<WorldTimeState | null>(null);

export function WorldTimeProvider({ children }: { children: ReactNode }) {
  runtimeAudit.render('WorldTimeProvider');
  const [now, setNow] = useState(() => new Date());
  const [devOverride, setDevOverride] = useState<WorldTimeOverride>(() => {
    if (__DEV__ && typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('phase') || params.get('time');
      if (p === 'day' || p === 'evening' || p === 'night') return p;
    }
    return 'auto';
  });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const refresh = () => setNow(new Date());
    const stopInterval = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
    };
    const startInterval = () => {
      stopInterval();
      refresh();
      interval = setInterval(refresh, WORLD_TIME_REFRESH_MS);
    };
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') startInterval();
      else stopInterval();
    };

    if (AppState.currentState === 'active') startInterval();
    else refresh();
    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      stopInterval();
      subscription.remove();
    };
  }, []);

  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  const actualPhase = getWorldTimePhase(localHour);
  const override = __DEV__ ? devOverride : 'auto';
  const phase = override === 'auto' ? actualPhase : override;
  const value = useMemo<WorldTimeState>(() => ({
    now,
    localHour,
    localMinute,
    phase,
    isDay: phase === 'day',
    isEvening: phase === 'evening',
    isNight: phase === 'night',
    isTreehouseLightingTime: phase !== 'day',
    override,
    setOverride: (nextOverride) => {
      if (__DEV__) setDevOverride(nextOverride);
    },
  }), [now, localHour, localMinute, phase, override]);

  return <WorldTimeContext.Provider value={value}>{children}</WorldTimeContext.Provider>;
}

export function useWorldTime() {
  const value = useContext(WorldTimeContext);
  if (!value) throw new Error('useWorldTime must be used inside WorldTimeProvider');
  return value;
}
