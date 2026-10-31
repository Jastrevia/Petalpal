import { useEffect, useState } from 'react';

// Usability testing (docs/usability-testing.md): testers may write on our phones, so the dev variant can wipe this
// device between testers. Local only: what a tester wrote stays on the server until their test account is deleted.
// The store app never shows this: EXPO_PUBLIC_APP_VARIANT is inlined at build, and release-config.cjs refuses it in store builds.
export const devVariant = process.env.EXPO_PUBLIC_APP_VARIANT === 'dev';

export type DeviceResetResult = { ok: boolean; failed: string[] };
type Step = [name: string, run: () => Promise<unknown>];

// Every step runs even if an earlier one failed, so one failure never leaves the rest of the data behind.
export async function runDeviceReset(steps: Step[]): Promise<DeviceResetResult> {
  const failed: string[] = [];
  for (const [name, run] of steps) {
    try { await run(); } catch { failed.push(name); }
  }
  return { ok: failed.length === 0, failed };
}

// What this app keeps on a phone: Firebase's sign-in and all preferences in AsyncStorage (cleared after signing out, which
// uses it), images in expo-image's caches and temporary audio and pictures in the cache folder. Normal builds keep nothing
// in SecureStore (only the DEV-only security harness does) and have no local database.
export function deviceResetSteps(logout: () => Promise<void>, signedIn: boolean): Step[] {
  return [
    ['session', async () => { if (signedIn) await logout(); }],
    ['storage', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.clear();
    }],
    ['images', async () => {
      const { Image } = require('expo-image');
      await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]);
    }],
    ['files', async () => {
      const FileSystem = require('expo-file-system/legacy');
      if (!FileSystem.cacheDirectory) return;
      const names: string[] = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
      await Promise.all(names.map(name => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${name}`, { idempotent: true })));
    }],
  ];
}

// Memory still holds this session's data until the app restarts, and a Release build cannot restart itself: once a reset has
// run, the whole app is covered by a message asking to close it (held here because signing out unmounts the panel it started in).
let finished: DeviceResetResult | null = null;
const listeners = new Set<() => void>();
export function finishDeviceReset(result: DeviceResetResult) { finished = result; listeners.forEach(listener => listener()); }
export function useDeviceResetResult() {
  const [result, setResult] = useState(finished);
  useEffect(() => {
    const listener = () => setResult(finished);
    listeners.add(listener); listener();
    return () => { listeners.delete(listener); };
  }, []);
  return result;
}
