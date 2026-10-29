// Weekly insight candidates (docs/product/WEEKLY_INSIGHTS_V1.md): code only. Reads the
// short report's owner-scoped source fence (this week and the four weeks before it),
// pulls fact spans from each Event (lib/event-memory.js eventSpans) and keeps a candidate
// only when its threshold is met. Every number and fact line here is written by code; the
// model later only chooses among the candidates and phrases them.
import { localDateForInstant, previousWeeklyPeriod } from "./ai-periods.js";
import { eventSpans, lexiconWords } from "./event-memory.js";
import { EN_FILLER, ZH_FILLER } from "./weekly-then-and-now.js";

export const INSIGHT_TYPES = Object.freeze(["HIDDEN_LINK", "SAID_BEFORE", "SMALL_GOODS", "OPEN_QUESTION"]);
// First guesses awaiting live review, like the then-and-now thresholds.
export const INSIGHT_LIMITS = Object.freeze({ linkEvents: 3, linkShare: 2 / 3, linkLift: 0.25, linkOthers: 2, laterEvents: 3,
  goods: 2, maxGoods: 6, maxCandidates: 6, weekDecay: 0.7, maxQuote: Object.freeze({ en: 180, "zh-Hans": 60 }) });
const BRIGHT = new Set(["SUNNY_BLOOM", "PEACEFUL_BLOOM", "HEALING_BLOOM", "GENTLE_BLOOM"]);
const MOODS = new Set([...BRIGHT, "WONDER_BLOOM", "QUIET_BLOOM", "DRIFTING_BLOOM", "FIRE_BLOOM"]);
const BRIGHT_NAMES = { en: "Sunny, Peaceful, Healing or Gentle", "zh-Hans": "晴朗、平静、疗愈或温柔" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const insightDay = (date, locale) => {
  const [, month, day] = date.split("-").map(Number);
  return locale === "en" ? `${MONTHS[month - 1]} ${day}` : `${month}月${day}日`;
};
const norm = text => String(text).normalize("NFKC").replace(/\s+/gu, " ").trim();
const length = text => [...text].length;
const QUESTION_FILLER = new Set([..."什么怎为吗呢吧底究竟难道啊呀嘛哪谁"]);

// The word a later entry has to contain to count as writing about the same thing:
// a listed person/topic word, else a short run of Chinese characters (2–4, fillers trimmed
// from both ends) or the last content word of an English phrase. null when there is none.
export function keyPhrase(text) {
  const listed = lexiconWords(text);
  const word = listed.topics[0] ?? listed.people[0];
  if (word) return word;
  const filler = char => ZH_FILLER.has(char) || QUESTION_FILLER.has(char);
  for (const run of norm(text).match(/\p{Script=Han}+/gu) || []) {
    const chars = [...run];
    let start = 0, end = chars.length;
    while (start < end && filler(chars[start])) start++;
    while (end > start && filler(chars[end - 1])) end--;
    if (end - start >= 2 && end - start <= 4) return chars.slice(start, end).join("");
  }
  if (/\p{Script=Han}/u.test(text)) return null;
  const words = (norm(text).toLowerCase().match(/[a-z]+/gu) || []).filter(item => item.length >= 4 && !EN_FILLER.has(item));
  return words.at(-1) ?? null;
}
const mentions = (text, phrase) => /^[a-z]+$/u.test(phrase) ? new RegExp(`\\b${phrase}`, "u").test(norm(text).toLowerCase())
  : norm(text).includes(phrase);

// computeInsights(input) → candidates, best first, at most INSIGHT_LIMITS.maxCandidates:
// { id, type, score, subject, numbers, fact, words, evidence: [{ sourceEventId, date }],
//   spans: [{ id, sourceEventId, date, text }], thing?, keyword? }
export function computeInsights(input) {
  const { locale, period } = input, maxQuote = INSIGHT_LIMITS.maxQuote[locale];
  if (!maxQuote) return [];
  const start = +new Date(period.periodStartUtc), end = +new Date(period.periodEndUtc);
  // Week index by account-timezone local date: 0 this week, 1–4 the earlier weeks.
  const keys = [period.periodKey];
  for (let earlier = period, i = 0; i < 4; i++) { earlier = previousWeeklyPeriod(earlier); keys.push(earlier.periodKey); }
  const events = input.sourceFence.sources.filter(source => typeof source.memory?.summary === "string" && source.occurredAt < end)
    .map(source => {
      const date = localDateForInstant(new Date(source.occurredAt), period.timezone), week = keys.findIndex(key => date >= key);
      return { id: source.id, at: source.occurredAt, date, week, current: source.occurredAt >= start, mood: source.primaryGardenMood,
        text: source.memory.summary, spans: eventSpans({ id: source.id, text: source.memory.summary, mood: source.primaryGardenMood }) };
    })
    .filter(event => event.week >= 0 && !event.spans.sensitive)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const fits = text => length(text) <= maxQuote;
  const freshness = list => list.reduce((sum, event) => sum + INSIGHT_LIMITS.weekDecay ** event.week, 0) / list.length;
  const evidence = list => list.map(event => ({ sourceEventId: event.id, date: event.date }));
  const span = (event, text) => ({ sourceEventId: event.id, date: event.date, text });
  const wordsOf = list => [...new Set(list.flatMap(event => [...event.spans.people, ...event.spans.topics].map(item => item.word)))];
  const found = [];

  // Hidden link: a person/topic in ≥3 entries, one of them this week, whose bright share is ≥ ⅔
  // and ≥ 25 points above the owner's own share across the five weeks.
  const moody = events.filter(event => MOODS.has(event.mood));
  const all = moody.length, bright = moody.filter(event => BRIGHT.has(event.mood)).length;
  for (const word of new Set(moody.flatMap(event => [...event.spans.people, ...event.spans.topics].map(item => item.word)))) {
    const list = moody.filter(event => [...event.spans.people, ...event.spans.topics].some(item => item.word === word));
    const lit = list.filter(event => BRIGHT.has(event.mood)).length, n = list.length;
    if (n < INSIGHT_LIMITS.linkEvents || all - n < INSIGHT_LIMITS.linkOthers || !list.some(event => event.current) ||
        lit / n < INSIGHT_LIMITS.linkShare || lit / n - bright / all < INSIGHT_LIMITS.linkLift) continue;
    const spans = [...list].reverse().map(event => {
      const item = [...event.spans.people, ...event.spans.topics].find(entry => entry.word === word);
      return item && fits(item.text) ? span(event, item.text) : null;
    }).filter(Boolean).slice(0, 3);
    if (!spans.length) continue;
    const fact = locale === "en"
      ? `In the past five weeks, ${n} entries mention “${word}”, and ${lit} of them were ${BRIGHT_NAMES.en}; across all ${all} entries, ${bright} were.`
      : `这五周有 ${n} 条记录写到“${word}”，其中 ${lit} 条的心情是${BRIGHT_NAMES["zh-Hans"]}；全部 ${all} 条记录里是 ${bright} 条。`;
    found.push({ type: "HIDDEN_LINK", subject: word, numbers: [n, lit, all, bright], fact, words: wordsOf(list), evidence: evidence(list),
      spans, score: freshness(list) * Math.min(2, n / INSIGHT_LIMITS.linkEvents) });
  }

  // Said before: a plan followed by ≥3 later entries, ≥1 of which writes the same thing.
  // A plan nobody wrote about again gives no candidate (owner decision 2026-10-29).
  const plans = new Map();
  for (const event of events) for (const intent of event.spans.intents) {
    const keyword = keyPhrase(intent.thing), later = events.filter(other => other.at > event.at);
    if (!keyword || !fits(intent.text) || later.length < INSIGHT_LIMITS.laterEvents) continue;
    const said = later.filter(other => mentions(other.text, keyword));
    if (!said.length || (!event.current && !said.some(other => other.current))) continue;
    const list = [event, ...said], quotes = said.map(other => other.spans.sentences.find(sentence => mentions(sentence, keyword) && fits(sentence)))
      .map((text, i) => text && span(said[i], text)).filter(Boolean).slice(-2);
    const fact = locale === "en"
      ? `On ${insightDay(event.date, "en")} you wrote: “${intent.text}” Of the ${later.length} entries after it, ${said.length} mention “${keyword}”.`
      : `${insightDay(event.date, "zh-Hans")}你写过：“${intent.text}”之后的 ${later.length} 条记录里，有 ${said.length} 条写到“${keyword}”。`;
    plans.set(keyword, { type: "SAID_BEFORE", subject: keyword, keyword, thing: intent.thing, numbers: [later.length, said.length], fact,
      words: wordsOf(list), evidence: evidence(list), spans: [span(event, intent.text), ...quotes],
      score: freshness(list) * Math.min(2, (said.length + 1) / 2) });
  }
  found.push(...plans.values());

  // Small good things: ≥2 from this week's bright entries; the model picks which to list.
  const goods = events.filter(event => event.current).flatMap(event => event.spans.smallGoods.filter(item => fits(item.text))
    .map(item => ({ event, item }))).slice(0, INSIGHT_LIMITS.maxGoods);
  if (goods.length >= INSIGHT_LIMITS.goods) {
    const list = [...new Map(goods.map(({ event }) => [event.id, event])).values()];
    found.push({ type: "SMALL_GOODS", subject: null, numbers: [], fact: null, words: wordsOf(list), evidence: evidence(list),
      spans: goods.map(({ event, item }) => span(event, item.text)), score: freshness(list) * Math.min(2, goods.length / INSIGHT_LIMITS.goods) });
  }

  // Open question: one the user asked themself this week that no later entry writes about again.
  for (const event of events.filter(item => item.current)) for (const question of event.spans.questions) {
    const keyword = keyPhrase(question.text);
    if (!fits(question.text) || (keyword && events.some(other => other.at > event.at && mentions(other.text, keyword)))) continue;
    found.push({ type: "OPEN_QUESTION", subject: null, keyword, numbers: [], fact: null, words: wordsOf([event]), evidence: evidence([event]),
      spans: [span(event, question.text)], score: freshness([event]) });
  }

  const order = type => INSIGHT_TYPES.indexOf(type);
  let next = 0;
  return found.sort((a, b) => b.score - a.score || order(a.type) - order(b.type))
    .filter((candidate, i, list) => candidate.type !== "OPEN_QUESTION" || list.slice(0, i).filter(other => other.type === "OPEN_QUESTION").length < 2)
    .slice(0, INSIGHT_LIMITS.maxCandidates)
    .map((candidate, i) => ({ id: `C${i + 1}`, ...candidate, spans: candidate.spans.map(item => ({ id: `S${++next}`, ...item })) }));
}
