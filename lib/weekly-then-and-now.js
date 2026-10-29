import { localDateForInstant } from "./ai-periods.js";

// Short Weekly "then and now" (docs/product/WEEKLY_SHORT_REPORT_DESIGN.md): code only, no
// model. Pairs this week's Event with an earlier one about the same thing, at least seven
// days apart, and quotes a whole sentence from each exactly as written. Preference: a
// change in wording (English, stored BGE vectors) → a repeated phrase → nothing.
// The similarity threshold and the filler lists are first guesses awaiting live review.
export const THEN_AND_NOW = Object.freeze({ minDaysApart: 7, maxCurrent: 8, maxEarlier: 60, minSimilarity: 0.85,
  minCount: 3, maxQuote: Object.freeze({ en: 180, "zh-Hans": 60 }) });
const DAY = 86_400_000;
// NFKC is for matching only; quotes keep the user's own characters (full-width punctuation included).
const norm = text => String(text).normalize("NFKC").replace(/\s+/gu, " ").trim();
const squash = text => String(text).replace(/\s+/gu, " ").trim();
const length = text => [...text].length;
// lib/event-memory.js keeps at most 500 characters; a clipped entry's last fragment is incomplete.
const clipped = text => text.length >= 500 && !/[。！？.!?」』”"）)]$/u.test(text.trim());
function sentences(text) {
  const parts = String(text).split(/(?<=[。！？；!?;])|(?<=\.)\s+|\n/u).map(part => part.trim()).filter(Boolean);
  return clipped(text) ? parts.slice(0, -1) : parts;
}

// A phrase needs at least two characters/words outside these everyday fillers.
// 不 is not filler: a leading negation carries meaning.
export const ZH_FILLER = new Set([..."我你他她它们的了是在和也都就很这那有个一今昨明天还要会去说着过把被让给对到从又再才上下午晚早中周末"]);
export const EN_FILLER = new Set(("a an the and or but so to of in on at for with from by as is are was were be been am i me my we our us " +
  "you your he she him her it its they them their this that these those there here then than just very really also too " +
  "about into over after before again today yesterday tonight morning afternoon evening night week day time got get went " +
  "go do did have has had").split(" "));
const words = text => norm(text).toLowerCase().match(/[\p{L}\p{N}]+(?:'\p{L}+)?/gu) || [];
function grams(list, k) {
  const set = new Set();
  for (let i = 0; i + k <= list.length; i++) set.add(list.slice(i, i + k).join(" "));
  return set;
}
// A phrase never starts or ends on filler ("又睡不着觉" → "睡不着觉", "slept through the" → "slept through").
function edges(items, filler) {
  let start = 0, end = items.length;
  while (start < end && filler(items[start])) start++;
  while (end > start && filler(items[end - 1])) end--;
  return items.slice(start, end);
}
function zhPhrase(a, b) {
  const runs = text => (norm(text).match(/\p{Script=Han}+/gu) || []).map(run => [...run]);
  const set = (text, k) => new Set(runs(text).flatMap(chars => [...grams(chars, k)].map(gram => gram.replaceAll(" ", ""))));
  for (let k = 8; k >= 4; k--) {
    const other = set(b, k);
    for (const gram of set(a, k)) {
      if (!other.has(gram)) continue;
      const phrase = edges([...gram], char => ZH_FILLER.has(char)).join("");
      if (length(phrase) >= 4 && [...phrase].filter(char => !ZH_FILLER.has(char)).length >= 2) return phrase;
    }
  }
  return null;
}
function enPhrase(a, b) {
  const first = words(a), second = words(b);
  for (let k = Math.min(6, first.length, second.length); k >= 2; k--) {
    const other = grams(second, k);
    for (const gram of grams(first, k)) {
      if (!other.has(gram)) continue;
      const phrase = edges(gram.split(" "), word => EN_FILLER.has(word));
      if (phrase.filter(word => !EN_FILLER.has(word)).length >= 2) return phrase.join(" ");
    }
  }
  return null;
}
const contains = (text, phrase, locale) => locale === "en" ? ` ${words(text).join(" ")} `.includes(` ${phrase} `) : norm(text).includes(phrase);

// current/earlier: [{ eventId, memoryId, occurredAt (ms), text }] from the owner-scoped
// source fence. similar: Map(nowMemoryId → Map(earlierMemoryId → cosine)), English only.
export function selectThenAndNow({ locale, timezone, current, earlier, similar = new Map() }) {
  const max = THEN_AND_NOW.maxQuote[locale];
  if (!max) return null;
  const recent = (list, take) => [...list].sort((a, b) => b.occurredAt - a.occurredAt || b.eventId.localeCompare(a.eventId)).slice(0, take);
  const quote = (text, phrase) => {
    const chosen = phrase ? sentences(text).find(sentence => contains(sentence, phrase, locale)) : !clipped(text) && text;
    const value = chosen && squash(chosen);
    return value && length(value) <= max ? value : null;
  };
  let best = null;
  for (const now of recent(current, THEN_AND_NOW.maxCurrent)) for (const then of recent(earlier, THEN_AND_NOW.maxEarlier)) {
    if (now.occurredAt - then.occurredAt < THEN_AND_NOW.minDaysApart * DAY) continue;
    const phrase = locale === "en" ? enPhrase(now.text, then.text) : zhPhrase(now.text, then.text);
    const similarity = locale === "en" ? similar.get(now.memoryId)?.get(then.memoryId) ?? 0 : 0;
    const match = phrase ? "REPEAT" : similarity >= THEN_AND_NOW.minSimilarity ? "CHANGE" : null;
    if (!match) continue;
    const nowQuote = quote(now.text, phrase), thenQuote = quote(then.text, phrase);
    if (!nowQuote || !thenQuote) continue;
    // A change in wording outranks a repeated phrase; then higher similarity / longer phrase; ties keep the most recent.
    const rank = match === "CHANGE" ? [1, similarity] : [0, length(phrase)];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) {
      best = { rank, match, phrase, now, then, nowQuote, thenQuote };
    }
  }
  if (!best) return null;
  const count = best.match === "REPEAT" ? [...current, ...earlier].filter(item => contains(item.text, best.phrase, locale)).length : 0;
  const side = (item, text) => ({ sourceEventId: item.eventId, date: localDateForInstant(new Date(item.occurredAt), timezone), quote: text });
  return { match: best.match, phrase: best.match === "REPEAT" ? best.phrase : null,
    count: count >= THEN_AND_NOW.minCount ? count : null, then: side(best.then, best.thenQuote), now: side(best.now, best.nowQuote) };
}
