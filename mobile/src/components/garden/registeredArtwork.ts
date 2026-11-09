import { Platform } from 'react-native';
import { GARDEN_WORLD_HEIGHT, GARDEN_WORLD_WIDTH } from './gardenMapLayout';
import { NATIVE_REGISTERED_ARTWORK } from './nativeRegisteredArtwork';

// Web copies trim only transparent padding. Preserve original source pixels and
// world registration; native platforms clip to the same verified registration bounds.
// Native draws the padded crop (nativeRegisteredArtwork.ts) placed one pixel out on each
// side, so every texel lands where it did on the full canvas and the clip shows the same
// pixels; the full canvas stays only as a fallback for artwork without a crop.
export function registeredArtwork(original: number, web: number, x: number, y: number, width: number, height: number) {
  const kx = GARDEN_WORLD_WIDTH / 2400, ky = GARDEN_WORLD_HEIGHT / 1800;
  if (Platform.OS !== 'web') {
    const clip = { x: x * kx, y: y * ky, width: width * kx, height: height * ky };
    const padded = NATIVE_REGISTERED_ARTWORK.get(web);
    if (padded !== undefined) return { source: padded, x: (x - 1) * kx, y: (y - 1) * ky, width: (width + 2) * kx, height: (height + 2) * ky, clip };
    return { source: original, x: 0, y: 0, width: GARDEN_WORLD_WIDTH, height: GARDEN_WORLD_HEIGHT, clip };
  }
  return { source: web, x: x * GARDEN_WORLD_WIDTH / 2400, y: y * GARDEN_WORLD_HEIGHT / 1800,
    width: width * GARDEN_WORLD_WIDTH / 2400, height: height * GARDEN_WORLD_HEIGHT / 1800 };
}
