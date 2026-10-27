import { useEffect, useSyncExternalStore } from 'react';

// Full-screen overlays that cover the Garden (the petal ring) pause its drawing and water
// clocks while open, so the overlay's own animation gets the whole frame budget on phones.
let holders = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

export function usePauseGardenWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;
    holders += 1; changed();
    return () => { holders -= 1; changed(); };
  }, [active]);
}
export function useGardenPausedByOverlay() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => holders > 0, () => holders > 0);
}
