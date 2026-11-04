import { plantingRecord } from '../../../services/events';
import { loadGarden, type GardenFlower } from '../../../services/garden';
import { loadFlowerPlacements, type FlowerPlacementRecord } from './plantingPersistence';
import { getApprovedMonthCentroid, isFootprintInApprovedMonthMaskWorld, isPointInApprovedMonthMaskWorld } from './approvedPlantingMasks';
import { MONTH_REGION_METAS } from './plantingRegionData';
import { clusterGeometry, footprintPoints, footprintsOverlap, placementFootprint, type Footprint } from './approvedFlowerClusters';

export function gardenPlantingRecord(flower: GardenFlower, timezone = 'UTC'): FlowerPlacementRecord {
  return { ...plantingRecord(flower, timezone), sourceType: flower.sourceType,
    dailyCheckInId: flower.dailyCheckInId, secondaryEmotions: flower.secondaryEmotions,
    variant: flower.variant, rarity: flower.rarity, growthState: flower.growthState, season: flower.season };
}
const fallbackPoints = new Map<number, { x: number; y: number }[]>();
function monthFallbackPoints(month: number) {
  const cached = fallbackPoints.get(month);
  if (cached) return cached;
  const center = getApprovedMonthCentroid(month);
  const points: { x: number; y: number }[] = [];
  // Small preview anchors inside approved grass. No collision/art-class guesses,
  // no writes, no modification of the user's confirmed placement validator.
  for (let ring = 0; ring <= 12; ring++) {
    for (let y = -ring; y <= ring; y++) for (let x = -ring; x <= ring; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
      const point = { x: center.x + x * 28, y: center.y + y * 28 };
      if (isFootprintInApprovedMonthMaskWorld(month, point.x, point.y, 16)) points.push(point);
    }
  }
  if (!points.length) throw new Error('Unable to find a safe Garden preview position.');
  fallbackPoints.set(month, points);
  return points;
}
export function hydrateGardenPlacements(flowers: readonly GardenFlower[], local: readonly FlowerPlacementRecord[],
  ownerId: string, viewerId: string, timezone = 'UTC'): FlowerPlacementRecord[] {
  const localById = new Map((ownerId === viewerId ? local : [])
    .filter(p => (!p.ownerUserId || p.ownerUserId === ownerId) && p.placementOrigin !== 'FALLBACK'
      && Number.isFinite(p.worldX) && Number.isFinite(p.worldY))
    .map(p => [p.flowerId, p]));
  const slots = new Map<number, number>();
  // Sorting makes fallback placement independent of backend response order.
  const records: FlowerPlacementRecord[] = [...flowers].sort((a, b) => a.id.localeCompare(b.id)).map(flower => {
    if (flower.userId !== ownerId) throw new Error('This flower belongs to another Garden.');
    const canonical = gardenPlantingRecord(flower, timezone);
    // A position saved on the Flower is authoritative and survives refresh and sign-in.
    const saved = flower.placement;
    if (saved) return { ...canonical, worldX: saved.worldX, worldY: saved.worldY, landId: saved.landId,
      scale: saved.scale, rotation: saved.rotation, placementOrigin: 'SERVER' };
    const localPlacement = localById.get(flower.id);
    if (localPlacement) return { ...canonical, worldX: localPlacement.worldX, worldY: localPlacement.worldY,
      landId: localPlacement.landId, scale: localPlacement.scale ?? canonical.scale, rotation: localPlacement.rotation ?? canonical.rotation,
      placementOrigin: 'LOCAL' };
    return { ...canonical, landId: MONTH_REGION_METAS[canonical.month].landId, placementOrigin: 'FALLBACK' };
  });
  // Unplaced (historical) flowers get a preview spot where the whole cluster fits its Land
  // without overlapping another; only a full Land reuses the earlier ring order.
  const occupied: Footprint[] = records.filter(p => p.placementOrigin !== 'FALLBACK').map(placementFootprint);
  return records.map(record => {
    if (record.placementOrigin !== 'FALLBACK') return record;
    const points = monthFallbackPoints(record.month);
    const free = points.find(point => {
      const g = clusterGeometry({ ...record, worldX: point.x, worldY: point.y });
      const footprint = g ? g.footprint : placementFootprint({ ...record, worldX: point.x, worldY: point.y });
      return (!g || footprintPoints(footprint, 12).every(p => isPointInApprovedMonthMaskWorld(record.month, p.x, p.y)))
        && !occupied.some(other => footprintsOverlap(footprint, other));
    });
    const index = slots.get(record.month) || 0;
    slots.set(record.month, index + 1);
    const point = free ?? points[index % points.length];
    const placed = { ...record, worldX: point.x, worldY: point.y };
    occupied.push(placementFootprint(placed));
    return placed;
  });
}
export async function loadGardenPlacements(ownerId: string, viewerId: string, timezone = 'UTC') {
  const [flowers, local] = await Promise.all([
    loadGarden(ownerId, viewerId), ownerId === viewerId ? loadFlowerPlacements() : Promise.resolve([]),
  ]);
  return hydrateGardenPlacements(flowers, local, ownerId, viewerId, timezone);
}
