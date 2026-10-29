import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const { shortWeekly, moodCurveLayout, moodIcon, SHORT_COPY, WEEKLY_SHORT, shortDate, thenNowCount, bouquetLayout, MOOD_SPECIES } = loadPlantingModules()('../../../services/reflections');
const { PRIMARY_MOODS } = loadPlantingModules()('../../../services/events');
const plain = value => JSON.parse(JSON.stringify(value)); // values from the VM sandbox have foreign prototypes

// Synthetic sections in the shape the backend saves for weekly-short-v1.
const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
const meta = { contractVersion: WEEKLY_SHORT, locale: 'zh-Hans' };
const sections = [
  { kind: 'LINE_OF_WEEK', claim: '那个下午很安静。', evidenceRefs: [{ sourceEventId: 'event-0', sourceMemoryId: 'memory-0' }], ...meta },
  { kind: 'MOOD_CURVE', claim: '周一到周四：安静 2 次。', days, evidenceRefs: [], ...meta, points: [
    { date: '2026-09-14', mood: 'QUIET_BLOOM', level: 1, sourceEventId: 'event-0' },
    { date: '2026-09-14', mood: 'SUNNY_BLOOM', level: 3, sourceEventId: 'event-1' },
    { date: '2026-09-17', mood: 'QUIET_BLOOM', level: 1, sourceEventId: 'event-2' },
    { date: '2026-09-30', mood: 'QUIET_BLOOM', level: 1, sourceEventId: 'outside' },
    { date: '2026-09-15', mood: 'UNKNOWN', level: 2, sourceEventId: 'bad-mood' }] },
  { kind: 'SIDE_BY_SIDE', claim: '你画完了一幅素描，也把画分享给了朋友。', evidenceRefs: [], ...meta },
  { kind: 'QUESTION', claim: '走回家的路上，你在想什么？', evidenceRefs: [], ...meta }
];

test('short Weekly sections are read only from the short contract; older reports keep the plain summary', () => {
  const short = plain(shortWeekly({ narrativeSections: sections }));
  assert.equal(short.locale, 'zh-Hans');
  assert.deepEqual(short.line, { text: '那个下午很安静。', eventId: 'event-0' });
  assert.deepEqual(short.curve.points.map(point => point.sourceEventId), ['event-0', 'event-1', 'event-2']);
  assert.equal(short.side, sections[2].claim); assert.equal(short.question, sections[3].claim); assert.equal(short.support, null);
  assert.equal(shortWeekly({ narrativeSections: [{ kind: 'RECENT_MOMENTS', claim: 'Older report.', contractVersion: 'weekly-reflection-v2' }] }), null);
  assert.equal(shortWeekly({ narrativeSections: [...sections, { kind: 'RECENT_MOMENTS', claim: 'Mixed.' }] }), null);
  assert.equal(shortWeekly({ narrativeSections: [] }), null);
  const support = plain(shortWeekly({ narrativeSections: [{ kind: 'SUPPORT_RESOURCES', claim: 'You do not have to face this alone.', contractVersion: WEEKLY_SHORT, locale: 'en' }] }));
  assert.deepEqual({ ...support, support: !!support.support }, { locale: 'en', line: null, curve: null, side: null, question: null, support: true, thenAndNow: null, card: null,
    headline: null, insights: null, version2: false });
});

test('mood curve puts each day in its column, higher moods higher, and joins points in time order', () => {
  const { curve } = shortWeekly({ narrativeSections: sections });
  const { dots, segments } = moodCurveLayout(curve.days, curve.points, 700, 96, 12);
  assert.deepEqual(dots.map(dot => [Math.round(dot.x), dot.y]), [[43, 84], [57, 12], [350, 84]]);
  assert.equal(segments.length, 2);
  assert.ok(Math.abs(segments[1].length - Math.hypot(350 - 57, 72)) < 0.1);
  assert.ok(segments[1].angle > 0 && segments[1].angle < Math.PI / 2);
  // Icons follow the EventsPanel mood order (index 0 is the general Event art).
  assert.deepEqual(plain(PRIMARY_MOODS.map(moodIcon)), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('both languages carry the same labels and seven day initials', () => {
  assert.deepEqual(Object.keys(SHORT_COPY.en), Object.keys(SHORT_COPY['zh-Hans']));
  for (const copy of Object.values(SHORT_COPY)) assert.equal(copy.days.length, 7);
});

test('then and now keeps both quotes and dates; a count appears only with its phrase', () => {
  const then = { sourceEventId: 'event-old', date: '2026-08-30', quote: '那时候一直睡不着觉。' };
  const now = { sourceEventId: 'event-0', date: '2026-09-14', quote: '晚上又睡不着觉，脑子停不下来。' };
  const read = section => plain(shortWeekly({ narrativeSections: [{ kind: 'THEN_AND_NOW', claim: 'x', ...meta, ...section }] })).thenAndNow;
  assert.deepEqual(read({ then, now, count: 3, phrase: '睡不着觉' }), { then, now, count: 3, phrase: '睡不着觉' });
  assert.deepEqual(read({ then, now, count: 3, phrase: null }), { then, now, count: null, phrase: null });
  assert.equal(read({ then: { ...then, date: 'August' }, now }), null);
  assert.equal(shortDate('2026-08-30', 'zh-Hans'), '8月30日'); assert.equal(shortDate('2026-09-04', 'en'), 'Sep 4');
  assert.equal(thenNowCount(3, '睡不着觉', 'zh-Hans'), '过去五周里，你有 3 条记录写到“睡不着觉”。');
});

test('petal card is read only when every field is present', () => {
  const card = { kind: 'PETAL_CARD', claim: '难过之后，一点点亮起来。', cardId: 'major-17', name: '星星', line: '难过之后，一点点亮起来。',
    text: '大星星挂在夜空。', fact: '这周你 4 次选了「安静」。', disclaimer: '花语卡只是陪你回看自己。', evidenceRefs: [], ...meta };
  assert.equal(shortWeekly({ narrativeSections: sections }).card, null);
  assert.deepEqual(plain(shortWeekly({ narrativeSections: [...sections, card] }).card),
    { id: 'major-17', name: '星星', line: card.line, text: card.text, fact: card.fact, disclaimer: card.disclaimer, reason: null });
  assert.equal(shortWeekly({ narrativeSections: [...sections, { ...card, reason: '小花仙看到你常写到“妈妈”，给你配了「星星」。' }] }).card.reason,
    '小花仙看到你常写到“妈妈”，给你配了「星星」。');
  assert.equal(shortWeekly({ narrativeSections: [...sections, { ...card, disclaimer: ' ' }] }).card, null);
  assert.equal(shortWeekly({ narrativeSections: [...sections, { ...card, fact: undefined }] }).card, null);
  assert.equal(SHORT_COPY['zh-Hans'].card, '花语卡');
});

// Weekly insights: saved under the same v1 contract, as new section kinds older apps skip.
test('insights: a valid main insight brings the headline and up to three more; malformed ones are skipped', () => {
  const insight = (role, type, extra = {}) => ({ kind: 'INSIGHT', claim: 'x', role, type, text: `${type} text`, fact: null, items: [], quote: null,
    evidence: [{ sourceEventId: 'event-0', date: '2026-09-14' }], ...meta, ...extra });
  const goods = insight('secondary', 'SMALL_GOODS', { items: [{ text: '阳光很好。', sourceEventId: 'event-1' }, { text: '喝到了热汤。', sourceEventId: 'event-2' }] });
  const read = list => plain(shortWeekly({ narrativeSections: [...sections, { kind: 'HEADLINE', claim: '写到妈妈的日子，多是亮的', ...meta }, ...list] }));
  const short = read([insight('main', 'HIDDEN_LINK', { fact: '这五周有 3 条记录写到“妈妈”。' }), goods,
    insight('secondary', 'OPEN_QUESTION', { quote: { text: '我到底想要什么？', sourceEventId: 'event-2' } }),
    insight('secondary', 'MADE_UP'), insight('secondary', 'SAID_BEFORE', { evidence: [{ sourceEventId: 'event-0', date: 'Sep 14' }] }),
    insight('secondary', 'SMALL_GOODS', { items: [{ text: '只有一件。', sourceEventId: 'event-1' }] })]);
  assert.equal(short.headline, '写到妈妈的日子，多是亮的');
  assert.deepEqual(short.insights.main, { index: 5, feedback: null, type: 'HIDDEN_LINK', text: 'HIDDEN_LINK text', fact: '这五周有 3 条记录写到“妈妈”。', items: [], quote: null,
    evidence: [{ eventId: 'event-0', date: '2026-09-14' }] });
  assert.deepEqual(short.insights.secondary.map(item => item.type), ['SMALL_GOODS', 'OPEN_QUESTION']);
  assert.deepEqual(short.insights.secondary[0].items.map(item => item.eventId), ['event-1', 'event-2']);
  assert.deepEqual(short.insights.secondary[1].quote, { text: '我到底想要什么？', eventId: 'event-2' });
  // The rest of the report reads as before.
  assert.equal(short.side, sections[2].claim); assert.equal(short.line.eventId, 'event-0');
  // No valid main insight: no headline and no insight cards, the short report as it was.
  for (const list of [[goods], [insight('main', 'HIDDEN_LINK', { text: ' ' })], [insight('main', 'HIDDEN_LINK', { evidence: [] })]]) {
    const plainShort = read(list);
    assert.equal(plainShort.headline, null); assert.equal(plainShort.insights, null);
  }
  assert.equal(SHORT_COPY['zh-Hans'].whyCard, '为什么是这张');
});

// Weekly 2.0 (backend lib/insight-write.js): the code-only TREND insight shows like the others, and the 2.0
// headline shows even with no insight (a week with fewer than three entries).
test('Weekly 2.0: a TREND main insight, and the headline of a week with no insight', () => {
  const trend = { kind: 'INSIGHT', claim: 'x', role: 'main', type: 'TREND', text: '前半周多是「迷茫」，后半周「疗愈」多了起来。', fact: null,
    items: [], quote: null, evidence: [{ sourceEventId: 'event-0', date: '2026-09-14' }], template: true, ...meta };
  const headline = { kind: 'HEADLINE', claim: '这周的花还在长', reportVersion: 'weekly-2.0', ...meta };
  const read = list => plain(shortWeekly({ narrativeSections: [...sections, ...list] }));
  assert.equal(read([headline, trend]).insights.main.type, 'TREND');
  const echo = { ...trend, type: 'ECHO', items: [{ text: '我又在凌晨三点醒来了，不知道为什么。', sourceEventId: 'event-9' }, { text: '我又在凌晨三点醒来了。', sourceEventId: 'event-0' }] };
  assert.deepEqual(read([headline, echo]).insights.main.items.map(item => item.eventId), ['event-9', 'event-0'], 'a lone time echo is the main insight');
  const growing = read([headline]);
  assert.equal(growing.headline, '这周的花还在长'); assert.equal(growing.insights, null);
  assert.equal(read([{ ...headline, reportVersion: undefined }]).headline, null, 'a v1 headline still needs its main insight');
});

// Weekly 2.0 first screen: the 2.0 marker, each insight's place and mark, and the bouquet's ground line.
test('Weekly 2.0: version marker, insight marks, and a bouquet that never ranks moods', () => {
  const insight = (role, extra = {}) => ({ kind: 'INSIGHT', claim: 'x', role, type: 'OPEN_QUESTION', text: 't', fact: null, items: [], quote: null,
    evidence: [{ sourceEventId: 'event-0', date: '2026-09-14' }], ...meta, ...extra });
  const short = plain(shortWeekly({ narrativeSections: [...sections, { kind: 'HEADLINE', claim: 'h', reportVersion: 'weekly-2.0', ...meta },
    insight('main', { feedback: 'HIDDEN' }), insight('secondary', { feedback: 'INACCURATE' }), insight('secondary', { feedback: 'MADE_UP' })] }));
  assert.equal(short.version2, true);
  assert.deepEqual([short.insights.main, ...short.insights.secondary].map(item => [item.index, item.feedback]), [[5, 'HIDDEN'], [6, 'INACCURATE'], [7, null]]);
  assert.equal(SHORT_COPY.en.inaccurate, 'Not right'); assert.equal(SHORT_COPY['zh-Hans'].hide, '隐藏');
  assert.deepEqual(Object.keys(SHORT_COPY.en).sort(), Object.keys(SHORT_COPY['zh-Hans']).sort());
  // Two flowers on Monday share its column side by side; Thursday's sits in its own column. Nothing has a height by mood.
  const points = [{ date: days[0], mood: 'QUIET_BLOOM', level: 1, sourceEventId: 'a' }, { date: days[0], mood: 'SUNNY_BLOOM', level: 3, sourceEventId: 'b' },
    { date: days[3], mood: 'FIRE_BLOOM', level: 1, sourceEventId: 'c' }];
  const placed = plain(bouquetLayout(days, points, 350, 44));
  assert.deepEqual(placed.map(point => Math.round(point.x)), [0, 14, 153]);
  assert.ok(placed.every(point => !('y' in point)));
  assert.deepEqual(Object.keys(MOOD_SPECIES).sort(), [...PRIMARY_MOODS].sort());
});
