import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

// The Treehouse's Monthly Report archive (services/monthlyArchive.ts): synthetic, isolated fixtures only.
const load = loadPlantingModules();
const archive = load('../../../services/monthlyArchive');
const { ApiError } = load('../../../services/api');
const { reportMonth, isGenerated, loadMonthlyArchive, archiveProblem, reportBlocks, paginateBlocks, textPieces, archiveSpreads, archiveKey, MONTHLY_REPORT_ARCHIVE } = archive;

const saved = (type, periodKey, start, id = `${type}-${periodKey}`) => ({ id, type, periodKey, periodStartUtc: start, periodEndUtc: start, createdAt: start, status: 'COMPLETE' });
// Newest first, Weekly and Monthly together, as GET /ai/reports returns them.
const ROWS = [
  saved('weekly', '2026-10-26', '2026-10-26T07:00:00.000Z'),
  saved('monthly', '2026-10', '2026-10-01T07:00:00.000Z'),
  saved('monthly', '2026-07', '2026-07-01T07:00:00.000Z'),
  saved('weekly', '2026-06-01', '2026-06-01T07:00:00.000Z'),
  saved('monthly', '2026-05', '2026-05-01T07:00:00.000Z'),
  saved('monthly', '2026-03', '2026-03-01T08:00:00.000Z'),
  saved('monthly', '2026-01', '2025-12-31T16:00:00.000Z'), // January in UTC+8 starts on 31 December, UTC
  saved('monthly', '2025-12', '2025-12-01T08:00:00.000Z'),
  saved('monthly', '2025-04', '2025-04-01T07:00:00.000Z'),
  saved('monthly', '2024-02', '2024-02-01T08:00:00.000Z'),
];
const NARRATIVE = { '2026-10': 'GENERATED', '2026-07': 'NOT_GENERATED', '2026-05': 'INSUFFICIENT_EVIDENCE', '2026-03': 'GENERATED', '2026-01': 'GENERATED',
  '2025-12': 'GENERATED', '2025-04': 'GENERATED', '2024-02': 'GENERATED' };
function fakeApi({ pageSize = 3, failList = false, failRead = null, missing = null } = {}) {
  const calls = { list: 0, read: [] };
  return { calls, api: {
    list: async (cursor) => {
      calls.list++;
      if (failList) throw new ApiError('Unable to load saved reports', 500);
      const from = cursor ? Number(cursor) : 0;
      const reports = ROWS.slice(from, from + pageSize);
      return { reports, nextCursor: from + pageSize < ROWS.length ? String(from + pageSize) : null };
    },
    read: async (report) => {
      calls.read.push(report.periodKey);
      if (report.periodKey === failRead) throw new ApiError('Server error', 500);
      if (report.periodKey === missing) throw new ApiError('AI report not found', 404);
      return { id: report.id, periodKey: report.periodKey, status: 'COMPLETE', narrativeStatus: NARRATIVE[report.periodKey], summary: `Summary ${report.periodKey}`,
        eventCount: 4, topTopics: [], narrativeSections: [], trendSignals: {} };
    },
  } };
}
// Values built inside the test VM are compared as plain data.
const plain = value => JSON.parse(JSON.stringify(value));
const unlocked = result => plain(result.months.map((entry, i) => entry ? i + 1 : null).filter(Boolean));

test('the archive is its own book, never a thirteenth month', () => {
  assert.equal(MONTHLY_REPORT_ARCHIVE, 'monthly-report-archive');
  assert.equal(archiveKey(2026), '2026-monthly-report-archive');
  assert.notEqual(archiveKey(2026), '2026-13');
  assert.equal(reportMonth('2026-13', 2026), null);
  assert.equal(reportMonth('2026-00', 2026), null);
  assert.equal(reportMonth('2026-03', 2026), 3);
  assert.equal(reportMonth('2026-12', 2026), 12);
  assert.equal(reportMonth('2025-03', 2026), null);
  assert.equal(reportMonth('2026-03-02', 2026), null, 'a Weekly periodKey is not a month');
});

test('only a saved, generated report unlocks its month; a passed month alone does not', async () => {
  assert.equal(isGenerated({ narrativeStatus: 'GENERATED' }), true);
  for (const status of ['NOT_GENERATED', 'INSUFFICIENT_EVIDENCE', undefined]) assert.equal(isGenerated({ narrativeStatus: status }), false);
  const { api } = fakeApi();
  const result = await loadMonthlyArchive(2026, undefined, api);
  assert.equal(result.months.length, 12);
  assert.deepEqual(unlocked(result), [1, 3, 10]);
  assert.equal(result.months[2].detail.summary, 'Summary 2026-03');
});

test('each year reads only its own reports', async () => {
  const { api } = fakeApi();
  assert.deepEqual(unlocked(await loadMonthlyArchive(2025, undefined, api)), [4, 12]);
  assert.deepEqual(unlocked(await loadMonthlyArchive(2024, undefined, api)), [2]);
  assert.deepEqual(unlocked(await loadMonthlyArchive(2027, undefined, api)), []);
  // January in UTC+8 starts on 31 December UTC; its periodKey still puts it in 2026, never in 2025.
  assert.ok(!unlocked(await loadMonthlyArchive(2025, undefined, api)).includes(1));
});

test('paging stops once the saved reports are older than the year', async () => {
  const { api, calls } = fakeApi({ pageSize: 3 });
  await loadMonthlyArchive(2026, undefined, api);
  // Rows 0–8 hold everything up to 2025-04; the page holding 2025-12 (start before 2026) ends the search.
  assert.ok(calls.list <= 3, `read ${calls.list} pages`);
  assert.deepEqual(calls.read.sort(), ['2026-01', '2026-03', '2026-05', '2026-07', '2026-10']);
});

test('a failed request is an error, never an empty archive', async () => {
  await assert.rejects(loadMonthlyArchive(2026, undefined, fakeApi({ failList: true }).api));
  await assert.rejects(loadMonthlyArchive(2026, undefined, fakeApi({ failRead: '2026-03' }).api));
  // A report removed between listing and reading simply is not there.
  assert.deepEqual(unlocked(await loadMonthlyArchive(2026, undefined, fakeApi({ missing: '2026-03' }).api)), [1, 10]);
  assert.equal(archiveProblem(new ApiError('AI processing is not currently authorized', 403)).kind, 'consent');
  assert.equal(archiveProblem(new ApiError('boom', 500)).kind, 'failed');
  assert.equal(archiveProblem(new TypeError('Network request failed')).kind, 'failed');
});

// ---------- content ----------
const MONTHLY_2 = {
  id: 'r', periodKey: '2026-03', status: 'COMPLETE', narrativeStatus: 'GENERATED', summary: null, eventCount: 9, topTopics: [], trendSignals: {},
  narrativeSections: [
    { kind: 'MONTH_HEADLINE', reportVersion: 'monthly-2.0', claim: 'March was a month of small returns.' },
    { kind: 'MONTH_GARDEN', claim: 'Twelve days held an entry.', days: ['2026-03-01', '2026-03-02'],
      dayMoods: [{ date: '2026-03-01', mood: 'SUNNY_BLOOM' }, { date: '2026-03-02', mood: null }],
      points: [{ date: '2026-03-01', mood: 'SUNNY_BLOOM', sourceEventId: 'e1' }] },
    { kind: 'MONTH_SPREAD', cards: [{ periodKey: '2026-03-02', cardId: 'c1', name: 'The Gardener', line: 'x', headline: 'Tending', role: 'start' },
      { periodKey: '2026-03-09', cardId: 'c2', name: 'The Lantern', role: 'turn' }, { periodKey: '2026-03-16', cardId: 'c3', name: 'The Bridge', role: 'turn' },
      { periodKey: '2026-03-23', cardId: 'c4', name: 'The Well', role: 'now' }] },
    { kind: 'MONTH_CHANGE', word: 'work', claim: 'Work sounded lighter.', then: { quote: 'Too much', date: '2026-02-03', sourceEventId: 'a' }, now: { quote: 'Enough', date: '2026-03-20', sourceEventId: 'b' } },
    { kind: 'MONTH_THREADS', items: [{ type: 'T', keyword: 'sleep', count: 3, line: 'Sleep came up three times.', quote: { text: 'Slept well', date: '2026-03-04', sourceEventId: 'c' } }] },
    { kind: 'MONTH_GOODS', items: [{ text: 'Tea with Mum', count: 2, date: '2026-03-05', sourceEventId: 'd' }] },
    { kind: 'MONTH_PEOPLE', people: [{ word: 'Mum', count: 3, mood: 'Gentle', moodCount: 2 }] },
    { kind: 'MONTH_QUESTION', claim: 'What would make April gentler?' },
  ],
};
const entry = (detail, month = 3) => ({ month, saved: saved('monthly', detail.periodKey, '2026-03-01T08:00:00.000Z'), detail });
const texts = blocks => plain(blocks.filter(b => 'text' in b).map(b => b.text));

test('a Monthly 2.0 report keeps every section of the Pavilion, in its order', () => {
  const blocks = reportBlocks(entry(MONTHLY_2), 2026);
  const all = texts(blocks);
  const order = ['March 2026', 'March was a month of small returns.', 'This month’s garden', 'Twelve days held an entry.', 'This month’s spread', 'What changed',
    'Work sounded lighter.', 'Last month', '“Too much”', 'This month', '“Enough”', 'Threads this month', '“Slept well”', 'Sleep came up three times.',
    'Small good things', 'Tea with Mum  ×2', 'People this month', '“Mum” · 3 entries · Gentle 2', 'A question for next month', 'What would make April gentler?',
    '9 recorded events · Saved reflection'];
  let at = -1;
  for (const text of order) { const i = all.indexOf(text, at + 1); assert.ok(i > at, `${text} in order`); at = i; }
  const calendar = blocks.find(b => b.type === 'calendar');
  assert.deepEqual(plain(calendar.days), [{ date: '2026-03-01', mood: 'SUNNY_BLOOM', eventId: 'e1' }, { date: '2026-03-02', mood: null, eventId: null }]);
  // Four weekly cards: rows of at most three, every card kept.
  const rows = blocks.filter(b => b.type === 'cards');
  assert.deepEqual(plain(rows.map(r => r.cards.length)), [3, 1]);
  assert.deepEqual(plain(rows.flatMap(r => r.cards.map(c => `${c.role}:${c.name}:${c.headline}`))), ['Start:The Gardener:Tending', 'Turn:The Lantern:null', 'Turn:The Bridge:null', 'Now:The Well:null']);
});

test('an earlier report keeps its Summary, Themes and Patterns', () => {
  const blocks = reportBlocks(entry({ id: 'l', periodKey: '2026-03', status: 'PARTIAL', narrativeStatus: 'GENERATED', summary: 'A busy month.', eventCount: 1,
    topTopics: [{ topic: 'family', count: 2 }], narrativeSections: [{ kind: 'X', claim: 'Rest mattered.' }],
    trendSignals: { status: 'ok', eventCountChange: -2, topicChanges: [{ topic: 'family', previousCount: 1, currentCount: 2, change: 1 }] } }), 2026);
  assert.deepEqual(texts(blocks), ['March 2026 · In progress', 'Your Monthly Reflection', 'A busy month.', 'Your Monthly Themes', '❧  family — 2 recorded',
    'Notable Patterns', 'Recorded events: -2 compared with the previous month.', '❧  family: 1 → 2', 'Rest mattered.', '1 recorded event · Saved reflection']);
});

// A stand-in for the page's text measurement: 40 characters a line, 10 units a line.
const measure = block => {
  if (block.type === 'calendar' || block.type === 'cards') return 120;
  if (block.type === 'rule') return 10;
  const text = 'text' in block ? block.text : '';
  return Math.max(1, Math.ceil(text.length / 40)) * 10 + 4;
};
const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('long reports flow across pages without losing a word', () => {
  const blocks = [{ type: 'eyebrow', text: 'March 2026' }, { type: 'headline', text: 'Headline' }, { type: 'text', text: words(400) },
    { type: 'section', text: 'Small good things' }, { type: 'calendar', days: [] }, { type: 'text', text: '中文的月报内容也不会丢失任何一个字。'.repeat(30) }, { type: 'rule' }];
  const pages = paginateBlocks(blocks, 150, measure);
  assert.ok(pages.length > 5);
  for (const page of pages) {
    const used = page.reduce((sum, block) => sum + measure(block), 0);
    assert.ok(used <= 150 || page.length === 1, `page holds ${used}`);
    assert.notEqual(['eyebrow', 'section', 'label'].includes(page[page.length - 1].type) && page !== pages[pages.length - 1], true, 'a heading never ends a page');
  }
  const flat = pages.flat();
  const joined = type => flat.filter(b => b.type === type).map(b => b.text).join(' ').replace(/\s+/g, ' ');
  assert.equal(flat.filter(b => b.type === 'text' && b.text.startsWith('word')).map(b => b.text).join(' '), words(400));
  assert.equal(flat.filter(b => b.type === 'text' && !b.text.startsWith('word')).map(b => b.text).join(''), '中文的月报内容也不会丢失任何一个字。'.repeat(30));
  assert.equal(joined('section'), 'Small good things');
  assert.equal(flat.filter(b => b.type === 'calendar').length, 1);
  assert.equal(textPieces('a  b c').join(''), 'a  b c');
});

test('every month starts on its own spread, after the title and contents', () => {
  const page = k => [{ type: 'text', text: `p${k}` }];
  const paged = Array.from({ length: 12 }, () => null);
  paged[2] = [page(1), page(2), page(3)];   // March: three pages, the last spread ends on a blank page
  paged[4] = [page(1), page(2)];            // May
  paged[11] = [page(1)];                    // December
  const { spreads, starts } = archiveSpreads(paged);
  assert.equal(starts.length, 12);
  assert.deepEqual(plain(starts), [null, null, 1, null, 3, null, null, null, null, null, null, 4]);
  assert.deepEqual(plain(spreads.map(s => [s.left.kind, s.right.kind, s.month])), [['front', 'contents', null], ['report', 'report', 3], ['report', 'end', 3],
    ['report', 'report', 5], ['report', 'end', 12]]);
  assert.deepEqual([spreads[2].left.page, spreads[2].left.pages], [3, 3]);
  // No reports at all: the title and contents spread only, every bookmark locked.
  const none = archiveSpreads(Array.from({ length: 12 }, () => null));
  assert.equal(none.spreads.length, 1);
  assert.ok(none.starts.every(start => start === null));
});

test('a report’s first page (no running head) may hold more than the pages after it', () => {
  const blocks = [{ type: 'headline', text: 'Headline' }, { type: 'text', text: words(300) }];
  const pages = paginateBlocks(blocks, i => i === 0 ? 200 : 150, measure);
  const used = page => page.reduce((sum, block) => sum + measure(block), 0);
  assert.ok(used(pages[0]) > 150 && used(pages[0]) <= 200);
  for (const page of pages.slice(1)) assert.ok(used(page) <= 150);
  assert.equal(pages.flat().filter(b => b.type === 'text').map(b => b.text).join(' '), words(300));
});
