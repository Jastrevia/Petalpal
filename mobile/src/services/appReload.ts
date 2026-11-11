import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Refresh for a Garden that looks frozen or stuck. On the web it is the browser's own Reload: the
// page and its scripts start again, and nothing stored (sign-in, flowers, settings, drafts) is cleared.
// Native builds have no page to reload (and no Updates module), so the app's navigator and every
// screen in it - the Garden and its canvas included - are mounted again from the start; the sign-in,
// the theme and stored data live above it and stay. Neither can help while the JavaScript thread
// itself is frozen: the tap would never be handled.
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => generation;

export function reloadApp() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.reload();
    return;
  }
  generation += 1;
  listeners.forEach(listener => listener());
}

/** A key for the app's navigator: it changes when a native refresh asks for the screens to start again. */
export const useAppReloadKey = () => useSyncExternalStore(subscribe, current, current);
