// Closeness with PPL (亲密度), the daily calendar check-in and her keepsakes (信物).
//
// Days are the account's local days (User.timezone, see time.md). Every write runs in one
// transaction under a per-owner advisory lock, so the daily caps and the once-a-day
// check-in hold under concurrent requests. The level is derived from the award ledger.
import { addLocalDays, localDateForInstant, normalizeIanaTimezone } from "./ai-periods.js";
import { stableFraction } from "./fairy-runtime.js";
import { weeklyReportLocale } from "./report-locale.js";
import { FAIRY_KEEPSAKES, KEEPSAKES_BY_ID, keepsakesOf, monthlyKeepsake } from "./fairy-keepsakes.js";
import {
  CHECK_IN_FOODS, LEVEL_UP_FOODS, accessoryBandProgress, eatFood, giveCheckInFood, giveFirstWeekFood, petsSummary, renamePet, setPetOutfit, syncLevelFoods
} from "./garden-pets.js";

// Points per award and how many awards of each source count per local day.
export const CLOSENESS_SOURCES = Object.freeze({
  CHECK_IN: { points: 10, dailyCap: 1 },
  STREAK_7: { points: 20, dailyCap: 1 },
  EVENT: { points: 5, dailyCap: 3 },
  MOMENT_LIKE: { points: 2, dailyCap: 3 },
  FAIRY_TAP: { points: 1, dailyCap: 5 },
  WEEKLY_READ: { points: 15, dailyCap: 1 }
});

export const MAX_LEVEL = 20;
// Points needed to go from `level` to `level + 1`: 35, 50, 65 … 305 (3,230 in total).
export const pointsToNextLevel = level => 20 + 15 * level;

// Titles as in the closeness design (亲密度等级 screen).
const TITLES = [
  { from: 1, en: "First Encounter", "zh-Hans": "初次相遇" },
  { from: 3, en: "Getting Familiar", "zh-Hans": "渐渐熟悉" },
  { from: 5, en: "Garden Friend", "zh-Hans": "花园好友" },
  { from: 8, en: "Trusted Companion", "zh-Hans": "心事伙伴" },
  { from: 12, en: "Kindred Spirit", "zh-Hans": "知心花友" },
  { from: 16, en: "In Perfect Harmony", "zh-Hans": "默契知己" },
  { from: 20, en: "Eternal Bloom", "zh-Hans": "一生花伴" }
];
const tierIndex = level => TITLES.findLastIndex(title => level >= title.from);
const titleFor = level => TITLES[tierIndex(level)];

// What PPL says on the closeness page, two lines per title tier, one picked per local day.
const GREETINGS = [
  [["You're here. This is our little garden. Take your time.", "你来啦。这里是我们的小花园，慢慢来就好。"],
    ["Tell me about today, whenever you're ready.", "今天发生了什么，想说的时候再告诉我。"]],
  [["I'm starting to remember the things you tell me.", "我开始记得你说过的话了。"],
    ["When you're away, I check on the flowers for you.", "你不在的时候，我会替你看看花。"]],
  [["Thank you for leaving your thoughts here, the happy ones and the heavy ones.", "谢谢你愿意在这里留下你的想法，无论是开心的，还是有些难过的。"],
    ["The garden feels a little brighter with you around.", "有你在，花园好像更亮了一点。"]],
  [["I'm keeping every one of your worries safe.", "你的心事，我都好好收着呢。"],
    ["Come sit for a while when you're tired. We don't have to talk.", "累了就来坐一会儿，不说话也可以。"]],
  [["Walking through these days with you is my favourite thing.", "能和你一起走过这些日子，是我最喜欢的事。"],
    ["I think I understand you a little better than before.", "我好像比以前更懂你一点了。"]],
  [["You don't have to say it. I can tell how today went.", "不用说，我也知道你今天过得怎么样。"],
    ["The flowers we planted together have filled a whole field.", "我们一起种下的花，已经开满一整片了。"]],
  [["Thank you for always coming back to me.", "谢谢你，一直回来看我。"],
    ["However far you go, a flower here is always blooming for you.", "无论你走多远，这里永远有一朵花为你开着。"]]
];
export function closenessGreeting(userId, localDate, level, locale) {
  const lines = GREETINGS[tierIndex(level)];
  const line = lines[Math.floor(stableFraction(`${userId}:${localDate}:greeting`) * lines.length) % lines.length];
  return line[locale === "zh-Hans" ? 1 : 0];
}

// The old perk list, kept in the summary for app builds that still read it. Newer builds show
// the bond rewards instead (`bondRewards`): Fairy Moments at Lv 3, then the pets' accessories.
export const MOMENTS_LEVEL = 3;
export const CLOSENESS_UNLOCKS = Object.freeze([
  { level: 3, key: "MOMENTS_FOR_YOU", status: "coming_soon" },
  { level: 5, key: "MORE_RARE_KEEPSAKES", status: "live" },
  { level: 8, key: "MAILBOX_LETTERS", status: "coming_soon" },
  { level: 12, key: "AVATAR_FRAME", status: "live" },
  { level: 16, key: "EASIER_MONTHLY_KEEPSAKE", status: "live" },
  { level: 20, key: "ETERNAL_LETTER", status: "coming_soon" }
]);

export const STREAK_REWARD_EVERY = 7;
export const GRACE_WINDOW_DAYS = 7; // one bridged missed day per 7 local days
export const monthlyDaysNeeded = level => (level >= 16 ? 16 : 20);
const rareChance = level => (level >= 5 ? 0.1 : 0.05);
const UNOWNED_PREFERENCE = 0.7;

const MAX_OWNERS = 100;
// FAIRY_CLOSENESS_OWNER_IDS: comma-separated User ids, or "*" alone for every signed-in
// owner. Spaces and line breaks around them are ignored. Unset, empty or malformed: nobody.
export function fairyClosenessEnabledFor(userId, env = process.env) {
  const raw = typeof env.FAIRY_CLOSENESS_OWNER_IDS === "string" ? env.FAIRY_CLOSENESS_OWNER_IDS.trim() : "";
  if (!raw || typeof userId !== "string" || !userId) return false;
  if (raw === "*") return true;
  const ids = raw.split(",").map(id => id.trim());
  if (ids.length > MAX_OWNERS || ids.some(id => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return false;
  return ids.includes(userId);
}

export function closenessLocale(preferredLocale) {
  try { return weeklyReportLocale(preferredLocale); } catch { return "en"; }
}

export function closenessLevel(total, locale = "en") {
  let level = 1, into = Math.max(0, Math.floor(total) || 0);
  while (level < MAX_LEVEL && into >= pointsToNextLevel(level)) { into -= pointsToNextLevel(level); level += 1; }
  const maxed = level === MAX_LEVEL;
  const nextTitle = maxed ? null : TITLES.find(title => title.from > level);
  return {
    level, title: titleFor(level)[locale], total: Math.max(0, Math.floor(total) || 0),
    pointsIntoLevel: maxed ? 0 : into, pointsForNextLevel: maxed ? null : pointsToNextLevel(level),
    nextTitle: nextTitle ? { level: nextTitle.from, title: nextTitle[locale] } : null, maxed
  };
}

const dayNumber = localDate => Date.UTC(+localDate.slice(0, 4), +localDate.slice(5, 7) - 1, +localDate.slice(8, 10)) / 86_400_000;
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

// The streak a check-in on `today` continues. `last` is the newest earlier check-in;
// `graceUsedSince` says whether a missed day was already bridged in the grace window.
export function nextStreak({ today, last, graceUsedSince }) {
  if (!last) return { streak: 1, graceUsed: false };
  const gap = daysBetween(last.localDate, today);
  if (gap === 1) return { streak: last.streak + 1, graceUsed: false };
  if (gap === 2 && !graceUsedSince) return { streak: last.streak + 1, graceUsed: true };
  return { streak: 1, graceUsed: false };
}

function pick(pool, owned, seed) {
  const unowned = pool.filter(keepsake => !owned.has(keepsake.id));
  const from = unowned.length && stableFraction(`${seed}:prefer`) < UNOWNED_PREFERENCE ? unowned : pool;
  return from[Math.floor(stableFraction(seed) * from.length) % from.length];
}

// Today's keepsakes for a check-in: the daily one (sometimes rare), a rare one every 7th
// streak day, and the month's brooch on the day the month's check-ins reach the threshold.
// Deterministic per owner and day.
export function planKeepsakes({ userId, today, level, streak, monthCheckIns, owned, monthlyGrantedThisMonth }) {
  const seed = `${userId}:${today}`;
  const plan = [];
  const rare = stableFraction(`${seed}:rare`) < rareChance(level);
  const daily = pick(keepsakesOf(rare ? "RARE" : "COMMON"), owned, `${seed}:daily`);
  plan.push({ keepsakeId: daily.id, reason: "DAILY" });
  if (streak % STREAK_REWARD_EVERY === 0) {
    const pool = keepsakesOf("RARE").filter(keepsake => keepsake.id !== daily.id);
    plan.push({ keepsakeId: pick(pool, owned, `${seed}:streak`).id, reason: "STREAK_7" });
  }
  const brooch = monthlyKeepsake(Number(today.slice(5, 7)));
  if (brooch && !monthlyGrantedThisMonth && monthCheckIns >= monthlyDaysNeeded(level)) {
    plan.push({ keepsakeId: brooch.id, reason: "MONTHLY" });
  }
  return plan;
}

// Ids no longer in the catalog (renamed or retired artwork) are left out of every list.
const known = keepsakeId => KEEPSAKES_BY_ID.has(keepsakeId);

export function presentKeepsake(keepsakeId, locale, { withNote = true } = {}) {
  const keepsake = KEEPSAKES_BY_ID.get(keepsakeId);
  if (!keepsake) return null;
  return {
    id: keepsake.id, rarity: keepsake.rarity, name: keepsake.name[locale],
    ...(withNote ? { note: keepsake.note[locale] } : {}), ...(keepsake.month ? { month: keepsake.month } : {})
  };
}

async function lockOwner(tx, userId) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`fairy-closeness:${userId}`}))::text AS "locked"`;
}

async function ownerClock(tx, userId, now) {
  const owner = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true, preferredLocale: true } });
  if (!owner) return null;
  const timezone = normalizeIanaTimezone(owner.timezone) || "UTC";
  return { timezone, today: localDateForInstant(now, timezone), locale: closenessLocale(owner.preferredLocale) };
}

async function totalPoints(tx, userId) {
  const sum = await tx.fairyClosenessAward.aggregate({ where: { userId }, _sum: { points: true } });
  return sum._sum.points || 0;
}

// Adds one award if the source still has room today; idempotent per (source, key).
// Returns the points added (0 when capped or repeated).
async function addAward(tx, { userId, source, key, today }) {
  const rule = CLOSENESS_SOURCES[source];
  const used = await tx.fairyClosenessAward.count({ where: { userId, source, localDate: today } });
  if (used >= rule.dailyCap) return 0;
  const repeated = await tx.fairyClosenessAward.findUnique({
    where: { userId_source_awardKey: { userId, source, awardKey: key } }, select: { id: true }
  });
  if (repeated) return 0;
  await tx.fairyClosenessAward.create({ data: { userId, source, awardKey: key, localDate: today, points: rule.points } });
  return rule.points;
}

function levelChange(before, after, locale) {
  const from = closenessLevel(before, locale), to = closenessLevel(after, locale);
  return to.level > from.level ? { level: to.level, title: to.title } : null;
}

// Awards closeness for something the owner did (EVENT, MOMENT_LIKE, FAIRY_TAP,
// WEEKLY_READ). `key` identifies the thing (event id, moment id …) so repeats count once.
export async function awardCloseness(prisma, { userId, source, key, now = new Date() }) {
  if (!CLOSENESS_SOURCES[source] || source === "CHECK_IN" || source === "STREAK_7") throw new TypeError("Unsupported closeness source");
  if (typeof key !== "string" || !key || key.length > 96) throw new TypeError("A closeness award key is required");
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return { awarded: 0, levelUp: null };
    const before = await totalPoints(tx, userId);
    const awarded = await addAward(tx, { userId, source, key, today: clock.today });
    return { awarded, levelUp: levelChange(before, before + awarded, clock.locale) };
  });
}

// FAIRY_TAP has no natural id, so each tap of the day takes the next numbered key.
export async function awardFairyTap(prisma, { userId, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return { awarded: 0, levelUp: null };
    const used = await tx.fairyClosenessAward.count({ where: { userId, source: "FAIRY_TAP", localDate: clock.today } });
    const before = await totalPoints(tx, userId);
    const awarded = await addAward(tx, { userId, source: "FAIRY_TAP", key: `${clock.today}:${used + 1}`, today: clock.today });
    return { awarded, levelUp: levelChange(before, before + awarded, clock.locale) };
  });
}

// The calendar check-in. Once per local day; a repeat returns today's result unchanged.
export async function checkInWithFairy(prisma, { userId, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    const { today, timezone, locale } = clock;
    const existing = await tx.fairyCheckIn.findUnique({ where: { userId_localDate: { userId, localDate: today } } });
    if (existing) {
      const grants = await tx.fairyKeepsakeGrant.findMany({ where: { userId, localDate: today }, orderBy: { createdAt: "asc" } });
      return {
        created: false, checkIn: { localDate: today, streak: existing.streak, graceUsed: existing.graceUsed },
        keepsakes: grants.filter(grant => known(grant.keepsakeId))
          .map(grant => ({ ...presentKeepsake(grant.keepsakeId, locale), reason: grant.reason, firstTime: false })),
        awarded: 0, levelUp: null, locale
      };
    }
    const last = await tx.fairyCheckIn.findFirst({ where: { userId, localDate: { lt: today } }, orderBy: { localDate: "desc" } });
    const graceUsedSince = await tx.fairyCheckIn.count({
      where: { userId, graceUsed: true, localDate: { gt: addLocalDays(today, -GRACE_WINDOW_DAYS) } }
    });
    const { streak, graceUsed } = nextStreak({ today, last, graceUsedSince: graceUsedSince > 0 });
    const before = await totalPoints(tx, userId);
    const grants = await tx.fairyKeepsakeGrant.findMany({ where: { userId }, select: { keepsakeId: true, reason: true, localDate: true } });
    const owned = new Set(grants.map(grant => grant.keepsakeId));
    const month = today.slice(0, 7);
    const monthCheckIns = 1 + await tx.fairyCheckIn.count({ where: { userId, localDate: { startsWith: month } } });
    const plan = planKeepsakes({
      userId, today, level: closenessLevel(before).level, streak, monthCheckIns, owned,
      monthlyGrantedThisMonth: grants.some(grant => grant.reason === "MONTHLY" && grant.localDate.startsWith(month))
    });
    const checkIn = await tx.fairyCheckIn.create({ data: { userId, localDate: today, timezone, streak, graceUsed } });
    await tx.fairyKeepsakeGrant.createMany({
      data: plan.map(item => ({ userId, checkInId: checkIn.id, keepsakeId: item.keepsakeId, reason: item.reason, localDate: today }))
    });
    await giveCheckInFood(tx, { userId, localDate: today });
    let awarded = await addAward(tx, { userId, source: "CHECK_IN", key: today, today });
    if (streak % STREAK_REWARD_EVERY === 0) awarded += await addAward(tx, { userId, source: "STREAK_7", key: today, today });
    const keepsakes = plan.map(item => ({ ...presentKeepsake(item.keepsakeId, locale), reason: item.reason, firstTime: !owned.has(item.keepsakeId) }));
    return {
      created: true, checkIn: { localDate: today, streak, graceUsed }, keepsakes,
      awarded, levelUp: levelChange(before, before + awarded, locale), locale
    };
  });
}

// Whether the streak still counts today: checked in today or yesterday, or two days ago
// with the weekly grace still free.
function liveStreak(today, last, graceUsedSince) {
  if (!last) return 0;
  const gap = daysBetween(last.localDate, today);
  if (gap <= 1) return last.streak;
  return gap === 2 && !graceUsedSince ? last.streak : 0;
}

// Everything the closeness page and the calendar check-in card show.
export async function closenessSummary(prisma, { userId, now = new Date() }) {
  return prisma.$transaction(async tx => {
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    const { today, locale } = clock;
    const total = await totalPoints(tx, userId);
    const level = closenessLevel(total, locale);
    const todays = await tx.fairyClosenessAward.findMany({ where: { userId, localDate: today }, select: { source: true, points: true } });
    const last = await tx.fairyCheckIn.findFirst({ where: { userId, localDate: { lte: today } }, orderBy: { localDate: "desc" } });
    const graceUsedSince = await tx.fairyCheckIn.count({
      where: { userId, graceUsed: true, localDate: { gt: addLocalDays(today, -GRACE_WINDOW_DAYS) } }
    });
    const checkedInToday = last?.localDate === today;
    const streak = liveStreak(today, last, graceUsedSince > 0);
    const month = today.slice(0, 7);
    const monthCheckIns = await tx.fairyCheckIn.count({ where: { userId, localDate: { startsWith: month } } });
    const grants = (await tx.fairyKeepsakeGrant.findMany({ where: { userId }, select: { keepsakeId: true, reason: true, localDate: true } }))
      .filter(grant => known(grant.keepsakeId));
    const brooch = monthlyKeepsake(Number(today.slice(5, 7)));
    // Days since she joined the owner's Garden, counting the first day (陪伴天数).
    const fairy = await tx.userFairy.findFirst({ where: { userId, isActive: true }, select: { unlockedAt: true } });
    const metOn = fairy?.unlockedAt ? localDateForInstant(fairy.unlockedAt, clock.timezone) : null;
    return {
      locale, localDate: today, ...level,
      greeting: closenessGreeting(userId, today, level.level, locale),
      daysTogether: metOn ? Math.max(1, daysBetween(metOn, today) + 1) : null,
      today: Object.entries(CLOSENESS_SOURCES).map(([source, rule]) => {
        const rows = todays.filter(row => row.source === source);
        return { source, count: rows.length, dailyCap: rule.dailyCap, points: rows.reduce((sum, row) => sum + row.points, 0), pointsEach: rule.points };
      }),
      checkIn: {
        checkedInToday, streak,
        // Where the streak is in its 7-day round (1–7; 0 with no streak): 本周签到 n / 7.
        cycleDay: streak ? ((streak - 1) % STREAK_REWARD_EVERY) + 1 : 0,
        graceAvailable: graceUsedSince === 0,
        // Check-ins still to go (today's included when not done yet) until the 7th-day rare keepsake.
        checkInsToStreakReward: STREAK_REWARD_EVERY - (streak % STREAK_REWARD_EVERY)
      },
      monthly: brooch ? {
        month, checkIns: monthCheckIns, needed: monthlyDaysNeeded(level.level),
        keepsake: presentKeepsake(brooch.id, locale, { withNote: false }),
        earned: grants.some(grant => grant.reason === "MONTHLY" && grant.localDate.startsWith(month))
      } : null,
      // owned: different keepsakes collected; received: every keepsake ever given (信物数量).
      collection: { owned: new Set(grants.map(grant => grant.keepsakeId)).size, received: grants.length, total: FAIRY_KEEPSAKES.length },
      unlocks: CLOSENESS_UNLOCKS.map(unlock => ({ ...unlock, unlocked: level.level >= unlock.level })),
      bondRewards: { momentsLevel: MOMENTS_LEVEL, levelUpFoods: LEVEL_UP_FOODS, checkInFoods: CHECK_IN_FOODS, accessories: accessoryBandProgress(userId, level.level) }
    };
  });
}

// Calendar marks for one local month: the days checked in, their keepsakes and the points
// the check-in gave (the day's detail list in the calendar).
export async function listCheckIns(prisma, { userId, month, now = new Date() }) {
  return prisma.$transaction(async tx => {
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    const target = month || clock.today.slice(0, 7);
    const rows = await tx.fairyCheckIn.findMany({
      where: { userId, localDate: { startsWith: target } }, orderBy: { localDate: "asc" },
      select: { localDate: true, streak: true, graceUsed: true }
    });
    const grants = await tx.fairyKeepsakeGrant.findMany({
      where: { userId, localDate: { startsWith: target } }, select: { localDate: true, keepsakeId: true, reason: true }
    });
    const awards = await tx.fairyClosenessAward.findMany({
      where: { userId, localDate: { startsWith: target }, source: { in: ["CHECK_IN", "STREAK_7"] } }, select: { localDate: true, points: true }
    });
    return {
      locale: clock.locale, month: target, today: clock.today,
      days: rows.map(row => ({
        localDate: row.localDate, streak: row.streak, graceUsed: row.graceUsed,
        points: awards.filter(award => award.localDate === row.localDate).reduce((sum, award) => sum + award.points, 0),
        keepsakes: grants.filter(grant => grant.localDate === row.localDate && known(grant.keepsakeId))
          .map(grant => ({ ...presentKeepsake(grant.keepsakeId, clock.locale, { withNote: false }), reason: grant.reason }))
      }))
    };
  });
}

// The keepsake book: every keepsake, owned or not. Her note shows only once owned.
export async function listKeepsakes(prisma, { userId, now = new Date() }) {
  return prisma.$transaction(async tx => {
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    const grants = (await tx.fairyKeepsakeGrant.findMany({
      where: { userId }, orderBy: { localDate: "asc" }, select: { keepsakeId: true, localDate: true }
    })).filter(grant => known(grant.keepsakeId));
    const byId = new Map();
    for (const grant of grants) {
      const entry = byId.get(grant.keepsakeId) || { count: 0, firstLocalDate: grant.localDate };
      entry.count += 1;
      byId.set(grant.keepsakeId, entry);
    }
    return {
      locale: clock.locale,
      owned: byId.size, received: grants.length, total: FAIRY_KEEPSAKES.length,
      keepsakes: FAIRY_KEEPSAKES.map(keepsake => {
        const entry = byId.get(keepsake.id);
        return {
          ...presentKeepsake(keepsake.id, clock.locale, { withNote: Boolean(entry) }),
          owned: Boolean(entry), count: entry?.count || 0, firstLocalDate: entry?.firstLocalDate || null
        };
      })
    };
  });
}

// Fairy Moments open at Lv 3. Owners whose feed has posts already (it opened on their first
// flower, before this rule) keep it. While locked she posts nothing, so no captions are paid for.
// Owners outside the closeness switch have no level and keep the old rule.
export async function fairyMomentsLockedByBond(prisma, { userId, env = process.env }) {
  if (!fairyClosenessEnabledFor(userId, env)) return false;
  if (closenessLevel(await totalPoints(prisma, userId)).level >= MOMENTS_LEVEL) return false;
  return !await prisma.fairyMoment.findFirst({ where: { userId }, select: { id: true } });
}

// The Garden pets: outfits, opened accessories and food (lib/garden-pets.js). Any food owed for
// levels reached is given first, under the owner's lock.
export async function gardenPets(prisma, { userId, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    const { level } = closenessLevel(await totalPoints(tx, userId));
    await syncLevelFoods(tx, { userId, level, localDate: clock.today });
    return petsSummary(tx, { userId, level, locale: clock.locale });
  });
}

export async function dressGardenPet(prisma, { userId, petId, outfit, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    return setPetOutfit(tx, { userId, petId, outfit, level: closenessLevel(await totalPoints(tx, userId)).level });
  });
}

export async function renameGardenPet(prisma, { userId, petId, name, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    return renamePet(tx, { userId, petId, name, now });
  });
}

export async function feedGardenPet(prisma, { userId, petId, foodId, key, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const clock = await ownerClock(tx, userId, now);
    if (!clock) return null;
    await syncLevelFoods(tx, { userId, level: closenessLevel(await totalPoints(tx, userId)).level, localDate: clock.today });
    const count = await eatFood(tx, { userId, petId, foodId, localDate: clock.today, key });
    return count === null ? { error: "NO_FOOD" } : { foodId, count };
  });
}

// A flower was planted: in the account's first seven local days, the day's first planting brings
// three foods. Later plantings that day find the same keys and give nothing.
export async function rewardFirstWeekPlanting(prisma, { userId, now = new Date() }) {
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const owner = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true, createdAt: true } });
    if (!owner?.createdAt) return [];
    const timezone = normalizeIanaTimezone(owner.timezone) || "UTC";
    const today = localDateForInstant(now, timezone);
    const firstWeekDay = daysBetween(localDateForInstant(owner.createdAt, timezone), today);
    return giveFirstWeekFood(tx, { userId, localDate: today, firstWeekDay });
  });
}
