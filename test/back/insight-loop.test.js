import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, localDateForInstant } from "../../lib/ai-periods.js";
import { INSIGHT_LOOP_LIMITS, InsightLoopRepository, weeklyLoopContext } from "../../lib/insight-loop.js";
import { computeInsights } from "../../lib/insight-compute.js";
import { renderWeekly2, weekly2Packet } from "../../lib/insight-write.js";
import { reportShowsEvent } from "../../lib/weekly-short.js";

// Synthetic owners and text only. A tiny in-memory stand-in for the Prisma calls lib/insight-loop.js makes.
const matches = (row, where = {}) => Object.entries(where).every(([key, want]) => {
  const have = row[key];
  if (want === null) return have === null || have === undefined;
  if (want && typeof want === "object" && !(want instanceof Date)) {
    return (want.in === undefined || want.in.includes(have)) && (want.not === undefined || have !== want.not) &&
      (want.gt === undefined || have > want.gt) && (want.gte === undefined || have >= want.gte) &&
      (want.lt === undefined || have < want.lt) && (want.lte === undefined || have <= want.lte);
  }
  return have === want;
});
function fakeDb({ consent = true } = {}) {
  let next = 0;
  const tables = { weeklyReport: [], insightKeep: [], insightThread: [], event: [], questionAnswer: [], futureLetter: [], insightMute: [],
    user: [{ id: "alice", timezone: "UTC" }, { id: "bob", timezone: "UTC" }] };
  const model = name => ({
    findFirst: async ({ where }) => tables[name].find(row => matches(row, where)) ?? null,
    findUnique: async ({ where }) => tables[name].find(row => matches(row, Object.values(where)[0] && typeof Object.values(where)[0] === "object" ? Object.values(where)[0] : where)) ?? null,
    findMany: async ({ where, take, orderBy } = {}) => {
      let rows = tables[name].filter(row => matches(row, where));
      if (orderBy) { const [[key, dir]] = Object.entries(orderBy); rows = [...rows].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (dir === "desc" ? -1 : 1)); }
      rows = rows.slice(0, take ?? rows.length);
      return name === "questionAnswer" ? rows.map(row => ({ ...row, weeklyReport: tables.weeklyReport.find(report => report.id === row.weeklyReportId) })) : rows;
    },
    count: async ({ where }) => tables[name].filter(row => matches(row, where)).length,
    create: async ({ data }) => { const row = { id: `${name}-${++next}`, createdAt: new Date(), endedAt: null, withdrawnAt: null, ...data }; tables[name].push(row); return row; },
    upsert: async ({ where, create, update }) => {
      const key = Object.values(where)[0], row = tables[name].find(item => matches(item, key));
      if (row) { Object.assign(row, update); return row; }
      const made = { id: `${name}-${++next}`, createdAt: new Date(), ...create }; tables[name].push(made); return made;
    },
    updateMany: async ({ where, data }) => { const rows = tables[name].filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    deleteMany: async ({ where }) => { const before = tables[name].length; tables[name] = tables[name].filter(row => !matches(row, where)); return { count: before - tables[name].length }; }
  });
  const tx = Object.fromEntries(Object.keys(tables).map(name => [name, model(name)]));
  tx.$queryRawUnsafe = async () => consent ? [{ aiProcessing: true, personalization: true, memoryEnabled: true }] : [];
  return { tables, prisma: { ...tx, $transaction: fn => fn(tx) } };
}
const alice = { userId: "alice" }, bob = { userId: "bob" };
const SECTIONS = [
  { kind: "HEADLINE", claim: "h" },
  { kind: "INSIGHT", type: "HIDDEN_LINK", subject: "妈妈", text: "写到“妈妈”的日子……", evidence: [{ sourceEventId: "c-1", date: "2026-09-15" }] },
  { kind: "INSIGHT", type: "SMALL_GOODS", subject: null, text: "小事", items: [] },
  { kind: "PETAL_CARD", cardId: "two-of-cups", name: "圣杯二", line: "相遇", reason: "写到妈妈的日子，你常选『温柔』。" },
  { kind: "QUESTION", claim: "下周你想留意什么？" }
];
function seeded() {
  const db = fakeDb();
  db.tables.weeklyReport.push({ id: "w1", ownerId: "alice", periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14"), createdAt: new Date("2026-09-21T01:00:00Z"), narrativeSections: SECTIONS },
    { id: "w0", ownerId: "alice", periodKey: "2026-09-07", periodStartUtc: new Date("2026-09-07"), createdAt: new Date("2026-09-14T01:00:00Z"),
      narrativeSections: [{ kind: "PETAL_CARD", cardId: "two-of-cups", name: "圣杯二", line: "相遇", reason: "上周的理由。" }] },
    { id: "wb", ownerId: "bob", periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14"), createdAt: new Date("2026-09-21T01:00:00Z"), narrativeSections: SECTIONS });
  db.tables.event.push({ id: "late", ownerId: "alice", createdAt: new Date("2026-09-22T09:00:00Z") }, { id: "early", ownerId: "alice", createdAt: new Date("2026-09-20T09:00:00Z") },
    { id: "bobs", ownerId: "bob", createdAt: new Date("2026-09-22T09:00:00Z") });
  return { ...db, loop: new InsightLoopRepository(db.prisma) };
}

test("花语集: keep and let go of the owner's own insight or card section; cards stack their reasons; stale keeps drop out", async () => {
  const { loop, tables } = seeded();
  assert.deepEqual(await loop.keep({ identity: alice, reportId: "w1", index: 1, kept: true }), { kept: true });
  assert.deepEqual(await loop.keep({ identity: alice, reportId: "w1", index: 3, kept: true }), { kept: true });
  assert.deepEqual(await loop.keep({ identity: alice, reportId: "w1", index: 1, kept: true }), { kept: true }, "keeping twice is one row");
  assert.equal(tables.insightKeep.length, 2);
  assert.equal(tables.insightKeep.find(row => row.kind === "CARD").cardId, "two-of-cups");
  assert.equal(await loop.keep({ identity: alice, reportId: "w1", index: 0, kept: true }), null, "a headline is not keepable");
  assert.equal(await loop.keep({ identity: bob, reportId: "w1", index: 1, kept: true }), null, "another owner's report");
  await assert.rejects(loop.keep({ identity: alice, reportId: "w1", index: 40, kept: true }), { code: "INSIGHT_LOOP_INVALID" });
  await assert.rejects(loop.keep({ identity: alice, reportId: "w1", index: 1, kept: "yes" }), { code: "INSIGHT_LOOP_INVALID" });
  const book = await loop.collection({ identity: alice });
  assert.deepEqual(book.cards.map(card => [card.cardId, card.kept, card.appearances.map(item => item.reason)]),
    [["two-of-cups", true, ["写到妈妈的日子，你常选『温柔』。", "上周的理由。"]]]);
  assert.deepEqual(book.insights.map(item => [item.reportId, item.index, item.type]), [["w1", 1, "HIDDEN_LINK"]]);
  assert.equal(JSON.stringify(book).includes("missing"), false);
  // The report was rewritten: the kept index now points at a different kind and is left out.
  tables.weeklyReport[0].narrativeSections = [{ kind: "HEADLINE" }, { kind: "QUESTION", claim: "?" }];
  assert.deepEqual((await loop.collection({ identity: alice })).insights, []);
  assert.deepEqual(await loop.keep({ identity: alice, reportId: "w1", index: 1, kept: false }), { kept: false });
  assert.equal(tables.insightKeep.filter(row => row.sectionIndex === 1).length, 0);
  const revoked = new InsightLoopRepository(fakeDb({ consent: false }).prisma);
  await assert.rejects(revoked.collection({ identity: alice }), { code: "AI_FORBIDDEN" });
});

test("跟进线索: an insight's subject becomes a thread, at most three active, cancellable, owner-only", async () => {
  const { loop, tables } = seeded();
  const thread = await loop.follow({ identity: alice, reportId: "w1", index: 1 });
  assert.equal(thread.word, "妈妈");
  assert.equal((await loop.follow({ identity: alice, reportId: "w1", index: 1 })).id, thread.id, "following again is the same thread");
  assert.equal(await loop.follow({ identity: alice, reportId: "w1", index: 2 }), null, "small goods have no subject to follow");
  tables.insightThread.push({ id: "t2", ownerId: "alice", word: "跑步", endedAt: null }, { id: "t3", ownerId: "alice", word: "论文", endedAt: null });
  tables.weeklyReport[0].narrativeSections = [...SECTIONS.slice(0, 2), { kind: "INSIGHT", type: "SAID_BEFORE", subject: "早睡" }];
  await assert.rejects(loop.follow({ identity: alice, reportId: "w1", index: 2 }), { code: "INSIGHT_LOOP_LIMIT" });
  assert.equal(await loop.unfollow({ identity: bob, threadId: "t2" }), false);
  assert.equal(await loop.unfollow({ identity: alice, threadId: "t2" }), true);
  assert.equal(await loop.unfollow({ identity: alice, threadId: "t2" }), false, "already ended");
  assert.equal((await loop.follow({ identity: alice, reportId: "w1", index: 2 })).word, "早睡");
  assert.deepEqual((await loop.collection({ identity: alice })).threads.map(item => item.word).sort(), ["妈妈", "早睡", "论文"].sort());
});

test("回答问题: only the owner's Event written after the report answers it, once", async () => {
  const { loop, tables } = seeded();
  assert.equal(await loop.answer({ identity: alice, reportId: "w1", eventId: "early" }), null, "written before the report");
  assert.equal(await loop.answer({ identity: alice, reportId: "w1", eventId: "bobs" }), null, "another owner's Event");
  assert.equal(await loop.answer({ identity: alice, reportId: "w0", eventId: "late" }), null, "a report without a question");
  assert.deepEqual(await loop.answer({ identity: alice, reportId: "w1", eventId: "late" }), { answered: true });
  await assert.rejects(loop.answer({ identity: alice, reportId: "w1", eventId: "late" }), { code: "INSIGHT_LOOP_INVALID" });
  assert.equal(tables.questionAnswer.length, 1);
});

test("给未来的信: tomorrow to a year ahead in the account's day, at most 20 pending, withdrawable until its day", async () => {
  const { loop, tables } = seeded();
  const today = localDateForInstant(new Date(), "UTC");
  for (const bad of [today, addLocalDays(today, -3), addLocalDays(today, 367), "2026-02-30", "soon"]) {
    await assert.rejects(loop.writeLetter({ identity: alice, text: "记得看海。", deliverOn: bad }), { code: "INSIGHT_LOOP_INVALID" }, bad);
  }
  for (const bad of ["", "   ", "字".repeat(281), "a\u0007b", 7]) await assert.rejects(loop.writeLetter({ identity: alice, text: bad, deliverOn: addLocalDays(today, 7) }), { code: "INSIGHT_LOOP_INVALID" });
  const letter = await loop.writeLetter({ identity: alice, text: "  记得  看海。 ", deliverOn: addLocalDays(today, 14) });
  assert.equal(letter.text, "记得 看海。");
  assert.equal(await loop.withdrawLetter({ identity: bob, letterId: letter.id }), false);
  assert.equal(await loop.withdrawLetter({ identity: alice, letterId: letter.id }), true);
  tables.futureLetter.push({ id: "past", ownerId: "alice", text: "old", deliverOn: today, withdrawnAt: null, createdAt: new Date() });
  assert.equal(await loop.withdrawLetter({ identity: alice, letterId: "past" }), false, "its day has come");
  assert.deepEqual((await loop.collection({ identity: alice })).letters.map(item => [item.id, item.delivered]), [["past", true]]);
  for (let i = 0; i < INSIGHT_LOOP_LIMITS.pendingLetters; i++) tables.futureLetter.push({ id: `p${i}`, ownerId: "alice", text: "x", deliverOn: addLocalDays(today, 30), withdrawnAt: null });
  await assert.rejects(loop.writeLetter({ identity: alice, text: "再一封", deliverOn: addLocalDays(today, 9) }), { code: "INSIGHT_LOOP_LIMIT" });
});

test("屏蔽: words are cleaned, unique, removable and capped", async () => {
  const { loop, tables } = seeded();
  assert.deepEqual(await loop.mute({ identity: alice, word: " 小林 ", muted: true }), { word: "小林", muted: true });
  await loop.mute({ identity: alice, word: "小林", muted: true });
  assert.equal(tables.insightMute.length, 1);
  for (const bad of ["", "x".repeat(65), 3]) await assert.rejects(loop.mute({ identity: alice, word: bad, muted: true }), { code: "INSIGHT_LOOP_INVALID" });
  assert.deepEqual((await loop.collection({ identity: alice })).mutes, ["小林"]);
  await loop.mute({ identity: alice, word: "小林", muted: false });
  assert.equal(tables.insightMute.length, 0);
  for (let i = 0; i < INSIGHT_LOOP_LIMITS.mutes; i++) tables.insightMute.push({ ownerId: "alice", word: `w${i}` });
  await assert.rejects(loop.mute({ identity: alice, word: "one more", muted: true }), { code: "INSIGHT_LOOP_LIMIT" });
});

// ---- the Weekly 2.0 report side ----
const PERIOD = { periodKey: "2026-09-14", periodStartUtc: new Date("2026-09-14T00:00:00Z"), periodEndUtc: new Date("2026-09-21T00:00:00Z"), timezone: "UTC" };
const EARLIER = [
  ["e-a", "2026-08-20T12:00:00Z", "QUIET_BLOOM", "今天加班到很晚，有点累。"],
  ["e-c", "2026-08-30T12:00:00Z", "DRIFTING_BLOOM", "不知道接下来该怎么办。"],
  ["e-g", "2026-09-10T12:00:00Z", "QUIET_BLOOM", "论文还没写完。"],
  ["e-b", "2026-08-25T12:00:00Z", "SUNNY_BLOOM", "和妈妈视频聊了一个小时。"],
  ["e-d", "2026-09-02T12:00:00Z", "SUNNY_BLOOM", "我想每天早上跑步。"],
  ["e-e", "2026-09-05T12:00:00Z", "QUIET_BLOOM", "下雨了，一整天没出门。"],
  ["e-f", "2026-09-08T12:00:00Z", "PEACEFUL_BLOOM", "妈妈寄来了自己做的月饼。"]
];
const CURRENT = [
  ["c-0", "2026-09-14T12:00:00Z", "SUNNY_BLOOM", "早上跑步了五公里。阳光照在河面上。"],
  ["c-1", "2026-09-15T12:00:00Z", "GENTLE_BLOOM", "给妈妈打了电话。她笑得很开心。"],
  ["c-2", "2026-09-17T12:00:00Z", "HEALING_BLOOM", "我想留意自己什么时候最放松。楼下的面包店送了我一块蛋糕。"],
  ["c-3", "2026-09-19T12:00:00Z", "PEACEFUL_BLOOM", "晚上又去跑步了。风很舒服。"]
];
const source = ([id, date, mood, summary]) => ({ id, occurredAt: +new Date(date), primaryGardenMood: mood, memory: { summary, topics: [] } });
const input = (loop, current = CURRENT) => ({ reportType: "WEEKLY", ownerId: "alice", locale: "zh-Hans", period: PERIOD,
  aggregates: { ...PERIOD, ownerId: "alice", eventCount: current.length, topTopics: [] },
  evidenceSelection: { ownerId: "alice", status: "READY", evidence: [] },
  sourceFence: { evidencePolicy: "weekly-localized-v1", thenAndNowLookback: true, sources: [...EARLIER, ...current].map(source) }, ...(loop ? { loop } : {}) });
const sectionsOf = data => renderWeekly2(null, data, weekly2Packet(data), null).sections;

test("weekly: threads count this week's mentions, an answer and due letters appear before the question, code-written", () => {
  const data = input({ mutes: [], threads: [{ id: "t1", word: "跑步" }, { id: "t2", word: "论文" }],
    answers: [{ sourceEventId: "c-2", periodKey: "2026-09-07", question: "下周你想留意什么？" }],
    letters: [{ id: "l1", text: "希望你还在跑步。", writtenOn: "2026-08-01", deliverOn: "2026-09-16" }] });
  const sections = sectionsOf(data), kinds = sections.map(section => section.kind);
  assert.deepEqual(kinds.slice(-5), ["THREAD", "THREAD", "ANSWER", "LETTER", "QUESTION"]);
  const [run, paper] = sections.filter(section => section.kind === "THREAD");
  assert.equal(run.claim, "你在跟进的“跑步”：这周写到 2 次。");
  assert.deepEqual(run.evidence.map(item => item.sourceEventId), ["c-0", "c-3"]);
  assert.equal(paper.claim, "你在跟进的“论文”：这周没有写到。");
  const answer = sections.find(section => section.kind === "ANSWER");
  assert.equal(answer.quote.text, "我想留意自己什么时候最放松。");
  assert.equal(answer.claim, "你回答了“下周你想留意什么？”：“我想留意自己什么时候最放松。”");
  assert.equal(sections.find(section => section.kind === "LETTER").text, "希望你还在跑步。");
  assert.equal(reportShowsEvent(sections.filter(section => section.kind === "THREAD"), "c-3"), true);
  assert.equal(reportShowsEvent(sections.filter(section => section.kind === "ANSWER"), "c-2"), true);
  assert.deepEqual(sections.filter(section => section.kind === "UNLOCK").map(section => section.module), ["RHYTHM"], "a full week shows only the next cumulative threshold");
});

test("weekly: a muted word removes candidates, threads and answers that carry it; a short week shows the real threshold", () => {
  const plain = computeInsights(input(null), { days: [] });
  assert(plain.candidates.some(candidate => candidate.subject === "妈妈"), "the fixture finds 妈妈 unmuted");
  const muted = input({ mutes: ["妈妈"], threads: [{ id: "t1", word: "妈妈" }], answers: [], letters: [] });
  const computed = computeInsights(muted, { days: [] });
  assert.equal(computed.candidates.some(candidate => [candidate.subject, candidate.fact, ...candidate.spans.map(span => span.text)].join(" ").includes("妈妈")), false);
  assert.equal(sectionsOf(muted).some(section => section.kind === "THREAD"), false);
  const short = input({ mutes: [], threads: [], answers: [], letters: [] }, CURRENT.slice(0, 2));
  const unlock = sectionsOf(short).find(section => section.kind === "UNLOCK");
  assert.equal(unlock.claim, "一周写下 3 条，就能看到这周的洞察。");
});

test("weekly loop context: answers only to earlier weeks, letters due by the week's end and not carried before", async () => {
  const { prisma, tables } = fakeDb();
  tables.insightMute.push({ ownerId: "alice", word: "小林" });
  tables.insightThread.push({ id: "t1", ownerId: "alice", word: "跑步", endedAt: null, createdAt: new Date("2026-09-01") },
    { id: "t9", ownerId: "alice", word: "later", endedAt: null, createdAt: new Date("2026-09-30") });
  tables.weeklyReport.push({ id: "prev", ownerId: "alice", periodKey: "2026-09-07", narrativeSections: [{ kind: "QUESTION", claim: "问？" }, { kind: "LETTER", letterId: "carried" }] },
    { id: "same", ownerId: "alice", periodKey: "2026-09-14", narrativeSections: [{ kind: "QUESTION", claim: "本周？" }, { kind: "LETTER", letterId: "regen" }] });
  tables.questionAnswer.push({ ownerId: "alice", eventId: "c-2", weeklyReportId: "prev", createdAt: new Date() }, { ownerId: "alice", eventId: "c-3", weeklyReportId: "same", createdAt: new Date() });
  const letter = (id, deliverOn) => ({ id, ownerId: "alice", text: id, deliverOn, withdrawnAt: null, createdAt: new Date("2026-08-01T12:00:00Z") });
  tables.futureLetter.push(letter("carried", "2026-09-10"), letter("missed", "2026-09-11"), letter("regen", "2026-09-15"), letter("future", "2026-09-21"));
  const context = await weeklyLoopContext(prisma, "alice", PERIOD, ["c-2", "c-3"]);
  assert.deepEqual(context.mutes, ["小林"]);
  assert.deepEqual(context.threads.map(thread => thread.id), ["t1"]);
  assert.deepEqual(context.answers, [{ sourceEventId: "c-2", periodKey: "2026-09-07", question: "问？" }]);
  assert.deepEqual(context.letters.map(item => [item.id, item.writtenOn]), [["missed", "2026-08-01"], ["regen", "2026-08-01"]]);
});

test("不准确 summary: per-type counts only, no text or ids", async () => {
  const { summarizeInsightFeedback } = await import("../../lib/insight-feedback-summary.js");
  const summary = summarizeInsightFeedback([{ narrativeSections: [{ kind: "INSIGHT", type: "HIDDEN_LINK", role: "main", text: "私密的话", feedback: "INACCURATE" },
    { kind: "INSIGHT", type: "HIDDEN_LINK", role: "secondary", template: true, feedback: "HIDDEN" }, { kind: "QUESTION", claim: "?" }] },
    { narrativeSections: [{ kind: "INSIGHT", type: "TREND", role: "main" }] }, { narrativeSections: null }]);
  assert.deepEqual(summary, { HIDDEN_LINK: { shown: 2, main: 1, template: 1, inaccurate: 1, hidden: 1, inaccurateRate: 0.5 },
    TREND: { shown: 1, main: 1, template: 0, inaccurate: 0, hidden: 0, inaccurateRate: 0 } });
  assert.equal(JSON.stringify(summary).includes("私密"), false);
});
