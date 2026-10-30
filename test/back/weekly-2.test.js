import assert from "node:assert/strict";
import test from "node:test";
import { compileGatewaySchema } from "../../lib/ai-gateway-schema.js";
import { GATEWAY_TASK_LIMITS } from "../../lib/ai-gateway-config.js";
import { AI_JOB_TYPES, INSIGHT_EXTRACTION_VERSION } from "../../lib/ai-jobs.js";
import { lexiconWords, modelSpans, ruleSpans, runInsightExtraction, sentenceRanges, spanView } from "../../lib/insight-extract.js";
import { computeInsights, keyPhrase } from "../../lib/insight-compute.js";
import { BANNED, checkSentence } from "../../lib/insight-validate.js";
import { renderWeekly2, templateHeadline, WEEKLY_2, WEEKLY_2_INSTRUCTIONS, WEEKLY_2_SCHEMA, weekly2Packet } from "../../lib/insight-write.js";
import { INSIGHT_CARDS } from "../../lib/petal-card-match.js";
import { PrivateReportRepository, WEEKLY_INSIGHT_FEEDBACK } from "../../lib/report-foundation.js";
import { petalCard } from "../../lib/petal-cards.js";
import { weeklyInsightsEnabledFor } from "../../lib/weekly-contract.js";
import { reportShowsEvent, WEEKLY_SHORT, weeklyMoodCurve } from "../../lib/weekly-short.js";

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
function input({ current = CURRENT, earlier = EARLIER, locale = "zh-Hans", extra = {} } = {}) {
  const evidence = current.map(([id, date, , summary], i) => ({ ownerId: "alice", sourceEventId: id, sourceMemoryId: `m-${i}`, summary,
    topics: [], eventDate: date, provenance: { sourceEventId: id, sourceMemoryId: `m-${i}` } }));
  return { reportType: "WEEKLY", ownerId: "alice", locale, period: PERIOD,
    aggregates: { ...PERIOD, ownerId: "alice", eventCount: current.length, topTopics: [] },
    evidenceSelection: { ownerId: "alice", status: "READY", evidence },
    sourceFence: { evidencePolicy: "weekly-localized-v1", thenAndNowLookback: true, sources: [...earlier, ...current].map(source) }, ...extra };
}
const byType = (built, type) => built.candidates.find(candidate => candidate.type === type);
const alias = (built, id) => [...built.aliases].find(([, value]) => value === id)[0];
function answer(built, change = {}) {
  const link = byType(built, "HIDDEN_LINK"), plan = byType(built, "SAID_BEFORE"), goods = byType(built, "SMALL_GOODS"), open = byType(built, "OPEN_QUESTION");
  const cite = candidate => candidate.evidence.map(item => alias(built, item.sourceEventId));
  return { version: WEEKLY_2, locale: "zh-Hans", headline: "说过想跑步，后来也写到了", insights: [
    { id: plan.id, role: "main", text: "9月2日你写过：“我想每天早上跑步。”之后有 1 条写到跑步。", evidence_ids: cite(plan), picks: [] },
    { id: link.id, role: "secondary", text: "这五周有 3 条记录写到“妈妈”，这 3 条的心情都是开心、平静、治愈或温柔。", evidence_ids: cite(link), picks: [] },
    { id: goods.id, role: "secondary", text: "这周你记下了这些小事。", evidence_ids: cite(goods), picks: goods.spans.slice(1, 3).map(span => span.id) },
    { id: open.id, role: "secondary", text: "你问过自己：“我到底想要什么样的生活？”", evidence_ids: cite(open), picks: [] }
  ], question: "下周跑步的时候，你想留意什么？", ...change };
}
const render = (built, output, data = input(), petalCards = false) => renderWeekly2(output, data, built, "model", { petalCards });
const kinds = result => result.sections.map(section => section.kind);

test("extraction rules: every span is the user's exact text at its offsets; sensitive entries give nothing", () => {
  const text = "我打算周末去看海。我不想上班。和室友在公园散步，没睡好。他问我：“你还好吗？”我是不是太着急了？阳光很好。";
  const spans = ruleSpans(text, "SUNNY_BLOOM");
  for (const span of spans) assert.equal(text.slice(span.start, span.end), span.text, JSON.stringify(span));
  const of = kind => spans.filter(span => span.kind === kind).map(span => span.type ? `${span.type}:${span.text}` : span.text);
  assert.deepEqual(of("intent"), ["我打算周末去看海。"]);
  assert.deepEqual(of("question"), ["我是不是太着急了？"]);
  assert.deepEqual(of("selfTalk"), ["我是不是太着急了？"]);
  assert.deepEqual(of("entity"), ["activity:上班", "person:室友", "place:公园", "activity:散步"]);
  assert.deepEqual(of("body"), ["sleep:没睡好", "exercise:散步"]);
  assert.deepEqual(of("smallGood"), ["阳光很好。"]);
  assert.equal(ruleSpans(text, "QUIET_BLOOM").some(span => span.kind === "smallGood"), false, "small goods only from bright moods");
  for (const sensitive of ["他打了我。阳光很好。", "I want to hurt myself. The tea was warm.", "I cannot keep myself safe."]) {
    assert.deepEqual(ruleSpans(sensitive, "SUNNY_BLOOM"), []);
    assert.equal(spanView({ id: "s", text: sensitive, mood: "SUNNY_BLOOM" }).sensitive, true);
  }
  assert.deepEqual(sentenceRanges("一。 二！\n三"), [{ text: "一。", start: 0, end: 2 }, { text: "二！", start: 3, end: 5 }, { text: "三", start: 6, end: 7 }]);
  assert.deepEqual(lexiconWords("我和男朋友去跑步").people, ["男朋友"]);
  const en = ruleSpans("I'm going to call my mom tonight. Why do I always wait? The tea was warm.", "PEACEFUL_BLOOM");
  assert.deepEqual(en.filter(span => span.kind === "intent").map(span => span.text), ["I'm going to call my mom tonight."]);
  assert.deepEqual(en.filter(span => span.kind === "smallGood").map(span => span.text), ["The tea was warm."]);
});

test("model extraction: only exact text survives, sentence kinds widen to the whole sentence, sensitive empties everything", () => {
  const text = "今天和小林喝了一杯热可可。我想早点睡。我是不是太较真了？";
  const { sensitive, spans } = modelSpans(text, { entities: [{ type: "person", text: "小林" }, { type: "place", text: "不存在的地方" }],
    intents: ["想早点睡"], questions: ["我是不是太较真了？", "编造的问题？"], selfTalk: ["我是不是太较真了"], body: [{ type: "sleep", text: "早点睡" }],
    smallGoods: ["一杯热可可"], sensitive: false }, "SUNNY_BLOOM");
  assert.equal(sensitive, false);
  for (const span of spans) assert.equal(text.slice(span.start, span.end), span.text);
  assert.deepEqual(spans.map(span => `${span.kind}:${span.text}`), ["entity:小林", "intent:我想早点睡。", "question:我是不是太较真了？",
    "selfTalk:我是不是太较真了？", "body:早点睡", "smallGood:一杯热可可"]);
  assert.equal(modelSpans(text, { smallGoods: ["一杯热可可"] }, "QUIET_BLOOM").spans.length, 0);
  assert.deepEqual(modelSpans(text, { entities: [], sensitive: true }, "SUNNY_BLOOM"), { sensitive: true, spans: [] });
  // Stored spans are read back only while the Event text still holds them at the same offsets.
  const view = spanView({ id: "x", text, mood: "SUNNY_BLOOM", extraction: { sensitive: false, spans } });
  assert.deepEqual(view.people.map(item => item.word), ["小林"]);
  assert.deepEqual(view.smallGoods.map(item => item.text), ["一杯热可可"]);
  assert.equal(spanView({ id: "x", text: `改过了。${text}`, mood: "SUNNY_BLOOM", extraction: { sensitive: false, spans } }).people[0]?.word, undefined);
});

test("extraction job: code rules unless Haiku is configured; saved under consent and claim; an edited Event is not saved", async () => {
  const event = { id: "ev-1", ownerId: "alice", content: "和妈妈去公园散步。", primaryGardenMood: "SUNNY_BLOOM", memoryProcessingAllowed: true,
    updatedAt: new Date("2026-09-14T12:00:00Z") };
  const fake = (current = event, consent = true) => {
    const saved = [], sql = [];
    const db = { event: { findFirst: async () => current }, eventInsightExtraction: { upsert: async ({ create }) => { saved.push(create); return create; } },
      $queryRawUnsafe: async query => { sql.push(query); return query.includes("AiConsent") ? (consent ? [{ userId: "alice", aiProcessing: true, personalization: true, memoryEnabled: true }] : [])
        : query.includes("UPDATE \"AIJob\"") ? [{ id: "job-1" }] : []; } };
    db.$transaction = fn => fn(db);
    return { db, saved, sql };
  };
  const job = { id: "job-1", ownerId: "alice", eventId: "ev-1", jobType: AI_JOB_TYPES.INSIGHT_EXTRACTION, attemptCount: 1, lockedAt: new Date(),
    idempotencyKey: `INSIGHT_EXTRACTION:ev-1:${INSIGHT_EXTRACTION_VERSION}` };
  const run = await fake();
  const result = await runInsightExtraction({ prisma: run.db, job, workerId: "w", env: {}, fetchImpl: () => assert.fail("no model call") });
  assert.equal(result.status, "RULES"); assert.equal(result.jobCompleted, true);
  assert.equal(run.saved[0].status, "RULES"); assert.equal(run.saved[0].model, null);
  assert.deepEqual(run.saved[0].spans.filter(span => span.kind === "entity").map(span => span.text), ["妈妈", "公园", "散步"]);
  assert.ok(run.sql.some(query => query.includes('UPDATE "AIJob"')), "the job completes in the same transaction");
  const edited = await fake({ ...event, content: "改过了。", updatedAt: new Date() });
  const changed = { ...edited, db: { ...edited.db, event: { findFirst: (() => { let n = 0; return async () => n++ ? { ...event, content: "改过了。" } : event; })() } } };
  changed.db.$transaction = fn => fn(changed.db);
  assert.equal((await runInsightExtraction({ prisma: changed.db, job, workerId: "w", env: {} })).status, "SOURCE_CHANGED");
  assert.equal(changed.saved.length, 0);
  const refused = await fake(event, false);
  await assert.rejects(runInsightExtraction({ prisma: refused.db, job, workerId: "w", env: {} }), { code: "AI_FORBIDDEN" });
  assert.equal(refused.saved.length, 0);
  // Configured for Haiku but the call fails (no gateway here): the code-rule spans are still saved.
  const failing = await fake();
  const viaModel = await runInsightExtraction({ prisma: failing.db, job, workerId: "w",
    env: { AI_INSIGHT_EXTRACTION_PROVIDER: "anthropic", AI_INSIGHT_EXTRACTION_MODEL: "claude-haiku-5-5" }, fetchImpl: () => assert.fail("gateway disabled") });
  assert.equal(viaModel.status, "RULES");
});

test("compute: thresholds per module, code-written facts, priority picks the main insight, last week's main type steps aside", () => {
  const days = weeklyMoodCurve(input()).days, { candidates } = computeInsights(input(), { days });
  assert.deepEqual(candidates.map(candidate => candidate.type), ["SAID_BEFORE", ...candidates.slice(1).map(candidate => candidate.type)]);
  assert.deepEqual(new Set(candidates.map(candidate => candidate.type)), new Set(["SAID_BEFORE", "HIDDEN_LINK", "SMALL_GOODS", "OPEN_QUESTION"]));
  assert.equal(candidates[0].role, "main");
  const link = candidates.find(candidate => candidate.type === "HIDDEN_LINK");
  assert.equal(link.subject, "妈妈"); assert.deepEqual(link.numbers, [3, 3, 11, 6]);
  assert.ok(!candidates.some(candidate => candidate.evidence.some(item => item.sourceEventId === "e-s")), "a sensitive entry is never evidence");
  assert.equal(candidates.find(candidate => candidate.type === "SAID_BEFORE").fact, "9月2日你写过：“我想每天早上跑步。”之后的 7 条记录里，有 1 条写到“跑步”。");
  // Same type is not the main insight two weeks running.
  assert.equal(computeInsights(input(), { days, previousMainType: "SAID_BEFORE" }).candidates[0].type, "HIDDEN_LINK");
  // Stored extractions are used when present (here: the plan sentence is not extracted, so no SAID_BEFORE).
  const stored = { "e-d": { sensitive: false, spans: [] } };
  assert.equal(computeInsights(input({ extra: { insightExtractions: stored } }), { days }).candidates.some(candidate => candidate.type === "SAID_BEFORE"), false);
  const without = (list, id) => list.filter(([key]) => key !== id);
  assert.equal(computeInsights(input({ earlier: without(EARLIER, "e-f") }), { days }).candidates.some(candidate => candidate.type === "HIDDEN_LINK"), false);
  // 走向: four or more moods this week lifting from Mon–Thu to Fri–Sun.
  const lifting = [["c-0", "2026-09-14T12:00:00Z", "QUIET_BLOOM", "a。"], ["c-1", "2026-09-15T12:00:00Z", "DRIFTING_BLOOM", "b。"],
    ["c-2", "2026-09-18T12:00:00Z", "HEALING_BLOOM", "c。"], ["c-3", "2026-09-19T12:00:00Z", "HEALING_BLOOM", "d。"]];
  const trend = computeInsights(input({ current: lifting, earlier: [] }), { days }).candidates;
  assert.deepEqual(trend.map(candidate => [candidate.type, candidate.fact]), [["TREND", "前半周多是「迷茫」，后半周「治愈」多了起来。"]]);
  assert.equal(keyPhrase("周末去看海"), "看海"); assert.equal(keyPhrase("我到底想要什么样的生活？"), null);
});

test("rendering: headline, main insight, bouquet, secondary insights, petal card by the main type, question", () => {
  const built = weekly2Packet(input()), result = render(built, answer(built), input(), true);
  assert.deepEqual(kinds(result), ["HEADLINE", "INSIGHT", "MOOD_CURVE", "INSIGHT", "INSIGHT", "INSIGHT", "PETAL_CARD", "QUESTION"]);
  assert.ok(result.sections.every(section => section.contractVersion === WEEKLY_SHORT), "older app builds still read the report");
  const [headline, main] = result.sections;
  assert.equal(headline.claim, "说过想跑步，后来也写到了"); assert.equal(headline.template, false); assert.equal(headline.reportVersion, WEEKLY_2);
  assert.equal(main.type, "SAID_BEFORE"); assert.equal(main.role, "main");
  assert.deepEqual(main.evidence.map(item => item.sourceEventId), ["e-d", "c-0"]);
  const card = result.sections.find(section => section.kind === "PETAL_CARD");
  assert.ok(INSIGHT_CARDS.SAID_BEFORE.includes(card.cardId));
  assert.equal(card.reason, "你说过“我想每天早上跑步。”，之后 1 次写到它。");
  assert.equal(result.sections.at(-1).claim, "下周跑步的时候，你想留意什么？");
  assert.equal(reportShowsEvent(result.sections, "e-d"), true); assert.equal(reportShowsEvent(result.sections, "e-a"), false);
  // The packet carries only candidates: aliases, facts and quotes; never ids, dates or moods.
  assert.equal(built.packet.version, WEEKLY_2);
  assert.doesNotMatch(JSON.stringify(built.packet), /alice|e-[a-z]|c-\d|BLOOM|2026-|score/);
});

test("validation: each failing insight is dropped alone; a bad headline or question falls back to its template", () => {
  const built = weekly2Packet(input()), base = answer(built);
  const main = change => ({ ...base, insights: base.insights.map((item, i) => i === 0 ? { ...item, ...change } : item) });
  const failing = [
    { text: "9月2日你写过想跑步，之后有 4 条写到跑步。" },          // a number not computed by code
    { text: "你写过：“我想每天跑步。”" },                            // a quote that is not the user's sentence
    { text: "因为想跑步，你早起了。" },                              // causation
    { text: "你是一个很自律的人。" },                                // a label
    { text: "以后会越来越常跑步。" },                                // prediction
    { text: "你应该继续跑步。" },                                    // advice
    { text: "你和室友说过想跑步。" },                                // a person not in this candidate's entries
    { evidence_ids: ["E99"] },                                       // evidence that does not exist
    { evidence_ids: [alias(built, "c-1")] },                         // evidence of another candidate
    { id: "C9" }                                                     // not a candidate
  ];
  for (const change of failing) {
    const result = render(built, main(change));
    assert.equal(result.sections.filter(section => section.kind === "INSIGHT").length, 3, JSON.stringify(change));
    assert.notEqual(result.sections[1].type, "SAID_BEFORE", JSON.stringify(change));
    assert.equal(result.sections[1].role, "main");
  }
  for (const [field, value] of [["headline", "因为妈妈，你很开心"], ["headline", "这是一句超过十六个字的很长很长的标题"], ["question", "你应该早点睡吗？"],
    ["question", "下周你想跑步吗？还是不想？"]]) {
    const result = render(built, { ...base, [field]: value });
    const section = result.sections.find(item => item.kind === (field === "headline" ? "HEADLINE" : "QUESTION"));
    assert.equal(section.template, true, value);
  }
  assert.ok(BANNED["zh-Hans"].test("这预示着什么")); assert.ok(BANNED.en.test("this is because of work"));
  assert.equal(checkSentence("这周有 3 次写到妈妈。", [], input(), { maxLength: 80 }), null, "no digits without a source");
});

test("fallback: with nothing valid the report is built from code templates, never the old short report", () => {
  const built = weekly2Packet(input());
  const allBad = answer(built, { headline: "", question: "" });
  allBad.insights = allBad.insights.map(item => ({ ...item, text: "你应该多休息。" }));
  for (const output of [allBad, null]) {
    const result = render(built, output, input(), true);
    assert.deepEqual(kinds(result), ["HEADLINE", "INSIGHT", "MOOD_CURVE", "PETAL_CARD", "QUESTION"]);
    assert.equal(result.sections[0].claim, templateHeadline(built.candidates[0], "zh-Hans"));
    assert.equal(result.sections[1].template, true);
    assert.equal(result.sections[1].text, built.candidates[0].fact, "the template is the code-written fact line");
    assert.ok(!kinds(result).some(kind => ["LINE_OF_WEEK", "SIDE_BY_SIDE"].includes(kind)));
  }
  // A broken candidate (thrown inside the insight code) never breaks the report.
  const broken = { ...built, candidates: built.candidates.map(candidate => ({ ...candidate, evidence: null })) };
  assert.equal(render(broken, answer(built)).sections[0].kind, "HEADLINE");
  // Fewer than three Events: "这周的花还在长", no insights and no model call needed.
  const few = weekly2Packet(input({ current: CURRENT.slice(0, 2) }));
  assert.equal(few.needsModel, false);
  assert.deepEqual(kinds(render(few, null, input({ current: CURRENT.slice(0, 2) }))), ["HEADLINE", "MOOD_CURVE", "UNLOCK", "QUESTION"]);
  assert.equal(render(few, null, input({ current: CURRENT.slice(0, 2) })).sections[0].claim, "这周的花还在长");
  assert.throws(() => render(built, { ...answer(built), version: WEEKLY_SHORT }), { code: "REPORT_NARRATIVE_GROUNDING_FAILED" });
});

test("packet and switch: the request fits the Gateway admission; the owner list is off by default and malformed means off", () => {
  const body = packet => Buffer.byteLength(JSON.stringify({ model: "claude-sonnet-5-5", system: WEEKLY_2_INSTRUCTIONS, max_tokens: 4096,
    messages: [{ role: "user", content: JSON.stringify(packet) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: compileGatewaySchema(WEEKLY_2_SCHEMA).wireSchema } } })) + 1024;
  assert.ok(body(weekly2Packet(input()).packet) <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input);
  const long = Array.from({ length: 6 }, (_, i) => [`c-${i}`, `2026-09-${String(14 + i).padStart(2, "0")}T0${i}:00:00Z`, "SUNNY_BLOOM",
    `${"今天在花园里晒太阳。".repeat(49)}好开心呀。`.slice(0, 500)]);
  const full = weekly2Packet(input({ current: long }));
  assert.ok(body(full.packet) <= GATEWAY_TASK_LIMITS.WEEKLY_REPORT.input, `${body(full.packet)}`);
  assert.equal(weeklyInsightsEnabledFor({}, "alice"), false);
  assert.equal(weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: " bob, alice " }, "alice"), true);
  assert.equal(weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: "alice;bob" }, "alice"), false);
  for (const id of Object.values(INSIGHT_CARDS).flat()) assert.equal(petalCard(id)?.heavy, false, id);
});

test("insight feedback: the owner marks one insight of their own report; anything else is refused or not found", async () => {
  const sections = [{ kind: "HEADLINE", claim: "h" }, { kind: "INSIGHT", claim: "i", type: "SMALL_GOODS" }, { kind: "QUESTION", claim: "q" }];
  const rows = new Map([["r-alice", { ownerId: "alice", narrativeSections: sections }]]);
  const db = { $queryRawUnsafe: async (query, ...args) => query.includes("AiConsent")
      ? [{ userId: args[0], aiProcessing: true, personalization: true, memoryEnabled: true }]
      : rows.get(args[0])?.ownerId === args[1] ? [{ id: args[0] }] : [],
    weeklyReport: { findFirst: async ({ where }) => rows.get(where.id)?.ownerId === where.ownerId ? rows.get(where.id) : null,
      update: async ({ where, data }) => Object.assign(rows.get(where.id), data) } };
  db.$transaction = fn => fn(db);
  const reports = new PrivateReportRepository(db), alice = { userId: "alice" };
  const hidden = await reports.setWeeklyInsightFeedback({ identity: alice, reportId: "r-alice", index: 1, verdict: "HIDDEN" });
  assert.equal(hidden[1].feedback, "HIDDEN"); assert.equal(rows.get("r-alice").narrativeSections[1].feedback, "HIDDEN");
  assert.equal((await reports.setWeeklyInsightFeedback({ identity: alice, reportId: "r-alice", index: 1, verdict: "INACCURATE" }))[1].feedback, "INACCURATE");
  assert.equal(Object.hasOwn((await reports.setWeeklyInsightFeedback({ identity: alice, reportId: "r-alice", index: 1, verdict: null }))[1], "feedback"), false);
  assert.equal(await reports.setWeeklyInsightFeedback({ identity: alice, reportId: "r-alice", index: 0, verdict: "HIDDEN" }), null, "only INSIGHT sections");
  assert.equal(await reports.setWeeklyInsightFeedback({ identity: { userId: "bob" }, reportId: "r-alice", index: 1, verdict: "HIDDEN" }), null, "never another owner's");
  for (const [index, verdict] of [[1, "WRONG"], [1, undefined], [-1, "HIDDEN"], [1.5, "HIDDEN"], [40, "HIDDEN"]]) {
    await assert.rejects(reports.setWeeklyInsightFeedback({ identity: alice, reportId: "r-alice", index, verdict }), { code: "INSIGHT_FEEDBACK_INVALID" });
  }
  assert.deepEqual(WEEKLY_INSIGHT_FEEDBACK, ["INACCURATE", "HIDDEN"]);
});
