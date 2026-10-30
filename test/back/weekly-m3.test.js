import assert from "node:assert/strict";
import test from "node:test";
import { computeInsights, dayPart, selfTalkKey } from "../../lib/insight-compute.js";
import { renderWeekly2, weekly2Packet } from "../../lib/insight-write.js";
import { INSIGHT_CARDS } from "../../lib/petal-card-match.js";

// Synthetic Events only. Week of 2026-09-14 (UTC); the lookback starts 2026-08-17.
const PERIOD = { periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14T00:00:00Z"), periodEndUtc: new Date("2026-09-21T00:00:00Z"), timezone: "UTC" };
const source = ([id, date, mood, summary]) => ({ id, occurredAt: +new Date(date), primaryGardenMood: mood, memory: { summary, topics: [] } });
const input = (rows, extra = {}) => ({ reportType: "WEEKLY", ownerId: "alice", locale: "zh-Hans", period: PERIOD,
  aggregates: { ...PERIOD, ownerId: "alice", eventCount: rows.length, topTopics: [] }, evidenceSelection: { ownerId: "alice", status: "READY", evidence: [] },
  sourceFence: { evidencePolicy: "weekly-localized-v1", thenAndNowLookback: true, sources: rows.map(source) }, ...extra });
const of = (data, type) => weekly2Packet(data).candidates.filter(candidate => candidate.type === type);
const OLD = +new Date("2026-06-01T00:00:00Z");
const WEEK = [
  ["c-0", "2026-09-14T12:00:00Z", "QUIET_BLOOM", "早上喝了一杯热茶。"],
  ["c-1", "2026-09-15T12:00:00Z", "GENTLE_BLOOM", "今天去面试了。"],
  ["c-2", "2026-09-17T12:00:00Z", "QUIET_BLOOM", "晚上看了一部电影。"]
];

test("第一次: a named word no earlier Event wrote, only after 4 weeks of history; it can lead and picks its card", () => {
  const data = input(WEEK, { firstTime: { historyStart: OLD, checked: ["面试"], seen: [] } });
  const [first] = of(data, "FIRST_TIME");
  assert.equal(first.fact, "这是你第一次写到“面试”。");
  assert.deepEqual(first.spans.map(span => span.text), ["今天去面试了。"]);
  assert.deepEqual(first.evidence.map(item => item.sourceEventId), ["c-1"]);
  assert.equal(of(input(WEEK, { firstTime: { historyStart: OLD, checked: ["面试"], seen: ["面试"] } }), "FIRST_TIME").length, 0, "written before");
  assert.equal(of(input(WEEK), "FIRST_TIME").length, 0, "no history check, no claim");
  const young = input(WEEK, { firstTime: { historyStart: +new Date("2026-09-01T00:00:00Z"), checked: ["面试"], seen: [] } });
  assert.equal(of(young, "FIRST_TIME").length, 0, "under 4 weeks of entries");
  assert.equal(weekly2Packet(young).unlock.type === "FIRST_TIME" || weekly2Packet(young).unlock.type === "RHYTHM", true);
  const muted = input(WEEK, { firstTime: { historyStart: OLD, checked: ["面试"], seen: [] }, loop: { mutes: ["面试"] } });
  assert.equal(of(muted, "FIRST_TIME").length, 0, "a muted word");
  const built = weekly2Packet(data), sections = renderWeekly2(null, data, built, null, { petalCards: true }).sections;
  const card = sections.find(section => section.kind === "PETAL_CARD");
  assert.equal(sections.find(section => section.kind === "HEADLINE").claim, "这是你第一次写到面试。");
  assert(INSIGHT_CARDS.FIRST_TIME.includes(card.cardId));
  assert.equal(card.reason, "这是你第一次写到面试。");
});

test("身体信号: one kind of signal in ≥3 entries with one mood in ≥ ⅔ of them, named by kind, never as the owner's words", () => {
  const rows = [
    ["e-1", "2026-08-25T12:00:00Z", "DRIFTING_BLOOM", "昨晚没睡好。"],
    ["e-2", "2026-09-03T12:00:00Z", "DRIFTING_BLOOM", "又失眠了。"],
    ["e-3", "2026-09-08T12:00:00Z", "SUNNY_BLOOM", "晴天。"],
    ...WEEK, ["c-3", "2026-09-18T12:00:00Z", "DRIFTING_BLOOM", "熬夜写报告。"]
  ];
  const [body] = of(input(rows), "BODY_SIGNAL");
  assert.equal(body.fact, "这五周有 3 条记录写到睡眠，你都选了『迷茫』。");
  assert.equal(body.subject, "睡眠");
  assert.deepEqual(body.spans.map(span => span.text), ["熬夜写报告。", "又失眠了。", "昨晚没睡好。"]);
  const mixed = rows.map(row => row[0] === "e-2" ? [row[0], row[1], "SUNNY_BLOOM", row[3]] : row);
  assert.equal(of(input(mixed), "BODY_SIGNAL").length, 0, "only 2 of 3 share a mood");
  const past = rows.filter(row => row[0] !== "c-3");
  assert.equal(of(input(past), "BODY_SIGNAL").length, 0, "none this week");
});

test("节律: ≥12 entries in four weeks; a mood mostly in one part of the local day that is not the usual part", () => {
  const days = ["2026-08-24", "2026-08-26", "2026-08-28", "2026-08-31", "2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09"];
  const rows = [...days.map((day, i) => [`d-${i}`, `${day}T12:00:00Z`, "SUNNY_BLOOM", "白天。"]),
    ["n-1", "2026-08-25T23:10:00Z", "DRIFTING_BLOOM", "夜里。"], ["n-2", "2026-09-01T23:40:00Z", "DRIFTING_BLOOM", "夜里。"],
    ["n-3", "2026-09-08T02:00:00Z", "DRIFTING_BLOOM", "夜里。"], ["n-4", "2026-09-15T22:30:00Z", "DRIFTING_BLOOM", "夜里。"], ...WEEK];
  const [rhythm] = of(input(rows), "RHYTHM");
  assert.equal(rhythm.fact, "这四周你选『迷茫』的 4 条记录里，有 4 条写在晚上 22 点以后。");
  assert.deepEqual(rhythm.spans, []);
  assert.equal(of(input(rows.slice(4)), "RHYTHM").length, 0, "fewer than 12 entries");
  assert.deepEqual(weekly2Packet(input(rows.slice(4))).unlock, { type: "RHYTHM", needed: 12 - rows.slice(4).filter(row => row[1] >= "2026-08-31").length });
  // Parts of the day follow the account timezone across the 2026-11-01 Vancouver DST change.
  assert.equal(dayPart(+new Date("2026-10-31T06:30:00Z"), "America/Vancouver"), "LATE");
  assert.equal(dayPart(+new Date("2026-11-02T06:30:00Z"), "America/Vancouver"), "LATE");
  assert.equal(dayPart(+new Date("2026-11-02T05:30:00Z"), "America/Vancouver"), "EVENING");
  assert.equal(dayPart(+new Date("2026-11-02T13:00:00Z"), "America/Vancouver"), "MORNING");
});

test("反复的句式: the same opening ≥3 times this week, counted and never quoted, never main, not in a sinking week", () => {
  assert.equal(selfTalkKey("我是不是太着急了？"), "我是不是太");
  assert.equal(selfTalkKey("Why am I so slow?"), "why am I so");
  const rows = [
    ["c-0", "2026-09-14T12:00:00Z", "SUNNY_BLOOM", "我是不是太着急了？"],
    ["c-1", "2026-09-15T12:00:00Z", "PEACEFUL_BLOOM", "我是不是太在意别人了？"],
    ["c-2", "2026-09-16T12:00:00Z", "SUNNY_BLOOM", "早上喝了一杯热茶。阳光很好。"],
    ["c-3", "2026-09-19T12:00:00Z", "GENTLE_BLOOM", "我是不是太累了。"]
  ];
  const built = weekly2Packet(input(rows)), [talk] = built.candidates.filter(candidate => candidate.type === "SELF_TALK");
  assert.equal(talk.fact, "这周你写了 3 次“我是不是太……”。");
  assert.deepEqual(talk.spans, []);
  assert.notEqual(built.candidates[0]?.type, "SELF_TALK");
  assert.equal(JSON.stringify(built.packet).includes("着急"), false, "the sentences never reach the model");
  const sinking = rows.map(row => row[0] === "c-3" ? [row[0], row[1], "QUIET_BLOOM", row[3]] : row)
    .concat([["c-4", "2026-09-20T12:00:00Z", "QUIET_BLOOM", "下雨。"], ["c-5", "2026-09-19T15:00:00Z", "DRIFTING_BLOOM", "不知道。"]]);
  const arc = computeInsights(input(sinking), { days: weekly2Packet(input(sinking)).candidates.length >= 0 ? ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"] : [] });
  assert.equal(arc.arc, "SINKING");
  assert.equal(arc.candidates.some(candidate => candidate.type === "SELF_TALK"), false);
});
