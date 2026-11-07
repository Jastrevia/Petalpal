// The Garden pets' wardrobe and food. Accessories are cut from the Accessory Design Collection
// sheets (light and Noble); ids are stable API keys the app maps to artwork in
// mobile/assets/garden/pets/accessories. Rules and routes: docs/product/FAIRY_CLOSENESS_API.md.
import { stableFraction } from "./fairy-runtime.js";

export const GARDEN_PETS = Object.freeze(["puppy", "hedgehog", "butterfly", "rabbit", "bluebird", "maltese"]);
// A pet that wears only its own pieces (its art is painted for them alone), kept under these
// catalog ids, per slot its light set's then its Noble set's: the Maltese has a flower clip, a
// lilac capelet and a pink bow with charms, and the Noble headpiece, violet capelet and crystal clasp.
// The puppy and Xiaobai are the only pets that dress (owner, 2026-11-06): two pieces per slot each,
// one per painted set (the puppy's set 2 and set 1, Xiaobai's light set and Noble set).
export const PET_OWN_PIECES = Object.freeze({
  puppy: Object.freeze({
    hat: Object.freeze(["flower-sprig", "golden-circlet"]),
    collar: Object.freeze(["petal-capelet", "midnight-cape"]),
    pendant: Object.freeze(["crystal-drop", "crystal-spire"])
  }),
  maltese: Object.freeze({
    hat: Object.freeze(["flower-sprig", "golden-circlet"]),
    collar: Object.freeze(["petal-capelet", "midnight-cape"]),
    pendant: Object.freeze(["crystal-drop", "crystal-spire"])
  })
});
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

// The pieces a Fairy Bond level opens (owner, 2026-11-06): only the golden puppy and Xiaobai dress,
// each in its own six pieces (PET_OWN_PIECES), twelve in all, each pet's unlocked on its own. From
// Lv 4 on, every level opens exactly one piece not opened yet, drawn at random from all twelve, so
// none repeats and the last one opens at Lv 15 (every piece by Lv 16 at the latest). A cape is the
// biggest change to a pet, so it is the rarest draw; necklaces the commonest: with every piece still
// there the first draw is a hat 40%, a necklace 50%, a cape 10%, and later draws weigh what is left
// the same way. Fixed per owner and worked out from the level alone: nothing is stored or migrated,
// and a level never changes what it gave.
export const DRESS_FROM_LEVEL = 4;
export const DRESS_WEIGHTS = Object.freeze({ hat: 4, pendant: 5, collar: 1 });
export const DRESS_PIECES = Object.freeze(Object.entries(PET_OWN_PIECES).flatMap(([petId, slots]) =>
  ACCESSORY_ROWS.flatMap(row => slots[row].map(id => Object.freeze({ petId, id, row, key: `${petId}:${id}` })))));
export const DRESS_ALL_BY_LEVEL = DRESS_FROM_LEVEL + DRESS_PIECES.length - 1;

// Which pieces `level` has opened: "petId:accessoryId" → the level that opened it.
export function unlockedPetPieces(userId, level) {
  const opened = new Map();
  let left = [...DRESS_PIECES];
  for (let at = DRESS_FROM_LEVEL; at <= level && left.length; at++) {
    const total = left.reduce((sum, piece) => sum + DRESS_WEIGHTS[piece.row], 0);
    let roll = stableFraction(`${userId}:${at}:dress`) * total;
    const index = left.findIndex(piece => (roll -= DRESS_WEIGHTS[piece.row]) < 0);
    const piece = left[index === -1 ? left.length - 1 : index];
    opened.set(piece.key, at);
    left = left.filter(item => item !== piece);
  }
  return opened;
}
// One pet's opened pieces: accessory id → level.
export const petUnlocks = (opened, petId) => new Map([...opened].filter(([key]) => key.startsWith(`${petId}:`)).map(([key, at]) => [key.slice(petId.length + 1), at]));

// Per slot, how many of its pieces (both pets') are open, for the Our Bond rewards list.
export const ACCESSORY_BANDS = Object.freeze(["hat", "pendant", "collar"].map(row => Object.freeze({ row, from: DRESS_FROM_LEVEL, to: DRESS_ALL_BY_LEVEL })));

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
  const opened = unlockedPetPieces(userId, level);
  const anyPet = new Map();
  for (const [key, at] of opened) { const id = key.split(":")[1]; if (!anyPet.has(id) || at < anyPet.get(id)) anyPet.set(id, at); }
  const stock = await foodStock(tx, userId);
  const rows = await tx.gardenPetOutfit.findMany({ where: { userId } });
  return {
    locale, level,
    // `unlocked` here: opened for either pet (an older app); `petPieces` says for which.
    accessories: PET_ACCESSORIES.map(item => ({
      id: item.id, row: item.row, collection: item.collection, name: item.name[locale],
      unlocked: anyPet.has(item.id), unlockedAtLevel: anyPet.get(item.id) ?? null
    })),
    petPieces: Object.fromEntries(Object.keys(PET_OWN_PIECES).map(petId => {
      const mine = petUnlocks(opened, petId);
      return [petId, Object.fromEntries(Object.values(PET_OWN_PIECES[petId]).flat().map(id => [id, mine.get(id) ?? null]))];
    })),
    outfits: Object.fromEntries(GARDEN_PETS.map(petId => [petId, wornOf(rows.find(row => row.petId === petId), petUnlocks(opened, petId))])),
    foods: PET_FOODS.map(food => ({ id: food.id, name: food.name[locale], count: stock.get(food.id) }))
  };
}

// Sets a pet's outfit. `outfit` is checked by the caller's shape check; a piece that is not
// opened, or in the wrong row, answers an error name instead of saving.
export async function setPetOutfit(tx, { userId, petId, outfit, level }) {
  const unlocked = petUnlocks(unlockedPetPieces(userId, level), petId);
  for (const slot of ACCESSORY_ROWS) {
    const id = outfit[slot];
    if (id === null || id === undefined) continue;
    if (ACCESSORIES_BY_ID.get(id)?.row !== slot) return { error: "UNKNOWN_ACCESSORY" };
    // Only the puppy and Xiaobai dress, each in its own pieces; any other pet can only take things off.
    if (!PET_OWN_PIECES[petId]?.[slot].includes(id)) return { error: "UNKNOWN_ACCESSORY" };
    if (!unlocked.has(id)) return { error: "ACCESSORY_LOCKED" };
  }
  const data = { ...NO_OUTFIT, ...outfit };
  await tx.gardenPetOutfit.upsert({ where: { userId_petId: { userId, petId } }, create: { userId, petId, ...data }, update: data });
  return { outfit: data };
}

// Owned / total per reward band, for the levels list on Our Bond.
export const accessoryBandProgress = (userId, level) => {
  const opened = unlockedPetPieces(userId, level);
  return ACCESSORY_BANDS.map(band => {
    const row = DRESS_PIECES.filter(piece => piece.row === band.row);
    return { row: band.row, from: band.from, to: band.to, owned: row.filter(piece => opened.has(piece.key)).length, total: row.length };
  });
};
