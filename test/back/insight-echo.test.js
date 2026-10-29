import assert from "node:assert/strict";
import test from "node:test";
import { dice, findEcho, longestRun, sentenceEcho } from "../../lib/insight-echo.js";
import { computeInsights } from "../../lib/insight-compute.js";
import { fenceSources } from "../../lib/insight-validate.js";
import { renderWeekly2, weekly2Packet } from "../../lib/insight-write.js";
import { reportShowsEvent, weeklyMoodCurve } from "../../lib/weekly-short.js";

// Synthetic Events only. Week of 2026-09-14 (UTC).
const DAY = 86_400_000;
const at = date => +new Date(`${date}T12:00:00Z`);
const event = (id, date, text) => ({ id, occurredAt: at(date), date, text });

test("Chinese sentences echo by shared wording; short, unrelated or too-close pairs do not", () => {
  assert.equal(longestRun("我又在凌晨三点醒来了", "凌晨三点醒来"), 6);
  assert.ok(dice("我又在凌晨三点醒来了", "我又在凌晨三点醒了") > 0.6);
  assert.ok(sentenceEcho("我又在凌晨三点醒来了。", "我又在凌晨三点醒来，睡不着。", "zh-Hans") > 0);
  assert.equal(sentenceEcho("今天好累。", "今天好累。", "zh-Hans"), 0, "too short to be an echo");
  assert.equal(sentenceEcho("和妈妈去公园散步。", "论文还没写完。", "zh-Hans"), 0);
  const current = [event("now", "2026-09-16", "我又在凌晨三点醒来了。窗外很安静。")];
  const history = [event("near", "2026-09-01", "我又在凌晨三点醒来了。"), event("far", "2026-03-12", "我又在凌晨三点醒来了，不知道为什么。"),
    event("old", "2025-08-01", "我又在凌晨三点醒来了。")];
  const echo = findEcho({ current, history, locale: "zh-Hans" });
  assert.equal(echo.then.sourceEventId, "far", "at least 30 days apart and within a year");
  assert.equal(echo.now.quote, "我又在凌晨三点醒来了。"); assert.equal(echo.then.quote, "我又在凌晨三点醒来了，不知道为什么。");
  assert.equal(findEcho({ current: [event("s", "2026-09-16", "我又在凌晨三点醒来了。我想死。")], history, locale: "zh-Hans" }), null,
    "a sensitive entry is never echoed");
});

test("English echoes come from the stored vectors, then the closest sentence pair", () => {
  const current = [event("now", "2026-09-16", "I keep saying yes to things I do not want to do. The tea was warm.")];
  const history = [event("then", "2026-05-02", "Why do I keep saying yes to things I do not want to do at work?"),
    event("other", "2026-04-02", "I keep saying yes to things I do not want to do.")];
  const vectors = new Map([["now", [{ id: "then", similarity: 0.86 }, { id: "other", similarity: 0.5 }]]]);
  const echo = findEcho({ current, history, locale: "en", vectorPairs: vectors });
  assert.equal(echo.then.sourceEventId, "then", "only Events the vectors call similar");
  assert.equal(echo.now.quote, "I keep saying yes to things I do not want to do.");
  assert.equal(findEcho({ current, history, locale: "en", vectorPairs: new Map() }), null);
});

// A report input with one echo whose earlier Event is outside the five-week window.
const PERIOD = { periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14T00:00:00Z"), periodEndUtc: new Date("2026-09-21T00:00:00Z"), timezone: "UTC" };
const source = (id, date, mood, summary) => ({ id, occurredAt: at(date), primaryGardenMood: mood, memory: { summary, topics: [] } });
function input({ current, echo, extra = true }) {
  return { reportType: "WEEKLY", ownerId: "alice", locale: "zh-Hans", period: PERIOD,
    aggregates: { ...PERIOD, ownerId: "alice", eventCount: current.length, topTopics: [] },
    evidenceSelection: { ownerId: "alice", status: "READY", evidence: current.map((item, i) => ({ ownerId: "alice", sourceEventId: item.id,
      sourceMemoryId: `m-${i}`, summary: item.memory.summary, topics: [], eventDate: new Date(item.occurredAt) })) },
    sourceFence: { sources: current, ...(extra ? { echoSources: [source("far", "2026-03-12", "QUIET_BLOOM", "我又在凌晨三点醒来了，不知道为什么。")] } : {}) },
    echo };
}
const ECHO = { score: 0.8, now: { sourceEventId: "c-0", date: "2026-09-16", quote: "我又在凌晨三点醒来了。" },
  then: { sourceEventId: "far", date: "2026-03-12", quote: "我又在凌晨三点醒来了，不知道为什么。" } };

test("the echo is the page's last reveal, never sent to the model; alone it is the main insight", () => {
  const many = [source("c-0", "2026-09-16", "QUIET_BLOOM", "我又在凌晨三点醒来了。"), source("c-1", "2026-09-15", "SUNNY_BLOOM", "阳光照在河面上。"),
    source("c-2", "2026-09-17", "GENTLE_BLOOM", "楼下的面包店送了我一块蛋糕。"), source("c-3", "2026-09-18", "QUIET_BLOOM", "我到底想要什么样的生活？")];
  const data = input({ current: many, echo: ECHO });
  assert.ok(fenceSources(data).has("far"), "the echo's earlier Event is checked like any other source");
  const { candidates } = computeInsights(data, { days: weeklyMoodCurve(data).days });
  assert.ok(candidates.some(candidate => candidate.type === "ECHO")); assert.notEqual(candidates[0].type, "ECHO");
  const built = weekly2Packet(data);
  assert.ok(!JSON.stringify(built.packet).includes("凌晨三点"), "the echo's quotes never reach the model");
  const sections = renderWeekly2(null, data, built, null).sections;
  const reveal = sections.find(section => section.kind === "THEN_AND_NOW");
  assert.equal(reveal.match, "ECHO"); assert.equal(reveal.then.sourceEventId, "far"); assert.equal(reveal.now.quote, "我又在凌晨三点醒来了。");
  assert.ok(!sections.some(section => section.kind === "INSIGHT" && section.type === "ECHO"));
  assert.equal(reportShowsEvent(sections, "far"), true, "deleting the earlier Event removes this report");
  // Alone: the echo is the main insight, both sentences listed.
  const lone = input({ current: [source("c-0", "2026-09-16", "QUIET_BLOOM", "我又在凌晨三点醒来了。"), source("c-1", "2026-09-17", "QUIET_BLOOM", "下雨了。"),
    source("c-2", "2026-09-18", "QUIET_BLOOM", "没出门。")], echo: ECHO });
  const alone = renderWeekly2(null, lone, weekly2Packet(lone), null).sections;
  const main = alone.find(section => section.kind === "INSIGHT");
  assert.equal(main.type, "ECHO"); assert.deepEqual(main.items.map(item => item.sourceEventId), ["far", "c-0"]);
  assert.equal(alone[0].claim, "这句话，你以前也写过。");
  // An echo whose earlier sentence is no longer in its Event (edited) is dropped.
  const edited = input({ current: many, echo: { ...ECHO, then: { ...ECHO.then, quote: "我从来没这么写过。" } } });
  assert.ok(!computeInsights(edited, { days: weeklyMoodCurve(edited).days }).candidates.some(candidate => candidate.type === "ECHO"));
  assert.ok(+new Date("2026-09-16") - +new Date("2026-03-12") >= 30 * DAY);
});
