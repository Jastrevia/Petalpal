import assert from "node:assert/strict";
import test from "node:test";
import { compileGatewaySchema } from "../../lib/ai-gateway-schema.js";
import { GATEWAY_TASK_LIMITS } from "../../lib/ai-gateway-config.js";
import { eventSpans, lexiconWords } from "../../lib/event-memory.js";
import { computeInsights, keyPhrase } from "../../lib/insight-compute.js";
import { INSIGHT_CARDS } from "../../lib/petal-card-match.js";
import { petalCard } from "../../lib/petal-cards.js";
import { buildWeeklyReflectionV2Packet } from "../../lib/sonnet-weekly.js";
import { weeklyInsightsEnabledFor } from "../../lib/weekly-contract.js";
import { INSIGHTS_PACKET_BUDGET, renderWeeklyShort, reportShowsEvent, WEEKLY_INSIGHTS, WEEKLY_INSIGHTS_INSTRUCTIONS,
  WEEKLY_INSIGHTS_SCHEMA, WEEKLY_SHORT, weeklyInsightsPacket, weeklyShortPacket } from "../../lib/weekly-short.js";

// Synthetic Events only. Week of 2026-09-14 (UTC); the lookback starts 2026-08-17.
const PERIOD = { periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14T00:00:00Z"), periodEndUtc: new Date("2026-09-21T00:00:00Z"), timezone: "UTC" };
const EARLIER = [
  ["e-a", "2026-08-20T12:00:00Z", "QUIET_BLOOM", "今天加班到很晚，有点累。"],
  ["e-b", "2026-08-25T12:00:00Z", "SUNNY_BLOOM", "和妈妈视频聊了一个小时。妈妈说家里的桂花开了。"],
  ["e-c", "2026-08-30T12:00:00Z", "DRIFTING_BLOOM", "不知道接下来该怎么办。"],
  ["e-d", "2026-09-02T12:00:00Z", "SUNNY_BLOOM", "我想每天早上跑步。"],
  ["e-e", "2026-09-05T12:00:00Z", "QUIET_BLOOM", "下雨了，一整天没出门。"],
  ["e-f", "2026-09-08T12:00:00Z", "PEACEFUL_BLOOM", "妈妈寄来了自己做的月饼。"],
  ["e-s", "2026-09-09T12:00:00Z", "FIRE_BLOOM", "他打了我，妈妈也在。"],
  ["e-g", "2026-09-10T12:00:00Z", "QUIET_BLOOM", "论文还没写完。"]
];
const CURRENT = [
  ["c-0", "2026-09-14T12:00:00Z", "SUNNY_BLOOM", "早上跑步了五公里。阳光照在河面上。"],
  ["c-1", "2026-09-15T12:00:00Z", "GENTLE_BLOOM", "给妈妈打了电话。她笑得很开心。"],
  ["c-2", "2026-09-17T12:00:00Z", "QUIET_BLOOM", "我到底想要什么样的生活？"],
  ["c-3", "2026-09-19T12:00:00Z", "HEALING_BLOOM", "楼下的面包店送了我一块蛋糕。"]
];
const source = ([id, date, mood, summary]) => ({ id, occurredAt: +new Date(date), primaryGardenMood: mood, memory: { summary, topics: [] } });
function input({ current = CURRENT, earlier = EARLIER, locale = "zh-Hans" } = {}) {
  const evidence = current.map(([id, date, , summary], i) => ({ ownerId: "alice", sourceEventId: id, sourceMemoryId: `m-${i}`, summary,
    topics: [], eventDate: date, provenance: { sourceEventId: id, sourceMemoryId: `m-${i}` } }));
  return { reportType: "WEEKLY", ownerId: "alice", locale, period: PERIOD,
    aggregates: { ...PERIOD, ownerId: "alice", eventCount: current.length, topTopics: [] },
    evidenceSelection: { ownerId: "alice", status: "READY", evidence },
    sourceFence: { evidencePolicy: "weekly-localized-v1", thenAndNowLookback: true, sources: [...earlier, ...current].map(source) } };
}
const prepare = data => weeklyInsightsPacket(weeklyShortPacket(buildWeeklyReflectionV2Packet(data), data), data);
const byType = (short, type) => short.candidates.find(candidate => candidate.type === type);
const v1Parts = { line: [{ ref: "E1", quote: "阳光照在河面上。" }],
  sideBySide: [{ text: "你早上跑了步，也给妈妈打了电话。", refs: ["E1", "E2"] }],
  question: [{ text: "这周哪一刻你最想再过一遍？", refs: ["E4"] }] };
function answer(short, change = {}) {
  const link = byType(short, "HIDDEN_LINK"), plan = byType(short, "SAID_BEFORE"), goods = byType(short, "SMALL_GOODS"), open = byType(short, "OPEN_QUESTION");
  return { version: WEEKLY_INSIGHTS, locale: "zh-Hans", ...structuredClone(v1Parts), insights: [
    { candidate: link.id, role: "main", text: "这五周有 3 条记录写到“妈妈”，这 3 条的心情都是晴朗、平静、疗愈或温柔。", picks: [] },
    { candidate: plan.id, role: "secondary", text: "9月2日你写过：“我想每天早上跑步。”之后有 1 条写到跑步。", picks: [] },
    { candidate: goods.id, role: "secondary", text: "这周你记下了这些小事。", picks: goods.spans.slice(1, 3).map(span => span.id) },
    { candidate: open.id, role: "secondary", text: "你问过自己：“我到底想要什么样的生活？”", picks: [] }
  ], ...change };
}
const render = (short, output, data = input(), petalCards = false) => renderWeeklyShort(output, data, short, "model", { petalCards });
const kinds = result => result.sections.map(section => section.kind);

test("spans: whole sentences for plans, own questions and bright small goods; sensitive entries give nothing", () => {
  const spans = eventSpans({ id: "x", mood: "SUNNY_BLOOM", text: "我打算周末去看海。我不想上班。想起小时候的事。他问我：“你还好吗？”我是不是太着急了？阳光很好。" });
  assert.deepEqual(spans.intents, [{ text: "我打算周末去看海。", thing: "周末去看海" }]);
  assert.deepEqual(spans.questions, [{ text: "我是不是太着急了？" }]);
  assert.deepEqual(spans.smallGoods.map(item => item.text), ["想起小时候的事。", "阳光很好。"]);
  assert.equal(eventSpans({ id: "y", mood: "QUIET_BLOOM", text: "阳光很好。" }).smallGoods.length, 0);
  const en = eventSpans({ id: "z", mood: "PEACEFUL_BLOOM", text: "I'm going to call my mom tonight. I don't want to work. Why do I always wait? The tea was warm." });
  assert.deepEqual(en.intents.map(item => item.thing), ["call my mom tonight"]);
  assert.deepEqual(en.questions.map(item => item.text), ["Why do I always wait?"]);
  assert.deepEqual(en.smallGoods.map(item => item.text), ["The tea was warm."]);
  assert.deepEqual(en.people.map(item => item.word), ["mom"]);
  for (const text of ["他打了我。阳光很好。", "I want to hurt myself. The tea was warm.", "I cannot keep myself safe."]) {
    const sensitive = eventSpans({ id: "s", mood: "SUNNY_BLOOM", text });
    assert.equal(sensitive.sensitive, true); assert.equal(sensitive.sentences.length + sensitive.smallGoods.length, 0);
  }
  assert.deepEqual(lexiconWords("我和男朋友去跑步").people, ["男朋友"]);
  assert.equal(keyPhrase("每天早上跑步"), "跑步"); assert.equal(keyPhrase("周末去看海"), "看海");
  assert.equal(keyPhrase("我到底想要什么样的生活？"), null);
});

test("candidates: each type needs its own threshold; numbers and fact lines are code-written", () => {
  const short = prepare(input());
  assert.deepEqual(short.candidates.map(candidate => candidate.type).sort(), ["HIDDEN_LINK", "OPEN_QUESTION", "SAID_BEFORE", "SMALL_GOODS"]);
  const link = byType(short, "HIDDEN_LINK");
  // 妈妈 appears in e-b, e-f, c-1 (the sensitive e-s is left out); 6 of the 11 mood entries are bright.
  assert.equal(link.subject, "妈妈"); assert.deepEqual(link.numbers, [3, 3, 11, 6]);
  assert.equal(link.fact, "这五周有 3 条记录写到“妈妈”，其中 3 条的心情是晴朗、平静、疗愈或温柔；全部 11 条记录里是 6 条。");
  assert.ok(!short.candidates.some(candidate => candidate.evidence.some(item => item.sourceEventId === "e-s")));
  const plan = byType(short, "SAID_BEFORE");
  assert.equal(plan.fact, "9月2日你写过：“我想每天早上跑步。”之后的 7 条记录里，有 1 条写到“跑步”。");
  assert.deepEqual(plan.evidence.map(item => item.sourceEventId), ["e-d", "c-0"]);
  assert.equal(byType(short, "SMALL_GOODS").spans.length, 5);
  assert.deepEqual(byType(short, "OPEN_QUESTION").spans.map(span => span.text), ["我到底想要什么样的生活？"]);
  assert.deepEqual(short.packet.include, ["line", "sideBySide", "question", "insights"]);
  assert.equal(short.packet.version, WEEKLY_INSIGHTS);
  assert.doesNotMatch(JSON.stringify(short.packet), /alice|e-[a-z]|c-\d|score|BLOOM/);

  const without = (list, id) => list.filter(([key]) => key !== id);
  assert.equal(byType(prepare(input({ earlier: without(EARLIER, "e-f") })), "HIDDEN_LINK"), undefined, "two entries are not a link");
  assert.equal(byType(prepare(input({ current: CURRENT.map(row => row[0] === "c-0" ? [...row.slice(0, 3), "阳光照在河面上。"] : row) })), "SAID_BEFORE"),
    undefined, "a plan nobody wrote about again gives no candidate");
  const dim = CURRENT.map(row => ["c-1", "c-3"].includes(row[0]) ? [row[0], row[1], "QUIET_BLOOM", row[3]] : row);
  assert.equal(byType(prepare(input({ current: dim })), "SMALL_GOODS").spans.length, 2);
  const answered = [...CURRENT, ["c-4", "2026-09-20T12:00:00Z", "QUIET_BLOOM", "想要什么样的生活，我还在想。"]];
  assert.ok(byType(prepare(input({ current: answered })), "OPEN_QUESTION"), "a question with no key phrase stays open");
  const asked = [...CURRENT.slice(0, 2), ["c-2", "2026-09-17T12:00:00Z", "QUIET_BLOOM", "我还要不要继续跑步？"], ["c-5", "2026-09-20T12:00:00Z", "QUIET_BLOOM", "跑步还是继续吧。"]];
  assert.equal(byType(prepare(input({ current: asked })), "OPEN_QUESTION"), undefined, "a later entry on the same thing answers it");
  // Fewer than three Events this week: no insights, the same packet as the short report.
  const few = prepare(input({ current: CURRENT.slice(0, 2) }));
  assert.deepEqual(few.candidates, []); assert.deepEqual(few.packet.include, ["line"]);
});

test("rendering: headline, main insight, curve, secondary insights; side by side gives way; old apps keep the v1 contract", () => {
  const short = prepare(input()), result = render(short, answer(short), input(), true);
  assert.deepEqual(kinds(result), ["HEADLINE", "INSIGHT", "MOOD_CURVE", "INSIGHT", "INSIGHT", "INSIGHT", "PETAL_CARD", "LINE_OF_WEEK", "QUESTION"]);
  assert.ok(result.sections.every(section => section.contractVersion === WEEKLY_SHORT));
  const [headline, main] = result.sections;
  assert.equal(headline.claim, "写到妈妈的日子，多是亮的"); assert.ok([...headline.claim].length <= 16);
  assert.equal(main.role, "main"); assert.equal(main.type, "HIDDEN_LINK");
  assert.deepEqual(main.evidence.map(item => item.sourceEventId), ["e-b", "e-f", "c-1"]);
  assert.deepEqual(main.evidenceRefs, []);
  const goods = result.sections.find(section => section.type === "SMALL_GOODS");
  assert.deepEqual(goods.items.map(item => item.text), ["阳光照在河面上。", "给妈妈打了电话。"]);
  assert.deepEqual(goods.evidence.map(item => item.sourceEventId), ["c-0", "c-1"]);
  assert.equal(result.sections.find(section => section.type === "OPEN_QUESTION").quote.text, "我到底想要什么样的生活？");
  const card = result.sections.find(section => section.kind === "PETAL_CARD");
  assert.ok(INSIGHT_CARDS.HIDDEN_LINK.includes(card.cardId));
  assert.equal(card.reason, `小花仙看到你常写到“妈妈”，给你配了「${petalCard(card.cardId).names["zh-Hans"]}」。`);
  assert.ok(card.fact, "older apps still get the mood fact line");
  // Event deletion reaches a report through its insight evidence too.
  assert.equal(reportShowsEvent(result.sections, "e-b"), true); assert.equal(reportShowsEvent(result.sections, "e-a"), false);
  // Without the card switch the same insights show without a card.
  assert.ok(!kinds(render(short, answer(short))).includes("PETAL_CARD"));
});

test("validation: every failing insight is dropped on its own; a failing main gives way to the best secondary", () => {
  const short = prepare(input()), base = answer(short);
  const with0 = change => ({ ...base, insights: base.insights.map((item, i) => i === 0 ? { ...item, ...change } : item) });
  const failing = [
    { text: "这五周有 4 条记录写到“妈妈”。" },                       // a number not in the fact
    { text: "写到妈妈的日子，你选了“晴朗的心情”。" },               // a quote that is not the user's sentence
    { text: "妈妈让你这几周更开心。" },                              // causation
    { text: "写到妈妈时你的焦虑症轻了一些。" },                      // diagnosis
    { text: "以后会有更多写到妈妈的好日子。" },                      // prediction
    { text: "你应该多给妈妈打电话。" },                              // advice
    { text: "写到妈妈和室友的日子多是晴朗。" },                      // a person not in this candidate's entries
    { text: "写到妈妈的日子是不是更亮？" },                          // a question
    { candidate: "C9" }                                               // not a candidate
  ];
  for (const change of failing) {
    const result = render(short, with0(change));
    assert.equal(result.sections.filter(section => section.kind === "INSIGHT").length, 3, JSON.stringify(change));
    assert.equal(result.sections[1].role, "main");
    assert.notEqual(result.sections[1].type, "HIDDEN_LINK");
    assert.ok(!kinds(result).includes("SIDE_BY_SIDE"));
  }
  const goods = base.insights[2];
  for (const picks of [[], [goods.picks[0]], [goods.picks[0], goods.picks[0]], [goods.picks[0], "S99"]]) {
    const result = render(short, { ...base, insights: base.insights.map(item => item === goods ? { ...item, picks } : item) });
    assert.ok(!result.sections.some(section => section.type === "SMALL_GOODS"), JSON.stringify(picks));
  }
  // An evidence Event that changed after the candidates were built is not quoted.
  const changed = input();
  changed.sourceFence.sources.find(item => item.id === "e-d").memory.summary = "我想早点睡。";
  assert.ok(!render(short, base, changed).sections.some(section => section.type === "SAID_BEFORE"));
});

test("fallback: no valid insight, an error or no room gives exactly the short report", () => {
  const short = prepare(input());
  const v1Short = weeklyShortPacket(buildWeeklyReflectionV2Packet(input()), input());
  const v1 = renderWeeklyShort({ version: WEEKLY_SHORT, locale: "zh-Hans", ...structuredClone(v1Parts) }, input(), v1Short, "model", { petalCards: true });
  assert.deepEqual(kinds(v1), ["LINE_OF_WEEK", "MOOD_CURVE", "PETAL_CARD", "SIDE_BY_SIDE", "QUESTION"]);
  const allBad = answer(short, {}); allBad.insights = allBad.insights.map(item => ({ ...item, text: "你应该多休息。" }));
  for (const output of [answer(short, { insights: [] }), allBad]) assert.deepEqual(render(short, output, input(), true), v1);
  // A broken candidate (thrown inside the insight code) never breaks the report.
  const broken = { ...short, candidates: short.candidates.map(candidate => ({ ...candidate, evidence: null })) };
  assert.deepEqual(render(broken, answer(short), input(), true), v1);
  // A shape that is not the insights contract is rejected like any malformed output.
  assert.throws(() => render(short, { ...answer(short), version: WEEKLY_SHORT }), { code: "REPORT_NARRATIVE_GROUNDING_FAILED" });
});

test("packet: within the unchanged Gateway admission; weakest candidates go first, then long Events, down to one", () => {
  const body = packet => Buffer.byteLength(JSON.stringify({ model: "claude-sonnet-5-5", system: WEEKLY_INSIGHTS_INSTRUCTIONS, max_tokens: 4096,
    messages: [{ role: "user", content: JSON.stringify(packet) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: compileGatewaySchema(WEEKLY_INSIGHTS_SCHEMA).wireSchema } } })) + 1024;
  assert.ok(body(prepare(input()).packet) <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
  // Six 500-character Chinese entries (the stored maximum; the selection bound allows six), every one a bright small good.
  const long = Array.from({ length: 6 }, (_, i) => [`c-${i}`, `2026-09-${String(14 + (i % 7)).padStart(2, "0")}T0${i}:00:00Z`, "SUNNY_BLOOM",
    `${"今天在花园里晒太阳。".repeat(49)}好开心呀。`.slice(0, 500)]);
  const full = prepare(input({ current: long }));
  assert.ok(body(full.packet) <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input, `${body(full.packet)}`);
  assert.ok(full.packet.evidence.length >= 1 && full.packet.evidence.length < 6);
  for (const item of full.packet.evidence) assert.ok(full.refs.has(item.ref));
  assert.equal(full.refs.size, full.packet.evidence.length);
  // The worst case the Event store allows: one 500-character entry made only of characters JSON escapes twice.
  const escaped = [["c-0", "2026-09-14T12:00:00Z", "QUIET_BLOOM", "\"".repeat(500)], ...CURRENT.slice(1)];
  const worst = prepare(input({ current: escaped }));
  assert.ok(body(worst.packet) <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
  assert.ok(INSIGHTS_PACKET_BUDGET > 2 * 500 * 3 + 600, "two full Chinese entries always fit without candidates");
});

test("owner switch: off by default, malformed lists turn it off, and the card pools are drawable", () => {
  assert.equal(weeklyInsightsEnabledFor({}, "alice"), false);
  assert.equal(weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: " bob, alice " }, "alice"), true);
  assert.equal(weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: "*" }, "alice"), true);
  assert.equal(weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: "alice;bob" }, "alice"), false);
  assert.equal(weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: "*" }, ""), false);
  for (const id of Object.values(INSIGHT_CARDS).flat()) assert.equal(petalCard(id)?.heavy, false, id);
});
