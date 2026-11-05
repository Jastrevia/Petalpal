// The Garden pets' wardrobe and food. Accessories are cut from the Accessory Design Collection
// sheets (light and Noble); ids are stable API keys the app maps to artwork in
// mobile/assets/garden/pets/accessories. Rules and routes: docs/product/FAIRY_CLOSENESS_API.md.
import { stableFraction } from "./fairy-runtime.js";

export const GARDEN_PETS = Object.freeze(["puppy", "hedgehog", "butterfly", "rabbit", "bluebird", "maltese"]);
// A pet that wears only its own pieces (its art is painted for them alone): the Maltese has a
// flower clip, a lilac capelet and a pink bow with charms, kept under these catalog ids.
export const PET_OWN_PIECES = Object.freeze({ maltese: Object.freeze({ hat: "flower-sprig", collar: "petal-capelet", pendant: "crystal-drop" }) });
export const ACCESSORY_ROWS = Object.freeze(["hat", "collar", "pendant"]);

const a = (id, row, collection, en, zh) => Object.freeze({ id, row, collection, name: { en, "zh-Hans": zh } });
// In the order of the sheets: row by row, left to right.
export const PET_ACCESSORIES = Object.freeze([
  a("lilac-beret", "hat", "light", "Lilac Beret", "紫藤贝雷帽"),
  a("straw-sun-hat", "hat", "light", "Straw Sun Hat", "草编遮阳帽"),
  a("sage-bonnet", "hat", "light", "Sage Bonnet", "鼠尾草小帽"),
  a("blossom-wreath", "hat", "light", "Blossom Wreath", "花环"),
  a("flower-sprig", "hat", "light", "Flower Sprig", "鬓边花枝"),
  a("starlit-plume-cap", "hat", "noble", "Starlit Plume Cap", "星羽军帽"),
  a("midnight-hood", "hat", "noble", "Midnight Hood", "午夜兜帽"),
  a("golden-circlet", "hat", "noble", "Golden Circlet", "金叶头环"),
  a("voyager-goggles", "hat", "noble", "Voyager Goggles", "旅人风镜帽"),
  a("laurel-crown", "hat", "noble", "Laurel Crown", "月桂冠"),
  a("petal-capelet", "collar", "light", "Petal Capelet", "花瓣小披肩"),
  a("lilac-cape", "collar", "light", "Lilac Cape", "紫藤披风"),
  a("bell-bow", "collar", "light", "Bell Bow", "铃铛蝴蝶结"),
  a("cream-ruffle", "collar", "light", "Cream Ruffle", "奶油荷叶领"),
  a("sage-capelet", "collar", "light", "Sage Capelet", "鼠尾草披肩"),
  a("star-capelet", "collar", "noble", "Star Capelet", "星辰小披肩"),
  a("midnight-cape", "collar", "noble", "Midnight Cape", "午夜披风"),
  a("gilded-wing-collar", "collar", "noble", "Gilded Wing Collar", "金翼领"),
  a("star-mantle", "collar", "noble", "Star Mantle", "星夜斗篷"),
  a("crystal-drop", "pendant", "light", "Crystal Drop", "水晶坠"),
  a("glow-lantern", "pendant", "light", "Glow Lantern", "暖光小灯笼"),
  a("lilac-clover", "pendant", "light", "Lilac Clover", "紫色四叶坠"),
  a("crescent-bloom", "pendant", "light", "Crescent Bloom", "花月弯钩"),
  a("little-spellbook", "pendant", "light", "Little Spellbook", "小魔法书"),
  a("sealed-letter", "pendant", "light", "Sealed Letter", "花封信笺"),
  a("compass-star", "pendant", "noble", "Compass Star", "罗盘星"),
  a("crescent-crystal", "pendant", "noble", "Crescent Crystal", "新月水晶"),
  a("gilded-tome", "pendant", "noble", "Gilded Tome", "鎏金书册"),
  a("noble-lantern", "pendant", "noble", "Noble Lantern", "贵族提灯"),
  a("hourglass", "pendant", "noble", "Hourglass", "沙漏"),
  a("crystal-spire", "pendant", "noble", "Crystal Spire", "水晶尖坠"),
  a("gilded-feather", "pendant", "noble", "Gilded Feather", "金羽坠")
]);
export const ACCESSORIES_BY_ID = new Map(PET_ACCESSORIES.map(item => [item.id, item]));

// Each level in a band opens that many pairs of its row, two pieces a pair, chosen at random
// within the row, until the row is empty. Hats first, then pendants, collars last: a cape is the
// biggest change to a pet, so it comes once the owner knows the wardrobe. The bands always empty
// their rows: 5 levels × exactly 2 = 10 hats, 7 × at least 2 ≥ 13 pendants, 5 × at least 2 ≥ 9 collars.
export const ACCESSORY_BANDS = Object.freeze([
  { row: "hat", from: 4, to: 8, minPairs: 1, maxPairs: 1 },
  { row: "pendant", from: 9, to: 15, minPairs: 1, maxPairs: 3 },
  { row: "collar", from: 16, to: 20, minPairs: 1, maxPairs: 2 }
]);
const PIECES_PER_PAIR = 2;

// Which accessories `level` has opened, id → the level that opened it. Worked out from the level
// alone, so nothing is stored: pieces never repeat, and an owner already at a high level has
// everything that level gives. Per owner and fixed: the order is the row sorted by a hash of
// owner and piece, the pairs per level a hash of owner and level.
export function unlockedAccessories(userId, level) {
  const unlocked = new Map();
  for (const band of ACCESSORY_BANDS) {
    const rank = id => stableFraction(`${userId}:${id}:accessory`);
    const order = PET_ACCESSORIES.filter(item => item.row === band.row).sort((x, y) => rank(x.id) - rank(y.id));
    let next = 0;
    for (let at = band.from; at <= Math.min(band.to, level) && next < order.length; at++) {
      const spread = band.maxPairs - band.minPairs + 1;
      const pairs = band.minPairs + Math.floor(stableFraction(`${userId}:${at}:accessory-pairs`) * spread) % spread;
      for (const item of order.slice(next, next + pairs * PIECES_PER_PAIR)) unlocked.set(item.id, at);
      next += pairs * PIECES_PER_PAIR;
    }
  }
  return unlocked;
}

export const PET_FOODS = Object.freeze([
  { id: "berry-tart", name: { en: "Berry Tart", "zh-Hans": "莓果挞" } },
  { id: "flower-cookies", name: { en: "Flower Cookies", "zh-Hans": "小花饼干" } },
  { id: "fish-biscuit", name: { en: "Fish Biscuit", "zh-Hans": "小鱼饼" } },
  { id: "honey-seeds", name: { en: "Honey Seeds", "zh-Hans": "蜂蜜谷粒" } }
]);
const FOOD_IDS = new Set(PET_FOODS.map(food => food.id));
export const isPetFood = id => FOOD_IDS.has(id);

export const CHECK_IN_FOODS = 1;
export const LEVEL_UP_FOODS = 5;
export const FIRST_WEEK_FOODS = 3; // on the first planting of each local day (21 at most)
export const FIRST_WEEK_DAYS = 7;

// Food is a ledger like closeness: one row per food given (+1) or eaten (−1). `awardKey` makes
// each gift count once, however often it is retried. Random but fixed by owner and key.
async function giveFoods(tx, { userId, reason, key, count, localDate }) {
  const data = Array.from({ length: count }, (_, i) => {
    const awardKey = `${key}:${i}`;
    const pick = Math.floor(stableFraction(`${userId}:${awardKey}:food`) * PET_FOODS.length) % PET_FOODS.length;
    return { userId, foodId: PET_FOODS[pick].id, delta: 1, reason, awardKey, localDate };
  });
  const repeated = await tx.gardenPetFood.findMany({ where: { userId, awardKey: { in: data.map(row => row.awardKey) } }, select: { awardKey: true } });
  const seen = new Set(repeated.map(row => row.awardKey));
  const fresh = data.filter(row => !seen.has(row.awardKey));
  if (fresh.length) await tx.gardenPetFood.createMany({ data: fresh, skipDuplicates: true });
  return fresh.map(row => row.foodId);
}

export const giveCheckInFood = (tx, { userId, localDate }) =>
  giveFoods(tx, { userId, reason: "CHECK_IN", key: `CHECK_IN:${localDate}`, count: CHECK_IN_FOODS, localDate });

// Five foods per level reached. Given when the owner next looks (levels rise from many places),
// so an owner who was already at a level before pets existed gets those levels' food once too.
export async function syncLevelFoods(tx, { userId, level, localDate }) {
  const given = await tx.gardenPetFood.count({ where: { userId, reason: "LEVEL" } });
  if (given >= (level - 1) * LEVEL_UP_FOODS) return;
  for (let reached = 2; reached <= level; reached++) {
    await giveFoods(tx, { userId, reason: "LEVEL", key: `LEVEL:${reached}`, count: LEVEL_UP_FOODS, localDate });
  }
}

// `firstWeekDay`: today's place in the account's first local days, 0 on the day it was created.
export function giveFirstWeekFood(tx, { userId, localDate, firstWeekDay }) {
  if (firstWeekDay < 0 || firstWeekDay >= FIRST_WEEK_DAYS) return [];
  return giveFoods(tx, { userId, reason: "FIRST_WEEK", key: `FIRST_WEEK:${localDate}`, count: FIRST_WEEK_FOODS, localDate });
}

export async function foodStock(tx, userId) {
  const rows = await tx.gardenPetFood.findMany({ where: { userId }, select: { foodId: true, delta: true } });
  const stock = new Map(PET_FOODS.map(food => [food.id, 0]));
  for (const row of rows) if (stock.has(row.foodId)) stock.set(row.foodId, stock.get(row.foodId) + row.delta);
  return stock;
}

// One food eaten. Returns the count left, or null when there is none to give.
export async function eatFood(tx, { userId, petId, foodId, localDate, key }) {
  const stock = await foodStock(tx, userId);
  if (!(stock.get(foodId) > 0)) return null;
  await tx.gardenPetFood.create({ data: { userId, foodId, delta: -1, reason: "FEED", awardKey: `FEED:${petId}:${key}`, localDate } });
  return stock.get(foodId) - 1;
}

const NO_OUTFIT = Object.freeze({ hat: null, collar: null, pendant: null });

// What a pet is wearing, leaving out anything no longer in the catalog or not yet opened.
const wornOf = (row, unlocked) => Object.fromEntries(ACCESSORY_ROWS.map(slot => {
  const id = row?.[slot];
  return [slot, id && unlocked.has(id) && ACCESSORIES_BY_ID.get(id)?.row === slot ? id : null];
}));

export async function petsSummary(tx, { userId, level, locale }) {
  const unlocked = unlockedAccessories(userId, level);
  const stock = await foodStock(tx, userId);
  const rows = await tx.gardenPetOutfit.findMany({ where: { userId } });
  return {
    locale, level,
    accessories: PET_ACCESSORIES.map(item => ({
      id: item.id, row: item.row, collection: item.collection, name: item.name[locale],
      unlocked: unlocked.has(item.id), unlockedAtLevel: unlocked.get(item.id) ?? null
    })),
    outfits: Object.fromEntries(GARDEN_PETS.map(petId => [petId, wornOf(rows.find(row => row.petId === petId), unlocked)])),
    foods: PET_FOODS.map(food => ({ id: food.id, name: food.name[locale], count: stock.get(food.id) }))
  };
}

// Sets a pet's outfit. `outfit` is checked by the caller's shape check; a piece that is not
// opened, or in the wrong row, answers an error name instead of saving.
export async function setPetOutfit(tx, { userId, petId, outfit, level }) {
  const unlocked = unlockedAccessories(userId, level);
  for (const slot of ACCESSORY_ROWS) {
    const id = outfit[slot];
    if (id === null || id === undefined) continue;
    if (ACCESSORIES_BY_ID.get(id)?.row !== slot) return { error: "UNKNOWN_ACCESSORY" };
    if (PET_OWN_PIECES[petId] && PET_OWN_PIECES[petId][slot] !== id) return { error: "UNKNOWN_ACCESSORY" };
    if (!unlocked.has(id)) return { error: "ACCESSORY_LOCKED" };
  }
  const data = { ...NO_OUTFIT, ...outfit };
  await tx.gardenPetOutfit.upsert({ where: { userId_petId: { userId, petId } }, create: { userId, petId, ...data }, update: data });
  return { outfit: data };
}

// Owned / total per reward band, for the levels list on Our Bond.
export const accessoryBandProgress = (userId, level) => {
  const unlocked = unlockedAccessories(userId, level);
  return ACCESSORY_BANDS.map(band => {
    const row = PET_ACCESSORIES.filter(item => item.row === band.row);
    return { row: band.row, from: band.from, to: band.to, owned: row.filter(item => unlocked.has(item.id)).length, total: row.length };
  });
};
