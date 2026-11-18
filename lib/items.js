// One item system for fairy outfits, garden decorations and shop items (docs/items/ITEMS.md).
// The catalog is data (data/items/catalog.json) so new pieces need no code. Whether an owner may use
// an item is decided here only:
//   FREE  everyone            VIP    while VIP (lib/billing.js)     LEVEL  Fairy Bond level >= item.level
//   SHOP  a store purchase    GRANT  given by the server (keepsakes, events, codes)
// SHOP and GRANT items need an ItemOwnership row; the others are checked live and never stored, so a
// lapsed VIP simply stops using VIP pieces and gets them back on renewal.
import { readFileSync } from "node:fs";
import { isVip } from "./billing.js";
import { bondLevel } from "./fairy-closeness.js";

export const ITEM_TYPES = Object.freeze({
  FAIRY_OUTFIT: Object.freeze(["body", "hair", "clothes", "accessory"]),
  DECORATION: Object.freeze(["garden"])
});
export const ITEM_ACCESS = Object.freeze(["FREE", "VIP", "LEVEL", "SHOP", "GRANT"]);
// Slots that always hold a piece; the others (accessory) may be empty (null).
export const REQUIRED_SLOTS = Object.freeze(["body", "hair", "clothes"]);
export const OWNED_SOURCES = Object.freeze(["PURCHASE", "KEEPSAKE", "EVENT", "REDEEM", "STAFF"]);
const ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const PRODUCT = /^[A-Za-z0-9._-]{1,100}$/;

// Validates the catalog once; a bad entry stops the server at start-up rather than misbehaving later.
export function validateCatalog(raw) {
  if (!raw || !Array.isArray(raw.items)) throw new Error("Item catalog needs an items array");
  const ids = new Set(), products = new Set();
  const items = raw.items.map((item, index) => {
    const where = `catalog item ${index} (${item?.id})`;
    if (!item || typeof item !== "object") throw new Error(`${where}: not an object`);
    if (!ID.test(item.id ?? "") || ids.has(item.id)) throw new Error(`${where}: id missing, malformed or repeated`);
    ids.add(item.id);
    if (!ITEM_TYPES[item.type]?.includes(item.slot)) throw new Error(`${where}: type/slot`);
    if (!ITEM_ACCESS.includes(item.access)) throw new Error(`${where}: access`);
    if (item.access === "LEVEL" && !(Number.isInteger(item.level) && item.level >= 1 && item.level <= 20)) throw new Error(`${where}: level 1-20`);
    if (item.access === "SHOP") {
      if (!PRODUCT.test(item.productId ?? "") || products.has(item.productId)) throw new Error(`${where}: productId missing or repeated`);
      products.add(item.productId);
    } else if (item.productId !== undefined) throw new Error(`${where}: productId only for SHOP`);
    if (typeof item.name?.en !== "string" || typeof item.name?.["zh-Hans"] !== "string") throw new Error(`${where}: name.en and name.zh-Hans`);
    if (typeof item.art !== "string" || !item.art) throw new Error(`${where}: art`);
    if (item.default && item.access !== "FREE") throw new Error(`${where}: defaults must be FREE`);
    return Object.freeze({ id: item.id, type: item.type, slot: item.slot, access: item.access, level: item.level ?? null,
      productId: item.productId ?? null, set: typeof item.set === "string" ? item.set : null, art: item.art, name: Object.freeze({ ...item.name }),
      default: item.default === true, placeholder: item.placeholder === true,
      ...(typeof item.keepsakeId === "string" ? { keepsakeId: item.keepsakeId } : {}) });
  });
  for (const slot of ITEM_TYPES.FAIRY_OUTFIT) {
    const defaults = items.filter(item => item.type === "FAIRY_OUTFIT" && item.slot === slot && item.default).length;
    if (defaults > 1 || (REQUIRED_SLOTS.includes(slot) && defaults !== 1)) throw new Error(`catalog: one default FAIRY_OUTFIT ${slot}`);
  }
  return Object.freeze(items);
}

export const CATALOG = validateCatalog(JSON.parse(readFileSync(new URL("../data/items/catalog.json", import.meta.url), "utf8")));
const BY_ID = new Map(CATALOG.map(item => [item.id, item]));
const BY_PRODUCT = new Map(CATALOG.filter(item => item.productId).map(item => [item.productId, item]));
export const itemById = id => BY_ID.get(id) ?? null;
export const itemByProduct = productId => BY_PRODUCT.get(productId) ?? null;
export const defaultOutfit = (catalog = CATALOG) => Object.fromEntries(ITEM_TYPES.FAIRY_OUTFIT.map(slot =>
  [slot, catalog.find(item => item.type === "FAIRY_OUTFIT" && item.slot === slot && item.default)?.id ?? null]));

// What the checks need about one owner, loaded once per request.
export async function itemContext(db, userId, { now = new Date() } = {}) {
  const [vip, level, rows] = await Promise.all([
    isVip(db, userId, now),
    bondLevel(db, userId).catch(() => 1),
    db.itemOwnership.findMany({ where: { userId }, select: { itemId: true, source: true, createdAt: true } })
  ]);
  return { vip, level, owned: new Map(rows.map(row => [row.itemId, row])) };
}

export function itemUsable(item, context) {
  if (!item || item.placeholder) return false;
  switch (item.access) {
    case "FREE": return true;
    case "VIP": return context.vip === true;
    case "LEVEL": return context.level >= item.level;
    default: return context.owned.has(item.id);
  }
}

// One catalog entry as the app sees it, in the owner's language.
export function presentItem(item, context, locale = "en") {
  const lang = locale === "zh-Hans" ? "zh-Hans" : "en";
  const owned = context.owned.get(item.id);
  return { id: item.id, type: item.type, slot: item.slot, set: item.set, art: item.art, name: item.name[lang],
    access: item.access, level: item.level, productId: item.productId, usable: itemUsable(item, context),
    owned: Boolean(owned), ownedAt: owned ? new Date(owned.createdAt).toISOString() : null };
}

// The catalog for one owner. Placeholders (art not finished) are never shown.
export function catalogFor(context, { type, locale = "en", catalog = CATALOG } = {}) {
  return catalog.filter(item => !item.placeholder && (!type || item.type === type)).map(item => presentItem(item, context, locale));
}

// Gives an owner a SHOP or GRANT item. Idempotent: a second grant keeps the first row.
export async function grantItem(db, { userId, itemId, source }) {
  const item = itemById(itemId);
  if (!item || !["SHOP", "GRANT"].includes(item.access) || !OWNED_SOURCES.includes(source)) {
    const error = new Error("Item cannot be granted"); error.code = "ITEM_NOT_GRANTABLE"; throw error;
  }
  await db.itemOwnership.upsert({ where: { userId_itemId: { userId, itemId } }, update: {}, create: { userId, itemId, source } });
  return item;
}

// Shop items bought through RevenueCat (non-consumable products), from the same subscriber object
// lib/billing.js reads. Purchases are only ever added here: a refund is handled by staff.
export function purchasedItemIds(subscriber, env = process.env) {
  const purchases = subscriber?.non_subscriptions;
  if (!purchases || typeof purchases !== "object") return [];
  return Object.entries(purchases).flatMap(([productId, list]) => {
    const item = itemByProduct(productId);
    if (!item || !Array.isArray(list) || !list.length) return [];
    const real = list.some(purchase => purchase?.is_sandbox !== true || env.BILLING_ALLOW_SANDBOX === "true");
    return real ? [item.id] : [];
  });
}
