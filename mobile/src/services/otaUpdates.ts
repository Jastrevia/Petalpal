import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

// OTA hotfixes (EAS Update, scripts/hotfix.mjs). A store build checks at launch on its own
// (app.json updates.checkAutomatically); this also looks again when the app comes back to the
// front, at most every half hour, so a fix reaches people who keep the app open for days. The
// fix is only downloaded here: it starts at the next launch, never in the middle of what
// someone is writing or planting.
const CHECK_EVERY_MS = 30 * 60 * 1000;
let lastCheck = 0;
let checking = false;

export async function fetchWaitingUpdate(now = Date.now()) {
  if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled || checking || now - lastCheck < CHECK_EVERY_MS) return false;
  checking = true; lastCheck = now;
  try {
    const found = await Updates.checkForUpdateAsync();
    if (!found.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    return true;
  } catch {
    return false; // Offline or the service is down: the app keeps running what it has.
  } finally {
    checking = false;
  }
}

export function useOtaUpdates() {
  useEffect(() => {
    void fetchWaitingUpdate();
    const subscription = AppState.addEventListener?.('change', state => { if (state === 'active') void fetchWaitingUpdate(); });
    return () => subscription?.remove();
  }, []);
}

/** What is running, for crash reports: the store build's own code or which hotfix. */
export function runningUpdate() {
  if (Platform.OS === 'web') return { channel: null, updateId: null, embedded: true };
  return { channel: Updates.channel ?? null, updateId: Updates.updateId ?? null, embedded: Updates.isEmbeddedLaunch };
}
