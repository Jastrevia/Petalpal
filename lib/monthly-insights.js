// Monthly 2.0 (docs/product/WEEKLY_2.0.md "M4", proposal "月报与年度回顾"): a month's change, not four Weeklies added up.
// Code only — no model call, so it costs nothing. Reads the report's owner-scoped source fence (this month and the one
// before), the month's saved Weekly reports (their cards, headlines and plans/questions) and the owner's muted words.
// Every number, quote and name is the owner's own and checked here; a part without enough data is left out.
import { addLocalDays, localDateForInstant } from "./ai-periods.js";
import { spanView } from "./insight-extract.js";
import { keyPhrase, mentions, MOOD_WORDS, mutedIn } from "./insight-compute.js";

export const MONTHLY_2 = "monthly-2.0";
export const MONTHLY_LIMITS = Object.freeze({ fewEvents: 3, changeEach: 2, changeShare: 0.5, maxChanges: 2, maxGoods: 8, peopleEvents: 2,
  maxPeople: 5, maxThreads: 4, maxQuote: Object.freeze({ en: 180, "zh-Hans": 60 }) });
const BRIGHT = new Set(["SUNNY_BLOOM", "PEACEFUL_BLOOM", "HEALING_BLOOM", "GENTLE_BLOOM"]);
const norm = text => String(text).normalize("NFKC").replace(/\s+/gu, " ").trim();
const length = text => [...text].length;

// The fence's Events with their span views, oldest first; sensitive ones dropped. `current`: this month.
export function monthEvents(input) {
  const { period } = input, start = +new Date(period.periodStartUtc), end = +new Date(period.periodEndUtc);
  const extractions = input.monthly2?.insightExtractions ?? {};
  return input.sourceFence.sources.filter(source => typeof source.memory?.summary === "string" && source.occurredAt < end)
    .map(source => ({ id: source.id, at: source.occurredAt, date: localDateForInstant(new Date(source.occurredAt), period.timezone),
      current: source.occurredAt >= start, mood: source.primaryGardenMood, text: source.memory.summary,
      spans: spanView({ id: source.id, text: source.memory.summary, mood: source.primaryGardenMood, extraction: extractions[source.id] ?? null }) }))
    .filter(event => !event.spans.sensitive)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
const topMood = list => {
  const counts = new Map();
  for (const event of list) if (event.mood) counts.set(event.mood, (counts.get(event.mood) ?? 0) + 1);
  // Ties go to the later choice.
  let best = null, n = 0;
  for (const event of list) if (event.mood && counts.get(event.mood) >= n) { best = event.mood; n = counts.get(event.mood); }
  return best ? { mood: best, count: n } : null;
};
const named = event => [...event.spans.people, ...event.spans.places, ...event.spans.topics];
const monthDays = period => {
  const first = `${period.periodKey}-01`, days = [];
  for (let day = first; day.startsWith(period.periodKey); day = addLocalDays(day, 1)) days.push(day);
  return days;
};
const meta = locale => ({ contractVersion: MONTHLY_2, locale, evidenceRefs: [], aggregateRefs: [] });
const side = (event, text) => ({ sourceEventId: event.id, date: event.date, quote: text });

export function renderMonthly2(input) {
  const locale = input.monthly2?.locale ?? input.locale ?? "en", en = locale === "en", moods = MOOD_WORDS[locale] ?? MOOD_WORDS.en, mutes = input.monthly2?.mutes ?? [];
  const maxQuote = MONTHLY_LIMITS.maxQuote[locale] ?? 60, fits = text => length(text) <= maxQuote && !mutedIn(text, mutes);
  const events = monthEvents(input), current = events.filter(event => event.current), before = events.filter(event => !event.current);
  const days = monthDays(input.period), m = meta(locale);
  // 本月花园: one flower per day in the day's main mood; days without an entry stay empty soil.
  const points = current.filter(event => event.mood).map(event => ({ date: event.date, mood: event.mood, sourceEventId: event.id }));
  const dayMoods = days.map(date => ({ date, mood: topMood(current.filter(event => event.date === date))?.mood ?? null }));
  const written = dayMoods.filter(day => day.mood).length;
  const garden = { kind: "MONTH_GARDEN", claim: en ? `You wrote on ${written} days this month, ${current.length} entries in all.` : `这个月有 ${written} 天写了记录，一共 ${current.length} 条。`,
    days, dayMoods, points, ...m };
  if (current.length < MONTHLY_LIMITS.fewEvents) {
    const headline = { kind: "MONTH_HEADLINE", claim: en ? "This month's garden is still growing" : "这个月的花园还在长", reportVersion: MONTHLY_2, ...m };
    const question = { kind: "MONTH_QUESTION", claim: en ? "Which moment next month would you like to keep?" : "下个月，有哪一刻你想记下来？", ...m };
    return finish([headline, garden, question]);
  }

  // 本月牌阵: the month's Weekly cards, start → turn → now, each with its week's headline.
  const weeks = (input.monthly2?.weeks ?? []).filter(week => week.card?.cardId && typeof week.card.name === "string");
  const spread = weeks.length ? { kind: "MONTH_SPREAD", claim: weeks.map(week => `${week.card.name}${en ? ": " : "："}${week.headline ?? ""}`).join(" "),
    cards: weeks.map((week, i) => ({ periodKey: week.periodKey, cardId: week.card.cardId, name: week.card.name, line: week.card.line ?? null,
      headline: week.headline && !mutedIn(week.headline, mutes) ? week.headline : null, insightType: week.insightType ?? null,
      role: i === 0 ? "start" : i === weeks.length - 1 ? "now" : "turn" })), ...m } : null;

  // 变化对照: a person/place/activity in ≥2 entries last month and ≥2 this month whose main mood changed, each main mood
  // holding at least half of its month's entries; one sentence from each side, as written.
  const changes = [];
  for (const word of new Set(current.flatMap(event => named(event).map(item => item.word)))) {
    if (mutedIn(word, mutes)) continue;
    const has = event => named(event).some(item => item.word === word) && event.mood;
    const then = before.filter(has), now = current.filter(has);
    if (then.length < MONTHLY_LIMITS.changeEach || now.length < MONTHLY_LIMITS.changeEach) continue;
    const a = topMood(then), b = topMood(now);
    if (!a || !b || a.mood === b.mood || a.count / then.length < MONTHLY_LIMITS.changeShare || b.count / now.length < MONTHLY_LIMITS.changeShare) continue;
    const quote = list => { for (const event of [...list].reverse()) { const item = named(event).find(entry => entry.word === word && fits(entry.text)); if (item) return side(event, item.text); } return null; };
    const thenQuote = quote(then.filter(event => event.mood === a.mood)), nowQuote = quote(now.filter(event => event.mood === b.mood));
    if (!thenQuote || !nowQuote) continue;
    changes.push({ kind: "MONTH_CHANGE", word, numbers: [then.length, a.count, now.length, b.count], then: thenQuote, now: nowQuote,
      claim: en ? `Last month, ${a.count} of the ${then.length} entries about “${word}” were ${moods[a.mood]}; this month, ${b.count} of ${now.length} were ${moods[b.mood]}.`
        : `上个月写到“${word}”的 ${then.length} 条里，有 ${a.count} 条是『${moods[a.mood]}』；这个月的 ${now.length} 条里，有 ${b.count} 条是『${moods[b.mood]}』。`,
      size: then.length + now.length, ...m });
  }
  changes.sort((x, y) => y.size - x.size);
  const shownChanges = changes.slice(0, MONTHLY_LIMITS.maxChanges).map(({ size, ...change }) => change);

  // 线索追踪: the plans and questions this month's Weeklies showed, and how often later entries this month wrote them.
  const threads = [];
  for (const week of input.monthly2?.weeks ?? []) for (const item of week.threads ?? []) {
    if (threads.length >= MONTHLY_LIMITS.maxThreads) break;
    const origin = events.find(event => event.id === item.quote?.sourceEventId);
    // Quoted only while the sentence is still in its Event.
    if (!origin || !norm(origin.text).includes(norm(item.quote.text)) || !fits(item.quote.text)) continue;
    const keyword = item.type === "SAID_BEFORE" ? item.subject : keyPhrase(item.quote.text);
    if (!keyword || mutedIn(keyword, mutes)) continue;
    const weekEnd = addLocalDays(week.periodKey, 7);
    const later = current.filter(event => event.date >= weekEnd && mentions(event.text, keyword));
    threads.push({ type: item.type, keyword, count: later.length, quote: { text: item.quote.text, sourceEventId: origin.id, date: origin.date },
      evidence: later.map(event => ({ sourceEventId: event.id, date: event.date })),
      line: en ? (later.length ? `Later this month, ${later.length} ${later.length === 1 ? "entry mentions" : "entries mention"} “${keyword}”.` : `Later this month, no entry mentions “${keyword}” yet.`)
        : later.length ? `这个月之后有 ${later.length} 条写到“${keyword}”。` : `这个月之后还没有写到“${keyword}”。` });
  }
  const threadSection = threads.length ? { kind: "MONTH_THREADS", claim: threads.map(item => `“${item.quote.text}” ${item.line}`).join(" "), items: threads, ...m } : null;

  // 本月好事清单: small good things from this month's bright entries, the most often written first.
  const goods = new Map();
  for (const event of current) if (BRIGHT.has(event.mood)) for (const item of event.spans.smallGoods) {
    if (!fits(item.text)) continue;
    // The same words written again count together; different things that share a name stay apart.
    const key = norm(item.text).replace(/[。！？.!?]+$/u, "").toLowerCase();
    const entry = goods.get(key) ?? { text: item.text, count: 0, sourceEventId: event.id, date: event.date };
    goods.set(key, { text: item.text, count: entry.count + 1, sourceEventId: event.id, date: event.date });
  }
  const goodList = [...goods.values()].sort((a, b) => b.count - a.count || b.date.localeCompare(a.date)).slice(0, MONTHLY_LIMITS.maxGoods);
  const goodSection = goodList.length >= 2 ? { kind: "MONTH_GOODS", claim: (en ? "Small good things this month: " : "这个月的小好事：") + goodList.map(item => item.text).join(" "),
    items: goodList, ...m } : null;

  // 本月的人 (folded in the app, the owner's eyes only): people in ≥2 entries this month and the mood chosen most with them.
  const people = [];
  for (const word of new Set(current.flatMap(event => event.spans.people.map(item => item.word)))) {
    if (mutedIn(word, mutes)) continue;
    const list = current.filter(event => event.mood && event.spans.people.some(item => item.word === word));
    if (list.length < MONTHLY_LIMITS.peopleEvents) continue;
    const top = topMood(list);
    people.push({ word, count: list.length, mood: moods[top.mood], moodCount: top.count, evidence: list.map(event => ({ sourceEventId: event.id, date: event.date })) });
  }
  people.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  const peopleSection = people.length ? { kind: "MONTH_PEOPLE", claim: people.slice(0, MONTHLY_LIMITS.maxPeople).map(item => en
    ? `“${item.word}”: ${item.count} entries, ${item.mood} ${item.moodCount} times.` : `“${item.word}”：${item.count} 条，其中『${item.mood}』${item.moodCount} 条。`).join(" "),
    people: people.slice(0, MONTHLY_LIMITS.maxPeople), ...m } : null;

  // Headline and question from the month's most notable part: a change, else small goods, else the garden.
  const change = shownChanges[0];
  const headline = { kind: "MONTH_HEADLINE", reportVersion: MONTHLY_2, ...m, claim: change
    ? (en ? `“${change.word}” felt different this month` : `写到“${change.word}”时，这个月不一样了`)
    : goodSection ? (en ? "Small things made this month bright" : "这个月让你开心的，是很小的事") : (en ? "Your garden this month" : "你这个月的花园") };
  const question = { kind: "MONTH_QUESTION", ...m, claim: change
    ? (en ? `When you write about “${change.word}” next month, what would you like to notice?` : `下个月写到“${change.word}”的时候，你想留意什么？`)
    : goodSection ? (en ? "Which small thing would you like to keep noticing next month?" : "下个月，你想继续留意哪一件小事？")
      : (en ? "What would you like to write down more often next month?" : "下个月，你想多记下些什么？") };
  return finish([headline, garden, spread, ...shownChanges, threadSection, goodSection, peopleSection, question].filter(Boolean));
}
const finish = sections => ({ narrative: sections.map(section => section.claim).join("\n\n"), sections });
