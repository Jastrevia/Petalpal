import { ApiError, apiRequest } from './api';
import { PRIMARY_MOODS, type PrimaryMood } from './events';

export type ReportType = 'weekly' | 'monthly';
export interface MoodPoint { date: string; mood: PrimaryMood; level: number; sourceEventId: string }
export interface ReportSection {
  kind: string; claim: string; contractVersion?: string; locale?: string;
  evidenceRefs?: { sourceEventId: string; sourceMemoryId: string }[]; days?: string[]; points?: MoodPoint[];
  then?: ThenNowSide; now?: ThenNowSide; count?: number | null; phrase?: string | null;
  cardId?: string; name?: string; line?: string; text?: string; fact?: string | null; disclaimer?: string; reason?: string;
  type?: string; role?: string; items?: { text: string; sourceEventId: string; date?: string }[];
  quote?: { text: string; sourceEventId: string; date?: string } | null; evidence?: { sourceEventId: string; date: string }[];
  reportVersion?: string; feedback?: string;
  subject?: string | null; word?: string; question?: string; writtenOn?: string;
}
export interface ThenNowSide { sourceEventId: string; date: string; quote: string }
export interface SavedReport {
  id: string; type: ReportType; periodKey: string; periodStartUtc: string;
  periodEndUtc: string; createdAt: string; status: string;
}
export interface ReflectionReport {
  id: string; summary: string | null; eventCount: number;
  topTopics: { topic: string; count: number }[];
  narrativeSections: ReportSection[];
  trendSignals: { status?: string; eventCountChange?: number;
    topicChanges?: { topic: string; currentCount: number; previousCount: number; change: number }[] };
}
export interface WeeklyTriggerResult {
  periodKey: string; execution: string;
  job: { status: string } | null;
  report: { id: string; periodKey: string; narrativeStatus: string } | null;
}
export const listReflections = (cursor?: string, signal?: AbortSignal) =>
  apiRequest<{ reports: SavedReport[]; nextCursor: string | null }>(`/ai/reports?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, { signal });
export const readReflection = (report: SavedReport, signal?: AbortSignal) =>
  apiRequest<ReflectionReport>(`/ai/reports/${report.type}/${encodeURIComponent(report.id)}`, 'GET', undefined, { signal });
// An empty body lets the server pick the most recent closed week in the owner's timezone,
// so an open week is never targeted. One job per owner and week: repeat presses are safe.
export const createLastWeekReflection = (signal?: AbortSignal) =>
  apiRequest<WeeklyTriggerResult>('/ai/reports/weekly/trigger', 'POST', {}, { signal });
// Same contract for Monthly: the server picks the most recent closed month, one job per month.
export const createLastMonthReflection = (signal?: AbortSignal) =>
  apiRequest<WeeklyTriggerResult>('/ai/reports/monthly/trigger', 'POST', {}, { signal });

// Weekly periodKey is the local Monday (YYYY-MM-DD) of a Monday-Sunday week: the newest week that may be written,
// this week from Sunday 23:59 (as the server's trigger, time.md §3), else last week.
export function lastClosedWeekKey(now = new Date()) {
  const offset = (now.getDay() + 6) % 7, ready = now.getDay() === 0 && now.getHours() * 60 + now.getMinutes() >= 23 * 60 + 59;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset - (ready ? 0 : 7));
  return [monday.getFullYear(), monday.getMonth() + 1, monday.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-');
}
// Monthly periodKey is the previous calendar month (YYYY-MM).
export function lastClosedMonthKey(now = new Date()) {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
}
// "October · Week 2" (the Monday's week of its month) and "Oct 12 – 18" for a Weekly periodKey.
export function weekLabel(periodKey: string, lang: ShortLocale = 'en') {
  const match = periodKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { title: periodKey, chip: periodKey, range: '' };
  const [year, month, day] = match.slice(1).map(Number), start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 6));
  const week = Math.ceil(day / 7), sameMonth = end.getUTCMonth() === start.getUTCMonth();
  if (lang === 'zh-Hans') {
    const title = `${month}月 · 第${week}周`;
    return { title, chip: title, range: `${month}月${day}日 – ${sameMonth ? '' : `${end.getUTCMonth() + 1}月`}${end.getUTCDate()}日` };
  }
  const name = (date: Date, style: 'long' | 'short') => date.toLocaleDateString('en-US', { month: style, timeZone: 'UTC' });
  return { title: `${name(start, 'long')} · Week ${week}`, chip: `${name(start, 'short')} · Week ${week}`,
    range: `${name(start, 'short')} ${day} – ${sameMonth ? '' : `${name(end, 'short')} `}${end.getUTCDate()}` };
}

export type WeeklyTriggerOutcome = {
  kind: 'ready' | 'empty' | 'pending' | 'consent' | 'paused' | 'failed'; message: string; periodKey?: string;
};
export function weeklyTriggerOutcome(result?: WeeklyTriggerResult, error?: unknown, period: 'week' | 'month' = 'week',
  lang: ShortLocale = 'en'): WeeklyTriggerOutcome {
  const zh = lang === 'zh-Hans', last = zh ? (period === 'week' ? '上周的周报' : '上个月的月报') : `Last ${period}’s reflection`;
  if (error) {
    const status = error instanceof ApiError ? error.status : 0;
    if (status === 403) return { kind: 'consent', message: zh ? '在隐私设置里打开 AI 记忆后，才能写回看。' : 'Turn on AI memory in your privacy settings to create reflections.' };
    if ([409, 429, 503].includes(status)) return { kind: 'paused', message: zh ? '回看暂时休息一下，请稍后再试。' : 'Reflections are taking a short break. Please try again later.' };
    if (status === 502) return { kind: 'failed', message: zh ? `${last}没能写出来。` : `${last} couldn’t be written.` };
    const message = (error as { message?: unknown }).message;
    // The server's own message is English; Chinese readers get ours.
    return { kind: 'failed', message: zh ? `${last}没能写出来。` : typeof message === 'string' && message ? message : `Unable to create last ${period}’s reflection.` };
  }
  const periodKey = result?.periodKey;
  if (result?.report?.narrativeStatus === 'GENERATED') return { kind: 'ready', message: zh ? `${last}写好了。` : `${last} is ready.`, periodKey };
  if (result?.job?.status === 'SUCCEEDED') {
    return { kind: 'empty', message: zh ? `上${period === 'week' ? '周' : '个月'}的记录还不够写一篇回看。` : `Last ${period} didn’t have enough moments for a written reflection.`, periodKey };
  }
  return { kind: 'pending', message: zh ? `${last}正在写，过几分钟再来看看。` : `${last} is being written. Check back in a few minutes.`, periodKey };
}

// Short Weekly report (backend contract weekly-short-v1). Only a report whose every
// section carries that contract renders this way; older reports keep the plain Summary.
export const WEEKLY_SHORT = 'weekly-short-v1';
export type ShortLocale = 'en' | 'zh-Hans';
export interface ShortWeekly {
  locale: ShortLocale;
  line: { text: string; eventId: string } | null;
  curve: { claim: string; days: string[]; points: MoodPoint[] } | null;
  side: string | null; question: string | null; support: string | null;
  thenAndNow: { then: ThenNowSide; now: ThenNowSide; count: number | null; phrase: string | null } | null;
  card: PetalCard | null;
  // Weekly 2.0 (backend lib/insight-write.js, saved under the v1 contract): headline + insight cards.
  // `version2` marks a 2.0 report (its HEADLINE says so): it opens with the bud and shows the bouquet.
  headline: string | null; insights: { main: Insight; secondary: Insight[] } | null; version2: boolean;
  // Weekly 2.0 闭环 (backend lib/insight-loop.js), all code-written: threads the owner follows, their answer to an
  // earlier question, letters due this week and, for a short week, the real threshold. `cardIndex` names the card to keep.
  threads: { word: string; count: number; claim: string; evidence: { eventId: string; date: string }[] }[];
  answer: { question: string; quote: { text: string; eventId: string; date: string } } | null;
  letters: { text: string; writtenOn: string | null }[]; unlock: string | null; cardIndex: number | null;
}
export interface PetalCard { id: string; name: string; line: string; text: string; fact: string; disclaimer: string; reason: string | null }
// TREND is Weekly 2.0's code-written fallback (backend lib/insight-compute.js).
export type InsightType = 'HIDDEN_LINK' | 'SAID_BEFORE' | 'SMALL_GOODS' | 'OPEN_QUESTION' | 'TREND' | 'ECHO' | 'FIRST_TIME' | 'BODY_SIGNAL' | 'RHYTHM' | 'SELF_TALK';
export type InsightFeedback = 'INACCURATE' | 'HIDDEN';
export interface Insight {
  // `index` is the section's place in the saved report, which the feedback call names.
  index: number; feedback: InsightFeedback | null;
  // The word a thread follows (跟进); null for types without one (small goods, trend, echo).
  subject: string | null;
  type: InsightType; text: string; fact: string | null;
  items: { text: string; eventId: string }[]; quote: { text: string; eventId: string } | null;
  evidence: { eventId: string; date: string }[];
}
export function shortWeekly(report: Pick<ReflectionReport, 'narrativeSections'>): ShortWeekly | null {
  const sections = Array.isArray(report.narrativeSections) ? report.narrativeSections : [];
  if (!sections.length || sections.some(section => section?.contractVersion !== WEEKLY_SHORT)) return null;
  const find = (kind: string) => sections.find(section => section.kind === kind && typeof section.claim === 'string' && section.claim.trim());
  const line = find('LINE_OF_WEEK'), curve = find('MOOD_CURVE'), eventId = line?.evidenceRefs?.[0]?.sourceEventId;
  const days = Array.isArray(curve?.days) && curve.days.length === 7 ? curve.days : null;
  const points = days && Array.isArray(curve?.points) ? curve.points.filter(point => days.includes(point.date) &&
    PRIMARY_MOODS.includes(point.mood) && [1, 2, 3].includes(point.level)) : [];
  return { locale: sections[0].locale === 'zh-Hans' ? 'zh-Hans' : 'en',
    line: line && eventId ? { text: line.claim, eventId } : null,
    curve: curve && days && points.length ? { claim: curve.claim, days, points } : null,
    side: find('SIDE_BY_SIDE')?.claim ?? null, question: find('QUESTION')?.claim ?? null, support: find('SUPPORT_RESOURCES')?.claim ?? null,
    thenAndNow: thenNow(find('THEN_AND_NOW')), card: petalCard(find('PETAL_CARD')), ...insightsOf(sections), ...loopOf(sections) };
}
function loopOf(sections: ReportSection[]) {
  const of = (kind: string) => sections.filter(section => section?.kind === kind && filled(section.claim));
  const threads = of('THREAD').filter(section => filled(section.word) && Number.isInteger(section.count) && Array.isArray(section.evidence))
    .map(section => ({ word: section.word!, count: section.count!, claim: section.claim,
      evidence: section.evidence!.filter(item => filled(item?.sourceEventId) && DATE.test(item?.date ?? '')).map(item => ({ eventId: item.sourceEventId, date: item.date })) }));
  const answered = of('ANSWER').find(section => filled(section.question) && filled(section.quote?.text) && filled(section.quote?.sourceEventId) && DATE.test(section.quote?.date ?? ''));
  const card = sections.findIndex(section => section?.kind === 'PETAL_CARD');
  return { threads,
    answer: answered ? { question: answered.question!, quote: { text: answered.quote!.text!, eventId: answered.quote!.sourceEventId!, date: answered.quote!.date! } } : null,
    letters: of('LETTER').filter(section => filled(section.text)).map(section => ({ text: section.text!, writtenOn: DATE.test(section.writtenOn ?? '') ? section.writtenOn! : null })),
    unlock: of('UNLOCK')[0]?.claim ?? null, cardIndex: card >= 0 ? card : null };
}
const INSIGHT_TYPES: InsightType[] = ['HIDDEN_LINK', 'SAID_BEFORE', 'SMALL_GOODS', 'OPEN_QUESTION', 'TREND', 'ECHO', 'FIRST_TIME', 'BODY_SIGNAL', 'RHYTHM', 'SELF_TALK'];
const filled = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const spanOf = (value?: { text?: unknown; sourceEventId?: unknown } | null) =>
  value && filled(value.text) && filled(value.sourceEventId) ? { text: value.text, eventId: value.sourceEventId } : null;
// A malformed insight is skipped; without a valid main insight no insight shows, and no headline unless it is a
// Weekly 2.0 one (reportVersion weekly-2.0: always saved, e.g. "这周的花还在长" for a week with few entries).
function insight(section: ReportSection, index: number): Insight | null {
  if (!INSIGHT_TYPES.includes(section.type as InsightType) || !filled(section.text) || !Array.isArray(section.evidence)) return null;
  const evidence = section.evidence.filter(item => filled(item?.sourceEventId) && DATE.test(item?.date ?? ''))
    .map(item => ({ eventId: item.sourceEventId, date: item.date }));
  const items = (Array.isArray(section.items) ? section.items : []).map(spanOf).filter(item => item !== null);
  if (!evidence.length || (section.type === 'SMALL_GOODS' && items.length < 2)) return null;
  const feedback = section.feedback === 'INACCURATE' || section.feedback === 'HIDDEN' ? section.feedback : null;
  return { index, feedback, subject: filled(section.subject) ? section.subject : null, type: section.type as InsightType, text: section.text, fact: filled(section.fact) ? section.fact : null, items,
    quote: spanOf(section.quote), evidence };
}
function insightsOf(sections: ReportSection[]) {
  const cards = sections.map((section, index) => ({ section, index })).filter(({ section }) => section?.kind === 'INSIGHT');
  const main = cards.find(({ section }) => section.role === 'main'), headline = sections.find(section => section?.kind === 'HEADLINE');
  const version2 = headline?.reportVersion === 'weekly-2.0';
  const first = main && insight(main.section, main.index);
  if (!first) return { headline: version2 && filled(headline.claim) ? headline.claim : null, insights: null, version2 };
  const secondary = cards.filter(({ section }) => section.role === 'secondary').map(({ section, index }) => insight(section, index))
    .filter(item => item !== null).slice(0, 3);
  return { headline: filled(headline?.claim) ? headline.claim : null, insights: { main: first, secondary }, version2 };
}
// Matched on the backend; every field must be present or the card is not shown.
function petalCard(section?: ReportSection): PetalCard | null {
  const fields = section && [section.cardId, section.name, section.line, section.text, section.fact, section.disclaimer];
  if (!fields || !fields.every(value => typeof value === 'string' && value.trim())) return null;
  const [id, name, line, text, fact, disclaimer] = fields as string[];
  return { id, name, line, text, fact, disclaimer, reason: filled(section!.reason) ? section!.reason : null };
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sideOk = (side?: ThenNowSide) => !!side && DATE.test(side.date) && typeof side.quote === 'string' && !!side.quote.trim() && typeof side.sourceEventId === 'string';
function thenNow(section?: ReportSection) {
  if (!section || !sideOk(section.then) || !sideOk(section.now)) return null;
  const count = Number.isInteger(section.count) && section.phrase ? section.count! : null;
  return { then: section.then!, now: section.now!, count, phrase: count ? section.phrase! : null };
}
// "Sep 21" / "9月21日" from an account-timezone local date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(date: string, locale: ShortLocale) {
  const [, month, day] = date.split('-').map(Number);
  return locale === 'en' ? `${MONTHS[month - 1]} ${day}` : `${month}月${day}日`;
}
export function thenNowCount(count: number, phrase: string, locale: ShortLocale) {
  return locale === 'en' ? `“${phrase}” appears in ${count} of your entries over the past five weeks.` : `过去五周里，你有 ${count} 条记录写到“${phrase}”。`;
}

// Seven columns, Monday first; level 3 at the top. Several Events on one day sit side by side,
// at most `gap` apart and never wider than their column.
export function moodCurveLayout(days: string[], points: MoodPoint[], width: number, height: number, pad = 12, gap = 14) {
  const column = width / 7, perDay = new Map<string, number>(), seen = new Map<string, number>();
  for (const point of points) perDay.set(point.date, (perDay.get(point.date) ?? 0) + 1);
  const dots = points.map(point => {
    const count = perDay.get(point.date) ?? 1, nth = seen.get(point.date) ?? 0, spread = Math.min(column / count, gap);
    seen.set(point.date, nth + 1);
    return { ...point, x: (days.indexOf(point.date) + .5) * column + (nth - (count - 1) / 2) * spread,
      y: pad + (3 - point.level) * (height - 2 * pad) / 2 };
  });
  const segments = dots.slice(1).map((to, i) => {
    const from = dots[i], length = Math.hypot(to.x - from.x, to.y - from.y);
    return { left: (from.x + to.x) / 2 - length / 2, top: (from.y + to.y) / 2, length, angle: Math.atan2(to.y - from.y, to.x - from.x) };
  });
  return { dots, segments };
}
export const moodIcon = (mood: PrimaryMood) => PRIMARY_MOODS.indexOf(mood) + 1; // EventIllustration index, as in EventsPanel

// Weekly 2.0 "不准确 / 隐藏" on one insight of the owner's own report; null clears the mark.
export const setInsightFeedback = (reportId: string, index: number, verdict: InsightFeedback | null) =>
  apiRequest<{ narrativeSections: ReportSection[] }>(`/ai/reports/weekly/${encodeURIComponent(reportId)}/insights/${index}/feedback`, 'POST', { verdict });

// ---- Weekly 2.0 闭环 (backend lib/insight-loop.js). Owner comes from the session; every call needs Memory on. ----
const weeklyPath = (reportId: string) => `/ai/reports/weekly/${encodeURIComponent(reportId)}`;
// 花语集: keep (or let go of) one insight or petal card section of the owner's report.
export const keepSection = (reportId: string, index: number, kept: boolean) =>
  apiRequest<{ kept: boolean }>(`${weeklyPath(reportId)}/insights/${index}/keep`, 'POST', { kept });
// 跟进: the insight's subject becomes a thread (at most three; a fourth is a 409 INSIGHT_LOOP_LIMIT).
export const followInsight = (reportId: string, index: number) =>
  apiRequest<{ id: string; word: string }>(`${weeklyPath(reportId)}/insights/${index}/follow`, 'POST', {});
export const unfollowThread = (threadId: string) => apiRequest<boolean>(`/ai/insight-threads/${encodeURIComponent(threadId)}`, 'DELETE');
export const answerQuestion = (reportId: string, eventId: string) =>
  apiRequest<{ answered: boolean }>(`${weeklyPath(reportId)}/answer`, 'POST', { eventId });
export const writeLetter = (text: string, deliverOn: string) =>
  apiRequest<{ id: string; text: string; deliverOn: string }>('/ai/future-letters', 'POST', { text, deliverOn });
export const withdrawLetter = (letterId: string) => apiRequest<boolean>(`/ai/future-letters/${encodeURIComponent(letterId)}`, 'DELETE');
export const setMute = (word: string, muted: boolean) => apiRequest<{ word: string; muted: boolean }>('/ai/insight-mutes', 'PUT', { word, muted });
export interface PetalCollection {
  cards: { cardId: string; name: string; line: string; kept: boolean; appearances: { reportId: string; periodKey: string; reason: string | null }[] }[];
  insights: { reportId: string; periodKey: string; index: number; type: InsightType; text: string;
    items: { text: string }[]; quote: { text: string } | null }[];
  threads: { id: string; word: string; insightType: string; createdAt: string }[];
  letters: { id: string; text: string; deliverOn: string; createdAt: string; delivered: boolean }[];
  mutes: string[]; today: string;
}
export const loadCollection = (signal?: AbortSignal) => apiRequest<PetalCollection>('/ai/insight-collection', 'GET', undefined, { signal });

// The bouquet: every Event of the week is one flower in its day's column, never higher or lower by mood. One or two
// flowers on a day stand side by side; more stand in rows of up to three, each row behind a little higher and smaller,
// so every flower shows however many Events the day has. `lift` is how far a back row stands above the ground line.
export function bouquetLayout(days: string[], points: MoodPoint[], width: number, size: number) {
  const column = width / 7, perDay = new Map<string, number>(), seen = new Map<string, number>();
  for (const point of points) perDay.set(point.date, (perDay.get(point.date) ?? 0) + 1);
  return points.filter(point => days.includes(point.date)).map(point => {
    const count = perDay.get(point.date) ?? 1, nth = seen.get(point.date) ?? 0;
    seen.set(point.date, nth + 1);
    const perRow = count <= 2 ? count : 3, rows = Math.ceil(count / perRow);
    // The front row is the newest; earlier Events of the day stand behind.
    const row = rows - 1 - Math.floor(nth / perRow), place = nth % perRow, inRow = Math.min(perRow, count - Math.floor(nth / perRow) * perRow);
    const flower = Math.round(size * (count <= 2 ? 1 : .78) * (1 - row * .1)), step = Math.min(flower * .55, column / perRow);
    const x = (days.indexOf(point.date) + .5) * column + (place - (inRow - 1) / 2) * step - flower / 2;
    return { ...point, x: Math.max(0, Math.min(width - flower, x)), size: flower, lift: Math.round(row * size * .34), row };
  });
}
// A flower for an Event whose own flower is not known here (not planted, deleted, or not loaded): one
// painted species per mood, chosen for its colour only.
export const MOOD_SPECIES: Record<PrimaryMood, string> = { SUNNY_BLOOM: 'SUNFLOWER', GENTLE_BLOOM: 'PETUNIA', QUIET_BLOOM: 'BLUEBELL',
  HEALING_BLOOM: 'CHAMOMILE', FIRE_BLOOM: 'POPPY', WONDER_BLOOM: 'ASTER', DRIFTING_BLOOM: 'LAVENDER', PEACEFUL_BLOOM: 'WHITE_ROSE' };

export type ShortCopy = (typeof SHORT_COPY)[ShortLocale];
export const SHORT_COPY = {
  en: { line: 'Line of the week', curve: 'Your week in moods', side: 'Side by side', thenNow: 'Then and now', then: 'Then', now: 'Now',
    question: 'A question for you', card: 'Petal card', more: 'Also this week', whyCard: 'Why this card',
    bouquet: 'This week’s bouquet',
    oneMore: 'One more thing', inaccurate: 'Not right', hide: 'Hide', hidden: 'Hidden.', thanks: 'Thank you — noted, and hidden.',
    undo: 'Show again', feedbackFailed: 'That didn’t save. Try again in a moment.', answer: 'Write an entry to answer',
    keep: 'Keep', kept: 'Kept', follow: 'Follow', following: 'Following', threadLimit: 'You already follow three threads. Let one go in the Petal collection first.',
    threads: 'Threads you follow', answered: 'Your answer', letter: 'A letter from you', letterFrom: (date: string) => `Written on ${date}`,
    types: { SAID_BEFORE: 'Something you said', HIDDEN_LINK: 'A quiet link', SMALL_GOODS: 'Small good things',
      OPEN_QUESTION: 'A question still open', TREND: 'How the week turned', ECHO: 'An echo', FIRST_TIME: 'A first time',
      BODY_SIGNAL: 'What your body said', RHYTHM: 'A rhythm', SELF_TALK: 'Words that came back' },
    // The names the Events screen shows when a mood is chosen.
    moods: { SUNNY_BLOOM: 'Sunny', GENTLE_BLOOM: 'Gentle', QUIET_BLOOM: 'Quiet', HEALING_BLOOM: 'Healing', FIRE_BLOOM: 'Fire',
      WONDER_BLOOM: 'Wonder', DRIFTING_BLOOM: 'Drifting', PEACEFUL_BLOOM: 'Peaceful' }, moodChart: 'Moods this week', pageOf: 'Page', page: 'Insight', previousCard: 'Previous', nextCard: 'Next',
    write: 'Write about it', open: 'Show the whole moment', close: 'Hide', loading: 'Opening…',
    unavailable: 'This moment can’t be opened right now.', support: 'Support', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
  'zh-Hans': { line: '本周一句', curve: '这周的心情', side: '两件事并排', thenNow: '那时与现在', then: '那时', now: '现在',
    question: '留给你的问题', card: '花语卡', more: '这周还有', whyCard: '为什么是这张',
    bouquet: '本周花束',
    oneMore: '还有一件事', inaccurate: '不准确', hide: '隐藏', hidden: '已隐藏。', thanks: '谢谢，已记下，这条先收起来。',
    undo: '重新显示', feedbackFailed: '没有保存成功，稍后再试。', answer: '写一条来回答',
    keep: '收藏', kept: '已收藏', follow: '跟进', following: '跟进中', threadLimit: '你已经在跟进 3 条线了，先在花语集里放下一条。',
    threads: '你在跟进的线', answered: '你的回答', letter: '你写给自己的信', letterFrom: (date: string) => `写于${date}`,
    types: { SAID_BEFORE: '说过的话', HIDDEN_LINK: '隐藏关联', SMALL_GOODS: '好事清单', OPEN_QUESTION: '没回答的问题', TREND: '走向', ECHO: '时间回声',
      FIRST_TIME: '第一次', BODY_SIGNAL: '身体信号', RHYTHM: '节律', SELF_TALK: '反复的句式' },
    moods: { SUNNY_BLOOM: '开心', GENTLE_BLOOM: '温柔', QUIET_BLOOM: '低落', HEALING_BLOOM: '治愈', FIRE_BLOOM: '愤怒',
      WONDER_BLOOM: '好奇', DRIFTING_BLOOM: '迷茫', PEACEFUL_BLOOM: '平静' }, moodChart: '这周的心情', pageOf: '页',
    page: '洞察', previousCard: '上一条', nextCard: '下一条',
    write: '写一写', open: '看完整记录', close: '收起', loading: '正在打开…',
    unavailable: '现在打不开这条记录。', support: '支持', days: ['一', '二', '三', '四', '五', '六', '日'] },
} as const;
