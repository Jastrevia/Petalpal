import { withMemoryConsent } from "./ai-consent.js";
import { requireAiIdentity } from "./ai-identity.js";
import { addLocalDays, localDateForInstant } from "./ai-periods.js";
export { mutedIn } from "./insight-compute.js";

// Weekly 2.0 loop (docs/product/WEEKLY_2.0.md "闭环"): 花语集, 跟进线索, 回答问题, 给未来的信, 屏蔽. Every read and
// write is the authenticated owner's own and holds the Memory consent lock, like the reports these point into.
export const INSIGHT_LOOP_LIMITS = Object.freeze({ threads: 3, word: 64, letter: 280, pendingLetters: 20, letterDays: 366,
  mutes: 50, keeps: 500, collectionReports: 104 });

const fail = (code = "INSIGHT_LOOP_INVALID") => { const error = new Error("Invalid insight loop request"); error.code = code; return error; };
const norm = text => String(text).normalize("NFKC").replace(/\s+/gu, " ").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function loopWord(value) {
  if (typeof value !== "string") throw fail();
  const word = norm(value);
  if (!word || [...word].length > INSIGHT_LOOP_LIMITS.word || /\p{Cc}/u.test(word)) throw fail();
  return word;
}

async function ownedSections(tx, ownerId, reportId) {
  const report = await tx.weeklyReport.findFirst({ where: { id: reportId, ownerId }, select: { id: true, periodKey: true, createdAt: true, narrativeSections: true } });
  return report ? { ...report, sections: Array.isArray(report.narrativeSections) ? report.narrativeSections : [] } : null;
}
async function today(tx, ownerId) {
  const user = await tx.user.findUnique({ where: { id: ownerId }, select: { timezone: true } });
  if (!user) throw fail("AI_FORBIDDEN");
  return localDateForInstant(new Date(), user.timezone);
}
const index = value => Number.isInteger(value) && value >= 0 && value <= 31 ? value : null;

export class InsightLoopRepository {
  constructor(prisma) { this.prisma = prisma; }

  // 花语集: keep (or let go of) one INSIGHT or PETAL_CARD section of the owner's own Weekly report.
  async keep({ identity, reportId, index: at, kept }) {
    const ownerId = requireAiIdentity(identity);
    if (index(at) === null || typeof kept !== "boolean") throw fail();
    return withMemoryConsent(this.prisma, identity, async tx => {
      // Letting go needs no matching section: the report may have been rewritten since.
      if (!kept) { await tx.insightKeep.deleteMany({ where: { ownerId, weeklyReportId: reportId, sectionIndex: at } }); return { kept: false }; }
      const report = await ownedSections(tx, ownerId, reportId), section = report?.sections[at];
      if (!["INSIGHT", "PETAL_CARD"].includes(section?.kind)) return null;
      const where = { ownerId_weeklyReportId_sectionIndex: { ownerId, weeklyReportId: reportId, sectionIndex: at } };
      if (await tx.insightKeep.count({ where: { ownerId } }) >= INSIGHT_LOOP_LIMITS.keeps) throw fail("INSIGHT_LOOP_LIMIT");
      const data = { kind: section.kind === "PETAL_CARD" ? "CARD" : "INSIGHT", cardId: section.kind === "PETAL_CARD" ? String(section.cardId).slice(0, 32) : null };
      await tx.insightKeep.upsert({ where, update: data, create: { ownerId, weeklyReportId: reportId, sectionIndex: at, ...data } });
      return { kept: true };
    });
  }

  // 跟进线索: the insight's own subject word becomes a thread; at most three are active at once.
  async follow({ identity, reportId, index: at }) {
    const ownerId = requireAiIdentity(identity);
    if (index(at) === null) throw fail();
    return withMemoryConsent(this.prisma, identity, async tx => {
      const report = await ownedSections(tx, ownerId, reportId), section = report?.sections[at];
      if (section?.kind !== "INSIGHT" || typeof section.subject !== "string") return null;
      const word = loopWord(section.subject), active = await tx.insightThread.findMany({ where: { ownerId, endedAt: null }, select: { id: true, word: true } });
      const same = active.find(thread => thread.word === word);
      if (same) return { id: same.id, word };
      if (active.length >= INSIGHT_LOOP_LIMITS.threads) throw fail("INSIGHT_LOOP_LIMIT");
      const thread = await tx.insightThread.create({ data: { ownerId, word, insightType: String(section.type).slice(0, 24) }, select: { id: true, word: true } });
      return thread;
    });
  }

  async unfollow({ identity, threadId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, async tx =>
      (await tx.insightThread.updateMany({ where: { id: threadId, ownerId, endedAt: null }, data: { endedAt: new Date() } })).count === 1);
  }

  // 回答问题: an Event the owner wrote after a Weekly report answers its question; the next Weekly quotes it.
  async answer({ identity, reportId, eventId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, async tx => {
      const report = await ownedSections(tx, ownerId, reportId);
      if (!report?.sections.some(section => section?.kind === "QUESTION")) return null;
      const event = await tx.event.findFirst({ where: { id: eventId, ownerId }, select: { id: true, createdAt: true } });
      if (!event || +event.createdAt < +report.createdAt) return null;
      if (await tx.questionAnswer.findUnique({ where: { eventId } })) throw fail();
      await tx.questionAnswer.create({ data: { ownerId, eventId, weeklyReportId: reportId } });
      return { answered: true };
    });
  }

  // 给未来的信: one sentence for a later week (an account-timezone local date, tomorrow to a year ahead).
  async writeLetter({ identity, text, deliverOn }) {
    const ownerId = requireAiIdentity(identity);
    const body = typeof text === "string" ? norm(text) : "";
    if (!body || [...body].length > INSIGHT_LOOP_LIMITS.letter || /\p{Cc}/u.test(body) || typeof deliverOn !== "string" || !DATE.test(deliverOn) ||
        new Date(`${deliverOn}T00:00:00Z`).toISOString().slice(0, 10) !== deliverOn) throw fail();
    return withMemoryConsent(this.prisma, identity, async tx => {
      const now = await today(tx, ownerId);
      if (deliverOn <= now || deliverOn > addLocalDays(now, INSIGHT_LOOP_LIMITS.letterDays)) throw fail();
      if (await tx.futureLetter.count({ where: { ownerId, withdrawnAt: null, deliverOn: { gt: now } } }) >= INSIGHT_LOOP_LIMITS.pendingLetters) throw fail("INSIGHT_LOOP_LIMIT");
      return tx.futureLetter.create({ data: { ownerId, text: body, deliverOn }, select: { id: true, text: true, deliverOn: true, createdAt: true } });
    });
  }

  // Withdrawable until its day comes.
  async withdrawLetter({ identity, letterId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, async tx => {
      const now = await today(tx, ownerId);
      return (await tx.futureLetter.updateMany({ where: { id: letterId, ownerId, withdrawnAt: null, deliverOn: { gt: now } },
        data: { withdrawnAt: new Date() } })).count === 1;
    });
  }

  async mute({ identity, word, muted }) {
    const ownerId = requireAiIdentity(identity), clean = loopWord(word);
    if (typeof muted !== "boolean") throw fail();
    return withMemoryConsent(this.prisma, identity, async tx => {
      if (!muted) { await tx.insightMute.deleteMany({ where: { ownerId, word: clean } }); return { word: clean, muted: false }; }
      if (await tx.insightMute.count({ where: { ownerId } }) >= INSIGHT_LOOP_LIMITS.mutes) throw fail("INSIGHT_LOOP_LIMIT");
      await tx.insightMute.upsert({ where: { ownerId_word: { ownerId, word: clean } }, update: {}, create: { ownerId, word: clean } });
      return { word: clean, muted: true };
    });
  }

  // The 花语集 book: every petal card the owner's Weekly reports drew (one entry per card, its reasons stacked, newest
  // first), the insights they kept, active threads, letters and muted words. Nothing here says how many are missing.
  async collection({ identity }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, async tx => {
      const [reports, keeps, threads, letters, mutes, now] = await Promise.all([
        tx.weeklyReport.findMany({ where: { ownerId }, orderBy: { periodStartUtc: "desc" }, take: INSIGHT_LOOP_LIMITS.collectionReports,
          select: { id: true, periodKey: true, narrativeSections: true } }),
        tx.insightKeep.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: INSIGHT_LOOP_LIMITS.keeps,
          select: { weeklyReportId: true, sectionIndex: true, kind: true, cardId: true } }),
        tx.insightThread.findMany({ where: { ownerId, endedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, word: true, insightType: true, createdAt: true } }),
        tx.futureLetter.findMany({ where: { ownerId, withdrawnAt: null }, orderBy: { deliverOn: "asc" }, select: { id: true, text: true, deliverOn: true, createdAt: true } }),
        tx.insightMute.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" }, select: { word: true } }),
        today(tx, ownerId)
      ]);
      const byId = new Map(reports.map(report => [report.id, report]));
      const sectionOf = keep => { const sections = byId.get(keep.weeklyReportId)?.narrativeSections; return Array.isArray(sections) ? sections[keep.sectionIndex] : null; };
      const keptCards = new Set(keeps.filter(keep => keep.kind === "CARD" && sectionOf(keep)?.cardId === keep.cardId).map(keep => keep.cardId));
      const cards = new Map();
      for (const report of reports) for (const section of Array.isArray(report.narrativeSections) ? report.narrativeSections : []) {
        if (section?.kind !== "PETAL_CARD" || typeof section.cardId !== "string") continue;
        if (!cards.has(section.cardId)) cards.set(section.cardId, { cardId: section.cardId, name: section.name, line: section.line, kept: keptCards.has(section.cardId), appearances: [] });
        cards.get(section.cardId).appearances.push({ reportId: report.id, periodKey: report.periodKey, reason: typeof section.reason === "string" ? section.reason : null });
      }
      const insights = keeps.filter(keep => keep.kind === "INSIGHT" && sectionOf(keep)?.kind === "INSIGHT").map(keep => {
        const section = sectionOf(keep);
        return { reportId: keep.weeklyReportId, periodKey: byId.get(keep.weeklyReportId).periodKey, index: keep.sectionIndex, type: section.type,
          text: section.text, items: section.items ?? [], quote: section.quote ?? null, evidence: section.evidence ?? [] };
      });
      return { cards: [...cards.values()], insights, threads,
        // A delivered letter's words now live in the Weekly report that carried it.
        letters: letters.map(letter => ({ ...letter, delivered: letter.deliverOn <= now })), mutes: mutes.map(mute => mute.word), today: now };
    });
  }
}

// Loaded into a Weekly 2.0 report input (lib/report-foundation.js): muted words, active threads, this week's answers
// to earlier questions and the letters due by the week's last day that no saved report has carried yet.
export async function weeklyLoopContext(prisma, ownerId, period, currentEventIds) {
  const lastDay = addLocalDays(period.periodKey, 6);
  const [mutes, threads, answers, letters] = await Promise.all([
    prisma.insightMute.findMany({ where: { ownerId }, select: { word: true } }),
    prisma.insightThread.findMany({ where: { ownerId, endedAt: null, createdAt: { lt: new Date(period.periodEndUtc) } }, orderBy: { createdAt: "asc" },
      take: INSIGHT_LOOP_LIMITS.threads, select: { id: true, word: true } }),
    currentEventIds.length ? prisma.questionAnswer.findMany({ where: { ownerId, eventId: { in: currentEventIds } }, orderBy: { createdAt: "asc" },
      select: { eventId: true, weeklyReport: { select: { periodKey: true, narrativeSections: true } } } }) : [],
    prisma.futureLetter.findMany({ where: { ownerId, withdrawnAt: null, deliverOn: { lte: lastDay } }, orderBy: { deliverOn: "asc" },
      take: INSIGHT_LOOP_LIMITS.pendingLetters, select: { id: true, text: true, deliverOn: true, createdAt: true } })
  ]);
  let due = letters;
  if (letters.length) {
    const carried = new Set((await prisma.weeklyReport.findMany({ where: { ownerId, periodKey: { gte: addLocalDays(letters[0].deliverOn, -6), not: period.periodKey } },
      select: { narrativeSections: true } })).flatMap(report => (Array.isArray(report.narrativeSections) ? report.narrativeSections : [])
      .filter(section => section?.kind === "LETTER").map(section => section.letterId)));
    due = letters.filter(letter => !carried.has(letter.id));
  }
  return {
    mutes: mutes.map(mute => mute.word),
    threads,
    answers: answers.map(answer => ({ sourceEventId: answer.eventId, periodKey: answer.weeklyReport.periodKey,
      question: (Array.isArray(answer.weeklyReport.narrativeSections) ? answer.weeklyReport.narrativeSections : []).find(section => section?.kind === "QUESTION")?.claim ?? null }))
      .filter(answer => answer.periodKey < period.periodKey && typeof answer.question === "string"),
    letters: due.map(letter => ({ id: letter.id, text: letter.text, deliverOn: letter.deliverOn,
      writtenOn: localDateForInstant(new Date(letter.createdAt), period.timezone) }))
  };
}
