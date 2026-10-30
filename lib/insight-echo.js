// Weekly 2.0 "时间回声" (docs/product/WEEKLY_2.0.md): a sentence written this week and a nearly identical one the owner
// wrote at least 30 days earlier, within a year. Both are whole sentences of the owner's own Events, shown side by side.
// English entries use the stored BGE vectors to find the earlier Event (lib/semantic-retrieval.js), then code picks the
// closest sentence pair; Chinese (no Chinese vectors) compares sentences in code: shared character pairs and the
// longest shared run. Thresholds are first guesses awaiting live review.
import { sentenceRanges, textSensitive } from "./insight-extract.js";

export const ECHO_LIMITS = Object.freeze({ minDaysApart: 30, lookbackDays: 365, maxHistory: 400, maxCurrent: 8,
  zh: Object.freeze({ minChars: 6, dice: 0.6, run: 6, runShare: 0.6 }), en: Object.freeze({ minWords: 5, overlap: 0.55, vector: 0.8 }),
  maxQuote: Object.freeze({ en: 180, "zh-Hans": 60 }) });
const DAY = 86_400_000;
const STOP = new Set("the a an and or but to of in on at for with is are was were be been it this that i me my we you so very just really".split(" "));
const han = text => [...String(text).normalize("NFKC")].filter(char => /\p{Script=Han}/u.test(char)).join("");
const words = text => (String(text).normalize("NFKC").toLowerCase().match(/[a-z']+/gu) || []).filter(word => word.length > 2 && !STOP.has(word));

function bigrams(text) {
  const counts = new Map();
  for (let i = 0; i < text.length - 1; i++) counts.set(text.slice(i, i + 2), (counts.get(text.slice(i, i + 2)) ?? 0) + 1);
  return counts;
}
// Dice coefficient over character pairs.
export function dice(a, b) {
  const x = bigrams(a), y = bigrams(b);
  let shared = 0, total = 0;
  for (const [pair, count] of x) { shared += Math.min(count, y.get(pair) ?? 0); total += count; }
  for (const count of y.values()) total += count;
  return total ? (2 * shared) / total : 0;
}
// Length of the longest run of characters both strings share.
export function longestRun(a, b) {
  let best = 0;
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let previous = 0;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = a[i - 1] === b[j - 1] ? previous + 1 : 0;
      if (row[j] > best) best = row[j];
      previous = keep;
    }
  }
  return best;
}
// How much two sentences say the same thing (0–1), or 0 when they are too short to count.
export function sentenceEcho(a, b, locale) {
  if (locale === "en") {
    const x = new Set(words(a)), y = new Set(words(b));
    if (x.size < ECHO_LIMITS.en.minWords || y.size < ECHO_LIMITS.en.minWords) return 0;
    const shared = [...x].filter(word => y.has(word)).length;
    return shared / Math.min(x.size, y.size);
  }
  const x = han(a), y = han(b), limits = ECHO_LIMITS.zh;
  if (x.length < limits.minChars || y.length < limits.minChars) return 0;
  const run = longestRun(x, y), byRun = run >= limits.run && run / Math.min(x.length, y.length) >= limits.runShare ? run / Math.min(x.length, y.length) : 0;
  return Math.max(dice(x, y) >= limits.dice ? dice(x, y) : 0, byRun);
}

const sentences = (event, locale) => sentenceRanges(event.text).map(range => range.text)
  .filter(text => [...text].length <= ECHO_LIMITS.maxQuote[locale] && !textSensitive(text));

// current / history: [{ id, occurredAt (ms), text, date }]. vectorPairs (English): Map(currentId → [{ id, similarity }]).
// Returns { now, then, score } with whole sentences, or null.
export function findEcho({ current, history, locale, vectorPairs = null }) {
  if (!ECHO_LIMITS.maxQuote[locale]) return null;
  const threshold = locale === "en" ? ECHO_LIMITS.en.overlap : Math.min(ECHO_LIMITS.zh.dice, ECHO_LIMITS.zh.runShare);
  const byId = new Map(history.map(event => [event.id, event]));
  let best = null;
  for (const now of [...current].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, ECHO_LIMITS.maxCurrent)) {
    if (textSensitive(now.text)) continue;
    const earliest = now.occurredAt - ECHO_LIMITS.lookbackDays * DAY, latest = now.occurredAt - ECHO_LIMITS.minDaysApart * DAY;
    const pool = locale === "en" && vectorPairs
      ? (vectorPairs.get(now.id) ?? []).filter(row => row.similarity >= ECHO_LIMITS.en.vector).map(row => byId.get(row.id)).filter(Boolean)
      : history;
    for (const then of pool) {
      if (then.occurredAt < earliest || then.occurredAt > latest || textSensitive(then.text)) continue;
      for (const a of sentences(now, locale)) for (const b of sentences(then, locale)) {
        const score = sentenceEcho(a, b, locale);
        // Closer wording wins; a tie keeps the more recent pair.
        if (score >= threshold && (!best || score > best.score)) {
          best = { score, now: { sourceEventId: now.id, date: now.date, quote: a }, then: { sourceEventId: then.id, date: then.date, quote: b } };
        }
      }
    }
  }
  return best;
}
