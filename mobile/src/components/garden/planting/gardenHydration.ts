import { plantingRecord } from '../../../services/events';
import { landMonth, loadGarden, plantFlowerSpot, type GardenFlower } from '../../../services/garden';
import { loadFlowerPlacements, type FlowerPlacementRecord } from './plantingPersistence';
import { MONTH_REGION_METAS } from './plantingRegionData';

export function gardenPlantingRecord(flower: GardenFlower, timezone = 'UTC'): FlowerPlacementRecord {
  return { ...plantingRecord(flower, timezone), sourceType: flower.sourceType,
    dailyCheckInId: flower.dailyCheckInId, secondaryEmotions: flower.secondaryEmotions,
    variant: flower.variant, rarity: flower.rarity, growthState: flower.growthState, season: flower.season };
}

/**
 * One rule for the owner's Garden and a visiting friend's: a flower is drawn only at the spot the
 * server persisted when its owner pressed Plant. Its land (and so its month and cluster size) is
 * that spot's land, never re-derived from the viewer's timezone. There is no default, generated or
 * fallback position: a flower without a persisted spot is not in the Garden. Visitors never receive
 * one (the server leaves it out); the owner keeps it as UNPLANTED, with no coordinates, to plant it.
 */
export function hydrateGardenPlacements(flowers: readonly GardenFlower[], ownerId: string, viewerId: string,
  timezone = 'UTC'): FlowerPlacementRecord[] {
  const ownGarden = ownerId === viewerId;
  return [...flowers].sort((a, b) => a.id.localeCompare(b.id)).flatMap((flower): FlowerPlacementRecord[] => {
    if (flower.userId !== ownerId) throw new Error('This flower belongs to another Garden.');
    const canonical = gardenPlantingRecord(flower, timezone);
    if (typeof flower.worldX === 'number' && Number.isFinite(flower.worldX)
      && typeof flower.worldY === 'number' && Number.isFinite(flower.worldY)) {
      const month = landMonth(flower.regionId) ?? canonical.month;
      return [{ ...canonical, month, worldX: flower.worldX, worldY: flower.worldY,
        landId: MONTH_REGION_METAS[month].landId, placementOrigin: 'SERVER' }];
    }
    if (!ownGarden) return [];
    // NaN on purpose: an unplanted flower has no position anywhere, so nothing can draw it by accident.
    return [{ ...canonical, worldX: Number.NaN, worldY: Number.NaN, landId: undefined, placementOrigin: 'UNPLANTED' }];
  });
}

export async function loadGardenPlacements(ownerId: string, viewerId: string, timezone = 'UTC') {
  const ownGarden = ownerId === viewerId;
  const [loaded, local] = await Promise.all([
    loadGarden(ownerId, viewerId), ownGarden ? loadFlowerPlacements() : Promise.resolve([]),
  ]);
  // Spots planted before the server kept them lived only on a device: offer each to the server
  // once. Only a spot the server accepted is drawn (so the owner and friends always match); a
  // refused or unsent one leaves the flower unplanted, and the next load tries again.
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
    } catch { /* Still unplanted; never drawn from the device copy. */ }
  }
  return hydrateGardenPlacements(flowers, ownerId, viewerId, timezone);
}
