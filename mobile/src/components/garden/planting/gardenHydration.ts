import { plantingRecord } from '../../../services/events';
import { landMonth, loadGarden, plantFlowerSpot, type GardenFlower } from '../../../services/garden';
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

/**
 * Where each flower is drawn, for the owner's Garden and a visiting friend's:
 * - SERVER: the spot the server persisted when its owner pressed Plant. Its land (and so its month and cluster
 *   size) is that spot's land, never re-derived from the viewer's timezone.
 * - LOCAL (owner only): a spot planted before the server kept spots, still only on this device (the server
 *   refused or has not received it yet); shown there, as before.
 * - UNPLANTED (owner only): an Event flower its owner has not planted yet. It has no coordinates (NaN, so
 *   nothing draws it by accident) and is planted from the calendar. Visitors never receive one (the server
 *   leaves it out, lib/garden-response.js awaitsPlanting).
 * - FALLBACK: an older flower that is not an Event's and has no spot keeps its preview spot on its month's
 *   grass, for the owner and visitors alike, so existing Gardens look exactly as they did.
 */
export function hydrateGardenPlacements(flowers: readonly GardenFlower[], ownerId: string, viewerId: string,
  timezone = 'UTC', deviceSpots: ReadonlyMap<string, FlowerPlacementRecord> = new Map()): FlowerPlacementRecord[] {
  const ownGarden = ownerId === viewerId;
  const slots = new Map<number, number>();
  // Sorting makes fallback placement independent of backend response order.
  return [...flowers].sort((a, b) => a.id.localeCompare(b.id)).flatMap((flower): FlowerPlacementRecord[] => {
    if (flower.userId !== ownerId) throw new Error('This flower belongs to another Garden.');
    const canonical = gardenPlantingRecord(flower, timezone);
    if (typeof flower.worldX === 'number' && Number.isFinite(flower.worldX)
      && typeof flower.worldY === 'number' && Number.isFinite(flower.worldY)) {
      const month = landMonth(flower.regionId) ?? canonical.month;
      return [{ ...canonical, month, worldX: flower.worldX, worldY: flower.worldY,
        landId: MONTH_REGION_METAS[month].landId, placementOrigin: 'SERVER' }];
    }
    const device = ownGarden ? deviceSpots.get(flower.id) : undefined;
    if (device) return [{ ...canonical, worldX: device.worldX, worldY: device.worldY, landId: device.landId,
      scale: device.scale ?? canonical.scale, rotation: device.rotation ?? canonical.rotation, placementOrigin: 'LOCAL' }];
    if (canonical.sourceType === 'EVENT') {
      if (!ownGarden) return [];
      return [{ ...canonical, worldX: Number.NaN, worldY: Number.NaN, landId: undefined, placementOrigin: 'UNPLANTED' }];
    }
    const points = monthFallbackPoints(canonical.month);
    const index = slots.get(canonical.month) || 0;
    slots.set(canonical.month, index + 1);
    const point = points[index % points.length];
    return [{ ...canonical, worldX: point.x, worldY: point.y,
      landId: MONTH_REGION_METAS[canonical.month].landId, placementOrigin: 'FALLBACK' }];
  });
}

export async function loadGardenPlacements(ownerId: string, viewerId: string, timezone = 'UTC') {
  const ownGarden = ownerId === viewerId;
  const [loaded, local] = await Promise.all([
    loadGarden(ownerId, viewerId), ownGarden ? loadFlowerPlacements() : Promise.resolve([]),
  ]);
  // Spots planted before the server kept them lived only on a device: offer each to the server
  // once. An accepted spot becomes the server's; a refused or unsent one keeps showing at the
  // device spot (LOCAL, as before), and the next load tries again.
  const deviceSpots = new Map(local
    .filter(p => (!p.ownerUserId || p.ownerUserId === ownerId) && (p.placementOrigin as string | undefined) !== 'FALLBACK'
      && p.placementOrigin !== 'UNPLANTED' && Number.isFinite(p.worldX) && Number.isFinite(p.worldY))
    .map(p => [p.flowerId, p]));
  const flowers = [...loaded];
  for (let i = 0; i < flowers.length; i++) {
    const flower = flowers[i];
    const device = deviceSpots.get(flower.id);
    if (!ownGarden || !device || flower.worldX != null) continue;
    try {
      const saved = await plantFlowerSpot(ownerId, flower.id, { worldX: device.worldX, worldY: device.worldY,
        landId: MONTH_REGION_METAS[gardenPlantingRecord(flower, timezone).month].landId });
      flowers[i] = { ...flower, worldX: saved.worldX, worldY: saved.worldY, regionId: saved.landId };
    } catch { /* Keep showing the device spot; the next load tries again. */ }
  }
  return hydrateGardenPlacements(flowers, ownerId, viewerId, timezone, deviceSpots);
}
