export type StaticLandmarkMapPlacement = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

// Approved world-space placements. These remain independent from land and all
// other landmark transforms.
export const STATIC_LANDMARK_MAP_PLACEMENTS: {
  gardenArch: StaticLandmarkMapPlacement;
  pavilion: StaticLandmarkMapPlacement;
  dogHouse: StaticLandmarkMapPlacement;
} = {
  gardenArch: { x: 1380, y: 1450, scale: 0.3, rotation: -6 },
  pavilion: { x: 1086, y: 514, scale: 0.17, rotation: 0 },
  // The puppy and the Maltese share one house on the open paving by the ST01 bridge (owner-placed 2026-11-21).
  dogHouse: { x: 1193, y: 883, scale: 0.21, rotation: 0 },
};
