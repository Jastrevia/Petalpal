import { useSyncExternalStore } from 'react';

// Load progress lives outside React state so the canvas owner never
// re-renders (re-rendering it would rebuild the Skia tree and reload images).
// Only asset names and generic error messages are kept; never user data.
// Each Garden scene owns one store: a friend's Garden mounts above the home
// Garden, and its unmount must not reset the home Garden's progress.
export type GardenLoadState = { landsLoaded: number; landsTotal: number; water: 'loading' | 'ready' | 'failed'; failures: readonly string[] };
export type GardenLoadStore = {
  publishLandsLoaded(loaded: number, total: number): void;
  publishWater(water: GardenLoadState['water']): void;
  reportFailure(label: string): void;
  subscribe(listener: () => void): () => void;
  getState(): GardenLoadState;
};

export function createGardenLoadStore(): GardenLoadStore {
  let state: GardenLoadState = { landsLoaded: 0, landsTotal: 7, water: 'loading', failures: [] };
  const listeners = new Set<() => void>();
  function update(next: Partial<GardenLoadState>) {
    state = { ...state, ...next };
    listeners.forEach(listener => listener());
  }
  return {
    publishLandsLoaded(loaded, total) {
      if (state.landsLoaded !== loaded || state.landsTotal !== total) update({ landsLoaded: loaded, landsTotal: total });
    },
    publishWater(water) {
      if (state.water !== water) update({ water });
    },
    reportFailure(label) {
      const entry = label.slice(0, 80);
      if (!state.failures.includes(entry)) update({ failures: [...state.failures, entry].slice(-4) });
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getState: () => state,
  };
}

export function useGardenLoadState(store: GardenLoadStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
