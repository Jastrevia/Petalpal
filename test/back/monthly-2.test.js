import assert from "node:assert/strict";
import test from "node:test";
import { MONTHLY_2, renderMonthly2 } from "../../lib/monthly-insights.js";
import { monthlyInsightsEnabledFor } from "../../lib/weekly-contract.js";
import { reportShowsEvent } from "../../lib/weekly-short.js";

// Synthetic Events only. October 2026 in UTC; September is the month before.
const PERIOD = { periodKey: "2026-10", periodStartUtc: new Date("2026-10-01T00:00:00Z"), periodEndUtc: new Date("2026-11-01T00:00:00Z"), timezone: "UTC" };
const source = ([id, date, mood, summary]) => ({ id, occurredAt: +new Date(date), primaryGardenMood: mood, memory: { summary, topics: [] } });
const BEFORE = [
  ["s-1", "2026-09-03T12:00:00Z", "FIRE_BLOOM", "面试又被拒了。"],
  ["s-2", "2026-09-10T12:00:00Z", "FIRE_BLOOM", "准备面试到半夜。"],
  ["s-3", "2026-09-20T12:00:00Z", "QUIET_BLOOM", "下雨。"],
  ["s-4", "2026-09-28T12:00:00Z", "SUNNY_BLOOM", "我想每天早上跑步。"]
];
const MONTH = [
  ["o-1", "2026-10-02T12:00:00Z", "PEACEFUL_BLOOM", "今天的面试很顺利。阳光很好。"],
  ["o-2", "2026-10-02T20:00:00Z", "SUNNY_BLOOM", "和妈妈打了电话。喝了一杯热可可。"],
  ["o-3", "2026-10-09T12:00:00Z", "PEACEFUL_BLOOM", "第二轮面试，聊得很开心。阳光很好。"],
  ["o-4", "2026-10-15T12:00:00Z", "GENTLE_BLOOM", "妈妈寄来了月饼。"],
  ["o-5", "2026-10-21T12:00:00Z", "SUNNY_BLOOM", "早上去跑步了。"]
];
const WEEKS = [
  { periodKey: "2026-10-05", headline: "说过想跑步，后来也写到了", insightType: "SAID_BEFORE", card: { cardId: "wands-03", name: "权杖三", line: "等自己种下的东西。" },
    threads: [{ type: "SAID_BEFORE", subject: "跑步", quote: { text: "我想每天早上跑步。", sourceEventId: "s-4", date: "2026-09-28" } }] },
  { periodKey: "2026-10-19", headline: "这周让你开心的，是很小的事。", insightType: "SMALL_GOODS", card: { cardId: "cups-03", name: "圣杯三", line: "一起庆祝。" }, threads: [] }
];
const input = ({ month = MONTH, before = BEFORE, weeks = WEEKS, mutes = [], locale = "zh-Hans" } = {}) => ({ reportType: "MONTHLY", ownerId: "alice", locale: null,
  period: PERIOD, evidenceSelection: { status: "READY", evidence: [] },
  sourceFence: { sources: [...before, ...month].map(source) }, monthly2: { locale, insightExtractions: {}, weeks, mutes } });
const kinds = result => result.sections.map(section => section.kind);

test("Monthly 2.0: garden, spread, change, threads, small goods, people (folded in the app) and a question, all code-written", () => {
  const result = renderMonthly2(input());
  assert.deepEqual(kinds(result), ["MONTH_HEADLINE", "MONTH_GARDEN", "MONTH_SPREAD", "MONTH_CHANGE", "MONTH_THREADS", "MONTH_GOODS", "MONTH_PEOPLE", "MONTH_QUESTION"]);
  const [head, garden, spread, change, threads, goods, people, question] = result.sections;
  assert.equal(head.reportVersion, MONTHLY_2);
  assert.equal(head.claim, "写到“面试”时，这个月不一样了");
  assert.equal(garden.days.length, 31);
  assert.equal(garden.claim, "这个月有 4 天写了记录，一共 5 条。");
  assert.deepEqual(garden.dayMoods.find(day => day.date === "2026-10-02"), { date: "2026-10-02", mood: "SUNNY_BLOOM" }, "a tie goes to the later entry");
  assert.equal(garden.dayMoods.find(day => day.date === "2026-10-03").mood, null, "a day without an entry stays empty soil");
  assert.deepEqual(spread.cards.map(card => [card.name, card.role, card.headline]), [["权杖三", "start", "说过想跑步，后来也写到了"], ["圣杯三", "now", "这周让你开心的，是很小的事。"]]);
  assert.equal(change.claim, "上个月写到“面试”的 2 条里，有 2 条是『愤怒』；这个月的 2 条里，有 2 条是『平静』。");
  assert.deepEqual([change.then.quote, change.now.quote], ["准备面试到半夜。", "第二轮面试，聊得很开心。"]);
  assert.deepEqual(threads.items.map(item => [item.keyword, item.count, item.line]), [["跑步", 1, "这个月之后有 1 条写到“跑步”。"]]);
  assert.deepEqual(goods.items.map(item => [item.text, item.count]).slice(0, 1), [["阳光很好。", 2]]);
  assert.deepEqual(people.people.map(item => [item.word, item.count]), [["妈妈", 2]]);
  assert.equal(question.claim, "下个月写到“面试”的时候，你想留意什么？");
  // Event deletion finds every Event the report shows: the garden, both sides of a change, a thread's quote, goods, people.
  for (const id of ["o-5", "s-2", "s-4", "o-3", "o-4"]) assert.equal(reportShowsEvent(result.sections, id), true, id);
  assert.equal(reportShowsEvent(result.sections, "s-3"), false);
});

test("Monthly 2.0: muted words leave out the change, people and quotes; a thread quote no longer in its Event is not shown", () => {
  const muted = renderMonthly2(input({ mutes: ["面试", "妈妈"] }));
  assert.equal(kinds(muted).includes("MONTH_CHANGE"), false);
  assert.equal(kinds(muted).includes("MONTH_PEOPLE"), false);
  assert.equal(JSON.stringify(muted.sections.filter(section => section.kind !== "MONTH_GARDEN")).includes("面试"), false);
  const edited = renderMonthly2(input({ before: BEFORE.map(row => row[0] === "s-4" ? [row[0], row[1], row[2], "改过了。"] : row) }));
  assert.equal(kinds(edited).includes("MONTH_THREADS"), false);
});

test("Monthly 2.0: a month with fewer than 3 entries is a growing garden and a light question; English copy", () => {
  const few = renderMonthly2(input({ month: MONTH.slice(0, 2) }));
  assert.deepEqual(kinds(few), ["MONTH_HEADLINE", "MONTH_GARDEN", "MONTH_QUESTION"]);
  assert.equal(few.sections[0].claim, "这个月的花园还在长");
  const en = renderMonthly2(input({ locale: "en" }));
  assert.equal(en.sections.find(section => section.kind === "MONTH_GARDEN").claim, "You wrote on 4 days this month, 5 entries in all.");
  assert.equal(en.sections.find(section => section.kind === "MONTH_CHANGE").claim,
    "Last month, 2 of the 2 entries about “面试” were Fire; this month, 2 of 2 were Peaceful.");
});

test("Monthly 2.0 switch: off unless listed; malformed is off", () => {
  assert.equal(monthlyInsightsEnabledFor({}, "alice"), false);
  assert.equal(monthlyInsightsEnabledFor({ MONTHLY_INSIGHTS_OWNER_IDS: "*" }, "alice"), true);
  assert.equal(monthlyInsightsEnabledFor({ MONTHLY_INSIGHTS_OWNER_IDS: " bob , alice " }, "alice"), true);
  assert.equal(monthlyInsightsEnabledFor({ MONTHLY_INSIGHTS_OWNER_IDS: "alice;bob" }, "alice"), false);
});
