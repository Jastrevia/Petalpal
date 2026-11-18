import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG, catalogFor, grantItem, itemUsable, purchasedItemIds, validateCatalog } from "../../lib/items.js";
import { deleteLook, outfitFor, saveLook, wardrobeFor, wearLook, wearPieces, WardrobeError, wornOutfit } from "../../lib/fairy-wardrobe.js";

const USER = "user_1762000000001";
const name = { en: "x", "zh-Hans": "x" };
const entry = (id, extra) => ({ id, type: "FAIRY_OUTFIT", art: `a/${id}`, name, ...extra });
const DEFAULTS = [entry("b0", { slot: "body", access: "FREE", default: true }), entry("h0", { slot: "hair", access: "FREE", default: true }),
  entry("c0", { slot: "clothes", access: "FREE", default: true })];

function fakeDb({ points = 0, entitlement = null, owned = [] } = {}) {
  let wardrobe = null;
  const ownership = owned.map(itemId => ({ userId: USER, itemId, source: "PURCHASE", createdAt: new Date("2026-11-01T00:00:00Z") }));
  return {
    get wardrobe() { return wardrobe; },
    ownership,
    subscriptionEntitlement: { findUnique: async () => entitlement },
    fairyClosenessAward: { aggregate: async () => ({ _sum: { points } }) },
    itemOwnership: {
      findMany: async () => ownership,
      upsert: async ({ where, create }) => {
        const found = ownership.find(row => row.itemId === where.userId_itemId.itemId);
        if (found) return found;
        const row = { ...create, createdAt: new Date() }; ownership.push(row); return row;
      }
    },
    fairyWardrobe: {
      findUnique: async () => wardrobe,
      upsert: async ({ create, update }) => (wardrobe = wardrobe ? { ...wardrobe, ...update } : { equipped: {}, looks: [], ...create }),
      update: async ({ data }) => (wardrobe = { ...wardrobe, ...data })
    }
  };
}

test("the catalog file is valid and every outfit slot that must be filled has one free default", () => {
  assert.ok(CATALOG.length >= 3);
  for (const bad of [
    { items: [...DEFAULTS, entry("b0", { slot: "hair", access: "FREE" })] },
    { items: [...DEFAULTS, entry("x1", { slot: "wings", access: "FREE" })] },
    { items: [...DEFAULTS, entry("x1", { slot: "hair", access: "LEVEL" })] },
    { items: [...DEFAULTS, entry("x1", { slot: "hair", access: "SHOP" })] },
    { items: [...DEFAULTS, entry("x1", { slot: "hair", access: "VIP", productId: "p" })] },
    { items: [...DEFAULTS, entry("x1", { slot: "hair", access: "VIP", default: true })] },
    { items: DEFAULTS.slice(1) },
    { items: [...DEFAULTS, { ...entry("x1", { slot: "hair", access: "FREE" }), name: { en: "only English" } }] }
  ]) assert.throws(() => validateCatalog(bad));
  assert.equal(validateCatalog({ items: DEFAULTS }).length, 3);
});

test("who may use an item: free, VIP while VIP, Bond level, owned shop and granted items; placeholders never", () => {
  const items = validateCatalog({ items: [...DEFAULTS,
    entry("vip1", { slot: "clothes", access: "VIP" }), entry("lvl5", { slot: "hair", access: "LEVEL", level: 5 }),
    entry("shop1", { slot: "accessory", access: "SHOP", productId: "petalpal_item_x" }), entry("gift1", { slot: "accessory", access: "GRANT" }),
    entry("todo1", { slot: "hair", access: "FREE", placeholder: true })] });
  const by = id => items.find(item => item.id === id);
  const free = { vip: false, level: 1, owned: new Map() };
  const rich = { vip: true, level: 6, owned: new Map([["shop1", { createdAt: new Date() }], ["gift1", { createdAt: new Date() }]]) };
  assert.deepEqual(["b0", "vip1", "lvl5", "shop1", "gift1", "todo1"].map(id => itemUsable(by(id), free)), [true, false, false, false, false, false]);
  assert.deepEqual(["b0", "vip1", "lvl5", "shop1", "gift1", "todo1"].map(id => itemUsable(by(id), rich)), [true, true, true, true, true, false]);
  const listed = catalogFor(rich, { catalog: items, locale: "zh-Hans" });
  assert.equal(listed.some(item => item.id === "todo1"), false, "placeholders are hidden");
  assert.equal(listed.find(item => item.id === "shop1").owned, true);
  assert.equal(catalogFor(free, { catalog: items, type: "DECORATION" }).length, 0);
});

test("shop purchases come from RevenueCat non-subscription products; sandbox only on TEST", () => {
  const subscriber = { non_subscriptions: { petalpal_item_dew_crown: [{ is_sandbox: false }], petalpal_vip_lifetime: [{}], unknown: [{}] } };
  assert.deepEqual(purchasedItemIds(subscriber), ["fairy-accessory-dew-crown"]);
  assert.deepEqual(purchasedItemIds({ non_subscriptions: { petalpal_item_dew_crown: [{ is_sandbox: true }] } }), []);
  assert.deepEqual(purchasedItemIds({ non_subscriptions: { petalpal_item_dew_crown: [{ is_sandbox: true }] } }, { BILLING_ALLOW_SANDBOX: "true" }), ["fairy-accessory-dew-crown"]);
  assert.deepEqual(purchasedItemIds(null), []);
});

test("grants: only SHOP/GRANT items, idempotent", async () => {
  const db = fakeDb();
  await grantItem(db, { userId: USER, itemId: "fairy-accessory-dew-crown", source: "PURCHASE" });
  await grantItem(db, { userId: USER, itemId: "fairy-accessory-dew-crown", source: "PURCHASE" });
  assert.equal(db.ownership.length, 1);
  await assert.rejects(grantItem(db, { userId: USER, itemId: "fairy-hair-default", source: "STAFF" }), { code: "ITEM_NOT_GRANTABLE" });
  await assert.rejects(grantItem(db, { userId: USER, itemId: "fairy-accessory-dew-crown", source: "HACK" }), { code: "ITEM_NOT_GRANTABLE" });
});

test("wardrobe: defaults first, wear pieces, take the accessory off, locked and unknown pieces refused", async () => {
  const db = fakeDb();
  const first = await wardrobeFor(db, USER, { locale: "zh-Hans" });
  assert.deepEqual(first.equipped, { body: "fairy-body-default", hair: "fairy-hair-default", clothes: "fairy-clothes-default", accessory: null });
  assert.deepEqual(first.looks, []);
  assert.ok(first.pieces.every(piece => piece.type === "FAIRY_OUTFIT"));
  assert.equal(first.pieces.find(piece => piece.id === "fairy-hair-default").name, "花瓣卷发");
  const worn = await wearPieces(db, USER, { hair: "fairy-hair-default", accessory: null });
  assert.equal(worn.equipped.accessory, null);
  await assert.rejects(wearPieces(db, USER, { hair: "fairy-clothes-default" }), { code: "WARDROBE_INVALID" });
  await assert.rejects(wearPieces(db, USER, { wings: "x" }), { code: "WARDROBE_INVALID" });
  await assert.rejects(wearPieces(db, USER, { hair: null }), { code: "WARDROBE_INVALID" }, "hair is never empty");
  await assert.rejects(wearPieces(db, USER, { clothes: "fairy-clothes-rose-gown" }), WardrobeError, "placeholder pieces are not wearable");
  await assert.rejects(wearPieces(db, USER, {}), { code: "WARDROBE_INVALID" });
});

test("a piece the owner can no longer use is worn as the slot's default", () => {
  const context = { vip: false, level: 1, owned: new Map() };
  assert.deepEqual(wornOutfit({ hair: "fairy-hair-rose-braid", clothes: "gone-item", accessory: "fairy-accessory-dew-crown" }, context),
    { body: "fairy-body-default", hair: "fairy-hair-default", clothes: "fairy-clothes-default", accessory: null });
});

test("looks: save up to 8, wear one, delete one; friends see only what is worn", async () => {
  const db = fakeDb();
  let state;
  for (let i = 0; i < 8; i++) state = await saveLook(db, USER, { name: `  Look   ${i} ` });
  assert.equal(state.looks.length, 8);
  assert.equal(state.looks[0].name, "Look 0");
  assert.equal(state.looks[0].complete, true);
  await assert.rejects(saveLook(db, USER, { name: "ninth" }), { code: "WARDROBE_FULL" });
  await assert.rejects(saveLook(db, USER, { name: "" }), { code: "WARDROBE_INVALID" });
  await assert.rejects(saveLook(db, USER, { name: "x", equipped: {} }), { code: "WARDROBE_INVALID" });
  const id = state.looks[3].id;
  assert.deepEqual((await wearLook(db, USER, id)).equipped, state.looks[3].equipped);
  assert.equal((await deleteLook(db, USER, id)).looks.length, 7);
  await assert.rejects(wearLook(db, USER, id), { code: "LOOK_NOT_FOUND" });
  assert.deepEqual(Object.keys(await outfitFor(db, USER)), ["body", "hair", "clothes", "accessory"]);
});
