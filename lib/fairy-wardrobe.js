// The Garden Fairy's wardrobe (docs/items/ITEMS.md): one piece per slot (body, hair, clothes,
// accessory), and up to WARDROBE_LIMITS.looks saved outfits. Pieces come from lib/items.js; a piece the
// owner can no longer use (a lapsed VIP piece) is shown as the slot's default, and comes back on renewal.
import { randomBytes } from "node:crypto";
import { catalogFor, defaultOutfit, ITEM_TYPES, itemById, itemContext, itemUsable, REQUIRED_SLOTS } from "./items.js";

export const WARDROBE_LIMITS = Object.freeze({ looks: 8, lookName: 24 });
const SLOTS = ITEM_TYPES.FAIRY_OUTFIT;

export class WardrobeError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// Stored equipped map → what is actually worn now (every slot filled, only usable pieces).
export function wornOutfit(stored, context) {
  const base = defaultOutfit();
  for (const slot of SLOTS) {
    if (stored?.[slot] === null && !REQUIRED_SLOTS.includes(slot)) { base[slot] = null; continue; }
    const item = itemById(stored?.[slot]);
    if (item && item.type === "FAIRY_OUTFIT" && item.slot === slot && itemUsable(item, context)) base[slot] = item.id;
  }
  return base;
}

// Validates a { slot: itemId } change; every named piece must exist, fit its slot and be usable.
function checkPieces(pieces, context) {
  if (!pieces || typeof pieces !== "object" || Array.isArray(pieces) || !Object.keys(pieces).length) {
    throw new WardrobeError("Choose at least one piece", 400, "WARDROBE_INVALID");
  }
  for (const [slot, itemId] of Object.entries(pieces)) {
    if (!SLOTS.includes(slot)) throw new WardrobeError(`Unknown slot ${slot}`, 400, "WARDROBE_INVALID");
    if (itemId === null && !REQUIRED_SLOTS.includes(slot)) continue; // take the accessory off
    const item = typeof itemId === "string" ? itemById(itemId) : null;
    if (!item || item.type !== "FAIRY_OUTFIT" || item.slot !== slot || item.placeholder) throw new WardrobeError("Unknown piece", 400, "WARDROBE_INVALID");
    if (!itemUsable(item, context)) throw new WardrobeError("This piece is locked", 403, item.access === "VIP" ? "VIP_REQUIRED" : "ITEM_LOCKED");
  }
}

const storedLooks = row => (Array.isArray(row?.looks) ? row.looks : []).filter(look => look && typeof look.id === "string");

function present(row, context, locale) {
  return {
    equipped: wornOutfit(row?.equipped, context),
    looks: storedLooks(row).map(look => ({ id: look.id, name: look.name, equipped: wornOutfit(look.equipped, context),
      // False when a piece of this look is locked now; wearing it puts the slot's default there.
      complete: SLOTS.every(slot => !look.equipped?.[slot] || itemUsable(itemById(look.equipped[slot]), context)) })),
    pieces: catalogFor(context, { type: "FAIRY_OUTFIT", locale }),
    vip: context.vip, level: context.level
  };
}

export async function wardrobeFor(db, userId, { locale = "en", now = new Date() } = {}) {
  const [context, row] = await Promise.all([itemContext(db, userId, { now }), db.fairyWardrobe.findUnique({ where: { userId } })]);
  return present(row, context, locale);
}

// What a visiting friend sees: the pieces worn, nothing else.
export async function outfitFor(db, userId, { now = new Date() } = {}) {
  const [context, row] = await Promise.all([itemContext(db, userId, { now }), db.fairyWardrobe.findUnique({ where: { userId }, select: { equipped: true } })]);
  return wornOutfit(row?.equipped, context);
}

export async function wearPieces(db, userId, pieces, { locale = "en", now = new Date() } = {}) {
  const context = await itemContext(db, userId, { now });
  checkPieces(pieces, context);
  const row = await db.fairyWardrobe.findUnique({ where: { userId } });
  const equipped = { ...wornOutfit(row?.equipped, context), ...pieces };
  const saved = await db.fairyWardrobe.upsert({ where: { userId }, update: { equipped }, create: { userId, equipped } });
  return present(saved, context, locale);
}

const tidyName = value => (typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "");

// Saves what is worn now as a named look.
export async function saveLook(db, userId, body, { locale = "en", now = new Date() } = {}) {
  if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "name")) throw new WardrobeError("Only a name is accepted", 400, "WARDROBE_INVALID");
  const name = tidyName(body.name);
  if (!name || [...name].length > WARDROBE_LIMITS.lookName) throw new WardrobeError(`Name must be 1-${WARDROBE_LIMITS.lookName} characters`, 400, "WARDROBE_INVALID");
  const context = await itemContext(db, userId, { now });
  const row = await db.fairyWardrobe.findUnique({ where: { userId } });
  const looks = storedLooks(row);
  if (looks.length >= WARDROBE_LIMITS.looks) throw new WardrobeError(`At most ${WARDROBE_LIMITS.looks} looks`, 409, "WARDROBE_FULL");
  const look = { id: randomBytes(6).toString("hex"), name, equipped: wornOutfit(row?.equipped, context) };
  const next = [...looks, look];
  const saved = await db.fairyWardrobe.upsert({ where: { userId }, update: { looks: next },
    create: { userId, equipped: look.equipped, looks: next } });
  return present(saved, context, locale);
}

export async function wearLook(db, userId, lookId, { locale = "en", now = new Date() } = {}) {
  const context = await itemContext(db, userId, { now });
  const row = await db.fairyWardrobe.findUnique({ where: { userId } });
  const look = storedLooks(row).find(item => item.id === lookId);
  if (!look) throw new WardrobeError("Look not found", 404, "LOOK_NOT_FOUND");
  const equipped = wornOutfit(look.equipped, context);
  const saved = await db.fairyWardrobe.update({ where: { userId }, data: { equipped } });
  return present(saved, context, locale);
}

export async function deleteLook(db, userId, lookId, { locale = "en", now = new Date() } = {}) {
  const context = await itemContext(db, userId, { now });
  const row = await db.fairyWardrobe.findUnique({ where: { userId } });
  const looks = storedLooks(row);
  if (!looks.some(look => look.id === lookId)) throw new WardrobeError("Look not found", 404, "LOOK_NOT_FOUND");
  const saved = await db.fairyWardrobe.update({ where: { userId }, data: { looks: looks.filter(look => look.id !== lookId) } });
  return present(saved, context, locale);
}
