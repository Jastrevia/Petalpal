import type { BlossomAnchorPoint } from './types';

/** Standard flower visual sizing matching PetalPal's production footprints */
export const FLOWER_VISUAL_WIDTH = 76;
export const FLOWER_VISUAL_HEIGHT = 76;

/** Base ground contact anchor (relative 0..1 in asset rect) */
export const FLOWER_GROUND_ANCHOR = { x: 0.47, y: 0.90 };

/**
 * Relative blossom petal anchors relative to the ground anchor point (0, 0).
 * Since the flower grows upward, blossom offsets have negative Y.
 */
export const RELATIVE_BLOSSOM_ANCHORS: readonly Omit<BlossomAnchorPoint, 'id'>[] = [
  { x: -4.0, y: -36.0, normalAngle: -Math.PI / 2, tiltAngle: 0.05, petalIndex: 0 }, // Center-left crown petal
  { x: -12.5, y: -34.5, normalAngle: -2.1, tiltAngle: 0.25, petalIndex: 1 }, // Left tulip blossom curve
  { x: 8.5, y: -33.5, normalAngle: -1.0, tiltAngle: -0.22, petalIndex: 2 }, // Right tulip blossom upper curve
  { x: -2.0, y: -31.0, normalAngle: -Math.PI / 2, tiltAngle: 0.0, petalIndex: 3 }, // Center blossom middle body
  { x: 14.5, y: -27.0, normalAngle: -0.8, tiltAngle: -0.3, petalIndex: 4 }, // Right tulip outer flank
  { x: -8.0, y: -24.0, normalAngle: -2.2, tiltAngle: 0.2, petalIndex: 5 }, // Left tulip lower petal
  { x: 7.5, y: -26.0, normalAngle: -1.1, tiltAngle: -0.15, petalIndex: 6 }, // Right tulip lower flank
];

/**
 * Returns explicit blossom anchor points transformed into world coordinates
 * around the flower cluster's ground position (worldX, worldY).
 */
export function getBlossomAnchors(
  worldX: number,
  worldY: number,
  scale: number = 1
): BlossomAnchorPoint[] {
  return RELATIVE_BLOSSOM_ANCHORS.map((anchor, index) => ({
    id: index,
    x: worldX + anchor.x * scale,
    y: worldY + anchor.y * scale,
    normalAngle: anchor.normalAngle,
    tiltAngle: anchor.tiltAngle,
    petalIndex: anchor.petalIndex,
  }));
}

/**
 * Calculate the localized effect bounding volume around a flower cluster.
 * The effect area is centered horizontally on worldX, extending upwards from worldY.
 */
export function getClusterEffectBounds(
  worldX: number,
  worldY: number,
  radius: number,
  height: number
) {
  return {
    left: worldX - radius,
    right: worldX + radius,
    top: worldY - height,
    bottom: worldY + 10, // slight ground buffer
    centerX: worldX,
    centerY: worldY - height * 0.5,
    radius,
    height,
  };
}
