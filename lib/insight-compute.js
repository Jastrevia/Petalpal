// Weekly 2.0 compute layer (docs/product/WEEKLY_2.0.md, proposal "技术架构 2"): code only. Reads the
// report's owner-scoped source fence (this week and the four weeks before it) and each Event's
// extraction (lib/insight-extract.js; code rules when none is stored), checks every module's sample
// threshold, and returns ranked candidates. Every number and fact line is written here; the model
// later only phrases candidates, and lib/insight-validate.js checks what it wrote.
import { localDateForInstant, previousWeeklyPeriod } from "./ai-periods.js";
import { lexiconWords, spanView, textSensitive } from "./insight-extract.js";
import { EN_FILLER, ZH_FILLER } from "./weekly-then-and-now.js";

// Proposal "惊艳时刻的优先级": the first type that qualifies is the main insight (unless it was last
// week's main type); the rest are ranked by score. TREND is the code-only fallback.
export const INSIGHT_TYPES = Object.freeze(["ECHO", "SAID_BEFORE", "HIDDEN_LINK", "SMALL_GOODS", "FIRST_TIME", "OPEN_QUESTION",
  "SELF_TALK", "BODY_SIGNAL", "RHYTHM", "THREAD", "TREND"]);
// Thresholds from the proposal's module table where it gives them; the rest are first guesses awaiting live review.
export const INSIGHT_LIMITS = Object.freeze({ linkEvents: 3, linkShare: 2 / 3, linkLift: 0.25, linkOthers: 2, laterEvents: 3,
  goods: 2, maxGoods: 6, trendEvents: 4, maxCandidates: 6, weekDecay: 0.7, maxQuote: Object.freeze({ en: 180, "zh-Hans": 60 }) });
const BRIGHT = new Set(["SUNNY_BLOOM", "PEACEFUL_BLOOM", "HEALING_BLOOM", "GENTLE_BLOOM"]);
const LOW = new Set(["QUIET_BLOOM", "DRIFTING_BLOOM", "FIRE_BLOOM"]);
const MOODS = new Set([...BRIGHT, ...LOW, "WONDER_BLOOM"]);
export const MOOD_WORDS = Object.freeze({ en: { SUNNY_BLOOM: "Sunny", PEACEFUL_BLOOM: "Peaceful", GENTLE_BLOOM: "Gentle", WONDER_BLOOM: "Wonder",
  HEALING_BLOOM: "Healing", QUIET_BLOOM: "Quiet", DRIFTING_BLOOM: "Drifting", FIRE_BLOOM: "Fire" },
// The names the Events screen shows when the mood is chosen (mobile EventsPanel).
"zh-Hans": { SUNNY_BLOOM: "晴朗", PEACEFUL_BLOOM: "平和", GENTLE_BLOOM: "温柔", WONDER_BLOOM: "惊喜",
  HEALING_BLOOM: "治愈", QUIET_BLOOM: "安静", DRIFTING_BLOOM: "飘忽", FIRE_BLOOM: "热烈" } });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const insightDay = (date, locale) => {
  const [, month, day] = date.split("-").map(Number);
  return locale === "en" ? `${MONTHS[month - 1]} ${day}` : `${month}月${day}日`;
};
const norm = text => String(text).normalize("NFKC").replace(/\s+/gu, " ").trim();
const length = text => [...text].length;
const QUESTION_FILLER = new Set([..."什么怎为吗呢吧底究竟难道啊呀嘛哪谁"]);

// The word a later entry has to contain to count as writing about the same thing: a listed
// person/place/activity word, else 2–4 Chinese characters with fillers trimmed from both ends,
// else the last content word of an English phrase. null when there is none.
export function keyPhrase(text) {
  const listed = lexiconWords(text);
  const word = listed.topics[0] ?? listed.places[0] ?? listed.people[0];
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
export const mentions = (text, phrase) => /^[a-z]+$/u.test(phrase) ? new RegExp(`\\b${phrase}`, "u").test(norm(text).toLowerCase())
  : norm(text).includes(phrase);

// The owner-scoped Events of the window, oldest first, each with its span view; sensitive ones dropped.
export function insightEvents(input) {
  const { period } = input, start = +new Date(period.periodStartUtc), end = +new Date(period.periodEndUtc);
  const keys = [period.periodKey];
  for (let earlier = period, i = 0; i < 4; i++) { earlier = previousWeeklyPeriod(earlier); keys.push(earlier.periodKey); }
  const extractions = input.insightExtractions ?? {};
  return input.sourceFence.sources.filter(source => typeof source.memory?.summary === "string" && source.occurredAt < end)
    .map(source => {
      const date = localDateForInstant(new Date(source.occurredAt), period.timezone), week = keys.findIndex(key => date >= key);
      return { id: source.id, at: source.occurredAt, date, week, current: source.occurredAt >= start, mood: source.primaryGardenMood,
        text: source.memory.summary, spans: spanView({ id: source.id, text: source.memory.summary, mood: source.primaryGardenMood,
          extraction: extractions[source.id] ?? null }) };
    })
    .filter(event => event.week >= 0 && !event.spans.sensitive)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// The week's own mood arc (Mon–Thu vs Fri–Sun), as in the petal card match: LIFTING, SINKING, MIXED or STEADY.
export function weekArc(events, days) {
  const points = events.filter(event => event.current && MOODS.has(event.mood));
  const first = points.filter(event => days.indexOf(event.date) < 4), second = points.filter(event => days.indexOf(event.date) >= 4);
  const share = (list, group) => list.filter(event => group.has(event.mood)).length / list.length;
  if (first.length && second.length) {
    if (share(first, LOW) > .5 && share(second, BRIGHT) > .5) return { arc: "LIFTING", first, second };
    if (share(first, BRIGHT) > .5 && share(second, LOW) > .5) return { arc: "SINKING", first, second };
  }
  return { arc: new Set(points.map(event => event.mood)).size >= 4 ? "MIXED" : "STEADY", first, second };
}
const topMood = list => {
  const counts = new Map();
  list.forEach((event, i) => counts.set(event.mood, { count: (counts.get(event.mood)?.count ?? 0) + 1, last: i }));
  return [...counts].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)[0]?.[0] ?? null;
};

// computeInsights(input, { days, previousMainType }) → { candidates, arc, current }. Candidates are
// best first: [{ id, type, role, score, subject, keyword?, thing?, numbers, fact, words,
//   evidence: [{ sourceEventId, date }], spans: [{ id, sourceEventId, date, text }] }].
export function computeInsights(input, { days = [], previousMainType = null } = {}) {
  const { locale } = input, maxQuote = INSIGHT_LIMITS.maxQuote[locale];
  if (!maxQuote) return { candidates: [], arc: null, current: 0 };
  const events = insightEvents(input), current = events.filter(event => event.current);
  const fits = text => length(text) <= maxQuote;
  const freshness = list => list.reduce((sum, event) => sum + INSIGHT_LIMITS.weekDecay ** event.week, 0) / list.length;
  // Emotional salience: entries the user wrote at length count more (0.75–1.5).
  const salience = list => 0.75 + Math.min(0.75, list.reduce((sum, event) => sum + Math.min(1, event.text.length / 300), 0) / list.length * 0.75);
  const evidence = list => list.map(event => ({ sourceEventId: event.id, date: event.date }));
  const span = (event, text) => ({ sourceEventId: event.id, date: event.date, text });
  const named = event => [...event.spans.people, ...event.spans.places, ...event.spans.topics];
  const wordsOf = list => [...new Set(list.flatMap(event => named(event).map(item => item.word)))];
  const moodName = mood => MOOD_WORDS[locale][mood];
  const found = [];
  const add = (candidate, list, strength) => found.push({ ...candidate, words: [...new Set([...(candidate.words ?? []), ...wordsOf(list)])],
    evidence: candidate.evidence ?? evidence(list), score: freshness(list) * Math.min(2, strength) * salience(list) });

  // 隐藏关联: a person/place/activity in ≥3 entries with a mood, ≥1 this week, ≥2 other entries; its bright
  // share ≥ ⅔ and ≥ 25 points above the owner's own share across the five weeks.
  const moody = events.filter(event => MOODS.has(event.mood));
  const all = moody.length, bright = moody.filter(event => BRIGHT.has(event.mood)).length;
  for (const word of new Set(moody.flatMap(event => named(event).map(item => item.word)))) {
    const list = moody.filter(event => named(event).some(item => item.word === word));
    const lit = list.filter(event => BRIGHT.has(event.mood)).length, n = list.length;
    if (n < INSIGHT_LIMITS.linkEvents || all - n < INSIGHT_LIMITS.linkOthers || !list.some(event => event.current) ||
        lit / n < INSIGHT_LIMITS.linkShare || lit / n - bright / all < INSIGHT_LIMITS.linkLift) continue;
    const spans = [...list].reverse().map(event => {
      const item = named(event).find(entry => entry.word === word);
      return item && fits(item.text) ? span(event, item.text) : null;
    }).filter(Boolean).slice(0, 3);
    if (!spans.length) continue;
    const mood = topMood(list.filter(event => BRIGHT.has(event.mood)));
    const fact = locale === "en"
      ? `In the past five weeks, ${n} entries mention “${word}”, and ${lit} of them were Sunny, Peaceful, Healing or Gentle; across all ${all} entries, ${bright} were.`
      : `这五周有 ${n} 条记录写到“${word}”，其中 ${lit} 条的心情是晴朗、平和、治愈或温柔；全部 ${all} 条记录里是 ${bright} 条。`;
    add({ type: "HIDDEN_LINK", subject: word, mood: moodName(mood), numbers: [n, lit, all, bright], fact, spans }, list, n / INSIGHT_LIMITS.linkEvents);
  }

  // 说过的话: a plan with ≥3 later entries, ≥1 of which writes the same thing; the plan or a mention is this week.
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
    plans.set(keyword, { candidate: { type: "SAID_BEFORE", subject: keyword, keyword, thing: intent.thing, numbers: [later.length, said.length],
      fact, spans: [span(event, intent.text), ...quotes] }, list, strength: (said.length + 1) / 2 });
  }
  for (const { candidate, list, strength } of plans.values()) add(candidate, list, strength);

  // 好事清单: ≥2 small good things from this week's bright entries; the model picks which to list.
  const goods = current.flatMap(event => event.spans.smallGoods.filter(item => fits(item.text)).map(item => ({ event, item })))
    .slice(0, INSIGHT_LIMITS.maxGoods);
  if (goods.length >= INSIGHT_LIMITS.goods) {
    const list = [...new Map(goods.map(({ event }) => [event.id, event])).values()];
    add({ type: "SMALL_GOODS", subject: null, numbers: [], fact: null, spans: goods.map(({ event, item }) => span(event, item.text)) },
      list, goods.length / INSIGHT_LIMITS.goods);
  }

  // 没回答的问题: a question the user asked themself this week that no later entry writes about again; at most two.
  for (const event of current) for (const question of event.spans.questions) {
    const keyword = keyPhrase(question.text);
    if (!fits(question.text) || (keyword && events.some(other => other.at > event.at && mentions(other.text, keyword)))) continue;
    add({ type: "OPEN_QUESTION", subject: null, keyword, numbers: [], fact: null, spans: [span(event, question.text)] }, [event], 1);
  }

  // 走向 (code-only fallback): the existing Mon–Thu / Fri–Sun rule, with ≥4 entries this week.
  const { arc, first, second } = weekArc(events, days);
  const moodsThisWeek = current.filter(event => MOODS.has(event.mood));
  if (days.length === 7 && moodsThisWeek.length >= INSIGHT_LIMITS.trendEvents && (arc === "LIFTING" || arc === "SINKING")) {
    const from = moodName(topMood(first)), to = moodName(topMood(second));
    const fact = locale === "en" ? `Mon–Thu was mostly ${from}; from Friday, ${to} came up more.` : `前半周多是「${from}」，后半周「${to}」多了起来。`;
    add({ type: "TREND", subject: null, arc, from, to, numbers: [], fact, spans: [] }, moodsThisWeek, 1);
  }

  // 时间回声 (lib/insight-echo.js, loaded with the report input): both sentences must still be in their Events, unchanged
  // and not sensitive. Code-written only; it is shown as "还有一件事" unless it is the week's only find.
  const echo = input.echo, fenced = new Map([...input.sourceFence.sources, ...(input.sourceFence.echoSources ?? [])].map(source => [source.id, source]));
  const holds = side => {
    const summary = fenced.get(side?.sourceEventId)?.memory?.summary;
    return typeof summary === "string" && !textSensitive(summary) && norm(summary).includes(norm(side.quote)) && fits(side.quote) &&
      /^\d{4}-\d{2}-\d{2}$/.test(side.date ?? "");
  };
  if (echo && holds(echo.now) && holds(echo.then) && echo.then.date < echo.now.date && current.some(event => event.id === echo.now.sourceEventId)) {
    const [then, now] = [insightDay(echo.then.date, locale), insightDay(echo.now.date, locale)];
    const fact = locale === "en" ? `On ${then} and ${now} you wrote nearly the same words.` : `${now}和${then}的你，写了几乎一样的话。`;
    const list = [echo.then, echo.now].map(side => ({ id: side.sourceEventId, date: side.date, week: 0, text: "" }));
    found.push({ type: "ECHO", subject: null, numbers: [], fact, dates: [then, now], spans: [echo.then, echo.now].map(side =>
      ({ sourceEventId: side.sourceEventId, date: side.date, text: side.quote })), evidence: list.map(event => ({ sourceEventId: event.id, date: event.date })),
      words: [], score: 2 });
  }

  const order = type => INSIGHT_TYPES.indexOf(type);
  const ranked = found.sort((a, b) => b.score - a.score || order(a.type) - order(b.type))
    .filter((candidate, i, list) => candidate.type !== "OPEN_QUESTION" || list.slice(0, i).filter(other => other.type === "OPEN_QUESTION").length < 2);
  // Main: the highest-priority type that qualifies, not last week's main type when another qualifies.
  const byPriority = [...ranked].sort((a, b) => order(a.type) - order(b.type) || b.score - a.score);
  // An echo is the page's last reveal ("还有一件事"), main only when it is the week's only find.
  const main = byPriority.find(candidate => candidate.type !== previousMainType && candidate.type !== "ECHO") ??
    byPriority.find(candidate => candidate.type !== "ECHO") ?? byPriority[0];
  const chosen = main ? [main, ...ranked.filter(candidate => candidate !== main)].slice(0, INSIGHT_LIMITS.maxCandidates) : [];
  let next = 0;
  return { arc, current: current.length, candidates: chosen.map((candidate, i) => ({ id: `C${i + 1}`, role: i === 0 ? "main" : "secondary",
    ...candidate, spans: candidate.spans.map(item => ({ id: `S${++next}`, ...item })) })) };
}
