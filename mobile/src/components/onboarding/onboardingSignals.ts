import { useSyncExternalStore } from 'react';
import type { OnboardingSignal } from './onboardingSteps';

// The thin, dependency-free side of the tour that ordinary screens use: they report what
// happened (a zoom, a saved Event, a planted Flower …) and can ask whether the tour is on.
// The tour itself (onboardingStore) listens; when it is not loaded these calls do nothing.
export type OnboardingSnapshot = { running: boolean; step: string };
let snapshot: OnboardingSnapshot = { running: false, step: 'done' };
let handler: ((signal: OnboardingSignal) => void) | null = null;
const listeners = new Set<() => void>();

const observers = new Set<(signal: OnboardingSignal) => void>();
export function dispatchOnboarding(signal: OnboardingSignal) { handler?.(signal); observers.forEach(observer => observer(signal)); }
/** Watch the reported app events (development preview controls use this). */
export function observeOnboardingSignals(observer: (signal: OnboardingSignal) => void) {
  observers.add(observer);
  return () => { observers.delete(observer); };
}
export function setOnboardingHandler(next: ((signal: OnboardingSignal) => void) | null) { handler = next; }
export function publishOnboardingSnapshot(next: OnboardingSnapshot) {
  if (next.running === snapshot.running && next.step === snapshot.step) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}
export const onboardingActive = () => snapshot.running;
export function useOnboardingSnapshot() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => snapshot, () => snapshot);
}
