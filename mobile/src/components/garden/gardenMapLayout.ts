// Authoritative reference: user-approved localhost effective layout export.
// Coordinates describe full transparent image canvases, not cropped artwork.
export const GARDEN_WORLD_WIDTH = 2400;
export const GARDEN_WORLD_HEIGHT = 1800;
export const GARDEN_WATER_COLOR = '#78b8b2';

export const GARDEN_LANDS = [
  { id: 'central', source: require('@/assets/garden/land/central-land.webp'), x: 768, y: 297, width: 831, rotation: 0, zIndex: 2 },
  { id: '0405', source: require('@/assets/garden/land/land-0405.webp'), x: 1135, y: -60, width: 597, rotation: 1.5, zIndex: 2 },
  { id: '06', source: require('@/assets/garden/land/land-06.webp'), x: 1638, y: 230, width: 598, rotation: -1.33, zIndex: 2 },
  { id: '07', source: require('@/assets/garden/land/land-07.webp'), x: 1737, y: 407, width: 689, rotation: 7.239999999999998, zIndex: 2 },
  { id: '08', source: require('@/assets/garden/land/land-08.webp'), x: 1667, y: 924, width: 673, rotation: 16.9, zIndex: 2 },
  { id: '09', source: require('@/assets/garden/land/land-09.webp'), x: 936, y: 1000, width: 597, rotation: 8.28, zIndex: 2 },
  { id: '101112', source: require('@/assets/garden/land/land-101112.webp'), x: -27, y: 373, width: 1008, rotation: 0, zIndex: 2 },
] as const;

export type GardenLand = (typeof GARDEN_LANDS)[number];
export type GardenLandLayout = readonly GardenLand[];

// Independent landmark placement; never derive these from a land transform.
// Initial placement spans the central / upper-land transition; tune on device.
export const TREEHOUSE_MAP_X = 900;
export const TREEHOUSE_MAP_Y = 420;
export const TREEHOUSE_MAP_SCALE = 0.4;
