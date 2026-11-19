import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// A catalog with one ready keepsake decoration and one VIP decoration, loaded before lib/items.js.
const shipped = JSON.parse(readFileSync(new URL("../../data/items/catalog.json", import.meta.url), "utf8"));
const file = path.join(mkdtempSync(path.join(tmpdir(), "petalpal-items-")), "catalog.json");
writeFileSync(file, JSON.stringify({ decorationsReady: ["dewdrop"], items: [...shipped.items,
  { id: "deco-moon-lamp", type: "DECORATION", slot: "garden", access: "VIP", art: "garden/decorations/moon-lamp", name: { en: "Moon lamp", "zh-Hans": "月亮灯" } }] }));
process.env.PETALPAL_ITEM_CATALOG_FILE = file;
const { saveLayout, layoutFor } = await import("../../lib/garden-layout.js");

const USER = "user_1762000000001";
function fakeDb({ keepsakes = [], vip = false } = {}) {
  let layout = null;
  return {
    get layout() { return layout; },
    subscriptionEntitlement: { findUnique: async () => vip ? { tier: "PREMIUM", status: "ACTIVE", plan: "LIFETIME", currentPeriodEnd: null } : null },
    fairyClosenessAward: { aggregate: async () => ({ _sum: { points: 0 } }) },
    itemOwnership: { findMany: async () => [] },
    fairyKeepsakeGrant: { findMany: async () => keepsakes.map(keepsakeId => ({ keepsakeId })) },
    gardenLayout: {
      findUnique: async () => layout,
      upsert: async ({ create, update }) => (layout = { ...(layout ?? create), ...update, updatedAt: new Date("2026-11-18T20:00:00Z") })
    }
  };
}
const at = (itemId, worldX, extra = {}) => ({ itemId, worldX, worldY: 900, ...extra });

test("an owner places the decorations they hold, as many as they hold, in z order", async () => {
  const db = fakeDb({ keepsakes: ["dewdrop", "dewdrop"] });
  const saved = await saveLayout(db, USER, { placements: [at("deco-dewdrop", 100.04, { z: 5, flip: true, scale: 1.234 }), at("deco-dewdrop", 300, { z: 1 })] });
  assert.deepEqual(saved.placements, [
    { itemId: "deco-dewdrop", worldX: 300, worldY: 900, z: 1, flip: false, scale: 1, art: "garden/decorations/dewdrop" },
    { itemId: "deco-dewdrop", worldX: 100, worldY: 900, z: 5, flip: true, scale: 1.23, art: "garden/decorations/dewdrop" }
  ]);
  await assert.rejects(saveLayout(db, USER, { placements: [at("deco-dewdrop", 1), at("deco-dewdrop", 2), at("deco-dewdrop", 3)] }), { code: "ITEM_LOCKED" });
  await assert.rejects(saveLayout(db, USER, { placements: [at("deco-dewdrop", 2400)] }), { code: "LAYOUT_INVALID" }, "x must be inside the world");
  await assert.rejects(saveLayout(db, USER, { placements: [at("deco-dewdrop", 1, { scale: 3 })] }), { code: "LAYOUT_INVALID" });
  await assert.rejects(saveLayout(db, USER, { placements: [at("deco-moon-lamp", 1)] }), { code: "VIP_REQUIRED" });
  await assert.rejects(saveLayout(fakeDb(), USER, { placements: [at("deco-dewdrop", 1)] }), { code: "ITEM_LOCKED" }, "no keepsake, no decoration");
});

test("a VIP decoration disappears from the Garden when VIP ends and comes back on renewal", async () => {
  const vip = fakeDb({ vip: true });
  await saveLayout(vip, USER, { placements: [at("deco-moon-lamp", 50)] });
  assert.equal((await layoutFor(vip, USER)).placements.length, 1);
  const lapsed = fakeDb();
  await saveLayout(lapsed, USER, { placements: [] });
  Object.assign(lapsed.layout, { placements: vip.layout.placements });
  assert.equal((await layoutFor(lapsed, USER)).placements.length, 0);
});
