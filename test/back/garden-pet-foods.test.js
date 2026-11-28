import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_FOODS, PET_FOODS, foodStock, giveCheckInFood, isPetFood } from "../../lib/garden-pets.js";

test("the dogs' foods: kibble and eight dog-safe foods, named in both languages", () => {
  assert.deepEqual(PET_FOODS.map(food => food.id), ["kibble", "carrot", "blueberries", "apple", "pumpkin", "banana", "strawberries", "salmon", "egg"]);
  for (const food of PET_FOODS) assert.ok(food.name.en && food.name["zh-Hans"], food.id);
  for (const old of Object.keys(LEGACY_FOODS)) assert.equal(isPetFood(old), false, `${old} can no longer be fed by its old id`);
  for (const now of Object.values(LEGACY_FOODS)) assert.equal(isPetFood(now), true);
});

test("food held from before counts as its new food, so nobody loses any", async () => {
  const rows = [
    { foodId: "berry-tart", delta: 1 }, { foodId: "berry-tart", delta: 1 }, { foodId: "blueberries", delta: 1 },
    { foodId: "blueberries", delta: -1 }, { foodId: "fish-biscuit", delta: 1 }, { foodId: "honey-seeds", delta: 1 },
    { foodId: "flower-cookies", delta: 1 }, { foodId: "something-unknown", delta: 5 }
  ];
  const stock = await foodStock({ gardenPetFood: { findMany: async () => rows } }, "owner");
  assert.equal(stock.get("blueberries"), 2);
  assert.equal(stock.get("salmon"), 1); assert.equal(stock.get("pumpkin"), 1); assert.equal(stock.get("kibble"), 1);
  assert.equal(stock.has("berry-tart"), false); assert.equal(stock.has("something-unknown"), false);
});

test("gifts are only current foods, and kibble comes most often", async () => {
  const given = [];
  const tx = { gardenPetFood: { findMany: async () => [], createMany: async ({ data }) => { given.push(...data); } } };
  for (let day = 1; day <= 400; day++) await giveCheckInFood(tx, { userId: `owner-${day % 7}`, localDate: `2026-${String(1 + (day % 12)).padStart(2, "0")}-${String(1 + (day % 28)).padStart(2, "0")}` });
  assert.ok(given.length > 300);
  assert.ok(given.every(row => isPetFood(row.foodId)));
  const counts = Object.fromEntries(PET_FOODS.map(food => [food.id, given.filter(row => row.foodId === food.id).length]));
  for (const food of PET_FOODS.filter(food => food.id !== "kibble")) assert.ok(counts.kibble > counts[food.id], `kibble more often than ${food.id}`);
});
