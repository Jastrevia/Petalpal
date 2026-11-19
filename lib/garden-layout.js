// Keepsake DIY garden (docs/items/ITEMS.md): where the owner placed decorations in their Garden.
// The editor saves the whole layout at once (PUT replaces it). Positions use the Garden world
// (lib/flower-placement.js GARDEN_WORLD); z orders overlapping pieces; flip mirrors the art.
// A friend sees the same layout minus any piece the owner can no longer use (a lapsed VIP piece).
import { GARDEN_WORLD } from "./flower-placement.js";
import { itemById, itemContext, itemCopies, itemUsable } from "./items.js";

export const LAYOUT_LIMITS = Object.freeze({ placements: 60, zMax: 999, scaleMin: 0.5, scaleMax: 2 });
const PLACEMENT_FIELDS = new Set(["itemId", "worldX", "worldY", "z", "flip", "scale"]);

export class LayoutError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

function parsePlacements(body, context) {
  if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "placements") || !Array.isArray(body.placements)) {
    throw new LayoutError("Send { placements: [...] }", 400, "LAYOUT_INVALID");
  }
  if (body.placements.length > LAYOUT_LIMITS.placements) throw new LayoutError(`At most ${LAYOUT_LIMITS.placements} decorations`, 400, "LAYOUT_TOO_MANY");
  const used = new Map();
  return body.placements.map((placement, index) => {
    if (!placement || typeof placement !== "object" || Object.keys(placement).some(key => !PLACEMENT_FIELDS.has(key))) {
      throw new LayoutError(`Placement ${index}: unsupported fields`, 400, "LAYOUT_INVALID");
    }
    const { itemId, worldX, worldY, z = index, flip = false, scale = 1 } = placement;
    const item = typeof itemId === "string" ? itemById(itemId) : null;
    if (!item || item.type !== "DECORATION" || item.placeholder) throw new LayoutError(`Placement ${index}: unknown decoration`, 400, "LAYOUT_INVALID");
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || worldX < 0 || worldX >= GARDEN_WORLD.width || worldY < 0 || worldY >= GARDEN_WORLD.height) {
      throw new LayoutError(`Placement ${index}: outside the Garden`, 400, "LAYOUT_INVALID");
    }
    if (!Number.isInteger(z) || z < 0 || z > LAYOUT_LIMITS.zMax || typeof flip !== "boolean" ||
        !Number.isFinite(scale) || scale < LAYOUT_LIMITS.scaleMin || scale > LAYOUT_LIMITS.scaleMax) {
      throw new LayoutError(`Placement ${index}: z, flip or scale`, 400, "LAYOUT_INVALID");
    }
    const count = (used.get(item.id) ?? 0) + 1;
    used.set(item.id, count);
    if (count > itemCopies(item, context)) {
      throw new LayoutError(`Placement ${index}: not enough ${item.id}`, 403, item.access === "VIP" ? "VIP_REQUIRED" : "ITEM_LOCKED");
    }
    return { itemId: item.id, worldX: Math.round(worldX * 10) / 10, worldY: Math.round(worldY * 10) / 10, z, flip, scale: Math.round(scale * 100) / 100 };
  });
}

// Stored placements → what can be shown now, in drawing order (z, then position).
export function visiblePlacements(stored, context) {
  const used = new Map();
  return (Array.isArray(stored) ? stored : []).filter(placement => {
    const item = itemById(placement?.itemId);
    if (!item || item.type !== "DECORATION" || !itemUsable(item, context)) return false;
    const count = (used.get(item.id) ?? 0) + 1;
    used.set(item.id, count);
    return count <= itemCopies(item, context);
  }).map(placement => ({ ...placement, art: itemById(placement.itemId).art })).sort((a, b) => a.z - b.z || a.worldY - b.worldY);
}

export async function layoutFor(db, userId, { now = new Date() } = {}) {
  const [context, row] = await Promise.all([itemContext(db, userId, { now }), db.gardenLayout.findUnique({ where: { userId } })]);
  return { placements: visiblePlacements(row?.placements, context), updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    world: GARDEN_WORLD, limit: LAYOUT_LIMITS.placements };
}

export async function saveLayout(db, userId, body, { now = new Date() } = {}) {
  const context = await itemContext(db, userId, { now });
  const placements = parsePlacements(body, context);
  await db.gardenLayout.upsert({ where: { userId }, update: { placements }, create: { userId, placements } });
  return layoutFor(db, userId, { now });
}
