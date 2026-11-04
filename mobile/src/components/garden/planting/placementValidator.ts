// Authoritative Single Placement Validator for PetalPal Flower Planting System V1.
// Used identically by initial planting and adjust position.

import {
  GARDEN_WORLD_HEIGHT,
  GARDEN_WORLD_WIDTH,
  MONTH_REGION_METAS,
} from './plantingRegionData';
import { FlowerPlacementDefinition } from './flowerFootprintConfig';
import { type MonthRegionCalibration } from './plantingRegionGeometry';
import { getApprovedRegionAtWorld, isFootprintInApprovedMonthMaskWorld, isPointInApprovedMonthMaskWorld } from './approvedPlantingMasks';
import { clusterGeometry, footprintPoints, footprintsOverlap, nearestAcceptedPoint, placementFootprint, type Footprint } from './approvedFlowerClusters';
import type { GardenLandLayout } from '../gardenMapLayout';
import { resolveParentCollision } from './parentCollision';

export { placementFootprint };

export interface FlowerPlacement {
  id: string;
  flowerId: string;
  journalEntryId: string;
  plantedDate: string;
  month: number;
  worldX: number;
  worldY: number;
  scale: number;
  rotation: number;
  landId?: string; // Legacy placements remain readable; confirmations always persist this.
  placementVersion: number;
  flowerName?: string;
  speciesCode?: string;
  mood?: string;
}

export type InvalidPlacementReason =
  | 'OUT_OF_WORLD'
  | 'NOT_PLANTABLE_GRASS'
  | 'WRONG_MONTH_REGION'
  | 'FOOTPRINT_OUTSIDE_REGION'
  | 'COLLIDES_WITH_FLOWER'
  | 'MISSING_FLOWER_DEFINITION'
  | 'MISSING_MONTH_REGION'
  | 'COLLISION_CLASS_UNRESOLVED';

export interface ValidationResult {
  isValid: boolean;
  reason?: InvalidPlacementReason;
  userFeedback: string;
  detectedMonth?: number;
  conflictingPlacementId?: string;
}

export interface ValidatePlacementParams {
  flowerId: string;
  month: number;
  worldX: number;
  worldY: number;
  existingPlacements: FlowerPlacement[];
  ignorePlacementId?: string;
  /** @deprecated Cannot override authoritative production parent collision. */
  definition?: FlowerPlacementDefinition;
  flowerName?: string;
  speciesCode?: string;
  calibrationMap?: Record<number, MonthRegionCalibration>;
  landLayout?: GardenLandLayout;
}

/** Nearest valid position to a starting point (rings of `step` world units), so a new preview
 * starts somewhere the whole cluster fits. Returns null when the Land has no room. */
export function findNearestValidPlacement(params: Omit<ValidatePlacementParams, 'worldX' | 'worldY'>,
  start: { x: number; y: number }, maxRadius = 260, step = 8): { worldX: number; worldY: number } | null {
  return nearestAcceptedPoint(start, (worldX, worldY) => validateFlowerPlacement({ ...params, worldX, worldY }).isValid, maxRadius, step);
}

export function validateFlowerPlacement({
  flowerId,
  month,
  worldX,
  worldY,
  existingPlacements,
  ignorePlacementId,
  flowerName,
  speciesCode,
  landLayout,
}: ValidatePlacementParams): ValidationResult {
  // Approved cluster art is planted at the size of the flower's own Land (the only valid destination).
  const cluster = clusterGeometry({ worldX, worldY, month, speciesCode, flowerName }, MONTH_REGION_METAS[month]?.landId);
  const collision = resolveParentCollision(speciesCode, flowerName);
  if (!cluster && collision.status === 'UNRESOLVED') {
    return { isValid:false, reason:'COLLISION_CLASS_UNRESOLVED',
      userFeedback:'This flower is not ready for planting yet.' };
  }
  const targetMeta = MONTH_REGION_METAS[month];
  const targetMonthName = targetMeta?.monthName || `Month ${month}`;

  // 1. World Bounds Check
  if (
    worldX < 0 ||
    worldX >= GARDEN_WORLD_WIDTH ||
    worldY < 0 ||
    worldY >= GARDEN_WORLD_HEIGHT
  ) {
    return {
      isValid: false,
      reason: 'OUT_OF_WORLD',
      userFeedback: 'Stay inside the garden.',
    };
  }

  // 2. Center Check: Grass & Month Region
  const centerRegion = getApprovedRegionAtWorld(
    worldX,
    worldY,
    month,
    landLayout
  );

  if (centerRegion === 0) {
    return {
      isValid: false,
      reason: 'NOT_PLANTABLE_GRASS',
      userFeedback: 'Choose a grassy spot.',
      detectedMonth: 0,
    };
  }

  if (centerRegion !== month) {
    return {
      isValid: false,
      reason: 'WRONG_MONTH_REGION',
      userFeedback: `This flower belongs in the ${targetMonthName} garden.`,
      detectedMonth: centerRegion,
    };
  }

  // 3. Entire Footprint Containment Check
  // The entire footprint (the whole cluster's ground ellipse, or the legacy parent circle)
  // must fit inside the target month region.
  const r = collision.radius;
  const own: Footprint = cluster ? cluster.footprint : { cx: worldX, cy: worldY, rx: r, ry: r };

  if (cluster ? !footprintPoints(own).every(point => isPointInApprovedMonthMaskWorld(month, point.x, point.y, landLayout))
    : !isFootprintInApprovedMonthMaskWorld(month, worldX, worldY, r, landLayout)) {
    return {
      isValid: false,
      reason: 'FOOTPRINT_OUTSIDE_REGION',
      userFeedback: cluster ? 'Choose a spot where the whole cluster fits.' : 'Choose a little more space around the flower.',
      detectedMonth: month,
    };
  }

  // 4. One Hole, One Flower: Footprint-to-Footprint Collision
  // Visual overlap is allowed, but logical planting footprints must not intersect.
  for (const existing of existingPlacements) {
    if (ignorePlacementId && existing.id === ignorePlacementId) {
      continue;
    }

    if (footprintsOverlap(own, placementFootprint(existing))) {
      return {
        isValid: false,
        reason: 'COLLIDES_WITH_FLOWER',
        conflictingPlacementId: existing.id,
        userFeedback: 'Another flower is already planted here.',
      };
    }
  }

  // All checks passed!
  return {
    isValid: true,
    userFeedback: 'Ready to plant!',
    detectedMonth: month,
  };
}
