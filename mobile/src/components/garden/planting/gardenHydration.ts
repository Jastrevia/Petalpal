import { plantingRecord } from '../../../services/events';
import { loadGarden, plantFlowerSpot, type GardenFlower } from '../../../services/garden';
import { loadFlowerPlacements, type FlowerPlacementRecord } from './plantingPersistence';
import { getApprovedMonthCentroid, isFootprintInApprovedMonthMaskWorld } from './approvedPlantingMasks';
import { MONTH_REGION_METAS } from './plantingRegionData';

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
  return [...flowers].sort((a, b) => a.id.localeCompare(b.id)).map(flower => {
    if (flower.userId !== ownerId) throw new Error('This flower belongs to another Garden.');
    const canonical = gardenPlantingRecord(flower, timezone);
    // The server's planted spot is the truth, for the owner and for visiting friends.
    if (typeof flower.worldX === 'number' && typeof flower.worldY === 'number') return { ...canonical,
      worldX: flower.worldX, worldY: flower.worldY, landId: flower.regionId || MONTH_REGION_METAS[canonical.month].landId,
      placementOrigin: 'SERVER' };
    const localPlacement = localById.get(flower.id);
    if (localPlacement) return { ...canonical, worldX: localPlacement.worldX, worldY: localPlacement.worldY,
      landId: localPlacement.landId, scale: localPlacement.scale ?? canonical.scale, rotation: localPlacement.rotation ?? canonical.rotation,
      placementOrigin: 'LOCAL' };
    const points = monthFallbackPoints(canonical.month);
    const index = slots.get(canonical.month) || 0;
    slots.set(canonical.month, index + 1);
    const point = points[index % points.length];
    return { ...canonical, worldX: point.x, worldY: point.y,
      landId: MONTH_REGION_METAS[canonical.month].landId, placementOrigin: 'FALLBACK' };
  });
}
export async function loadGardenPlacements(ownerId: string, viewerId: string, timezone = 'UTC') {
  const [flowers, local] = await Promise.all([
    loadGarden(ownerId, viewerId), ownerId === viewerId ? loadFlowerPlacements() : Promise.resolve([]),
  ]);
  const records = hydrateGardenPlacements(flowers, local, ownerId, viewerId, timezone);
  // Spots planted before the server kept them live only on this device: save each once.
  // A refused spot (e.g. too close under the cluster spacing) stays on this device only.
  for (const record of records) {
    if (ownerId !== viewerId || record.placementOrigin !== 'LOCAL') continue;
    try {
      await plantFlowerSpot(ownerId, record.flowerId, { worldX: record.worldX, worldY: record.worldY,
        landId: MONTH_REGION_METAS[record.month].landId });
      record.placementOrigin = 'SERVER'; record.landId = MONTH_REGION_METAS[record.month].landId;
    } catch { /* Keep showing the device spot; the next load tries again. */ }
  }
  return records;
}
