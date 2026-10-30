import assert from "node:assert/strict";
import test from "node:test";
import { AlmanacRepository, buildAlmanac } from "../../lib/almanac.js";

// Synthetic Events and reports only.
const event = (id, date, mood, summary) => ({ id, occurredAt: new Date(date), primaryGardenMood: mood, memory: { summary, ownerId: "alice", memoryType: "EVENT" } });
const EVENTS = [
  event("a", "2026-01-05T12:00:00Z", "QUIET_BLOOM", "和室友去公园散步。"),
  event("b", "2026-03-10T12:00:00Z", "SUNNY_BLOOM", "又和室友吃火锅。阳光很好。"),
  event("c", "2026-03-10T20:00:00Z", "PEACEFUL_BLOOM", "喝了一杯热可可。"),
  event("d", "2026-07-02T12:00:00Z", "GENTLE_BLOOM", "室友送了我一盆花。阳光很好。"),
  event("e", "2026-10-20T12:00:00Z", "SUNNY_BLOOM", "今天去面试了。"),
  event("x", "2025-12-31T12:00:00Z", "SUNNY_BLOOM", "去年的事。")
];
const card = (cardId, name, reason) => ({ kind: "PETAL_CARD", cardId, name, line: "l", reason });
const WEEKS = [
  { periodKey: "2026-03-09", narrativeSections: [card("cups-03", "圣杯三", "三月的理由。")] },
  { periodKey: "2026-06-29", narrativeSections: [card("cups-03", "圣杯三", "七月的理由。")] },
  { periodKey: "2026-10-19", narrativeSections: [card("major-00", "愚者", "这是你第一次写到面试。"),
    { kind: "INSIGHT", type: "FIRST_TIME", subject: "面试", evidence: [{ sourceEventId: "e", date: "2026-10-20" }] },
    { kind: "INSIGHT", type: "FIRST_TIME", subject: "辞职", feedback: "HIDDEN", evidence: [{ sourceEventId: "e", date: "2026-10-20" }] }] }
];

test("花语年鉴: twelve month gardens, the most returning theme with its first and latest words, firsts, goods and the year's card", () => {
  const book = buildAlmanac({ year: 2026, timezone: "UTC", locale: "zh-Hans", events: EVENTS, weeks: WEEKS });
  assert.equal(book.months.length, 12);
  assert.equal(book.months[1].days.length, 28);
  assert.equal(book.months[2].days.find(day => day.date === "2026-03-10").mood, "PEACEFUL_BLOOM", "a tie goes to the later entry");
  assert.equal(book.months[2].days.find(day => day.date === "2026-03-11").mood, null);
  assert.equal(book.entries, 5, "last year's entry is not this year's");
  assert.equal(book.summary, "这一年你在 4 天里写下了 5 条记录。");
  assert.equal(book.echo.word, "室友");
  assert.deepEqual([book.echo.first.text, book.echo.last.text], ["和室友去公园散步。", "室友送了我一盆花。"]);
  assert.equal(book.echo.line, "“室友”在 3 个月里出现了 3 次。");
  assert.deepEqual(book.firsts.map(item => [item.word, item.date]), [["面试", "2026-10-20"]], "a hidden one is left out");
  assert.deepEqual(book.goods.map(item => [item.text, item.count]).slice(0, 1), [["阳光很好。", 2]]);
  assert.equal(book.card.name, "圣杯三");
  assert.deepEqual(book.card.reasons.map(item => item.reason), ["三月的理由。", "七月的理由。"]);
  assert.equal(book.card.line, "这一年抽到了 2 次。");
  const muted = buildAlmanac({ year: 2026, timezone: "UTC", locale: "zh-Hans", events: EVENTS, weeks: WEEKS, mutes: ["室友", "面试"] });
  assert.equal(muted.echo, null);
  assert.deepEqual(muted.firsts, []);
  const gone = buildAlmanac({ year: 2026, timezone: "UTC", locale: "en", events: EVENTS.filter(item => item.id !== "e"), weeks: WEEKS });
  assert.deepEqual(gone.firsts, [], "a first time whose Event is gone is not shown");
  assert.equal(gone.summary, "4 entries on 3 days.");
});

test("花语年鉴 access: this year's opens on 25 December in the account's day; earlier years any time; owner-only reads", async () => {
  const calls = [];
  const tx = {
    $queryRawUnsafe: async () => [{ aiProcessing: true, personalization: true, memoryEnabled: true }],
    user: { findUnique: async () => ({ timezone: "Asia/Tokyo", preferredLocale: "zh-Hans" }) },
    event: { findMany: async args => { calls.push(args.where); return EVENTS; } },
    weeklyReport: { findMany: async args => { calls.push(args.where); return args.select.narrativeSections ? WEEKS : [{ periodKey: "2025-12-29" }, ...WEEKS]; } },
    insightMute: { findMany: async () => [] }
  };
  const repo = new AlmanacRepository({ $transaction: fn => fn(tx) });
  // 2026-12-24T15:30Z is already 25 December in Tokyo.
  await assert.rejects(repo.almanac({ identity: { userId: "alice" }, year: 2026, now: new Date("2026-12-24T14:00:00Z") }), { code: "ALMANAC_NOT_YET" });
  const book = await repo.almanac({ identity: { userId: "alice" }, year: 2026, now: new Date("2026-12-24T15:30:00Z") });
  assert.equal(book.year, 2026);
  assert(calls.every(where => where.ownerId === "alice"));
  assert.deepEqual((await repo.years({ identity: { userId: "alice" }, now: new Date("2026-06-01T00:00:00Z") })).years, [2025]);
  assert.deepEqual((await repo.years({ identity: { userId: "alice" }, now: new Date("2026-12-26T00:00:00Z") })).years, [2026, 2025]);
  await assert.rejects(repo.almanac({ identity: { userId: "alice" }, year: 1999 }), { code: "ALMANAC_INVALID" });
  const revoked = new AlmanacRepository({ $transaction: fn => fn({ ...tx, $queryRawUnsafe: async () => [] }) });
  await assert.rejects(revoked.almanac({ identity: { userId: "alice" }, year: 2025 }), { code: "AI_FORBIDDEN" });
});
