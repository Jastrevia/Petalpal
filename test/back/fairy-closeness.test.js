import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { FAIRY_KEEPSAKES, KEEPSAKES_BY_ID, keepsakesOf } from "../../lib/fairy-keepsakes.js";
import {
  CLOSENESS_SOURCES, MAX_LEVEL, awardCloseness, awardFairyTap, checkInWithFairy, closenessLevel, closenessSummary,
  dressGardenPet, fairyClosenessEnabledFor, fairyMomentsLockedByBond, feedGardenPet, gardenPets, listCheckIns, listKeepsakes, nextStreak, planKeepsakes,
  pointsToNextLevel, rewardFirstWeekPlanting
} from "../../lib/fairy-closeness.js";
import { ACCESSORY_BANDS, PET_ACCESSORIES, PET_FOODS, unlockedAccessories } from "../../lib/garden-pets.js";
import { app } from "../../server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plain = value => JSON.parse(JSON.stringify(value));
// 20:00 UTC is 13:00 in Vancouver (PDT, UTC-7) on these dates.
const at = (localDate, hourUtc = 20) => new Date(`${localDate}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);

test("keepsake catalog follows the icon sheet: 24 common, 8 rare, the October brooch", () => {
  assert.equal(new Set(FAIRY_KEEPSAKES.map(keepsake => keepsake.id)).size, FAIRY_KEEPSAKES.length);
  assert.equal(FAIRY_KEEPSAKES.length, 33);
  assert.deepEqual(["COMMON", "RARE", "MONTHLY"].map(rarity => keepsakesOf(rarity).length), [24, 8, 1]);
  assert.deepEqual(keepsakesOf("MONTHLY").map(keepsake => keepsake.month), [10]);
  assert.equal(KEEPSAKES_BY_ID.get("firefly-bottle").name["zh-Hans"], "萤火虫瓶");
  assert.equal(KEEPSAKES_BY_ID.get("moonlit-letter-set").rarity, "RARE");
  for (const keepsake of FAIRY_KEEPSAKES) {
    assert.match(keepsake.id, /^[a-z0-9-]{1,48}$/);
    for (const locale of ["en", "zh-Hans"]) assert.ok(keepsake.name[locale] && keepsake.note[locale], `${keepsake.id} ${locale}`);
    assert.doesNotMatch(keepsake.note["zh-Hans"], /小仙女/);
  }
  assert.equal(KEEPSAKES_BY_ID.get("crocus-brooch").month, 10);
});

test("levels: each level needs 15 more points, 20 is the top", () => {
  assert.deepEqual([1, 2, 10, 19].map(pointsToNextLevel), [35, 50, 170, 305]);
  assert.equal(closenessLevel(0).level, 1);
  assert.equal(closenessLevel(34).level, 1);
  assert.deepEqual(plain(closenessLevel(35, "zh-Hans")), {
    level: 2, title: "初次相遇", total: 35, pointsIntoLevel: 0, pointsForNextLevel: 50,
    nextTitle: { level: 3, title: "渐渐熟悉" }, maxed: false
  });
  const top = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => pointsToNextLevel(i + 1)).reduce((a, b) => a + b, 0);
  assert.equal(top, 3230);
  assert.equal(closenessLevel(top - 1).level, 19);
  assert.deepEqual(plain(closenessLevel(top + 999, "en")), {
    level: 20, title: "Eternal Bloom", total: top + 999, pointsIntoLevel: 0, pointsForNextLevel: null, nextTitle: null, maxed: true
  });
});

test("streak: consecutive days add up, one missed day a week is bridged, more resets", () => {
  const last = { localDate: "2026-10-20", streak: 4 };
  assert.deepEqual(nextStreak({ today: "2026-10-21", last, graceUsedSince: false }), { streak: 5, graceUsed: false });
  assert.deepEqual(nextStreak({ today: "2026-10-22", last, graceUsedSince: false }), { streak: 5, graceUsed: true });
  assert.deepEqual(nextStreak({ today: "2026-10-22", last, graceUsedSince: true }), { streak: 1, graceUsed: false });
  assert.deepEqual(nextStreak({ today: "2026-10-23", last, graceUsedSince: false }), { streak: 1, graceUsed: false });
  assert.deepEqual(nextStreak({ today: "2026-10-23", last: null, graceUsedSince: false }), { streak: 1, graceUsed: false });
  assert.deepEqual(nextStreak({ today: "2026-11-01", last: { localDate: "2026-10-31", streak: 9 }, graceUsedSince: false }), { streak: 10, graceUsed: false });
});

test("keepsake plan: deterministic, 7th day rare, brooch once the month's days are reached", () => {
  const base = { userId: "u", today: "2026-10-22", level: 1, streak: 3, monthCheckIns: 5, owned: new Set(), monthlyGrantedThisMonth: false };
  assert.deepEqual(planKeepsakes(base), planKeepsakes(base));
  assert.deepEqual(planKeepsakes(base).map(item => item.reason), ["DAILY"]);
  const seventh = planKeepsakes({ ...base, streak: 14 });
  assert.deepEqual(seventh.map(item => item.reason), ["DAILY", "STREAK_7"]);
  assert.equal(KEEPSAKES_BY_ID.get(seventh[1].keepsakeId).rarity, "RARE");
  assert.notEqual(seventh[0].keepsakeId, seventh[1].keepsakeId);
  assert.deepEqual(planKeepsakes({ ...base, monthCheckIns: 20 }).at(-1), { keepsakeId: "crocus-brooch", reason: "MONTHLY" });
  assert.equal(planKeepsakes({ ...base, monthCheckIns: 16 }).length, 1);
  assert.equal(planKeepsakes({ ...base, monthCheckIns: 16, level: 16 }).at(-1).reason, "MONTHLY", "Lv16 needs 16 days");
  assert.equal(planKeepsakes({ ...base, monthCheckIns: 25, monthlyGrantedThisMonth: true }).length, 1);
  assert.equal(planKeepsakes({ ...base, today: "2026-11-25", monthCheckIns: 25 }).length, 1, "no brooch drawn for November yet");
  // Over many days most daily keepsakes are common, and unowned ones are preferred.
  const owned = new Set(keepsakesOf("COMMON").slice(0, 20).map(keepsake => keepsake.id));
  const days = Array.from({ length: 200 }, (_, i) => planKeepsakes({ ...base, today: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, userId: `u${i}`, owned })[0]);
  const rare = days.filter(item => KEEPSAKES_BY_ID.get(item.keepsakeId).rarity === "RARE").length;
  assert.ok(rare > 0 && rare < 30, `rare ${rare}`);
  const fresh = days.filter(item => !owned.has(item.keepsakeId)).length;
  assert.ok(fresh > days.length / 2, `fresh ${fresh}`);
});

test("owner switch: a listed id or \"*\", spaces ignored, otherwise off", () => {
  assert.equal(fairyClosenessEnabledFor("user_1", {}), false);
  assert.equal(fairyClosenessEnabledFor("user_1", { FAIRY_CLOSENESS_OWNER_IDS: "*\n" }), true);
  assert.equal(fairyClosenessEnabledFor("user_1", { FAIRY_CLOSENESS_OWNER_IDS: "user_2, user_1" }), true);
  assert.equal(fairyClosenessEnabledFor("user_3", { FAIRY_CLOSENESS_OWNER_IDS: "user_2,user_1" }), false);
  assert.equal(fairyClosenessEnabledFor("", { FAIRY_CLOSENESS_OWNER_IDS: "*" }), false);
  for (const value of ["*,user_1", "user 1", ","]) assert.equal(fairyClosenessEnabledFor("user_1", { FAIRY_CLOSENESS_OWNER_IDS: value }), false, value);
});

// In-memory stand-in for the Prisma calls lib/fairy-closeness.js makes.
function fakeDatabase(users) {
  const tables = { fairyCheckIn: [], fairyKeepsakeGrant: [], fairyClosenessAward: [], gardenPetFood: [], gardenPetOutfit: [], fairyMoment: [] };
  let id = 0;
  const cmp = (value, filter) => {
    if (filter === null || typeof filter !== "object" || filter instanceof Date) return value === filter;
    if (Array.isArray(filter.in)) return filter.in.includes(value);
    return (filter.lt === undefined || value < filter.lt) && (filter.lte === undefined || value <= filter.lte) &&
      (filter.gt === undefined || value > filter.gt) && (filter.startsWith === undefined || value.startsWith(filter.startsWith));
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, filter]) => {
    if (key === "userId_localDate" || key === "userId_source_awardKey") return Object.entries(filter).every(([k, v]) => row[k] === v);
    return cmp(row[key], filter);
  });
  const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row });
  const sort = (rows, orderBy) => {
    if (!orderBy) return rows;
    const [[key, dir]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  };
  const model = name => ({
    findUnique: async ({ where, select }) => { const row = tables[name].find(r => matches(r, where)); return row ? pick(row, select) : null; },
    findFirst: async ({ where, orderBy, select }) => { const row = sort(tables[name].filter(r => matches(r, where)), orderBy)[0]; return row ? pick(row, select) : null; },
    findMany: async ({ where, orderBy, select } = {}) => sort(tables[name].filter(r => matches(r, where)), orderBy).map(r => pick(r, select)),
    count: async ({ where }) => tables[name].filter(r => matches(r, where)).length,
    aggregate: async ({ where }) => ({ _sum: { points: tables[name].filter(r => matches(r, where)).reduce((sum, r) => sum + r.points, 0) || null } }),
    create: async ({ data }) => {
      if (name === "fairyCheckIn" && tables[name].some(r => r.userId === data.userId && r.localDate === data.localDate)) throw new Error("unique");
      if (name === "fairyClosenessAward" && tables[name].some(r => r.userId === data.userId && r.source === data.source && r.awardKey === data.awardKey)) throw new Error("unique");
      if (name === "gardenPetFood" && tables[name].some(r => r.userId === data.userId && r.awardKey === data.awardKey)) throw new Error("unique");
      if (name === "fairyKeepsakeGrant" && tables[name].some(r => r.userId === data.userId && r.localDate === data.localDate && r.reason === data.reason)) throw new Error("unique");
      const row = { id: `${name}-${++id}`, createdAt: new Date(id), graceUsed: false, ...data };
      tables[name].push(row); return { ...row };
    },
    createMany: async ({ data }) => { for (const row of data) await model(name).create({ data: row }); return { count: data.length }; },
    upsert: async ({ where, create, update }) => {
      const row = tables[name].find(r => r.userId === where.userId_petId.userId && r.petId === where.userId_petId.petId);
      if (row) Object.assign(row, update); else tables[name].push({ ...create });
    }
  });
  const db = {
    tables,
    user: { findUnique: async ({ where }) => users[where.id] || null },
    gardenPetFood: model("gardenPetFood"), gardenPetOutfit: model("gardenPetOutfit"), fairyMoment: model("fairyMoment"),
    userFairy: { findFirst: async ({ where }) => (users[where.userId]?.unlockedAt ? { unlockedAt: users[where.userId].unlockedAt } : null) },
    fairyCheckIn: model("fairyCheckIn"), fairyKeepsakeGrant: model("fairyKeepsakeGrant"), fairyClosenessAward: model("fairyClosenessAward"),
    $queryRaw: async () => [{ locked: "" }]
  };
  db.$transaction = async operation => operation(db);
  return db;
}

const OWNER = { "owner-1": { timezone: "America/Vancouver", preferredLocale: "zh-Hans", unlockedAt: new Date("2026-10-04T18:00:00Z") } };

test("check-in: once a local day, streak, 7th-day reward, grace and the calendar month", async () => {
  const db = fakeDatabase(OWNER);
  const first = await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-16") });
  assert.equal(first.created, true);
  assert.deepEqual(plain(first.checkIn), { localDate: "2026-10-16", streak: 1, graceUsed: false });
  assert.equal(first.keepsakes.length, 1);
  assert.equal(first.keepsakes[0].reason, "DAILY");
  assert.equal(first.keepsakes[0].firstTime, true);
  assert.ok(first.keepsakes[0].name && first.keepsakes[0].note);
  assert.equal(first.awarded, 10);
  assert.equal(first.locale, "zh-Hans");

  const again = await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-16", 23) });
  assert.equal(again.created, false);
  assert.equal(again.awarded, 0);
  assert.deepEqual(again.keepsakes.map(k => k.id), first.keepsakes.map(k => k.id));
  assert.equal(db.tables.fairyCheckIn.length, 1);

  // 06:30 UTC on the 17th is still the evening of the 16th in Vancouver.
  assert.equal((await checkInWithFairy(db, { userId: "owner-1", now: new Date("2026-10-17T06:30:00Z") })).created, false);

  for (const day of ["17", "18", "19", "20", "21"]) await checkInWithFairy(db, { userId: "owner-1", now: at(`2026-10-${day}`) });
  const seventh = await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-22") });
  assert.equal(seventh.checkIn.streak, 7);
  assert.deepEqual(seventh.keepsakes.map(k => k.reason), ["DAILY", "STREAK_7"]);
  assert.equal(seventh.awarded, 30);

  // Skip the 23rd: the grace bridges it. Skip again within the week: the streak restarts.
  const bridged = await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-24") });
  assert.deepEqual(plain(bridged.checkIn), { localDate: "2026-10-24", streak: 8, graceUsed: true });
  const reset = await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-26") });
  assert.equal(reset.checkIn.streak, 1);

  const month = await listCheckIns(db, { userId: "owner-1", now: at("2026-10-26") });
  assert.equal(month.month, "2026-10");
  assert.deepEqual(month.days.map(day => day.localDate.slice(8)), ["16", "17", "18", "19", "20", "21", "22", "24", "26"]);
  assert.deepEqual(month.days[6].keepsakes.map(k => k.reason), ["DAILY", "STREAK_7"]);
  assert.equal(month.days[6].points, 30);
  assert.equal(month.days[0].points, 10);
  assert.ok(month.days[6].keepsakes.every(k => k.name && k.rarity && !("note" in k)));
  assert.deepEqual(plain((await listCheckIns(db, { userId: "owner-1", month: "2026-09", now: at("2026-10-26") })).days), []);
});

test("closeness awards: daily caps, each thing counts once, level-up reported", async () => {
  const db = fakeDatabase(OWNER);
  const now = at("2026-10-22");
  const events = [];
  for (const key of ["e1", "e2", "e3", "e4"]) events.push((await awardCloseness(db, { userId: "owner-1", source: "EVENT", key, now })).awarded);
  assert.deepEqual(events, [5, 5, 5, 0], "three Events a day");
  assert.equal((await awardCloseness(db, { userId: "owner-1", source: "EVENT", key: "e5", now: at("2026-10-23") })).awarded, 5, "the cap resets the next local day");
  assert.deepEqual([await awardCloseness(db, { userId: "owner-1", source: "MOMENT_LIKE", key: "m1", now }),
    await awardCloseness(db, { userId: "owner-1", source: "MOMENT_LIKE", key: "m1", now })].map(r => r.awarded), [2, 0], "re-liking counts once");
  const taps = [];
  for (let i = 0; i < 6; i++) taps.push((await awardFairyTap(db, { userId: "owner-1", now })).awarded);
  assert.deepEqual(taps, [1, 1, 1, 1, 1, 0]);
  const weekly = await awardCloseness(db, { userId: "owner-1", source: "WEEKLY_READ", key: "report-1", now });
  assert.equal(weekly.awarded, 15);
  assert.deepEqual(plain(weekly.levelUp), { level: 2, title: "初次相遇" }, "15+2+5+15 = 37 crosses 35");
  assert.equal((await awardCloseness(db, { userId: "owner-1", source: "WEEKLY_READ", key: "report-1", now: at("2026-10-29") })).awarded, 0);
  await assert.rejects(awardCloseness(db, { userId: "owner-1", source: "CHECK_IN", key: "x", now }), TypeError);
  await assert.rejects(awardCloseness(db, { userId: "owner-1", source: "EVENT", key: "", now }), TypeError);
  assert.equal((await awardCloseness(db, { userId: "missing", source: "EVENT", key: "e", now })).awarded, 0);
});

test("reaching the top level reports the last title", async () => {
  const db = fakeDatabase(OWNER);
  db.tables.fairyClosenessAward.push({ id: "seed", userId: "owner-1", source: "EVENT", awardKey: "seed", localDate: "2026-01-01", points: 3229 });
  const result = await awardCloseness(db, { userId: "owner-1", source: "EVENT", key: "last", now: at("2026-10-22") });
  assert.deepEqual(plain(result), { awarded: 5, levelUp: { level: 20, title: "一生花伴" } });
  assert.equal(db.tables.fairyKeepsakeGrant.length, 0);
});

test("summary and keepsake book", async () => {
  const db = fakeDatabase(OWNER);
  for (const day of ["15", "16", "17", "18", "19", "20"]) await checkInWithFairy(db, { userId: "owner-1", now: at(`2026-10-${day}`) });
  await awardCloseness(db, { userId: "owner-1", source: "EVENT", key: "e1", now: at("2026-10-21") });
  const before = await closenessSummary(db, { userId: "owner-1", now: at("2026-10-21") });
  assert.equal(before.localDate, "2026-10-21");
  assert.equal(before.total, 65);
  assert.equal(before.level, 2);
  assert.deepEqual(plain(before.checkIn), { checkedInToday: false, streak: 6, cycleDay: 6, graceAvailable: true, checkInsToStreakReward: 1 });
  assert.equal(before.daysTogether, 18, "met on Oct 4 (local), Oct 21 is day 18");
  assert.ok(before.greeting.length > 4);
  assert.equal(before.greeting, (await closenessSummary(db, { userId: "owner-1", now: at("2026-10-21", 23) })).greeting, "one greeting per local day");
  assert.equal(before.collection.received, db.tables.fairyKeepsakeGrant.length);
  assert.deepEqual(plain(before.today.find(row => row.source === "EVENT")), { source: "EVENT", count: 1, dailyCap: 3, points: 5, pointsEach: 5 });
  assert.equal(before.today.length, Object.keys(CLOSENESS_SOURCES).length);
  assert.deepEqual(plain(before.monthly), {
    month: "2026-10", checkIns: 6, needed: 20, keepsake: { id: "crocus-brooch", rarity: "MONTHLY", name: "番红花胸针", month: 10 }, earned: false
  });
  assert.deepEqual(before.unlocks.map(unlock => [unlock.level, unlock.unlocked]), [[3, false], [5, false], [8, false], [12, false], [16, false], [20, false]]);
  // A keepsake id that left the catalog (renamed artwork) is ignored everywhere.
  db.tables.fairyKeepsakeGrant.push({ id: "old", userId: "owner-1", keepsakeId: "acorn-cup", reason: "DAILY", localDate: "2026-10-01" });
  await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-21") });
  const after = await closenessSummary(db, { userId: "owner-1", now: at("2026-10-21") });
  assert.deepEqual(plain(after.checkIn), { checkedInToday: true, streak: 7, cycleDay: 7, graceAvailable: true, checkInsToStreakReward: 7 });
  assert.equal((await closenessSummary(db, { userId: "owner-1", now: at("2026-10-25") })).checkIn.streak, 0, "three days away ends the streak");

  const book = await listKeepsakes(db, { userId: "owner-1", now: at("2026-10-21") });
  assert.equal(book.total, FAIRY_KEEPSAKES.length);
  assert.equal(book.keepsakes.length, FAIRY_KEEPSAKES.length);
  const owned = book.keepsakes.filter(keepsake => keepsake.owned);
  assert.equal(book.owned, owned.length);
  assert.ok(owned.every(keepsake => keepsake.note && keepsake.count >= 1 && keepsake.firstLocalDate));
  assert.ok(book.keepsakes.filter(keepsake => !keepsake.owned).every(keepsake => !("note" in keepsake) && keepsake.count === 0));
});

test("bond rewards: Lv 4-10 pendants, 11-15 collars, 16-20 hats, in pairs, never repeated, every row emptied", () => {
  const rows = row => PET_ACCESSORIES.filter(item => item.row === row);
  assert.deepEqual(["hat", "collar", "pendant"].map(row => rows(row).length), [10, 9, 13]);
  assert.equal(new Set(PET_ACCESSORIES.map(item => item.id)).size, 32);
  for (const userId of Array.from({ length: 200 }, (_, i) => `user_${i}`)) {
    assert.equal(unlockedAccessories(userId, 3).size, 0, "nothing before Lv 4");
    let previous = new Map();
    for (let level = 4; level <= 20; level++) {
      const now = unlockedAccessories(userId, level);
      for (const [id, at] of previous) assert.equal(now.get(id), at, "a piece stays, from the level that opened it");
      const fresh = [...now.keys()].filter(id => !previous.has(id)).map(id => PET_ACCESSORIES.find(item => item.id === id));
      const band = ACCESSORY_BANDS.find(item => level >= item.from && level <= item.to);
      assert.ok(fresh.every(item => item.row === band.row), `Lv ${level} only opens its own row`);
      assert.ok(fresh.length <= band.maxPairs * 2);
      previous = now;
    }
    for (const band of ACCESSORY_BANDS) {
      const open = [...unlockedAccessories(userId, band.to).keys()].filter(id => PET_ACCESSORIES.find(item => item.id === id).row === band.row);
      assert.equal(open.length, rows(band.row).length, `${band.row} is empty by Lv ${band.to}`);
    }
    assert.equal(unlockedAccessories(userId, 20).size, 32);
  }
  assert.deepEqual([...unlockedAccessories("user_1", 9)], [...unlockedAccessories("user_1", 9)], "fixed per owner");
  assert.notDeepEqual([...unlockedAccessories("user_1", 20).keys()], [...unlockedAccessories("user_2", 20).keys()], "different per owner");
});

const stockOf = pets => Object.fromEntries(pets.foods.map(food => [food.id, food.count]));
const totalFood = pets => pets.foods.reduce((sum, food) => sum + food.count, 0);
const seedPoints = (db, points) => db.tables.fairyClosenessAward.push({ id: "seed", userId: "owner-1", source: "EVENT", awardKey: "seed", localDate: "2026-01-01", points });

test("pet food: one per check-in, five per level reached (owed levels once), three on each first-week planting day", async () => {
  const db = fakeDatabase({ "owner-1": { ...OWNER["owner-1"], createdAt: new Date("2026-10-20T20:00:00Z") } });
  assert.equal(totalFood(await gardenPets(db, { userId: "owner-1", now: at("2026-10-20") })), 0);
  await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-20") });
  await checkInWithFairy(db, { userId: "owner-1", now: at("2026-10-20", 23) });
  assert.equal(totalFood(await gardenPets(db, { userId: "owner-1", now: at("2026-10-20") })), 1, "a repeat check-in gives nothing");

  assert.equal((await rewardFirstWeekPlanting(db, { userId: "owner-1", now: at("2026-10-20") })).length, 3);
  assert.equal((await rewardFirstWeekPlanting(db, { userId: "owner-1", now: at("2026-10-20", 23) })).length, 0, "only the day's first planting");
  assert.equal((await rewardFirstWeekPlanting(db, { userId: "owner-1", now: at("2026-10-26") })).length, 3, "day 7 still counts");
  assert.equal((await rewardFirstWeekPlanting(db, { userId: "owner-1", now: at("2026-10-27") })).length, 0, "day 8 does not");
  assert.equal(totalFood(await gardenPets(db, { userId: "owner-1", now: at("2026-10-27") })), 7);

  seedPoints(db, 85); // Lv 3 with the check-in's 10 points: two levels reached
  const later = await gardenPets(db, { userId: "owner-1", now: at("2026-10-27") });
  assert.equal(later.level, 3);
  assert.equal(totalFood(later), 7 + 10);
  assert.equal(totalFood(await gardenPets(db, { userId: "owner-1", now: at("2026-10-28") })), 7 + 10, "owed levels are paid once");
  assert.ok(PET_FOODS.every(food => stockOf(later)[food.id] >= 0));
});

test("feeding spends one food and stops at none", async () => {
  const db = fakeDatabase(OWNER);
  const now = at("2026-10-22");
  await checkInWithFairy(db, { userId: "owner-1", now });
  const stock = stockOf(await gardenPets(db, { userId: "owner-1", now }));
  const foodId = Object.keys(stock).find(id => stock[id] === 1);
  const none = Object.keys(stock).find(id => stock[id] === 0);
  assert.deepEqual(plain(await feedGardenPet(db, { userId: "owner-1", petId: "puppy", foodId, key: "a", now })), { foodId, count: 0 });
  assert.deepEqual(plain(await feedGardenPet(db, { userId: "owner-1", petId: "puppy", foodId, key: "b", now })), { error: "NO_FOOD" });
  assert.deepEqual(plain(await feedGardenPet(db, { userId: "owner-1", petId: "puppy", foodId: none, key: "c", now })), { error: "NO_FOOD" });
});

test("outfits: only opened pieces of the right row, and a list that shows the locks", async () => {
  const db = fakeDatabase(OWNER);
  const now = at("2026-10-22");
  const before = await gardenPets(db, { userId: "owner-1", now });
  assert.equal(before.accessories.length, 32);
  assert.ok(before.accessories.every(item => !item.unlocked && item.unlockedAtLevel === null && item.name));
  assert.equal(before.accessories.find(item => item.id === "lilac-beret").name, "紫藤贝雷帽");
  assert.deepEqual(plain(await dressGardenPet(db, { userId: "owner-1", petId: "puppy", outfit: { pendant: "hourglass" }, now })), { error: "ACCESSORY_LOCKED" });
  seedPoints(db, 3230); // Lv 20
  assert.deepEqual(plain(await dressGardenPet(db, { userId: "owner-1", petId: "puppy", outfit: { hat: "hourglass" }, now })), { error: "UNKNOWN_ACCESSORY" }, "a pendant is not a hat");
  assert.deepEqual(plain(await dressGardenPet(db, { userId: "owner-1", petId: "puppy", outfit: { hat: "no-such-hat" }, now })), { error: "UNKNOWN_ACCESSORY" });
  assert.deepEqual(plain(await dressGardenPet(db, { userId: "owner-1", petId: "puppy", outfit: { hat: "lilac-beret", pendant: "hourglass" }, now })), { outfit: { hat: "lilac-beret", collar: null, pendant: "hourglass" } });
  const after = await gardenPets(db, { userId: "owner-1", now });
  assert.deepEqual(plain(after.outfits.puppy), { hat: "lilac-beret", collar: null, pendant: "hourglass" });
  assert.deepEqual(plain(after.outfits.rabbit), { hat: null, collar: null, pendant: null }, "each pet has its own outfit");
  assert.ok(after.accessories.every(item => item.unlocked));
  await dressGardenPet(db, { userId: "owner-1", petId: "puppy", outfit: { hat: null }, now });
  assert.equal((await gardenPets(db, { userId: "owner-1", now })).outfits.puppy.hat, null, "taking it off");
});

test("Fairy Moments open at Lv 3; feeds that already have posts stay open; owners outside the switch keep the old rule", async () => {
  const db = fakeDatabase(OWNER);
  const on = { FAIRY_CLOSENESS_OWNER_IDS: "*" }, off = {};
  assert.equal(await fairyMomentsLockedByBond(db, { userId: "owner-1", env: off }), false);
  assert.equal(await fairyMomentsLockedByBond(db, { userId: "owner-1", env: on }), true, "a new owner waits for Lv 3");
  db.tables.fairyMoment.push({ id: "m1", userId: "owner-1" });
  assert.equal(await fairyMomentsLockedByBond(db, { userId: "owner-1", env: on }), false, "an existing feed is kept");
  db.tables.fairyMoment.length = 0;
  seedPoints(db, 85);
  assert.equal(await fairyMomentsLockedByBond(db, { userId: "owner-1", env: on }), false, "Lv 3 opens it");
});

test("migration: owner-scoped tables, one check-in a day, cascade on account deletion", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
      .filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of names) await db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    await db.exec(`INSERT INTO "User" (id, name) VALUES ('owner', 'Owner');
      INSERT INTO "FairyCheckIn" (id, "userId", "localDate", timezone, streak) VALUES ('c1', 'owner', '2026-10-22', 'UTC', 1);
      INSERT INTO "FairyKeepsakeGrant" (id, "userId", "checkInId", "keepsakeId", reason, "localDate") VALUES ('g1', 'owner', 'c1', 'dewdrop', 'DAILY', '2026-10-22');
      INSERT INTO "FairyClosenessAward" (id, "userId", source, "awardKey", "localDate", points) VALUES ('a1', 'owner', 'CHECK_IN', '2026-10-22', '2026-10-22', 10);
      INSERT INTO "GardenPetFood" (id, "userId", "foodId", delta, reason, "awardKey", "localDate") VALUES ('f1', 'owner', 'berry-tart', 1, 'CHECK_IN', 'CHECK_IN:2026-10-22:0', '2026-10-22');
      INSERT INTO "GardenPetOutfit" ("userId", "petId", hat, "updatedAt") VALUES ('owner', 'puppy', 'lilac-beret', now());`);
    await assert.rejects(db.exec(`INSERT INTO "GardenPetFood" (id, "userId", "foodId", delta, reason, "awardKey", "localDate") VALUES ('f2', 'owner', 'berry-tart', 1, 'CHECK_IN', 'CHECK_IN:2026-10-22:0', '2026-10-22')`), /unique/i);
    await assert.rejects(db.exec(`INSERT INTO "FairyCheckIn" (id, "userId", "localDate", timezone, streak) VALUES ('c2', 'owner', '2026-10-22', 'UTC', 1)`), /unique/i);
    await assert.rejects(db.exec(`INSERT INTO "FairyClosenessAward" (id, "userId", source, "awardKey", "localDate", points) VALUES ('a2', 'owner', 'CHECK_IN', '2026-10-22', '2026-10-22', 10)`), /unique/i);
    await assert.rejects(db.exec(`INSERT INTO "FairyKeepsakeGrant" (id, "userId", "keepsakeId", reason, "localDate") VALUES ('g2', 'owner', 'tea-leaf', 'DAILY', '2026-10-22')`), /unique/i);
    await db.exec(`DELETE FROM "User" WHERE id = 'owner'`);
    for (const table of ["FairyCheckIn", "FairyKeepsakeGrant", "FairyClosenessAward", "GardenPetFood", "GardenPetOutfit"]) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
    }
  } finally { await db.close(); }
});

test("closeness routes", async (t) => {
  const db = fakeDatabase({ "owner-1": { timezone: "America/Vancouver", preferredLocale: "en" } });
  const restore = [];
  const stub = (target, method, implementation) => {
    const original = target[method];
    restore.push(() => { target[method] = original; });
    target[method] = implementation;
  };
  stub(prisma, "$transaction", async operation => operation(db));
  stub(prisma.user, "findUnique", async args => (args.where?.firebaseUid === "owner-uid" ? { id: "owner-1", firebaseUid: "owner-uid", timezone: "America/Vancouver" } : db.user.findUnique(args)));
  t.mock.timers.enable({ apis: ["Date"], now: at("2026-10-22") });
  setFirebaseTokenVerifierForTests(async () => ({ uid: "owner-uid", email: "owner@example.test", email_verified: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    delete process.env.FAIRY_CLOSENESS_OWNER_IDS;
    restore.forEach(fn => fn());
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const call = async (urlPath, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${urlPath}`, {
      method, headers: { Authorization: "Bearer owner-token", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };

  await t.test("off unless the owner is listed", async () => {
    for (const [route, method] of [["/api/fairy/closeness"], ["/api/fairy/check-ins"], ["/api/fairy/keepsakes"], ["/api/fairy/check-in", "POST"], ["/api/fairy/closeness/tap", "POST"], ["/api/fairy/pets"], ["/api/fairy/pets/puppy/feed", "POST"]]) {
      assert.equal((await call(route, method)).status, 404, route);
    }
    assert.equal(db.tables.fairyCheckIn.length, 0);
  });

  await t.test("check in, read the summary, calendar and book", async () => {
    process.env.FAIRY_CLOSENESS_OWNER_IDS = "*";
    const checkIn = await call("/api/fairy/check-in", "POST", {});
    assert.equal(checkIn.status, 200);
    assert.equal(checkIn.body.created, true);
    assert.equal(checkIn.body.locale, "en");
    assert.equal((await call("/api/fairy/check-in", "POST")).body.created, false, "no body is fine; a repeat is a no-op");
    assert.equal((await call("/api/fairy/check-in", "POST", { streak: 99 })).status, 400);
    const summary = await call("/api/fairy/closeness");
    assert.equal(summary.status, 200);
    assert.equal(summary.body.total, 10);
    assert.equal(summary.body.checkIn.checkedInToday, true);
    const month = await call("/api/fairy/check-ins?month=2026-10");
    assert.deepEqual(month.body.days.map(day => day.localDate), ["2026-10-22"]);
    assert.equal((await call("/api/fairy/check-ins?month=2026-13")).status, 400);
    assert.equal((await call("/api/fairy/check-ins?month=oct")).status, 400);
    const book = await call("/api/fairy/keepsakes");
    assert.equal(book.body.owned, 1);
    assert.deepEqual(plain((await call("/api/fairy/closeness/tap", "POST")).body), { awarded: 1, levelUp: null });
    assert.deepEqual(summary.body.bondRewards.accessories.map(band => [band.row, band.from, band.to, band.owned, band.total]),
      [["pendant", 4, 10, 0, 13], ["collar", 11, 15, 0, 9], ["hat", 16, 20, 0, 10]]);
    const pets = await call("/api/fairy/pets");
    assert.equal(pets.status, 200);
    assert.equal(pets.body.foods.reduce((sum, food) => sum + food.count, 0), 1, "today's check-in brought one food");
    const food = pets.body.foods.find(item => item.count === 1).id;
    assert.equal((await call("/api/fairy/pets/dragon/feed", "POST", { foodId: food })).status, 404);
    assert.equal((await call("/api/fairy/pets/puppy/feed", "POST", { foodId: "stone" })).status, 400);
    assert.equal((await call("/api/fairy/pets/puppy/feed", "POST", { foodId: food, extra: 1 })).status, 400);
    assert.deepEqual((await call("/api/fairy/pets/puppy/feed", "POST", { foodId: food })).body, { foodId: food, count: 0 });
    assert.equal((await call("/api/fairy/pets/puppy/feed", "POST", { foodId: food })).status, 409);
    assert.equal((await call("/api/fairy/pets/puppy/outfit", "PUT", { hat: "lilac-beret" })).status, 409, "still locked");
    assert.equal((await call("/api/fairy/pets/puppy/outfit", "PUT", { hat: 7 })).status, 400);
  });
});
