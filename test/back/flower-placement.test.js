import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CLUSTER_FOOTPRINT_RADIUS, LAND_CLUSTER_SIZE, plantFlowerOnce } from "../../lib/flower-placement.js";

// In-memory Flower rows behind the same calls the module makes inside its transaction.
function fakeDatabase(rows) {
  const locks = [];
  const tx = {
    $queryRaw: async (strings, ...values) => { locks.push(values[0]); return [{ locked: "" }]; },
    flower: {
      findFirst: async ({ where }) => rows.find(row => row.id === where.id && row.userId === where.userId) ?? null,
      findMany: async ({ where }) => rows.filter(row => row.userId === where.userId && row.regionId === where.regionId
        && row.worldX !== null && row.id !== where.NOT.id),
      updateMany: async ({ where, data }) => {
        const row = rows.find(item => item.id === where.id && item.userId === where.userId && item.worldX === null);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }
    }
  };
  return { locks, $transaction: callback => callback(tx) };
}
const flower = (id, extra = {}) => ({ id, userId: "owner", worldX: null, worldY: null, regionId: null, placedAt: null,
  createdAt: new Date("2026-04-10T18:00:00Z"), sourceEvent: { localDate: "2026-04-10" }, dailyCheckIn: null,
  user: { timezone: "America/Vancouver" }, ...extra });
const now = new Date("2026-10-28T00:00:00Z");

test("a flower is planted once and its spot can never change", async () => {
  const rows = [flower("a")];
  const db = fakeDatabase(rows);
  const spot = { worldX: 1100.5, worldY: 900.25, landId: "Land04" };
  const first = await plantFlowerOnce(db, { userId: "owner", flowerId: "a", body: spot, now });
  assert.equal(first.created, true);
  assert.deepEqual(first.placement, { flowerId: "a", ...spot, placedAt: now });
  assert.deepEqual(db.locks, ["flower-placement:owner"]);

  // The same spot again (a retried request) is accepted without a change.
  const again = await plantFlowerOnce(db, { userId: "owner", flowerId: "a", body: spot });
  assert.equal(again.created, false);
  assert.equal(again.placement.placedAt, now);

  for (const moved of [{ ...spot, worldX: 1130 }, { ...spot, worldY: 880 }]) {
    await assert.rejects(plantFlowerOnce(db, { userId: "owner", flowerId: "a", body: moved }),
      { status: 409, code: "PLACEMENT_LOCKED" });
  }
  assert.equal(rows[0].worldX, 1100.5);
  assert.equal(rows[0].worldY, 900.25);
});

test("placement is owner-scoped, inside the Garden and on the flower's own month land", async () => {
  const db = fakeDatabase([flower("a"), flower("daily", { sourceEvent: null, dailyCheckIn: { localDate: "2026-12-01" } }),
    flower("legacy", { sourceEvent: null, createdAt: new Date("2026-08-01T03:00:00Z") })]);
  await assert.rejects(plantFlowerOnce(db, { userId: "intruder", flowerId: "a", body: { worldX: 10, worldY: 10, landId: "Land04" } }),
    { status: 404 });
  for (const body of [{ worldX: -1, worldY: 10, landId: "Land04" }, { worldX: 2400, worldY: 10, landId: "Land04" },
    { worldX: 10, worldY: Number.NaN, landId: "Land04" }, { worldX: "10", worldY: 10, landId: "Land04" },
    { worldX: 10, worldY: 10, landId: "Land13" }, { worldX: 10, worldY: 10, landId: "Land04", userId: "x" }]) {
    await assert.rejects(plantFlowerOnce(db, { userId: "owner", flowerId: "a", body }), { status: 400, code: "INVALID_PLACEMENT" });
  }
  await assert.rejects(plantFlowerOnce(db, { userId: "owner", flowerId: "a", body: { worldX: 10, worldY: 10, landId: "Land05" } }),
    { status: 400, code: "WRONG_LAND" });
  assert.equal((await plantFlowerOnce(db, { userId: "owner", flowerId: "daily", body: { worldX: 10, worldY: 10, landId: "Land12" } })).created, true);
  // Without an Event or check-in, the account-local creation date decides (Jul 31 in Vancouver).
  await assert.rejects(plantFlowerOnce(db, { userId: "owner", flowerId: "legacy", body: { worldX: 10, worldY: 10, landId: "Land08" } }),
    { code: "WRONG_LAND" });
  assert.equal((await plantFlowerOnce(db, { userId: "owner", flowerId: "legacy", body: { worldX: 10, worldY: 10, landId: "Land07" } })).created, true);
});

test("clusters on the same land keep their spacing", async () => {
  const r = CLUSTER_FOOTPRINT_RADIUS[LAND_CLUSTER_SIZE[4]];
  const db = fakeDatabase([flower("a", { worldX: 1000, worldY: 900, regionId: "Land04" }), flower("b"), flower("c")]);
  await assert.rejects(plantFlowerOnce(db, { userId: "owner", flowerId: "b", body: { worldX: 1000 + 2 * r - 2, worldY: 900, landId: "Land04" } }),
    { status: 409, code: "TOO_CLOSE" });
  assert.equal((await plantFlowerOnce(db, { userId: "owner", flowerId: "b", body: { worldX: 1000 + 2 * r, worldY: 900, landId: "Land04" } })).created, true);
});

test("server cluster sizes match the app's land rule", () => {
  assert.deepEqual(Object.entries(LAND_CLUSTER_SIZE).filter(([, size]) => size === "S").map(([land]) => Number(land)), [1, 2, 3, 5, 6]);
  assert.deepEqual(Object.entries(LAND_CLUSTER_SIZE).filter(([, size]) => size === "M").map(([land]) => Number(land)), [4, 7, 8, 9]);
  assert.deepEqual(Object.entries(LAND_CLUSTER_SIZE).filter(([, size]) => size === "L").map(([land]) => Number(land)), [10, 11, 12]);
  const app = fs.readFileSync(new URL("../../mobile/src/components/garden/planting/flowerClusters.ts", import.meta.url), "utf8");
  const radii = /CLUSTER_FOOTPRINT_RADIUS = \{ S: (\d+), M: (\d+), L: (\d+) \}/.exec(app);
  assert.ok(radii, "the app declares its cluster footprint radii");
  assert.deepEqual({ S: Number(radii[1]), M: Number(radii[2]), L: Number(radii[3]) }, CLUSTER_FOOTPRINT_RADIUS);
});

test("no server route moves a planted flower", () => {
  const source = fs.readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /worldX:\s*req\.body|worldY:\s*req\.body/);
  assert.equal((source.match(/plantFlowerOnce\(/g) || []).length, 1);
});

test("HTTP: only the owner plants, once; a move is a 409", async (t) => {
  const { default: prisma } = await import("../../lib/prisma.js");
  const { app } = await import("../../server.js");
  const { setFirebaseTokenVerifierForTests } = await import("../../lib/auth.js");
  const rows = [flower("a", { userId: "user-a" })];
  const db = fakeDatabase(rows);
  const originals = { userFindUnique: prisma.user.findUnique, transaction: prisma.$transaction };
  prisma.user.findUnique = async ({ where }) => where.firebaseUid
    ? { id: where.firebaseUid === "a-firebase" ? "user-a" : "user-b" }
    : { id: where.id, firebaseUid: `${where.id}-firebase` };
  prisma.$transaction = db.$transaction;
  setFirebaseTokenVerifierForTests(async (token) => ({ uid: token === "a-token" ? "a-firebase" : "b-firebase", email_verified: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    prisma.user.findUnique = originals.userFindUnique; prisma.$transaction = originals.transaction;
    setFirebaseTokenVerifierForTests();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/users/user-a/flowers/a/placement`;
  const send = (token, body) => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const spot = { worldX: 1000, worldY: 900, landId: "Land04" };
  assert.equal((await send("b-token", spot)).status, 403);
  assert.equal(rows[0].worldX, null);
  const planted = await send("a-token", spot);
  assert.equal(planted.status, 201);
  assert.deepEqual({ ...(await planted.json()), placedAt: undefined }, { flowerId: "a", ...spot, placedAt: undefined });
  assert.equal((await send("a-token", spot)).status, 200);
  const moved = await send("a-token", { ...spot, worldX: 1040 });
  assert.equal(moved.status, 409);
  assert.equal((await moved.json()).code, "PLACEMENT_LOCKED");
  assert.equal(rows[0].worldX, 1000);
});
