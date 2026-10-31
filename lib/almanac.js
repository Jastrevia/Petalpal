import { withMemoryConsent } from "./ai-consent.js";
import { requireAiIdentity } from "./ai-identity.js";
import { addLocalDays, localDateForInstant, monthlyPeriodFor } from "./ai-periods.js";
import { spanView } from "./insight-extract.js";
import { MOOD_WORDS, mutedIn } from "./insight-compute.js";

// 花语年鉴 (proposal "年度回顾", docs/product/WEEKLY_2.0.md "M5"): a year told from the owner's own entries and saved Weekly
// reports. Built by code when it is opened and never stored, so it costs nothing and always follows deletions. Opens
// from 25 December (account timezone) for the current year, any time for earlier ones.
export const ALMANAC_LIMITS = Object.freeze({ opensOn: "12-25", maxEvents: 2000, echoEvents: 3, echoMonths: 2, goods: 10, firsts: 24,
  maxQuote: Object.freeze({ en: 180, "zh-Hans": 60 }) });
const BRIGHT = new Set(["SUNNY_BLOOM", "PEACEFUL_BLOOM", "HEALING_BLOOM", "GENTLE_BLOOM"]);
const norm = text => String(text).normalize("NFKC").replace(/\s+/gu, " ").trim();
const fail = code => Object.assign(new Error("Almanac unavailable"), { code });

// Pure: the almanac from already owner-scoped rows. `events`: { id, occurredAt, primaryGardenMood, memory: { summary } };
// `weeks`: saved Weekly reports { periodKey, narrativeSections }.
export function buildAlmanac({ year, timezone, locale, events, weeks, mutes = [] }) {
  const en = locale === "en", moods = MOOD_WORDS[locale] ?? MOOD_WORDS.en, maxQuote = ALMANAC_LIMITS.maxQuote[locale] ?? 60;
  const fits = text => [...text].length <= maxQuote && !mutedIn(text, mutes);
  const list = events.filter(event => typeof event.memory?.summary === "string").map(event => ({ id: event.id, at: +new Date(event.occurredAt),
    date: localDateForInstant(new Date(event.occurredAt), timezone), mood: event.primaryGardenMood, text: event.memory.summary,
    spans: spanView({ id: event.id, text: event.memory.summary, mood: event.primaryGardenMood }) }))
    .filter(event => event.date.startsWith(`${year}-`) && !event.spans.sensitive).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  // 12 个月花园: every month's days, each in its main mood (ties to the later choice), empty soil without an entry.
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`, days = [];
    for (let day = `${key}-01`; day.startsWith(key); day = addLocalDays(day, 1)) {
      const onDay = list.filter(event => event.date === day && event.mood), counts = new Map();
      let mood = null, n = 0;
      for (const event of onDay) { counts.set(event.mood, (counts.get(event.mood) ?? 0) + 1); if (counts.get(event.mood) >= n) { mood = event.mood; n = counts.get(event.mood); } }
      days.push({ date: day, mood, sourceEventId: onDay[0]?.id ?? null });
    }
    return { month: key, days, entries: list.filter(event => event.date.startsWith(key)).length };
  });
  // 回声最多的主题: the person/place/activity written in the most entries (≥3, in ≥2 months), with the first and the latest
  // sentence that wrote it, as written.
  const named = event => [...event.spans.people, ...event.spans.places, ...event.spans.topics];
  let echo = null;
  for (const word of new Set(list.flatMap(event => named(event).map(item => item.word)))) {
    if (mutedIn(word, mutes)) continue;
    const with_ = list.filter(event => named(event).some(item => item.word === word));
    if (with_.length < ALMANAC_LIMITS.echoEvents || new Set(with_.map(event => event.date.slice(0, 7))).size < ALMANAC_LIMITS.echoMonths) continue;
    if (echo && with_.length <= echo.count) continue;
    const quote = event => { const item = named(event).find(entry => entry.word === word && fits(entry.text)); return item ? { text: item.text, sourceEventId: event.id, date: event.date } : null; };
    const first = with_.map(quote).find(Boolean), last = [...with_].reverse().map(quote).find(Boolean);
    if (!first || !last || first.sourceEventId === last.sourceEventId) continue;
    echo = { word, count: with_.length, months: new Set(with_.map(event => event.date.slice(0, 7))).size, first, last };
  }
  // 第一次时间线: the "第一次" insights the year's Weekly reports showed (not ones the owner hid or marked inaccurate).
  const sectionsOf = week => Array.isArray(week.narrativeSections) ? week.narrativeSections : [];
  const firsts = weeks.flatMap(week => sectionsOf(week).filter(section => section?.kind === "INSIGHT" && section.type === "FIRST_TIME" && !section.feedback &&
    typeof section.subject === "string" && !mutedIn(section.subject, mutes) && section.evidence?.[0]?.date?.startsWith(`${year}-`))
    .map(section => ({ word: section.subject, date: section.evidence[0].date, sourceEventId: section.evidence[0].sourceEventId })))
    .filter(item => list.some(event => event.id === item.sourceEventId))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, ALMANAC_LIMITS.firsts);
  // 年度好事前 10: small good things from bright entries, the same words counted together, most written first.
  const goods = new Map();
  for (const event of list) if (BRIGHT.has(event.mood)) for (const item of event.spans.smallGoods) {
    if (!fits(item.text)) continue;
    const key = norm(item.text).replace(/[。！？.!?]+$/u, "").toLowerCase(), had = goods.get(key);
    goods.set(key, { text: item.text, count: (had?.count ?? 0) + 1, sourceEventId: event.id, date: event.date });
  }
  const topGoods = [...goods.values()].sort((a, b) => b.count - a.count || b.date.localeCompare(a.date)).slice(0, ALMANAC_LIMITS.goods);
  // 年度花语卡: the card the year's Weekly reports drew most often (ties to the latest), every "why this card" stacked.
  const cards = new Map();
  for (const week of weeks) for (const section of sectionsOf(week)) if (section?.kind === "PETAL_CARD" && typeof section.cardId === "string") {
    const card = cards.get(section.cardId) ?? { cardId: section.cardId, name: section.name, line: section.line ?? null, reasons: [] };
    card.reasons.push({ periodKey: week.periodKey, reason: typeof section.reason === "string" && !mutedIn(section.reason, mutes) ? section.reason : null });
    cards.set(section.cardId, card);
  }
  const card = [...cards.values()].sort((a, b) => b.reasons.length - a.reasons.length || b.reasons.at(-1).periodKey.localeCompare(a.reasons.at(-1).periodKey))[0] ?? null;
  const written = months.reduce((sum, month) => sum + month.days.filter(day => day.mood).length, 0);
  return { year, locale, entries: list.length, daysWritten: written,
    title: en ? `Your ${year} in flowers` : `你的 ${year} 花语年鉴`,
    summary: en ? `${list.length} entries on ${written} days.` : `这一年你在 ${written} 天里写下了 ${list.length} 条记录。`,
    months, echo: echo && { ...echo, line: en ? `“${echo.word}” came back in ${echo.count} entries across ${echo.months} months.`
      : `“${echo.word}”在 ${echo.months} 个月里出现了 ${echo.count} 次。` },
    firsts, goods: topGoods, card: card && { ...card, count: card.reasons.length,
      line: en ? `Drawn ${card.reasons.length} ${card.reasons.length === 1 ? "time" : "times"} this year.` : `这一年抽到了 ${card.reasons.length} 次。` },
    moodNames: moods };
}

export class AlmanacRepository {
  constructor(prisma) { this.prisma = prisma; }

  // The years with saved Weekly reports, newest first, and whether this year's almanac is open yet.
  async years({ identity, now = new Date() }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, async tx => {
      const user = await tx.user.findUnique({ where: { id: ownerId }, select: { timezone: true } });
      if (!user) throw fail("AI_FORBIDDEN");
      const today = localDateForInstant(now, user.timezone), current = Number(today.slice(0, 4));
      const rows = await tx.weeklyReport.findMany({ where: { ownerId }, select: { periodKey: true } });
      const years = [...new Set(rows.map(row => Number(row.periodKey.slice(0, 4))))]
        .filter(year => year < current || (year === current && today.slice(5) >= ALMANAC_LIMITS.opensOn)).sort((a, b) => b - a);
      return { years, opensOn: `${current}-${ALMANAC_LIMITS.opensOn}` };
    });
  }

  async almanac({ identity, year, now = new Date() }) {
    const ownerId = requireAiIdentity(identity);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw fail("ALMANAC_INVALID");
    return withMemoryConsent(this.prisma, identity, async tx => {
      const user = await tx.user.findUnique({ where: { id: ownerId }, select: { timezone: true, preferredLocale: true } });
      if (!user) throw fail("AI_FORBIDDEN");
      const today = localDateForInstant(now, user.timezone);
      if (`${year}-${ALMANAC_LIMITS.opensOn}` > today) throw fail("ALMANAC_NOT_YET");
      const start = monthlyPeriodFor({ year, month: 1, timezone: user.timezone }).periodStartUtc;
      const end = monthlyPeriodFor({ year: year + 1, month: 1, timezone: user.timezone }).periodStartUtc;
      const [events, weeks, mutes] = await Promise.all([
        tx.event.findMany({ where: { ownerId, memoryProcessingAllowed: true, occurredAt: { gte: start, lt: end } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          take: ALMANAC_LIMITS.maxEvents, select: { id: true, occurredAt: true, primaryGardenMood: true, memory: { select: { summary: true, ownerId: true, memoryType: true } } } }),
        tx.weeklyReport.findMany({ where: { ownerId, periodKey: { gte: `${year}-01-01`, lte: `${year}-12-31` } }, orderBy: { periodKey: "asc" },
          select: { periodKey: true, narrativeSections: true } }),
        tx.insightMute.findMany({ where: { ownerId }, select: { word: true } })
      ]);
      const locale = /^zh/iu.test(user.preferredLocale ?? "") && !/hant|tw|hk|mo/iu.test(user.preferredLocale ?? "") ? "zh-Hans" : "en";
      return buildAlmanac({ year, timezone: user.timezone, locale, weeks, mutes: mutes.map(row => row.word),
        events: events.filter(event => event.memory?.ownerId === ownerId && event.memory.memoryType === "EVENT") });
    });
  }
}
