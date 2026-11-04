import { apiRequest } from './api';
import type { BackendFlower } from './events';
import { dateText, moodZh, weekdayName } from './treehouseCopy';

export interface JournalCheckIn {
  id: string; localDate: string; createdAt: string;
  // locked: written through a Daily Grow check-in; the Treehouse keeps it read-only.
  journal: { id: string; content: string; locked?: boolean } | null;
  emotionResult: { label: string; secondaryEmotions?: string[]; inferencePath?: string } | null;
  flower: BackendFlower | null;
}
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
export function monthKey(year: number, month: number) { return `${year}-${String(month).padStart(2, '0')}`; }
// A month opens once it holds a private journal. The current month (device clock) is always
// open, so its book can be read and written in before its first journal.
export function openableMonths(entries: JournalCheckIn[], now = new Date()) {
  return new Set([monthKey(now.getFullYear(), now.getMonth() + 1), ...entries.filter(e => e.journal).map(e => e.localDate.slice(0, 7))]);
}
export function journalYears(entries: JournalCheckIn[]) {
  return [...new Set([2026, 2027, 2028, 2029, 2030, ...entries.filter(e => e.journal).map(e => Number(e.localDate.slice(0, 4)))])].sort((a, b) => a - b);
}
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// localDate is already the owner's calendar day (YYYY-MM-DD); format it without any timezone conversion.
// In the Treehouse's language (services/treehouseCopy.ts).
export function formatLocalDate(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return dateText(year, month, day);
}
export function weekdayOf(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return weekdayName(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}
// Today's calendar day in the owner's timezone, used only to pick a default shelf and explain where a new journal lands.
export function todayLocalDate(timezone: string, now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}
// A month's saved journals in diary order (oldest first; same-day entries by save time).
export function monthEntries(entries: JournalCheckIn[], year: number, month: number) {
  const key = monthKey(year, month);
  return entries.filter(e => e.journal && e.localDate.startsWith(key))
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function journalCounts(entries: JournalCheckIn[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) if (entry.journal) counts.set(entry.localDate.slice(0, 7), (counts.get(entry.localDate.slice(0, 7)) || 0) + 1);
  return counts;
}
// Journals have no separate title; cards show the opening words of the entry itself.
export function journalPreview(content: string, max = 64) {
  const line = content.split('\n').map(part => part.trim()).find(Boolean)?.replace(/\s+/g, ' ') || '';
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * .6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?，。、；：！？]+$/u, '')}…`;
}
// Date bookmarks for a month's book, in diary order. Several journals on one day stay separate ("Oct 16 · 2").
export function bookmarkLabels(entries: JournalCheckIn[]) {
  const totals = new Map<string, number>(), seen = new Map<string, number>();
  for (const entry of entries) totals.set(entry.localDate, (totals.get(entry.localDate) || 0) + 1);
  return entries.map(entry => {
    const nth = (seen.get(entry.localDate) || 0) + 1; seen.set(entry.localDate, nth);
    const [, month, day] = entry.localDate.split('-').map(Number);
    return `${MONTHS[month - 1]} ${day}${(totals.get(entry.localDate) || 0) > 1 ? ` · ${nth}` : ''}`;
  });
}
// Daily Grow journals carry a Flower's history. Older servers omit `locked`, so fall back to the linked records.
export function journalLocked(entry: JournalCheckIn) {
  return entry.journal?.locked ?? Boolean(entry.flower || entry.emotionResult);
}
// Months after the owner's current month (in the account timezone) have not arrived yet and stay closed.
// Compared numerically as year * 12 + month. A month or year that already holds a saved journal
// (for example after a timezone or clock difference) is never locked, so saved pages stay reachable.
export function monthLocked(year: number, month: number, today: string, saved = 0) {
  return saved === 0 && year * 12 + month > Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
}
export function yearLocked(year: number, today: string, saved = 0) {
  return saved === 0 && year > Number(today.slice(0, 4));
}
export function defaultShelfYear(years: number[], today: string) {
  const current = Number(today.slice(0, 4));
  return years.includes(current) ? current : years[years.length - 1] ?? current;
}
interface JournalPage { journals: JournalCheckIn[]; nextCursor: string | null }
// Keep the complete-array service contract used by calendar navigation.
export async function readJournals(userId: string, signal?: AbortSignal): Promise<JournalCheckIn[]> {
  const entries: JournalCheckIn[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    if (signal?.aborted) throw new Error('Journal loading cancelled.');
    const page: JournalPage | JournalCheckIn[] = await apiRequest<JournalPage | JournalCheckIn[]>(
      `/users/${encodeURIComponent(userId)}/journals?view=page&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      'GET', undefined, { signal });
    // Older servers ignore view and return the original complete array. Never cap it.
    if (Array.isArray(page) && cursor === null) return page;
    if (Array.isArray(page) || !Array.isArray(page.journals) || page.journals.length > 50
      || (page.nextCursor !== null && (typeof page.nextCursor !== 'string'
        || !/^[A-Za-z0-9_-]{1,768}$/.test(page.nextCursor) || !page.journals.length || seen.has(page.nextCursor)))) {
      throw new Error('Unable to load complete Journal history. Try again.');
    }
    entries.push(...page.journals);
    cursor = page.nextCursor;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return entries;
}
export const savePrivateJournal = (userId: string, content: string) =>
  apiRequest<{ id: string; content: string }>(`/users/${encodeURIComponent(userId)}/journals`, 'POST', { content: content.trim() });

export const updatePrivateJournal = (userId: string, journalId: string, content: string) =>
  apiRequest<{ id: string; content: string }>(`/users/${encodeURIComponent(userId)}/journals/${encodeURIComponent(journalId)}`, 'PATCH', { content: content.trim() });
export const deletePrivateJournal = (userId: string, journalId: string) =>
  apiRequest<{ success: boolean; id: string }>(`/users/${encodeURIComponent(userId)}/journals/${encodeURIComponent(journalId)}`, 'DELETE');

export const readJournalCover = (userId: string, journalId: string) =>
  apiRequest<{ coverImage: string | null }>(`/users/${encodeURIComponent(userId)}/journals/${encodeURIComponent(journalId)}/cover`);
export const saveJournalCover = (userId: string, journalId: string, coverImage: string | null) =>
  apiRequest<{ coverImage: string | null }>(`/users/${encodeURIComponent(userId)}/journals/${encodeURIComponent(journalId)}/cover`, 'PUT', { coverImage });

// ---------- one calendar day in the Treehouse journal ----------
// A day's spread draws on three stores, matched only by the owner's stored local date (YYYY-MM-DD, never
// converted): private journals (the right page), Daily Grow check-ins (flower and mood) and Events (what
// happened, its mood and the flower it grew). Nothing is matched by timestamp, and nothing is inferred.
export interface DailyCheckInRecord {
  id: string; localDate: string;
  journal: { id: string; content: string } | null;
  emotionResult: { label: string; secondaryEmotions?: string[] | null; intensity?: number | null } | null;
  flower: BackendFlower | null;
}
export interface MonthEvent {
  id: string; content: string; localDate: string; occurredAt: string;
  primaryGardenMood: string | null; secondaryEmotions: string[] | null; emotionStatus?: string;
  flower: Pick<BackendFlower, 'id' | 'name' | 'img' | 'mood' | 'speciesCode'> & { meaning?: string | null; createdAt?: string } | null;
}
export const readCheckIns = (userId: string, signal?: AbortSignal) =>
  apiRequest<DailyCheckInRecord[]>(`/users/${encodeURIComponent(userId)}/check-ins`, 'GET', undefined, { signal });
export const readMonthEvents = (userId: string, year: number, month: number, signal?: AbortSignal) =>
  apiRequest<{ events: MonthEvent[] }>(`/users/${encodeURIComponent(userId)}/events?month=${monthKey(year, month)}`, 'GET', undefined, { signal });

export interface JournalDay {
  localDate: string;
  /** Private journals written that day, oldest first (Daily Grow journals included, read-only). */
  journals: JournalCheckIn[];
  checkIns: DailyCheckInRecord[];
  events: MonthEvent[];
}
/** The month's days that hold anything, in date order — plus today (in the account calendar) when it falls in
 *  the month, so there is always a page to write on. Nothing after today. */
export function monthDays(year: number, month: number, journals: JournalCheckIn[], checkIns: DailyCheckInRecord[], events: MonthEvent[], today: string): JournalDay[] {
  const prefix = `${monthKey(year, month)}-`;
  const days = new Map<string, JournalDay>();
  const day = (localDate: string) => {
    if (!days.has(localDate)) days.set(localDate, { localDate, journals: [], checkIns: [], events: [] });
    return days.get(localDate)!;
  };
  for (const entry of monthEntries(journals, year, month)) day(entry.localDate).journals.push(entry);
  for (const record of checkIns) if (record.localDate.startsWith(prefix)) day(record.localDate).checkIns.push(record);
  for (const event of events) if (event.localDate.startsWith(prefix)) day(event.localDate).events.push(event);
  if (today.startsWith(prefix)) day(today);
  return [...days.values()].filter(d => d.localDate <= today || d.journals.length).sort((a, b) => a.localDate.localeCompare(b.localDate));
}
// Secondary emotions are stored as JSON: only plain text labels are shown (anything else in older rows is left out).
function labels(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()) : []; }
export type DayFlower = { id: string; name: string; speciesCode: string; img: string; mood: string; meaning: string | null; source: 'Daily Grow' | 'Event' };
export type DayMood = { label: string; secondary: string[]; source: 'Daily Grow' | 'Event' };
/** The left page's records for a day: the flowers it grew, its Events and the moods that were recorded. */
export function dayRecords(day: JournalDay) {
  const flowers: DayFlower[] = [];
  const seen = new Set<string>();
  const addFlower = (f: { id: string; name: string; speciesCode?: string; img?: string; mood?: string; meaning?: string | null } | null | undefined, source: DayFlower['source']) => {
    if (!f?.id || seen.has(f.id) || typeof f.name !== 'string') return;
    seen.add(f.id);
    flowers.push({ id: f.id, name: f.name, speciesCode: f.speciesCode || '', img: f.img || '', mood: f.mood || '', meaning: f.meaning || null, source });
  };
  for (const record of day.checkIns) addFlower(record.flower, 'Daily Grow');
  for (const entry of day.journals) addFlower(entry.flower, 'Daily Grow');
  for (const event of day.events) addFlower(event.flower, 'Event');
  const moods: DayMood[] = [];
  const checkInMoods = new Map(day.checkIns.map(r => [r.id, r.emotionResult]));
  for (const entry of day.journals) if (entry.emotionResult && !day.checkIns.length) checkInMoods.set(entry.id, entry.emotionResult);
  for (const result of checkInMoods.values()) if (typeof result?.label === 'string' && result.label) moods.push({ label: result.label, secondary: labels(result.secondaryEmotions), source: 'Daily Grow' });
  for (const event of day.events) if (typeof event.primaryGardenMood === 'string' && event.primaryGardenMood) moods.push({ label: event.primaryGardenMood, secondary: labels(event.secondaryEmotions), source: 'Event' });
  return { flowers, events: day.events.map(e => typeof e.content === 'string' ? e.content.trim() : '').filter(Boolean), moods };
}
/** "SUNNY_BLOOM" → "Sunny bloom"; free labels ("calm") → "Calm". */
export function moodTitle(label: string) {
  if (typeof label !== 'string') return '';
  const zh = moodZh(label);
  if (zh) return zh;
  const words = label.toLowerCase().split('_').filter(Boolean);
  if (!words.length) return '';
  return words.map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
}
