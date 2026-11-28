import { useSyncExternalStore } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { DOG_HOUSE_WIDTH } from './StaticLandmarkEntities';
import { STATIC_LANDMARK_MAP_PLACEMENTS, type StaticLandmarkMapPlacement } from './staticLandmarkMapPlacements';

// The puppy and the Maltese shelter in their house while it rains. GardenCritters walks them to
// the door and, once both sit there, hands over to the house: `entering` plays the painted clip of
// them going in (dogHouseClips.ts), then the house shows them resting inside on a loop, until the
// rain stops (`out`) and they come back out. `since` is on the Garden clock.
export type DogHousePhase = 'out' | 'entering' | 'inside';
type State = { phase: DogHousePhase; since: number };

let state: State = { phase: 'out', since: 0 };
let placement: StaticLandmarkMapPlacement = STATIC_LANDMARK_MAP_PLACEMENTS.dogHouse;
const listeners = new Set<() => void>();

export const dogHouse = {
  get: () => state,
  set(next: State) { state = next; listeners.forEach(listener => listener()); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  /** The Garden clock the phase times are on (GardenCritters' clock). */
  clock: null as SharedValue<number> | null,
  /** Where the house stands now (the dev placer can move it). */
  placement: () => placement,
  setPlacement(next: StaticLandmarkMapPlacement) { placement = next; },
};

export function useDogHouseState() {
  return useSyncExternalStore(dogHouse.subscribe, dogHouse.get, dogHouse.get);
}

// The clips were painted on a 1344 × 768 key frame with the house 648 px wide at (650, 70); the two
// dogs sit at its door facing right, paws at these points (their sprites' anchors, see
// GardenCritters FrameWalker). World units per key-frame pixel follow the house's own scale.
export const CLIP_KEY = { width: 1344, height: 768, houseX: 650, houseY: 70, houseW: 648 };
const DOOR_SPOTS = { puppy: { x: 709.5, y: 682 }, maltese: { x: 476.6, y: 722 } } as const;

export function clipToWorld(p: StaticLandmarkMapPlacement = placement) {
  const k = (DOG_HOUSE_WIDTH * p.scale) / CLIP_KEY.houseW;
  return { k, x: (px: number) => p.x + (px - CLIP_KEY.houseX) * k, y: (py: number) => p.y + (py - CLIP_KEY.houseY) * k };
}

/** Where each dog sits at the door, facing right, before the clip takes over. */
export function doorSpot(id: 'puppy' | 'maltese') {
  const map = clipToWorld();
  return { x: map.x(DOOR_SPOTS[id].x), y: map.y(DOOR_SPOTS[id].y) };
}
