import { apiRequest } from './api';
import type { BackendFlower } from './events';

export interface JournalCheckIn {
  id: string; localDate: string; createdAt: string;
  journal: { id: string; content: string } | null;
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

export const readJournalCover = (userId: string, journalId: string) =>
  apiRequest<{ coverImage: string | null }>(`/users/${encodeURIComponent(userId)}/journals/${encodeURIComponent(journalId)}/cover`);
export const saveJournalCover = (userId: string, journalId: string, coverImage: string | null) =>
  apiRequest<{ coverImage: string | null }>(`/users/${encodeURIComponent(userId)}/journals/${encodeURIComponent(journalId)}/cover`, 'PUT', { coverImage });
