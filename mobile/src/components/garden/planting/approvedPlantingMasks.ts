import snapshot from './approvedPlantingMasks.json';
import { type GardenLandLayout } from '../gardenMapLayout';
import { MONTH_REGION_METAS, GARDEN_WORLD_WIDTH, GARDEN_WORLD_HEIGHT } from './plantingRegionData';
import { getParentLand, worldToLandLocal, maskLocalToLandLocal, landLocalToWorld,
  type MonthRegionCalibration } from './plantingRegionGeometry';
import { getMaskRefinementOffset, isPointInRefinedMaskLandLocal, isCircleInRefinedMaskLandLocal,
  type MonthMaskRefinement } from './plantingMaskRefinement';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Lossless saved operation histories and transforms from the approved checkpoint.
// Runtime never falls back to a baseline or an editable browser refinement.
export const APPROVED_MASK_REFINEMENTS = freeze(snapshot.refinements as Record<number, MonthMaskRefinement>);
export const APPROVED_MASK_CALIBRATION = freeze(snapshot.calibration as Record<number, MonthRegionCalibration>);
for (let month = 1; month <= 12; month++) {
  if (APPROVED_MASK_REFINEMENTS[month]?.month !== month || !APPROVED_MASK_CALIBRATION[month]) {
    throw new Error(`Missing approved planting mask for month ${month}`);
  }
}

export function isPointInApprovedMonthMaskWorld(month: number, x: number, y: number, layout?: GardenLandLayout): boolean {
  const cal = APPROVED_MASK_CALIBRATION[month];
  const refinement = APPROVED_MASK_REFINEMENTS[month];
  if (!cal || !refinement || x < 0 || y < 0 || x >= GARDEN_WORLD_WIDTH || y >= GARDEN_WORLD_HEIGHT) return false;
  const local = worldToLandLocal(x, y, getParentLand(cal.parentLandAsset, layout));
  return isPointInRefinedMaskLandLocal(month, local.x, local.y, refinement.strokes, cal,
    MONTH_REGION_METAS[month], getMaskRefinementOffset(refinement));
}

export function getApprovedRegionAtWorld(x: number, y: number, targetMonth: number, layout?: GardenLandLayout): number {
  if (isPointInApprovedMonthMaskWorld(targetMonth, x, y, layout)) return targetMonth;
  for (let month = 1; month <= 12; month++) {
    if (month !== targetMonth && isPointInApprovedMonthMaskWorld(month, x, y, layout)) return month;
  }
  return 0;
}

export function isFootprintInApprovedMonthMaskWorld(month: number, x: number, y: number,
  radius: number, layout?: GardenLandLayout): boolean {
  const cal = APPROVED_MASK_CALIBRATION[month];
  const refinement = APPROVED_MASK_REFINEMENTS[month];
  if (!cal || !refinement || x - radius < 0 || y - radius < 0 ||
      x + radius >= GARDEN_WORLD_WIDTH || y + radius >= GARDEN_WORLD_HEIGHT) return false;
  const local = worldToLandLocal(x, y, getParentLand(cal.parentLandAsset, layout));
  return isCircleInRefinedMaskLandLocal(month, local.x, local.y, radius,
    refinement.strokes, cal, MONTH_REGION_METAS[month], getMaskRefinementOffset(refinement));
}

export function getApprovedMonthCentroid(month: number): { x: number; y: number } {
  const meta = MONTH_REGION_METAS[month];
  const cal = APPROVED_MASK_CALIBRATION[month];
  const local = maskLocalToLandLocal(meta.centroid.x - meta.bbox.x, meta.centroid.y - meta.bbox.y, cal, meta);
  const offset = getMaskRefinementOffset(APPROVED_MASK_REFINEMENTS[month]);
  return landLocalToWorld(local.x + offset.offsetX, local.y + offset.offsetY, getParentLand(cal.parentLandAsset));
}

/** World bounding box of a month's approved bed (its mask rectangle through the same transforms as the centroid). */
export function getApprovedMonthWorldBounds(month: number): { x: number; y: number; width: number; height: number } {
  const meta = MONTH_REGION_METAS[month];
  const cal = APPROVED_MASK_CALIBRATION[month];
  const offset = getMaskRefinementOffset(APPROVED_MASK_REFINEMENTS[month]);
  const land = getParentLand(cal.parentLandAsset);
  const corners = [[0, 0], [meta.bbox.width, 0], [0, meta.bbox.height], [meta.bbox.width, meta.bbox.height]].map(([u, v]) => {
    const local = maskLocalToLandLocal(u, v, cal, meta);
    return landLocalToWorld(local.x + offset.offsetX, local.y + offset.offsetY, land);
  });
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
