import mask from './gardenGroundMask.json';
import { APPROVED_MASK_CALIBRATION, APPROVED_MASK_REFINEMENTS,
  isPointInApprovedMonthMaskWorld } from '../planting/approvedPlantingMasks';
import { MONTH_REGION_METAS } from '../planting/plantingRegionData';
import { getParentLand, maskLocalToLandLocal, landLocalToWorld } from '../planting/plantingRegionGeometry';
import { getMaskRefinementOffset } from '../planting/plantingMaskRefinement';
import { type Point } from './walkNetwork';

// Conservative broad-phase bounds skip the expensive stroke evaluator for
// distant months. The final decision still uses the exact approved mask.
const flowerBounds = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1, cal = APPROVED_MASK_CALIBRATION[month];
  const refinement = APPROVED_MASK_REFINEMENTS[month], meta = MONTH_REGION_METAS[month];
  const offset = getMaskRefinementOffset(refinement), land = getParentLand(cal.parentLandAsset);
  const points = [[0,0], [meta.bbox.width,0], [0,meta.bbox.height], [meta.bbox.width,meta.bbox.height]]
    .map(([u,v]) => maskLocalToLandLocal(u,v,cal,meta));
  for (const stroke of refinement.strokes) {
    const b = stroke.bbox;
    points.push({x:b.minX,y:b.minY}, {x:b.minX,y:b.maxY}, {x:b.maxX,y:b.minY}, {x:b.maxX,y:b.maxY});
  }
  const world = points.map(p => landLocalToWorld(p.x + offset.offsetX,p.y + offset.offsetY,land));
  return {month, minX:Math.min(...world.map(p=>p.x)), maxX:Math.max(...world.map(p=>p.x)),
    minY:Math.min(...world.map(p=>p.y)), maxY:Math.max(...world.map(p=>p.y))};
});

// A month's lawn: its broad bounds (world units) and whether a point is on it.
export const monthLawnBounds = (month: number) => flowerBounds[month - 1];
export const isOnMonthLawn = (month: number, point: Point) => {
  const b = flowerBounds[month - 1];
  return point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY &&
    isPointInApprovedMonthMaskWorld(month, point.x, point.y);
};

export function isGardenPlantable(point: Point): boolean {
  return flowerBounds.some(b => point.x >= b.minX && point.x <= b.maxX &&
    point.y >= b.minY && point.y <= b.maxY && isPointInApprovedMonthMaskWorld(b.month,point.x,point.y));
}

// Collision data is baked from the SAME placed terrain alpha as the renderer.
// It contains no camera scale, road-centerline restriction or landmark roof mask.
// Each row is a list of [start, end) dry-ground column runs, at 2 world units.
export function isDryGardenGround({ x, y }: Point): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < mask.x || y < mask.y ||
      x >= mask.x + mask.width || y >= mask.y + mask.height) return false;
  const column = Math.floor((x - mask.x) / mask.cellSize);
  const row = mask.rows[Math.floor((y - mask.y) / mask.cellSize)];
  let low = 0, high = row.length / 2 - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (column < row[middle * 2]) high = middle - 1;
    else if (column >= row[middle * 2 + 1]) low = middle + 1;
    else return true;
  }
  return false;
}

export function gardenGroundKind(point: Point): 'ground' | 'water' | 'plantable' | 'outside' {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < mask.x ||
      point.y < mask.y || point.x >= mask.x + mask.width || point.y >= mask.y + mask.height) return 'outside';
  if (!isDryGardenGround(point)) return 'water';
  // Always evaluate the locked approved flower regions, even when no flowers
  // have grown yet. Decorative grass/flowers outside these masks remain ground.
  if (isGardenPlantable(point)) return 'plantable';
  return 'ground';
}

export const isGardenGroundBlocked = (point: Point) => gardenGroundKind(point) !== 'ground';
