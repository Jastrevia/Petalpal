import { localDateForInstant } from "./ai-periods.js";

// A planted flower's Garden position is stored once and never changes: there is no move or
// adjust. Lands 1–12 are the months; the flower's land must be the month of its local date
// (time.md). Cluster sizes follow the land (small / medium / large) and must match
// mobile/src/components/garden/planting/flowerClusters.ts.
export const GARDEN_WORLD = { width: 2400, height: 1800 };
export const LAND_CLUSTER_SIZE = Object.freeze({
  1: "S", 2: "S", 3: "S", 5: "S", 6: "S", 4: "M", 7: "M", 8: "M", 9: "M", 10: "L", 11: "L", 12: "L"
});
export const CLUSTER_FOOTPRINT_RADIUS = Object.freeze({ S: 14, M: 18, L: 22 });

export class FlowerPlacementError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const landNumber = landId => {
  const match = /^Land(0[1-9]|1[0-2])$/.exec(typeof landId === "string" ? landId : "");
  return match ? Number(match[1]) : null;
};

// The one rule for "planted", used by every Garden read (owner and visitor alike): a flower is
// planted only when it has a persisted Garden spot. A flower without one (an Event saved but not
// yet planted with Plant) is never placed anywhere, by default or fallback.
const LEGACY_WORLD_LAYOUT_VERSION = 2;
const inWorld = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < GARDEN_WORLD.width
  && y >= 0 && y < GARDEN_WORLD.height;
export function plantedSpot(flower) {
  if (!flower) return null;
  if (Number.isFinite(flower.worldX) && Number.isFinite(flower.worldY)) {
    return { worldX: flower.worldX, worldY: flower.worldY, landId: landNumber(flower.regionId) ? flower.regionId : null };
  }
  // Legacy, explicit: an earlier local build (never production) confirmed spots into left/top
  // with layoutVersion 2 and the land in regionId. Read those as the same persisted spot.
  // layoutVersion 1 left/top are random old-web values and are never a spot.
  if (flower.layoutVersion === LEGACY_WORLD_LAYOUT_VERSION && landNumber(flower.regionId) && inWorld(flower.left, flower.top)) {
    return { worldX: flower.left, worldY: flower.top, landId: flower.regionId };
  }
  return null;
}
// The fields a Garden read needs to apply plantedSpot().
export const PLANTED_SPOT_SELECT = Object.freeze({ worldX: true, worldY: true, regionId: true, left: true, top: true, layoutVersion: true });
// A flower's spot fields as Garden reads send them: the persisted spot, or nulls when unplanted.
export function plantedSpotFields(flower) {
  const spot = plantedSpot(flower);
  return { worldX: spot ? spot.worldX : null, worldY: spot ? spot.worldY : null,
    regionId: spot ? spot.landId : (flower?.regionId ?? null) };
}

export function parsePlacement(body) {
  const keys = Object.keys(body || {});
  if (keys.some(key => !["worldX", "worldY", "landId"].includes(key))) {
    throw new FlowerPlacementError(400, "INVALID_PLACEMENT", "Send only worldX, worldY and landId");
  }
  const { worldX, worldY, landId } = body;
  const land = landNumber(landId);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || worldX < 0 || worldX >= GARDEN_WORLD.width
    || worldY < 0 || worldY >= GARDEN_WORLD.height || !land) {
    throw new FlowerPlacementError(400, "INVALID_PLACEMENT", "Choose a spot inside the Garden");
  }
  return { worldX, worldY, landId, land };
}

const placementOf = (flower, spot) => ({ flowerId: flower.id, worldX: spot.worldX, worldY: spot.worldY,
  landId: spot.landId, placedAt: flower.placedAt });

// Plants the owner's flower at one spot. A second call with the same spot returns it unchanged;
// any other spot is refused, so a planted flower can never move.
export async function plantFlowerOnce(prisma, { userId, flowerId, body, now = new Date() }) {
  const spot = parsePlacement(body);
  return prisma.$transaction(async tx => {
    // One placement at a time per owner, so two plantings can never take the same space.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`flower-placement:${userId}`}))::text AS "locked"`;
    const flower = await tx.flower.findFirst({
      where: { id: flowerId, userId },
      select: { id: true, ...PLANTED_SPOT_SELECT, placedAt: true, createdAt: true,
        sourceEvent: { select: { localDate: true } }, dailyCheckIn: { select: { localDate: true } },
        user: { select: { timezone: true } } }
    });
    if (!flower) throw new FlowerPlacementError(404, "FLOWER_NOT_FOUND", "Flower not found");
    const existing = plantedSpot(flower);
    if (existing) {
      if (existing.worldX === spot.worldX && existing.worldY === spot.worldY && existing.landId === spot.landId) {
        return { created: false, placement: placementOf(flower, existing) };
      }
      throw new FlowerPlacementError(409, "PLACEMENT_LOCKED", "This flower is already planted. Its spot can’t change.");
    }
    const localDate = flower.sourceEvent?.localDate || flower.dailyCheckIn?.localDate
      || localDateForInstant(flower.createdAt, flower.user?.timezone || "UTC");
    if (Number(localDate.slice(5, 7)) !== spot.land) {
      throw new FlowerPlacementError(400, "WRONG_LAND", "This flower belongs in another month’s land");
    }
    const radius = CLUSTER_FOOTPRINT_RADIUS[LAND_CLUSTER_SIZE[spot.land]];
    const neighbours = (await tx.flower.findMany({
      where: { userId, regionId: spot.landId, NOT: { id: flower.id } },
      select: PLANTED_SPOT_SELECT
    })).map(plantedSpot).filter(Boolean);
    // Same rule as the app: footprints of neighbouring clusters never overlap.
    if (neighbours.some(other => Math.hypot(other.worldX - spot.worldX, other.worldY - spot.worldY) < 2 * radius - 0.5)) {
      throw new FlowerPlacementError(409, "TOO_CLOSE", "Another flower is already planted here");
    }
    const written = await tx.flower.updateMany({
      where: { id: flower.id, userId, worldX: null },
      data: { worldX: spot.worldX, worldY: spot.worldY, regionId: spot.landId, placedAt: now }
    });
    if (written.count !== 1) throw new FlowerPlacementError(409, "PLACEMENT_LOCKED", "This flower is already planted. Its spot can’t change.");
    return { created: true, placement: { flowerId: flower.id, worldX: spot.worldX, worldY: spot.worldY,
      landId: spot.landId, placedAt: now } };
  });
}
