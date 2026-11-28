import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import { apiBaseUrl } from './api';

// Switches the founders can turn from the server (Render environment, lib/app-config.js) while the app
// is live, without a release: a maintenance notice, a lowest app version that may still be used, and
// features paused one by one. Read at launch and when the app returns to the front. If the server
// cannot be reached the app simply runs on; it never blocks someone on a failed check.
export type PausableFeature = 'friendMessages' | 'petalTarot';
export interface AppConfig {
  maintenance: { blocking: boolean; message: { en: string; 'zh-Hans': string } } | null;
  minimumVersion: { ios: string | null; android: string | null };
  paused: PausableFeature[];
}
const EMPTY: AppConfig = { maintenance: null, minimumVersion: { ios: null, android: null }, paused: [] };
const REFRESH_MS = 5 * 60 * 1000;

let current: AppConfig = EMPTY;
let loadedAt = 0;
const listeners = new Set<() => void>();

export function parseAppConfig(value: unknown): AppConfig {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, any>;
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 600) : '');
  const version = (v: unknown) => (typeof v === 'string' && /^\d+(?:\.\d+){0,2}$/.test(v) ? v : null);
  const m = source.maintenance;
  const maintenance = m && typeof m === 'object' && (text(m.message?.en) || text(m.message?.['zh-Hans']))
    ? { blocking: m.blocking === true, message: { en: text(m.message?.en) || text(m.message?.['zh-Hans']), 'zh-Hans': text(m.message?.['zh-Hans']) || text(m.message?.en) } }
    : null;
  const paused = Array.isArray(source.paused) ? source.paused.filter((f: unknown): f is PausableFeature => f === 'friendMessages' || f === 'petalTarot') : [];
  return { maintenance, minimumVersion: { ios: version(source.minimumVersion?.ios), android: version(source.minimumVersion?.android) }, paused };
}

/** -1, 0 or 1, comparing dotted versions numerically ("1.0.10" is after "1.0.9"). */
export function compareVersions(a: string, b: string) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** True when this installed app is older than the lowest version the server still accepts. */
export function updateRequired(config: AppConfig, os = Platform.OS, installed = Application.nativeApplicationVersion) {
  const minimum = os === 'ios' ? config.minimumVersion.ios : os === 'android' ? config.minimumVersion.android : null;
  return Boolean(minimum && installed && compareVersions(installed, minimum) < 0);
}

export async function refreshAppConfig(now = Date.now()) {
  if (now - loadedAt < REFRESH_MS) return current;
  loadedAt = now;
  try {
    const response = await fetch(`${apiBaseUrl()}/app-config`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return current;
    const next = parseAppConfig(await response.json());
    if (JSON.stringify(next) !== JSON.stringify(current)) { current = next; listeners.forEach(listener => listener()); }
  } catch { /* Offline or the server is down: keep what we had. */ }
  return current;
}

export function useAppConfig() {
  useEffect(() => {
    void refreshAppConfig();
    // Optional chaining: some hosts (tests, older web shims) have no AppState events.
    const subscription = AppState.addEventListener?.('change', state => { if (state === 'active') void refreshAppConfig(); });
    return () => subscription?.remove();
  }, []);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => current);
}

export function useFeaturePaused(feature: PausableFeature) {
  const [paused, setPaused] = useState(() => current.paused.includes(feature));
  useEffect(() => {
    const update = () => setPaused(current.paused.includes(feature));
    update(); listeners.add(update);
    return () => { listeners.delete(update); };
  }, [feature]);
  return paused;
}
