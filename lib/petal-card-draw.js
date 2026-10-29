// The daily petal card draw (轮回花环): once per account-local day the owner picks what to ask
// about (a topic), spins the ring and picks one place in today's deck. The deck is all 78 cards,
// each upright or reversed, in an order fixed per owner and day (seeded, so a refresh or another
// device shows the same deck); the app only learns the deck size until a place is chosen, so it
// cannot peek ahead. The card back alternates by day. Gated by the petal card switch
// (PETAL_CARDS_OWNER_IDS).
import { localDateForInstant, normalizeIanaTimezone } from "./ai-periods.js";
import { stableFraction } from "./fairy-runtime.js";
import { weeklyReportLocale } from "./report-locale.js";
import { DRAWABLE_PETAL_CARDS, PETAL_CARD_DISCLAIMER, PETAL_CARDS, petalCard } from "./petal-cards.js";
import { petalCardKeywords } from "./petal-card-keywords.js";

export const PETAL_CARD_BACKS = Object.freeze(["lilac", "violet"]);
// What the owner can ask about, one per day (owner decision 2026-10-30).
export const PETAL_TOPICS = Object.freeze({
  FORTUNE: Object.freeze({ en: "Today’s fortune", "zh-Hans": "今日运势" }),
  DIRECTION: Object.freeze({ en: "The way ahead", "zh-Hans": "接下来的方向" }),
  LOVE: Object.freeze({ en: "Love", "zh-Hans": "感情" }),
  WORK: Object.freeze({ en: "Work & study", "zh-Hans": "工作与学习" }),
  PEOPLE: Object.freeze({ en: "People around you", "zh-Hans": "人际关系" })
});
export const PETAL_TOPIC_IDS = Object.freeze(Object.keys(PETAL_TOPICS));
// About a third of the deck lies reversed: enough to be real tarot, not so many that most days read heavy.
export const REVERSED_SHARE = 1 / 3;

const locale = value => { try { return weeklyReportLocale(value); } catch { return "en"; } };
const dayNumber = localDate => Date.UTC(+localDate.slice(0, 4), +localDate.slice(5, 7) - 1, +localDate.slice(8, 10)) / 86_400_000;

// Today's back: the two designs in turn, by calendar day.
export const cardBackFor = localDate => PETAL_CARD_BACKS[dayNumber(localDate) % 2];

// Heavy cards join the daily deck only once their paintings ship in the app: PETAL_HEAVY_CARDS=on
// (set it after the web build that bundles all 78). Until then the deck is the 69 with art.
export const heavyCardsOn = (env = process.env) => env.PETAL_HEAVY_CARDS === "on";

// Today's deck for this owner: every card id, shuffled with a seed of owner + day. `heavy` adds
// the 9 heavy cards; an app from before topics never gets them (it has no art for them).
export function dailyDeck(userId, localDate, { heavy = false } = {}) {
  const ids = (heavy ? PETAL_CARDS : DRAWABLE_PETAL_CARDS).map(card => card.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(stableFraction(`${userId}:${localDate}:deck:${i}`) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// Whether the card at this place of today's deck lies reversed (seeded like the deck).
export const reversedAt = (userId, localDate, place) => stableFraction(`${userId}:${localDate}:reversed:${place}`) < REVERSED_SHARE;

export function presentPetalCard(cardId, lang, reversed = false) {
  const card = petalCard(cardId);
  if (!card) return null;
  return {
    id: card.id, name: card.names[lang], line: card.copy[lang].line, text: card.copy[lang].text,
    reversed, keywords: petalCardKeywords(card.id, lang, reversed), disclaimer: PETAL_CARD_DISCLAIMER[lang]
  };
}
export const topicLabel = (topic, lang) => PETAL_TOPICS[topic]?.[lang] ?? null;

async function ownerDay(db, userId, now) {
  const owner = await db.user.findUnique({ where: { id: userId }, select: { timezone: true, preferredLocale: true } });
  if (!owner) return null;
  const timezone = normalizeIanaTimezone(owner.timezone) || "UTC";
  return { today: localDateForInstant(now, timezone), lang: locale(owner.preferredLocale) };
}

const drawResult = (row, lang) => ({ id: row.id, position: row.position, drawnAt: row.createdAt, topic: row.topic ?? null,
  topicLabel: topicLabel(row.topic, lang), card: presentPetalCard(row.cardId, lang, row.reversed === true) });

// What the ring needs before a draw: the deck size, today's back, and today's card if drawn.
// `heavy`: the deck includes the 9 heavy cards (see heavyCardsOn).
export async function todaysPetalDraw(db, { userId, now = new Date(), heavy = false }) {
  const day = await ownerDay(db, userId, now);
  if (!day) return null;
  const row = await db.petalCardDraw.findUnique({ where: { userId_localDate: { userId, localDate: day.today } } });
  return {
    locale: day.lang, localDate: day.today, deckSize: (heavy ? PETAL_CARDS : DRAWABLE_PETAL_CARDS).length, back: cardBackFor(day.today),
    topics: PETAL_TOPIC_IDS.map(id => ({ id, label: PETAL_TOPICS[id][day.lang] })), drawn: row ? drawResult(row, day.lang) : null
  };
}

// Picks the card at `position` (0-based, wraps around the deck) for `topic`. Once a day: a
// second draw returns the first one unchanged. No topic: an app from before topics, which gets
// the 69-card deck and never a reversed card.
export async function drawPetalCard(prisma, { userId, position, topic, heavy = false, now = new Date() }) {
  if (!Number.isInteger(position) || position < 0) throw new TypeError("position must be a whole number ≥ 0");
  if (topic !== undefined && !PETAL_TOPIC_IDS.includes(topic)) throw new TypeError("topic must be one of PETAL_TOPIC_IDS");
  const legacy = topic === undefined;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`petal-card-draw:${userId}`}))::text AS "locked"`;
    const day = await ownerDay(tx, userId, now);
    if (!day) return null;
    const existing = await tx.petalCardDraw.findUnique({ where: { userId_localDate: { userId, localDate: day.today } } });
    if (existing) return { created: false, locale: day.lang, localDate: day.today, ...drawResult(existing, day.lang) };
    const deck = dailyDeck(userId, day.today, { heavy: heavy && !legacy });
    const place = position % deck.length;
    const row = await tx.petalCardDraw.create({ data: { userId, localDate: day.today, position: place, cardId: deck[place],
      topic: topic ?? null, reversed: !legacy && reversedAt(userId, day.today, place) } });
    return { created: true, locale: day.lang, localDate: day.today, ...drawResult(row, day.lang) };
  });
}

// Calendar marks: the card drawn on each day of a local month (YYYY-MM).
export async function petalDrawsForMonth(db, { userId, month, lang }) {
  const rows = await db.petalCardDraw.findMany({
    where: { userId, localDate: { startsWith: month } }, orderBy: { localDate: "asc" },
    select: { localDate: true, cardId: true, topic: true, reversed: true }
  });
  return rows.map(row => ({ localDate: row.localDate, id: row.cardId, name: petalCard(row.cardId)?.names[lang] ?? row.cardId,
    reversed: row.reversed === true, topic: row.topic ?? null }));
}
