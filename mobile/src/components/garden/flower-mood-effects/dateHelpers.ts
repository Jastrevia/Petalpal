import type { DailyFlowerEffect, FlowerEffectConfig } from './types';

export const DEFAULT_TIMEZONE = 'America/Vancouver';

/**
 * Returns the local calendar date string (YYYY-MM-DD) for a given timestamp in a specified timezone.
 */
export function getLocalCalendarDate(
  dateOrTimestamp: string | Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const date = typeof dateOrTimestamp === 'string' ? new Date(dateOrTimestamp) : dateOrTimestamp;
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(date); // Format produces YYYY-MM-DD in en-CA
}

/**
 * Calculates the exact UTC ISO string for the next local midnight following a date string (YYYY-MM-DD).
 * Correctly accounts for daylight-saving transitions (spring forward 23h and fall back 25h days).
 */
export function getNextLocalMidnight(
  dateStr: string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  // Normalize dateStr to YYYY-MM-DD
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = cleanDate.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  // Target the start of the next calendar day
  const nextCal = new Date(Date.UTC(year, month - 1, day + 1));
  const ny = nextCal.getUTCFullYear();
  const nm = nextCal.getUTCMonth() + 1;
  const nd = nextCal.getUTCDate();

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Start with standard UTC guess
  let guess = Date.UTC(ny, nm - 1, nd, 0, 0, 0);

  // Converge to the exact UTC timestamp matching target local midnight
  for (let iter = 0; iter < 4; iter++) {
    const formatted = dtf.formatToParts(new Date(guess));
    const p = Object.fromEntries(formatted.map(item => [item.type, item.value]));
    const curY = Number(p.year);
    const curM = Number(p.month);
    const curD = Number(p.day);
    const curH = Number(p.hour) % 24;
    const curMin = Number(p.minute);
    const curSec = Number(p.second);

    const currentLocalUtc = Date.UTC(curY, curM - 1, curD, curH, curMin, curSec);
    const targetLocalUtc = Date.UTC(ny, nm - 1, nd, 0, 0, 0);
    const diff = targetLocalUtc - currentLocalUtc;
    guess += diff;
    if (diff === 0) break;
  }

  return new Date(guess).toISOString();
}

/**
 * Pure helper to verify if a flower effect is currently active.
 * Automatically marks expired effects as inactive without deleting configuration data.
 */
export function isFlowerEffectActive(
  effect: DailyFlowerEffect,
  currentTimeIso: string = new Date().toISOString(),
  options: { historicalReplay?: boolean } = {}
): boolean {
  if (options.historicalReplay) {
    return true;
  }

  const now = new Date(currentTimeIso).getTime();
  const start = new Date(effect.startAt).getTime();
  const expires = new Date(effect.expiresAt).getTime();

  return now >= start && now < expires;
}

/**
 * Creates a complete DailyFlowerEffect record with proper timezone expiration timestamps.
 */
export function createDailyFlowerEffect(
  clusterId: string,
  date: string,
  primaryEffect: FlowerEffectConfig,
  secondaryEffect?: FlowerEffectConfig,
  options: {
    startAt?: string;
    timeZone?: string;
  } = {}
): DailyFlowerEffect {
  const timeZone = options.timeZone || DEFAULT_TIMEZONE;
  const startAt = options.startAt || new Date().toISOString();
  const expiresAt = getNextLocalMidnight(date, timeZone);

  return {
    clusterId,
    date,
    primaryEffect,
    secondaryEffect,
    startAt,
    expiresAt,
  };
}

export type TimeSimulationMode = 'normal' | 'before_midnight' | 'after_midnight';

/**
 * Generates simulated ISO timestamps for interactive preview testing.
 */
export function getSimulatedTimestamp(
  dateStr: string,
  mode: TimeSimulationMode,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const expiresIso = getNextLocalMidnight(dateStr, timeZone);
  const expiresTime = new Date(expiresIso).getTime();

  switch (mode) {
    case 'before_midnight':
      // 10 seconds before local midnight (active)
      return new Date(expiresTime - 10 * 1000).toISOString();
    case 'after_midnight':
      // 10 seconds after local midnight (expired)
      return new Date(expiresTime + 10 * 1000).toISOString();
    case 'normal':
    default:
      // Middle of the planting day (approx 14:00 local)
      return new Date(expiresTime - 10 * 3600 * 1000).toISOString();
  }
}
