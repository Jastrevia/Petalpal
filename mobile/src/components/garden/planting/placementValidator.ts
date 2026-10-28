// Authoritative Single Placement Validator for PetalPal Flower Planting System V1.
// Used for planting only: a planted flower never moves. The server repeats the spacing rule.

import {
  GARDEN_WORLD_HEIGHT,
  GARDEN_WORLD_WIDTH,
  MONTH_REGION_METAS,
} from './plantingRegionData';
import type { FlowerPlacementDefinition } from './flowerFootprintConfig';
import { type MonthRegionCalibration } from './plantingRegionGeometry';
import { getApprovedRegionAtWorld, isFootprintInApprovedMonthMaskWorld } from './approvedPlantingMasks';
import type { GardenLandLayout } from '../gardenMapLayout';
import { clusterFootprintRadius, hasClusterArt } from './flowerClusters';

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
  if (!hasClusterArt(speciesCode, flowerName)) {
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
  // The whole cluster footprint (its land's small / medium / large circle) must fit inside the land.
  const r = clusterFootprintRadius(month);

  if (!isFootprintInApprovedMonthMaskWorld(month, worldX, worldY, r, landLayout)) {
    return {
      isValid: false,
      reason: 'FOOTPRINT_OUTSIDE_REGION',
      userFeedback: 'Choose a little more space around the flower.',
      detectedMonth: month,
    };
  }

  // 4. One Hole, One Flower: cluster footprints never intersect, so clusters are not crammed.
  for (const existing of existingPlacements) {
    if (ignorePlacementId && existing.id === ignorePlacementId) {
      continue;
    }

    const minDistance = r + clusterFootprintRadius(existing.month);

    const dx = worldX - existing.worldX;
    const dy = worldY - existing.worldY;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDistance * minDistance) {
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
