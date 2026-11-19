// Monthly flower deity (time.md): each account-local calendar month one flower deity visits the
// Garden. The month is the owner's local month (User.timezone), so the deity changes at local midnight
// on the 1st. The Monthly report of that month (periodKey YYYY-MM) shows the same deity.
// A deity with `ready: false` has no art yet; the app shows no visitor that month.
// Names and stories are drafts for the design lead to rewrite; ids never change once shipped.
import { localDateForInstant, normalizeIanaTimezone } from "./ai-periods.js";

export const FLOWER_DEITIES = Object.freeze([
  { month: 1, id: "deity-snowdrop", flower: "snowdrop", ready: false,
    name: { en: "Snowdrop, Keeper of Quiet Starts", "zh-Hans": "雪花莲 · 静候新始之神" },
    story: { en: "She arrives with the first frost of the year and asks for nothing but one small wish to keep.",
      "zh-Hans": "她随着新年的第一层霜来到花园，只想替你收好一个小小的愿望。" } },
  { month: 2, id: "deity-violet", flower: "violet", ready: false,
    name: { en: "Violet, Keeper of Gentle Words", "zh-Hans": "紫罗兰 · 温柔话语之神" },
    story: { en: "He collects kind words that were never said aloud and plants them where you will find them.",
      "zh-Hans": "他收集那些没说出口的温柔话，把它们种在你会经过的地方。" } },
  { month: 3, id: "deity-daffodil", flower: "daffodil", ready: false,
    name: { en: "Daffodil, Keeper of Returning Light", "zh-Hans": "水仙 · 归来之光之神" },
    story: { en: "Each morning she opens one more petal, to show the light is staying a little longer.",
      "zh-Hans": "每天清晨她多打开一片花瓣，告诉你光会停留得更久一点。" } },
  { month: 4, id: "deity-sweet-pea", flower: "sweet-pea", ready: false,
    name: { en: "Sweet Pea, Keeper of Small Joys", "zh-Hans": "香豌豆 · 小小欢喜之神" },
    story: { en: "She hides tiny joys under leaves and laughs when you find one.",
      "zh-Hans": "她把小小的欢喜藏在叶子底下，你找到一个，她就笑一下。" } },
  { month: 5, id: "deity-lily-of-the-valley", flower: "lily-of-the-valley", ready: false,
    name: { en: "Lily of the Valley, Keeper of Returning Happiness", "zh-Hans": "铃兰 · 幸福归来之神" },
    story: { en: "Her bells ring only when someone in the Garden feels a little better than yesterday.",
      "zh-Hans": "只有当花园里有人比昨天好一点时，她的小铃铛才会响。" } },
  { month: 6, id: "deity-rose", flower: "rose", ready: false, name: { en: "Rose", "zh-Hans": "玫瑰" }, story: null },
  { month: 7, id: "deity-water-lily", flower: "water-lily", ready: false, name: { en: "Water Lily", "zh-Hans": "睡莲" }, story: null },
  { month: 8, id: "deity-sunflower", flower: "sunflower", ready: false, name: { en: "Sunflower", "zh-Hans": "向日葵" }, story: null },
  { month: 9, id: "deity-aster", flower: "aster", ready: false, name: { en: "Aster", "zh-Hans": "紫菀" }, story: null },
  { month: 10, id: "deity-marigold", flower: "marigold", ready: false, name: { en: "Marigold", "zh-Hans": "万寿菊" }, story: null },
  { month: 11, id: "deity-chrysanthemum", flower: "chrysanthemum", ready: false, name: { en: "Chrysanthemum", "zh-Hans": "菊花" }, story: null },
  { month: 12, id: "deity-holly", flower: "holly", ready: false, name: { en: "Holly", "zh-Hans": "冬青" }, story: null }
].map(deity => Object.freeze(deity)));

// Deities whose art has shipped, from FLOWER_DEITIES_READY (comma-separated ids) so art can go live
// without a code change; the `ready` flags above are the default.
const readyIds = env => new Set(String(env.FLOWER_DEITIES_READY ?? "").split(",").map(id => id.trim()).filter(Boolean));
const isReady = (deity, env) => deity.ready || readyIds(env).has(deity.id);

function present(deity, locale, env) {
  const lang = locale === "zh-Hans" ? "zh-Hans" : "en";
  return { id: deity.id, monthOfYear: deity.month, flower: deity.flower, name: deity.name[lang],
    story: deity.story?.[lang] ?? null, art: `garden/deities/${deity.flower}`, ready: isReady(deity, env) };
}

export const deityForMonth = month => FLOWER_DEITIES.find(deity => deity.month === month) ?? null;

// "YYYY-MM" of the owner's local month at `now`.
export function localMonthKey(now, timezone) {
  return localDateForInstant(now, normalizeIanaTimezone(timezone) || "UTC").slice(0, 7);
}

// Months from the account's first local month up to this one (newest first, at most 24).
export function monthsSince(firstKey, currentKey) {
  const keys = [];
  let [year, month] = currentKey.split("-").map(Number);
  while (keys.length < 24) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key < firstKey) break;
    keys.push(key);
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return keys;
}

// GET /api/garden/deity: this month's visitor, and the album of deities met since the account began.
export function deitySummary({ now = new Date(), timezone, createdAt, locale = "en", env = process.env }) {
  const current = localMonthKey(now, timezone);
  const first = localMonthKey(createdAt ?? now, timezone);
  const deity = deityForMonth(Number(current.slice(5)));
  return {
    month: current,
    deity: deity && isReady(deity, env) ? present(deity, locale, env) : null,
    album: monthsSince(first, current).map(key => {
      const met = deityForMonth(Number(key.slice(5)));
      return { ...(met && isReady(met, env) ? present(met, locale, env) : { id: met?.id ?? null, ready: false }), month: key };
    })
  };
}
