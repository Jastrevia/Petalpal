import type { BridgeLocalPoint, BridgeWalkPath } from './bridgeTestPlacement';
import current from '@/assets/garden/decorations/bridge/rendered/bridge_entrance_to_right.json';
type PixelPoint = { x: number; y: number };
export type BridgeSprite = {
  source: number; filename: string; angle: number; cameraAzimuthDegrees: number;
  canvas: { width: number; height: number }; anchor: PixelPoint;
  projection: { along: PixelPoint; across: PixelPoint; elevation: PixelPoint };
};
// Camera-only view of the locked approved master. No bitmap rotation.
export const BRIDGE_VIEW_SPRITE: BridgeSprite = {
  ...current, filename: 'bridge_entrance_to_right.png',
  source: require('@/assets/garden/decorations/bridge/rendered/bridge_entrance_to_right.webp'),
};

export function projectBridgePoint(point: BridgeLocalPoint, sprite: BridgeSprite): PixelPoint {
  const { along, across, elevation } = sprite.projection;
  return {
    x: point.x * along.x + point.y * across.x + point.elevation * elevation.x,
    y: point.x * along.y + point.y * across.y + point.elevation * elevation.y,
  };
}
export function bridgePathPoints(path: BridgeWalkPath): BridgeLocalPoint[] {
  return [path.entryA, ...path.approach, path.crest, ...path.exit, path.entryB];
}
