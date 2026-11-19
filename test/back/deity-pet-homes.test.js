import assert from "node:assert/strict";
import test from "node:test";
import { deitySummary, FLOWER_DEITIES, localMonthKey, monthsSince } from "../../lib/flower-deity.js";
import { petHomesFor, petSleepState, placePetHome, PET_SLEEP } from "../../lib/pet-homes.js";
import { GARDEN_PETS } from "../../lib/garden-pets.js";


test("twelve deities, one per month, unique ids", () => {
  assert.equal(FLOWER_DEITIES.length, 12);
  assert.deepEqual(FLOWER_DEITIES.map(deity => deity.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(new Set(FLOWER_DEITIES.map(deity => deity.id)).size, 12);
});

test("the deity follows the account-local month: 00:30 on 1 Feb in Shanghai is February while UTC is still January", () => {
  const SH = "Asia/Shanghai"; // fixed UTC+8, so the test does not depend on DST rules
  const earlyFeb = new Date("2027-01-31T16:30:00Z");
  assert.equal(localMonthKey(earlyFeb, SH), "2027-02");
  assert.equal(localMonthKey(earlyFeb, "UTC"), "2027-01");
  const env = { FLOWER_DEITIES_READY: "deity-snowdrop, deity-violet" };
  const summary = deitySummary({ now: earlyFeb, timezone: SH, createdAt: new Date("2026-12-10T04:00:00Z"), locale: "zh-Hans", env });
  assert.equal(summary.month, "2027-02");
  assert.equal(summary.deity.id, "deity-violet");
  assert.equal(summary.deity.name, "紫罗兰 · 温柔话语之神");
  assert.equal(summary.deity.monthOfYear, 2);
  assert.deepEqual(summary.album.map(entry => [entry.month, entry.ready]), [["2027-02", true], ["2027-01", true], ["2026-12", false]]);
  // Not ready: no visitor this month.
  assert.equal(deitySummary({ now: earlyFeb, timezone: SH, createdAt: earlyFeb, env: {} }).deity, null);
});

test("months since sign-up run newest first across a year and stop at 24", () => {
  assert.deepEqual(monthsSince("2026-11", "2027-02"), ["2027-02", "2027-01", "2026-12", "2026-11"]);
  assert.equal(monthsSince("2020-01", "2027-02").length, 24);
});

test("pets sleep from 21:30 to 07:00 local, staggered per pet", () => {
  const SH = "Asia/Shanghai";
  const evening = new Date("2026-11-18T13:00:00Z"); // 21:00 in Shanghai
  assert.deepEqual(petSleepState("puppy", evening, SH), { state: "AWAKE", nextChangeAt: new Date("2026-11-18T13:30:00Z") });
  const night = new Date("2026-11-18T14:00:00Z"); // 22:00
  assert.deepEqual(petSleepState("puppy", night, SH), { state: "ASLEEP", nextChangeAt: new Date("2026-11-18T23:00:00Z") }); // 07:00 next day
  const early = new Date("2026-11-18T22:00:00Z"); // 06:00
  assert.deepEqual(petSleepState("puppy", early, SH), { state: "ASLEEP", nextChangeAt: new Date("2026-11-18T23:00:00Z") });
  const second = petSleepState(GARDEN_PETS[1], new Date("2026-11-18T13:35:00Z"), SH);
  assert.equal(second.state, "AWAKE", "the second pet goes to bed 12 minutes later");
  assert.deepEqual(second.nextChangeAt, new Date(Date.UTC(2026, 10, 18, 13, 30 + PET_SLEEP.staggerMinutes)));
  // On a spring-forward day the wake-up is still 07:00 on the wall clock.
  const spring = petSleepState("puppy", new Date("2026-03-08T08:00:00Z"), "America/Vancouver");
  assert.equal(spring.state, "ASLEEP");
  assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(spring.nextChangeAt), "07:00");
  assert.throws(() => petSleepState("dragon", night, SH), { code: "PET_NOT_FOUND" });
});

test("pet beds: placed inside the Garden, removable, every pet listed", async () => {
  const rows = [];
  const db = {
    user: { findUnique: async () => ({ timezone: "Asia/Shanghai" }) },
    gardenPetOutfit: {
      findMany: async () => rows,
      upsert: async ({ where, update, create }) => {
        const row = rows.find(item => item.petId === where.userId_petId.petId);
        if (row) Object.assign(row, update); else rows.push({ ...create });
      }
    }
  };
  const now = new Date("2026-11-18T14:00:00Z"); // 22:00 in Shanghai
  const placed = await placePetHome(db, "user_1", "puppy", { home: { worldX: 1200.04, worldY: 300 } }, { now });
  assert.equal(placed.pets.length, GARDEN_PETS.length);
  assert.deepEqual(placed.pets.find(pet => pet.petId === "puppy"), { petId: "puppy", state: "ASLEEP", nextChangeAt: "2026-11-18T23:00:00.000Z", home: { worldX: 1200, worldY: 300 } });
  assert.equal(placed.pets.find(pet => pet.petId === "rabbit").home, null);
  assert.equal((await placePetHome(db, "user_1", "puppy", { home: null }, { now })).pets[0].home, null);
  await assert.rejects(placePetHome(db, "user_1", "puppy", { home: { worldX: 5000, worldY: 1 } }), { code: "PET_HOME_INVALID" });
  await assert.rejects(placePetHome(db, "user_1", "puppy", { home: { worldX: 1, worldY: 1, z: 2 } }), { code: "PET_HOME_INVALID" });
  await assert.rejects(placePetHome(db, "user_1", "dragon", { home: null }), { code: "PET_NOT_FOUND" });
  assert.equal((await petHomesFor(db, "user_1", { now })).world.width, 2400);
});
