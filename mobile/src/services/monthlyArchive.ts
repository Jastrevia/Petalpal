import { ApiError } from './api';
import { MONTH_NAMES } from './bookhouse';
import type { PrimaryMood } from './events';
import { listReflections, MONTHLY_COPY, monthly2, readReflection, shortDate, SHORT_COPY, weekOfMonth, type ReflectionReport, type SavedReport } from './reflections';

// The Treehouse's Monthly Report archive: one extra book per year on the My Journals shelf, after December. It is a
// book of its own kind, never a thirteenth month: it is named by MONTHLY_REPORT_ARCHIVE (and archiveKey), and every
// month number in this file is a real calendar month, 1–12.
//
// Read-only. The Pavilion writes and saves Monthly reports (POST /ai/reports/monthly/trigger); this book lists the saved
// reports (GET /ai/reports, owner from the session) and reads each one (GET /ai/reports/monthly/:id). Nothing is copied
// or stored on the device: the archive is fetched again every time the book is opened.

export const MONTHLY_REPORT_ARCHIVE = 'monthly-report-archive';
/** A book on the My Journals shelf: one of the twelve monthly journals, or the year's Monthly Report archive. */
export type ShelfBookRef = { kind: 'month'; year: number; month: number } | { kind: 'archive'; year: number };
/** The archive's slot key on the shelf (beside the journals' monthKey `YYYY-MM`, which it can never equal). */
export const archiveKey = (year: number) => `${year}-${MONTHLY_REPORT_ARCHIVE}`;

/** A saved Monthly report as GET /ai/reports/monthly/:id returns it (the stored row). */
export type SavedMonthlyReport = ReflectionReport & { periodKey?: string; status?: string; narrativeStatus?: string };
export type ArchiveReport = { month: number; saved: SavedReport; detail: SavedMonthlyReport };
/** `months[m - 1]`: the generated report saved for month m of `year`, or null (that month's bookmark stays locked). */
export type MonthlyArchive = { year: number; months: (ArchiveReport | null)[] };

/** The calendar month (1–12) a Monthly report's periodKey (`YYYY-MM`, account timezone; time.md §4) names in `year`. */
export function reportMonth(periodKey: string, year: number): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match || Number(match[1]) !== year) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? month : null;
}
/** Only a written report unlocks its month: saved rows whose narrative was never generated (or had too little to write
 *  from) stay locked, and a month never unlocks because it has passed. */
export const isGenerated = (detail: { narrativeStatus?: string } | null | undefined) => detail?.narrativeStatus === 'GENERATED';

const PAGE_LIMIT = 50;
const MAX_PAGES = 60;
type ArchiveApi = {
  list: (cursor: string | undefined, signal: AbortSignal | undefined, limit: number) => Promise<{ reports: SavedReport[]; nextCursor: string | null }>;
  read: (report: SavedReport, signal?: AbortSignal) => Promise<ReflectionReport>;
};
/** Every generated Monthly report of `year`, read from the Pavilion's saved reports. Throws when the reports cannot be
 *  read (a failed request is never taken to mean that no report exists). */
export async function loadMonthlyArchive(year: number, signal?: AbortSignal,
  api: ArchiveApi = { list: listReflections, read: readReflection }): Promise<MonthlyArchive> {
  // Saved reports come newest first (Weekly and Monthly together, by period start). Once a page reaches periods that
  // start before this year's 1 January in every timezone, no later page can hold one of its months.
  const floor = Date.UTC(year - 1, 11, 30);
  const found = new Map<number, SavedReport>();
  let cursor: string | undefined;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new Error('Too many saved reports to look through.');
    const { reports, nextCursor } = await api.list(cursor, signal, PAGE_LIMIT);
    for (const report of reports) {
      if (report.type !== 'monthly') continue;
      const month = reportMonth(report.periodKey, year);
      if (month && !found.has(month)) found.set(month, report);
    }
    const last = reports[reports.length - 1];
    if (!nextCursor || !last || Date.parse(last.periodStartUtc) < floor) break;
    cursor = nextCursor;
  }
  const months: (ArchiveReport | null)[] = Array.from({ length: 12 }, () => null);
  await Promise.all([...found].map(async ([month, saved]) => {
    let detail: SavedMonthlyReport;
    try { detail = await api.read(saved, signal) as SavedMonthlyReport; }
    catch (error) {
      // Gone between listing and reading (removed): there is no report for that month. Anything else is a failure.
      if (error instanceof ApiError && error.status === 404) return;
      throw error;
    }
    if (isGenerated(detail)) months[month - 1] = { month, saved, detail };
  }));
  return { year, months };
}

export type ArchiveProblem = { kind: 'consent' | 'failed'; message: string };
export function archiveProblem(error: unknown): ArchiveProblem {
  if (error instanceof ApiError && error.status === 403) {
    return { kind: 'consent', message: 'Monthly Reports are kept with AI memory. Turn AI memory on in your privacy settings to read them here.' };
  }
  return { kind: 'failed', message: 'Your Monthly Reports couldn’t be loaded just now.' };
}

// ---------- the report's content, as the book's pages lay it out ----------
// The same sections, order and wording as the Pavilion's Monthly book (MonthlyReport2 for Monthly 2.0; the Summary,
// Themes and Patterns pages otherwise), as blocks the pages flow and split.
export type ArchiveDay = { date: string; mood: PrimaryMood | null; eventId: string | null };
export type ArchiveCard = { cardId: string; name: string; role: string; headline: string | null };
export type ReportBlock =
  | { type: 'eyebrow'; text: string }
  | { type: 'headline'; text: string }
  | { type: 'section'; text: string }
  | { type: 'label'; text: string }
  | { type: 'text'; text: string; tone?: 'soft' | 'quote' | 'item' | 'center' }
  | { type: 'date'; text: string }
  | { type: 'rule' }
  | { type: 'calendar'; days: ArchiveDay[] }
  | { type: 'cards'; cards: ArchiveCard[] };

const en = MONTHLY_COPY.en, short = SHORT_COPY.en;
export const monthTitle = (month: number, year: number) => `${MONTH_NAMES[month - 1]} ${year}`;
const CARDS_PER_ROW = 3;

/** The report's blocks: Monthly 2.0 when the report is one, otherwise the Pavilion's earlier Summary · Themes · Patterns. */
export function reportBlocks(report: ArchiveReport, year: number): ReportBlock[] {
  const { detail } = report;
  const inProgress = detail.status === 'PARTIAL' || report.saved.status === 'PARTIAL' ? ' · In progress' : '';
  const date = monthTitle(report.month, year) + inProgress;
  const blocks: ReportBlock[] = [];
  const month = monthly2(detail);
  if (month) {
    blocks.push({ type: 'eyebrow', text: date }, { type: 'headline', text: month.headline });
    if (month.garden) {
      const firstEvent = (day: string) => month.garden!.points.find(point => point.date === day)?.eventId ?? null;
      blocks.push({ type: 'section', text: en.garden },
        { type: 'calendar', days: month.garden.dayMoods.map(day => ({ date: day.date, mood: day.mood, eventId: firstEvent(day.date) })) },
        { type: 'text', text: month.garden.claim });
    }
    if (month.spread.length) {
      blocks.push({ type: 'rule' }, { type: 'section', text: en.spread });
      for (let i = 0; i < month.spread.length; i += CARDS_PER_ROW) {
        blocks.push({ type: 'cards', cards: month.spread.slice(i, i + CARDS_PER_ROW)
          .map(card => ({ cardId: card.cardId, name: card.name, role: en.week(weekOfMonth(card.periodKey)), headline: card.headline })) });
      }
    }
    month.changes.forEach(change => {
      blocks.push({ type: 'rule' }, { type: 'section', text: en.change }, { type: 'text', text: change.claim });
      for (const [label, ref] of [[en.lastMonth, change.then], [en.thisMonth, change.now]] as const) {
        blocks.push({ type: 'label', text: label }, { type: 'text', text: `“${ref.text}”`, tone: 'quote' }, { type: 'date', text: shortDate(ref.date, 'en') });
      }
    });
    if (month.threads.length) {
      blocks.push({ type: 'rule' }, { type: 'section', text: en.threads });
      for (const item of month.threads) {
        blocks.push({ type: 'text', text: `“${item.quote.text}”`, tone: 'quote' }, { type: 'text', text: item.line }, { type: 'date', text: shortDate(item.quote.date, 'en') });
      }
    }
    if (month.goods.length) {
      blocks.push({ type: 'rule' }, { type: 'section', text: en.goods });
      for (const item of month.goods) blocks.push({ type: 'text', text: `${item.text}${item.count > 1 ? `  ${en.times(item.count)}` : ''}`, tone: 'item' });
    }
    if (month.people.length) {
      blocks.push({ type: 'rule' }, { type: 'section', text: en.people });
      for (const item of month.people) blocks.push({ type: 'text', text: en.peopleLine(item.word, item.count, item.mood, item.moodCount) });
    }
    if (month.question) blocks.push({ type: 'rule' }, { type: 'section', text: en.question }, { type: 'text', text: month.question });
  } else {
    blocks.push({ type: 'eyebrow', text: date }, { type: 'headline', text: 'Your Monthly Reflection' });
    const sections = Array.isArray(detail.narrativeSections) ? detail.narrativeSections : [];
    const claims = sections.map(section => section?.claim).filter((claim): claim is string => typeof claim === 'string' && !!claim.trim());
    blocks.push({ type: 'text', text: detail.summary || claims.join('\n\n') || 'No written reflection is available for this saved report.' });
    blocks.push({ type: 'rule' }, { type: 'section', text: 'Your Monthly Themes' });
    const topics = Array.isArray(detail.topTopics) ? detail.topTopics : [];
    if (topics.length) for (const item of topics) blocks.push({ type: 'text', text: `❧  ${item.topic} — ${item.count} recorded`, tone: 'item' });
    else blocks.push({ type: 'text', text: 'No themes recorded in this reflection.', tone: 'soft' });
    blocks.push({ type: 'rule' }, { type: 'section', text: 'Notable Patterns' });
    const trend = detail.trendSignals;
    if (trend?.status === 'ok') {
      if (typeof trend.eventCountChange === 'number') {
        blocks.push({ type: 'text', text: `Recorded events: ${trend.eventCountChange > 0 ? '+' : ''}${trend.eventCountChange} compared with the previous month.` });
      }
      for (const item of trend.topicChanges ?? []) blocks.push({ type: 'text', text: `❧  ${item.topic}: ${item.previousCount} → ${item.currentCount}`, tone: 'item' });
    } else blocks.push({ type: 'text', text: 'There isn’t enough recorded evidence to compare periods.', tone: 'soft' });
    // The Pavilion also sets the reflection's closing line beside its Summary when the Summary is its own text.
    if (detail.summary && claims.length) blocks.push({ type: 'rule' }, { type: 'text', text: claims[claims.length - 1], tone: 'soft' });
  }
  const n = detail.eventCount;
  if (typeof n === 'number') blocks.push({ type: 'rule' }, { type: 'date', text: `${n} recorded ${n === 1 ? 'event' : 'events'} · Saved reflection` });
  return blocks;
}
/** Mood names as the Pavilion shows them (for the calendar's accessible text and its key). */
export const moodName = (mood: PrimaryMood) => short.moods[mood];

// ---------- pagination ----------
/** Height of a block on the page (book units), including the space after it. */
export type Measure = (block: ReportBlock) => number;
const KEEP_WITH_NEXT = new Set<ReportBlock['type']>(['eyebrow', 'section', 'label']);
/** Words (and single CJK characters, which wrap anywhere), each with its trailing space: joined, they give back the text. */
export function textPieces(text: string): string[] {
  return text.match(/[⺀-鿿豈-﫿＀-￯]|[^\s⺀-鿿豈-﫿＀-￯]+\s*|\s+/g) ?? [];
}
/** Flows blocks onto pages `room` tall (a number, or each page's own room by its index: a report's first page has no
 *  running head, so it holds a little more). Text continues on the next page from the exact word it stopped at; pictures
 *  (the calendar, a row of cards) and short labels never split, and a heading never ends a page alone. Nothing is ever
 *  dropped: every piece of every block lands on some page. */
export function paginateBlocks(blocks: ReportBlock[], rooms: number | ((page: number) => number), measure: Measure): ReportBlock[][] {
  const pages: ReportBlock[][] = [];
  let page: ReportBlock[] = [], used = 0;
  const roomOf = typeof rooms === 'number' ? () => rooms : rooms;
  let room = roomOf(0);
  const flush = () => { if (page.length) { pages.push(page); page = []; used = 0; room = roomOf(pages.length); } };
  const queue = [...blocks];
  while (queue.length) {
    const block = queue.shift()!;
    const height = measure(block);
    const next = queue[0];
    // A heading keeps at least the first line of what follows it on its page.
    const follow = KEEP_WITH_NEXT.has(block.type) && next
      ? measure(next.type === 'text' ? { ...next, text: textPieces(next.text)[0] ?? '' } : next) : 0;
    // (On a fresh page it goes in even if what follows must wait: there is no better page for it.)
    if (used + height + follow <= room || !page.length && height <= room) {
      page.push(block); used += height;
      continue;
    }
    if (block.type !== 'text' && block.type !== 'headline') {
      // An unsplittable block: on a fresh page (or alone on one, however tall it is).
      if (page.length) { flush(); queue.unshift(block); continue; }
      page.push(block); flush();
      continue;
    }
    // Text (and an unusually long headline): as many whole words as fit here, the rest on the next page.
    const pieces = textPieces(block.text);
    let lo = 0, hi = pieces.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (used + measure({ ...block, text: pieces.slice(0, mid).join('').trimEnd() }) <= room) lo = mid; else hi = mid - 1;
    }
    if (lo === 0) {
      if (page.length) { flush(); queue.unshift(block); continue; }
      lo = 1; // a single word taller than a page: it still goes on its own page
    }
    page.push({ ...block, text: pieces.slice(0, lo).join('').trimEnd() });
    flush();
    const rest = pieces.slice(lo).join('');
    if (rest.trim()) queue.unshift({ ...block, text: rest });
  }
  flush();
  return pages;
}

// ---------- the book's spreads ----------
export type ArchivePage =
  | { kind: 'front' }
  | { kind: 'contents' }
  | { kind: 'report'; month: number; page: number; pages: number; blocks: ReportBlock[] }
  | { kind: 'end'; month: number };
export type ArchiveSpread = { left: ArchivePage; right: ArchivePage; month: number | null };
/** The book: its title and contents first, then each written month in calendar order, starting on a fresh spread
 *  (left page first). `starts[m - 1]`: the spread month m opens at — what its bookmark turns to — or null (locked). */
export function archiveSpreads(paged: (ReportBlock[][] | null)[]): { spreads: ArchiveSpread[]; starts: (number | null)[] } {
  const spreads: ArchiveSpread[] = [{ left: { kind: 'front' }, right: { kind: 'contents' }, month: null }];
  const starts: (number | null)[] = Array.from({ length: 12 }, () => null);
  paged.slice(0, 12).forEach((pages, i) => {
    if (!pages || !pages.length) return;
    const month = i + 1;
    starts[i] = spreads.length;
    const page = (k: number): ArchivePage => pages[k] ? { kind: 'report', month, page: k + 1, pages: pages.length, blocks: pages[k] } : { kind: 'end', month };
    for (let k = 0; k < pages.length; k += 2) spreads.push({ left: page(k), right: page(k + 1), month });
  });
  return { spreads, starts };
}
/** The month a spread belongs to (its bookmark is the highlighted one), or null for the title spread. */
export const spreadMonth = (spreads: ArchiveSpread[], index: number) => spreads[index]?.month ?? null;
