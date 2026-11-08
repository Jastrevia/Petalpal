import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { loadOnboarding, setOnboardingUser, updateOnboarding, type OnboardingProgress, type OnboardingUpdate } from '../../services/onboarding';
import { isOnboardingStep, onboardingTransition, resumeStep, type OnboardingSignal, type OnboardingStep } from './onboardingSteps';
import { publishOnboardingSnapshot, setOnboardingHandler } from './onboardingSignals';
export { dispatchOnboarding } from './onboardingSignals';

// One tour per signed-in owner, shared by every screen that draws part of it (the Garden,
// the Events and Friends panels, the Treehouse). Progress is saved on the server after each
// step; a failed save is kept and sent again with the next one, so nothing is lost offline.
export interface OnboardingState {
  userId: string | null;
  phase: 'idle' | 'loading' | 'active' | 'completed' | 'unavailable';
  step: OnboardingStep;
  fairyName: string | null;
  fairyNamed: boolean;
  firstEventId: string | null;
  firstFlowerId: string | null;
  flowerPlanted: boolean;
  draftHasText: boolean;
  syncFailed: boolean;
}

const initial: OnboardingState = { userId: null, phase: 'idle', step: 'intro.name', fairyName: null, fairyNamed: false,
  firstEventId: null, firstFlowerId: null, flowerPlanted: false, draftHasText: false, syncFailed: false };
let state = initial;
/** True while the tour is on screen (a finished tour stops at once, even before the server confirms). */
export const tourRunning = (value: OnboardingState) => value.phase === 'active' && value.step !== 'done';
export const onboardingActive = () => tourRunning(state);
let generation = 0;
let pending: OnboardingUpdate = {};
let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();
function set(next: Partial<OnboardingState>) {
  state = { ...state, ...next };
  publishOnboardingSnapshot({ running: tourRunning(state), step: state.step });
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useOnboarding() { return useSyncExternalStore(subscribe, () => state, () => state); }
export const onboardingState = () => state;


function fromProgress(progress: OnboardingProgress): Partial<OnboardingState> {
  return { fairyName: progress.fairyName, fairyNamed: progress.fairyNamed, firstEventId: progress.firstEventId,
    firstFlowerId: progress.firstFlowerId, flowerPlanted: progress.flowerPlanted };
}

/** Called once the owner's Garden has finished loading. Returning owners stay untouched. */
export async function beginOnboarding(userId: string, existingCompleted?: boolean) {
  if (state.userId === userId && state.phase !== 'idle' && state.phase !== 'unavailable') return;
  const version = ++generation;
  pending = {};
  if (typeof setOnboardingUser === 'function') setOnboardingUser(userId);
  set({ ...initial, userId, phase: 'loading' });
  try {
    const progress = await loadOnboarding(userId, existingCompleted);
    if (version !== generation) return;
    if (progress.status === 'completed') { set({ ...fromProgress(progress), phase: 'completed', step: 'done' }); return; }
    const saved = isOnboardingStep(progress.step) ? progress.step : 'intro.name';
    const step = resumeStep({ ...progress, step: saved });
    set({ ...fromProgress(progress), phase: 'active', step });
  } catch {
    // An unreachable or older server never blocks the Garden; the tour is offered next time.
    if (version === generation) set({ phase: 'unavailable' });
  }
}

export function endOnboardingSession() {
  generation++; pending = {}; flushing = null;
  if (typeof setOnboardingUser === 'function') setOnboardingUser(null);
  set(initial);
}

async function flush(): Promise<void> {
  while (flushing) { await flushing; }
  const version = generation;
  const update = pending;
  const currentOwner = state.userId || undefined;
  if (!Object.keys(update).length) return;
  pending = {};
  flushing = (async () => {
    try {
      const progress = await updateOnboarding(update, currentOwner);
      if (version !== generation) return;
      set({ ...fromProgress(progress), syncFailed: false,
        ...(progress.status === 'completed' && state.step === 'done' ? { phase: 'completed' } : {}) });
    } catch {
      if (version !== generation) return;
      // Newer fields win; the server ignores steps it has already passed.
      pending = { ...update, ...pending };
      set({ syncFailed: true });
    }
  })();
  try { await flushing; } finally { flushing = null; }
}
AppState.addEventListener?.('change', next => { if (next === 'active' && state.phase === 'active' && Object.keys(pending).length) void flush(); });

/** Report something that happened in the app. Only signals that complete the current step move the tour. */
function handleOnboardingSignal(signal: OnboardingSignal) {
  if (state.phase !== 'active') return;
  if (signal.type === 'draftChanged') { if (state.draftHasText !== signal.hasText) set({ draftHasText: signal.hasText }); return; }
  const next = onboardingTransition(state.step, signal, { draftHasText: state.draftHasText, firstFlowerId: state.firstFlowerId });
  if (!next) return;
  const update: OnboardingUpdate = {};
  const local: Partial<OnboardingState> = { step: next };
  if (signal.type === 'eventSaved') {
    update.firstEventId = signal.eventId; local.firstEventId = signal.eventId;
    if (signal.flowerId) { update.firstFlowerId = signal.flowerId; local.firstFlowerId = signal.flowerId; }
  }
  if (signal.type === 'planted') { update.flowerPlanted = true; local.flowerPlanted = true; }
  if (next === 'done') update.complete = true;
  else update.step = next;
  if (next === 'event.nav' || next === 'event.write') local.draftHasText = false;
  pending = { ...pending, ...update };
  set(local);
  void flush();
}

/** The naming step waits for the server: her name is part of the account, never only on screen. */
export async function saveFairyName(name: string) {
  const version = generation;
  const progress = await updateOnboarding({ fairyName: name, step: 'intro.celebrate' }, state.userId || undefined);
  if (version !== generation) return;
  set(fromProgress(progress));
  handleOnboardingSignal({ type: 'nameSaved' });
}

/** Increases whenever a tour session starts or ends (development preview controls wait on it). */
export const onboardingSessionVersion = () => generation;

/** DEV-only (onboarding preview controls): place the tour at a step with the given progress. */
export function previewOnboardingAt(userId: string, step: OnboardingStep, progress: Partial<OnboardingState> = {}) {
  if (!__DEV__) return;
  generation++; pending = {}; flushing = null;
  set({ ...initial, userId, phase: 'active', step, ...progress });
}
/** DEV-only: end the tour without saving anything. */
export function previewStopOnboarding(userId: string) {
  if (!__DEV__) return;
  generation++; pending = {}; flushing = null;
  set({ ...initial, userId, phase: 'completed', step: 'done' });
}

/** Retry an unsaved completion (for example after the finale ran offline). */
export const retryOnboardingSync = () => flush();

setOnboardingHandler(handleOnboardingSignal);
