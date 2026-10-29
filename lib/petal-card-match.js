// Matches one petal card to a Weekly report's moods (docs/product/PETAL_CARDS_DESIGN.md,
// "Matching rules"). Code only and reproducible: no model, no randomness beyond a hash of
// owner + week. The caller passes the mood curve's points (lib/weekly-short.js
// weeklyMoodCurve), already in time order, and never calls this for a support week.
import { stableFraction } from "./fairy-runtime.js";
import { DRAWABLE_PETAL_CARDS, petalCard } from "./petal-cards.js";

export const PETAL_CARD_MIN_EVENTS = 3;
const LOW = new Set(["QUIET_BLOOM", "DRIFTING_BLOOM", "FIRE_BLOOM"]);
const BRIGHT = new Set(["SUNNY_BLOOM", "PEACEFUL_BLOOM", "HEALING_BLOOM", "GENTLE_BLOOM"]);
// Owner decision 2026-10-21: a clear direction (lifting or sinking) wins over "mixed".
export const ARC_CARDS = Object.freeze({
  LIFTING: Object.freeze(["major-17", "swords-06", "major-14", "major-20"]),
  SINKING: Object.freeze(["swords-04", "major-09", "major-08"]),
  MIXED: Object.freeze(["major-14", "major-10", "pentacles-02"])
});

// Weekly insights (docs/product/WEEKLY_INSIGHTS_V1.md): with a main insight the card comes
// from that insight type's pool instead of the mood arc; same owner + week hash.
export const INSIGHT_CARDS = Object.freeze({
  HIDDEN_LINK: Object.freeze(["cups-02", "major-05", "cups-03", "cups-10"]),
  SAID_BEFORE: Object.freeze(["wands-02", "major-01", "pentacles-07", "pentacles-08"]),
  SMALL_GOODS: Object.freeze(["cups-09", "wands-04", "major-19", "pentacles-09"]),
  OPEN_QUESTION: Object.freeze(["major-02", "major-09", "swords-11", "wands-11"])
});
export const insightCardId = ({ ownerId, periodKey, type }) => {
  const pool = INSIGHT_CARDS[type];
  return pool && ownerId && periodKey ? pool[Math.floor(stableFraction(`petal-card:v1:${ownerId}:${periodKey}`) * pool.length) % pool.length] : null;
};

// Most chosen; a tie goes to the mood chosen most recently.
function topMood(points) {
  const counts = new Map();
  points.forEach((point, i) => counts.set(point.mood, { count: (counts.get(point.mood)?.count ?? 0) + 1, last: i }));
  const [mood, { count }] = [...counts].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)[0];
  return { mood, count };
}
const share = (points, group) => points.filter(point => group.has(point.mood)).length / points.length;

// Halves are the mood curve's own split: Mon–Thu and Fri–Sun of the account-timezone week.
export function weeklyArc(points, days) {
  const first = points.filter(point => days.indexOf(point.date) < 4), second = points.filter(point => days.indexOf(point.date) >= 4);
  if (first.length && second.length) {
    if (share(first, LOW) > .5 && share(second, BRIGHT) > .5) return { arc: "LIFTING", first, second };
    if (share(first, BRIGHT) > .5 && share(second, LOW) > .5) return { arc: "SINKING", first, second };
  }
  return { arc: new Set(points.map(point => point.mood)).size >= 4 ? "MIXED" : "STEADY", first, second };
}

// { cardId, arc, dominant, distinct, shift } or null when the week has too few moods.
// `shift` (lifting/sinking only) is the most chosen bright/low mood of Fri–Sun, for the fact line.
export function matchWeeklyPetalCard({ ownerId, periodKey, days, points }) {
  if (!ownerId || !periodKey || !Array.isArray(days) || days.length !== 7 || !Array.isArray(points) ||
      points.length < PETAL_CARD_MIN_EVENTS) return null;
  const dominant = topMood(points), { arc, second } = weeklyArc(points, days);
  const candidates = arc === "STEADY" ? DRAWABLE_PETAL_CARDS.filter(card => card.moods.includes(dominant.mood)).map(card => card.id)
    : ARC_CARDS[arc];
  if (!candidates.length) return null;
  const cardId = candidates[Math.floor(stableFraction(`petal-card:v1:${ownerId}:${periodKey}`) * candidates.length) % candidates.length];
  const toward = arc === "LIFTING" ? BRIGHT : arc === "SINKING" ? LOW : null;
  const shift = toward ? topMood(second.filter(point => toward.has(point.mood))) : null;
  return { cardId, arc, dominant, distinct: new Set(points.map(point => point.mood)).size, shift };
}

// Every listed card exists and is drawable.
for (const id of [...Object.values(ARC_CARDS), ...Object.values(INSIGHT_CARDS)].flat()) if (petalCard(id)?.heavy !== false) throw new Error(`Petal card ${id} is not drawable`);
