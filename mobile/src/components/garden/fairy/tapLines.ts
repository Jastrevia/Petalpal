import bank from './tapLines.json';
import type { FairyState } from './FairyNavigation';

// What PPL says: now and then on her own in the Garden, and when tapped in Our Bond. Lines are
// bundled and picked on the device, so nothing calls a model. scripts/generate-fairy-tap-lines.mjs
// adds reviewed lines to tapLines.json offline.
export type TapActivity = 'SWINGING' | 'SLEEPING' | 'TEA_TIME' | 'IDLE';
export type TapLine = { id: string; activity: TapActivity | 'ANY'; source: string; en: string; zh: string };

export const TAP_LINES = bank.lines as TapLine[];
const ACTIVITY_WEIGHT = 3, ANY_WEIGHT = 1;
export const RECENT_TAP_LINES = 5;

// Chinese except Traditional (same rule as the server's weeklyReportLocale), else English.
export const zhHans = (locale?: string | null) =>
  /^zh(?:-|$)/i.test(locale || '') && !/(?:^|-)(hant|tw|hk|mo)(?:-|$)/i.test(locale || '');

// Only resting states speak; while she travels she is quiet.
export function tapActivity(state: FairyState): TapActivity | null {
  if (state === 'sittingOnSwing') return 'SWINGING';
  if (state === 'sleepingOnMoonBed') return 'SLEEPING';
  if (state === 'seatedAtTea' || state === 'drinkingTea') return 'TEA_TIME';
  if (state === 'idle') return 'IDLE';
  return null;
}

// Lines that only read as an answer to a tap (being tickled, being woken); never unprompted.
const TAP_ONLY = new Set(['idle-gen-5', 'sleeping-gen-4']);
export const AMBIENT_LINES = TAP_LINES.filter(line => !TAP_ONLY.has(line.id));

// In the Garden she speaks up by herself only now and then, so a line still feels like a small
// surprise: sometimes a little while after settling into something, otherwise rarely while she
// stays, and never twice within a few minutes however often she moves. Each line shows for a few seconds.
export const AMBIENT_TIMING = { settleChance: 0.3, settleMs: [20_000, 45_000], gapMs: [240_000, 480_000],
  cooldownMs: 300_000, showMs: 5_000 } as const;
export function ambientDelay(settling: boolean, random: () => number = Math.random, sinceLastMs = Infinity) {
  const [min, max] = settling && random() < AMBIENT_TIMING.settleChance ? AMBIENT_TIMING.settleMs : AMBIENT_TIMING.gapMs;
  return Math.max(Math.round(min + random() * (max - min)), AMBIENT_TIMING.cooldownMs - sinceLastMs);
}

// Lines for her activity weigh more than general ones; the last few shown are skipped
// while anything else is left.
export function pickTapLine(state: FairyState, locale: string | null | undefined, recent: readonly string[],
  random: () => number = Math.random, lines: readonly TapLine[] = TAP_LINES) {
  const activity = tapActivity(state);
  if (!activity) return null;
  const pool = lines.filter(line => line.activity === activity || line.activity === 'ANY');
  const fresh = pool.filter(line => !recent.includes(line.id));
  const candidates = fresh.length ? fresh : pool;
  if (!candidates.length) return null;
  const weight = (line: TapLine) => line.activity === 'ANY' ? ANY_WEIGHT : ACTIVITY_WEIGHT;
  let roll = random() * candidates.reduce((sum, line) => sum + weight(line), 0);
  const line = candidates.find(item => (roll -= weight(item)) < 0) ?? candidates[candidates.length - 1];
  return { id: line.id, text: zhHans(locale) ? line.zh : line.en };
}
