import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, apiRequest } from './api';

// The Fairy's server-side day (GET /api/fairy/runtime), shared by the Garden and the Moments
// dot so both read one request. It refreshes when the Garden opens, when the app returns to the
// foreground and just after her next scheduled change.
export interface FairyRuntime {
  currentState: string;
  nextTransitionAt: string | null;
  gardenSchedule?: boolean;
  moments?: { unread?: boolean };
}

let current: FairyRuntime | null = null;
let fetchedAt = 0;
// Why the last request failed: 'onboarding' until the owner plants a first flower (the server
// answers 409 and her day has not started), otherwise 'unavailable' (offline, API waking).
export type FairyRuntimeBlock = 'onboarding' | 'unavailable' | null;
let blocked: FairyRuntimeBlock = null;
export const fairyRuntimeBlock = () => blocked;
let inflight: Promise<FairyRuntime | null> | null = null;
const listeners = new Set<(runtime: FairyRuntime | null) => void>();
const publish = () => listeners.forEach(listener => listener(current));

// Any failure (offline, onboarding unfinished) keeps the last answer and reports null.
export function refreshFairyRuntime(): Promise<FairyRuntime | null> {
  inflight ??= apiRequest<FairyRuntime>('/api/fairy/runtime').then(runtime => {
    current = runtime; blocked = null; fetchedAt = Date.now(); publish(); return runtime;
  }).catch(error => {
    blocked = error instanceof ApiError && error.status === 409 ? 'onboarding' : 'unavailable';
    publish(); return null;
  }).finally(() => { inflight = null; });
  return inflight;
}

export const peekFairyRuntime = () => current;

// Opening her Moments marks them read without another request.
export function markFairyMomentsRead() {
  if (current?.moments) { current = { ...current, moments: { ...current.moments, unread: false } }; publish(); }
}

const FRESH_MS = 10_000, AFTER_CHANGE_MS = 1_500, MAX_WAIT_MS = 30 * 60_000;

export function useFairyRuntime() {
  const [runtime, setRuntime] = useState<FairyRuntime | null>(current);
  useEffect(() => {
    listeners.add(setRuntime);
    if (Date.now() - fetchedAt > FRESH_MS) void refreshFairyRuntime();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refreshFairyRuntime(); });
    return () => { listeners.delete(setRuntime); subscription.remove(); };
  }, []);
  useEffect(() => {
    const next = runtime?.nextTransitionAt ? Date.parse(runtime.nextTransitionAt) : NaN;
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => void refreshFairyRuntime(), Math.min(MAX_WAIT_MS, Math.max(AFTER_CHANGE_MS, next - Date.now() + AFTER_CHANGE_MS)));
    return () => clearTimeout(timer);
  }, [runtime?.nextTransitionAt]);
  return runtime;
}
