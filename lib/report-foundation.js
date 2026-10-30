import { withMemoryConsent } from "./ai-consent.js";
import { assertOwnerIdentity, requireAiIdentity } from "./ai-identity.js";
import {
  localDateForInstant,
  monthlyPeriodFor,
  previousMonthlyPeriod,
  previousWeeklyPeriod,
  reportPeriodStatus,
  weeklyLookbackStart,
  weeklyPeriodForLocalDate,
  weeklyReportPeriodStatus,
  weeklySourceEnd
} from "./ai-periods.js";
import { ECHO_LIMITS, findEcho } from "./insight-echo.js";
import { weeklyLoopContext } from "./insight-loop.js";
import { reportSourceSnapshot, lockReportConsent, lockReportClaim, finishReportClaim, assertReportSources } from "./report-write-fence.js";
import { trendAnalyzer } from "./trend-analyzer.js";
import { requireLockedMemoryConsent, requireMemoryConsent } from "./semantic-retrieval.js";
import { weeklyReportLocale, WEEKLY_EVIDENCE_POLICY } from "./report-locale.js";
import { selectMonthlyEvidence, MONTHLY_EVIDENCE_POLICY } from "./monthly-evidence.js";
import { selectThenAndNow, THEN_AND_NOW } from "./weekly-then-and-now.js";
import { weeklyContractFor, weeklyInsightsEnabledFor, WEEKLY_SHORT_CONTRACT } from "./weekly-contract.js";

export const REPORT_EVIDENCE_LIMITS = Object.freeze({
  WEEKLY: Object.freeze({ candidateTake: 32, maxEvidence: 8, maxContextCharacters: 4_000, maxPerTheme: 2, minimumEvidence: 2 }),
  MONTHLY: Object.freeze({ candidateTake: 64, maxEvidence: 16, maxContextCharacters: 8_000, maxPerTheme: 3, minimumEvidence: 3 })
});

function ownerEvents(identity, events, previousEvents = []) {
  const ownerId = requireAiIdentity(identity);
  for (const event of events) assertOwnerIdentity(identity, event.ownerId);
  for (const event of previousEvents) assertOwnerIdentity(identity, event.ownerId);
  return { ownerId, events, previousEvents };
}

function importantEvents(events, threshold = 0.7) {
  return events
    .filter((event) => Number(event.importanceScore ?? event.memory?.importanceScore) >= threshold)
    .sort((left, right) => Number(right.importanceScore ?? right.memory?.importanceScore) - Number(left.importanceScore ?? left.memory?.importanceScore) || String(left.id).localeCompare(String(right.id)))
    .map((event) => event.id);
}

function topTopics(trend) {
  return trend.topicFrequency.slice(0, 10);
}

function normalizedTokens(value) {
  return new Set(String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase("en")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean));
}

function nearDuplicate(left, right) {
  const leftText = String(left.summary || "").normalize("NFC").trim().toLocaleLowerCase("en");
  const rightText = String(right.summary || "").normalize("NFC").trim().toLocaleLowerCase("en");
  if (leftText === rightText) return true;
  const leftTokens = normalizedTokens(leftText);
  const rightTokens = normalizedTokens(rightText);
  if (!leftTokens.size || !rightTokens.size) return false;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union >= 0.85;
}

function evidenceOrder(left, right) {
  const similarity = Number(right.similarity ?? 0) - Number(left.similarity ?? 0);
  if (similarity) return similarity;
  const importance = Number(right.importanceScore ?? 0) - Number(left.importanceScore ?? 0);
  if (importance) return importance;
  const date = new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime();
  return date || String(left.sourceEventId).localeCompare(String(right.sourceEventId)) || String(left.id).localeCompare(String(right.id));
}

function themeKey(candidate) {
  const topics = Array.isArray(candidate.topics)
    ? candidate.topics.filter((topic) => typeof topic === "string" && topic.trim()).map((topic) => topic.trim().toLocaleLowerCase("en")).sort()
    : [];
  return topics[0] || `event:${candidate.sourceEventId}`;
}

function evidenceCharacters(candidate) {
  return String(candidate.summary || "").length + 96;
}

export function selectReportEvidence({
  identity,
  candidates,
  periodStartUtc,
  periodEndUtc,
  limits
}) {
  const ownerId = requireAiIdentity(identity);
  const start = new Date(periodStartUtc);
  const end = new Date(periodEndUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("Evidence selection requires a valid report period");
  }
  if (!limits || !Number.isInteger(limits.maxEvidence) || !Number.isInteger(limits.maxContextCharacters) || !Number.isInteger(limits.maxPerTheme)) {
    throw new Error("Evidence selection requires bounded limits");
  }

  const eligible = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    assertOwnerIdentity(identity, candidate?.ownerId);
    const occurredAt = new Date(candidate.eventDate);
    if (
      candidate.memoryType !== "EVENT" ||
      !candidate.id ||
      !candidate.sourceEventId ||
      Number.isNaN(occurredAt.getTime()) ||
      occurredAt < start ||
      occurredAt >= end
    ) continue;
    eligible.push(candidate);
  }
  eligible.sort(evidenceOrder);

  const deduplicated = [];
  const eventIds = new Set();
  const memoryIds = new Set();
  for (const candidate of eligible) {
    if (eventIds.has(candidate.sourceEventId) || memoryIds.has(candidate.id)) continue;
    if (deduplicated.some((existing) => nearDuplicate(existing, candidate))) continue;
    eventIds.add(candidate.sourceEventId);
    memoryIds.add(candidate.id);
    deduplicated.push(candidate);
  }

  const groups = new Map();
  for (const candidate of deduplicated) {
    const key = themeKey(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const orderedGroups = [...groups.entries()].sort((left, right) =>
    evidenceOrder(left[1][0], right[1][0]) || left[0].localeCompare(right[0]));

  const selected = [];
  let contextCharacters = 0;
  for (let themeIndex = 0; themeIndex < limits.maxPerTheme && selected.length < limits.maxEvidence; themeIndex += 1) {
    for (const [key, group] of orderedGroups) {
      const candidate = group[themeIndex];
      if (!candidate || selected.length >= limits.maxEvidence) continue;
      const characters = evidenceCharacters(candidate);
      if (contextCharacters + characters > limits.maxContextCharacters) continue;
      contextCharacters += characters;
      selected.push({
        ownerId,
        sourceEventId: candidate.sourceEventId,
        sourceMemoryId: candidate.id,
        eventDate: new Date(candidate.eventDate),
        summary: candidate.summary,
        topics: Array.isArray(candidate.topics) ? [...candidate.topics] : [],
        importanceScore: candidate.importanceScore ?? null,
        similarity: Number(candidate.similarity ?? 0),
        selectionReason: themeIndex === 0 ? "SEMANTIC_RELEVANCE" : "REPEATED_OR_CHANGING_THEME",
        theme: key,
        provenance: { sourceEventId: candidate.sourceEventId, sourceMemoryId: candidate.id }
      });
    }
  }
  selected.sort((left, right) =>
    left.eventDate.getTime() - right.eventDate.getTime() ||
    left.sourceEventId.localeCompare(right.sourceEventId) ||
    left.sourceMemoryId.localeCompare(right.sourceMemoryId));

  const minimumEvidence = Number.isInteger(limits.minimumEvidence) ? limits.minimumEvidence : 1;
  const sufficient = selected.length >= minimumEvidence;
  return {
    ownerId,
    status: sufficient ? "READY" : "INSUFFICIENT_EVIDENCE",
    reason: sufficient ? null : (selected.length ? "BELOW_MINIMUM_EVIDENCE" : "NO_ELIGIBLE_EVIDENCE"),
    candidateCount: eligible.length,
    deduplicatedCount: deduplicated.length,
    selectedCount: selected.length,
    contextCharacters,
    evidence: selected
  };
}

export function buildWeeklyReport({
  identity,
  timezone,
  periodKey,
  periodStartUtc,
  periodEndUtc,
  asOf,
  status,
  currentEvents = [],
  previousEvents = [],
  generationVersion = "deterministic-v1"
}) {
  const { ownerId, events, previousEvents: priorEvents } = ownerEvents(identity, currentEvents, previousEvents);
  const trendSignals = trendAnalyzer.analyzeWeekly({ currentEvents: events, previousEvents: priorEvents });
  return {
    ownerId,
    timezone,
    periodKey,
    periodStartUtc,
    periodEndUtc,
    asOf,
    status,
    eventCount: events.length,
    topTopics: topTopics(trendSignals),
    importantEventIds: importantEvents(events),
    trendSignals,
    summary: null,
    generationVersion
  };
}

export function buildMonthlyReport({
  identity,
  timezone,
  periodKey,
  periodStartUtc,
  periodEndUtc,
  asOf,
  status,
  year,
  month,
  currentEvents = [],
  previousEvents = [],
  generationVersion = "deterministic-v1"
}) {
  const { ownerId, events, previousEvents: priorEvents } = ownerEvents(identity, currentEvents, previousEvents);
  const trendSignals = trendAnalyzer.analyzeMonthly({ currentEvents: events, previousEvents: priorEvents });
  return {
    ownerId,
    timezone,
    periodKey,
    periodStartUtc,
    periodEndUtc,
    asOf,
    status,
    year,
    month,
    eventCount: events.length,
    topTopics: topTopics(trendSignals),
    importantEventIds: importantEvents(events),
    trendSignals,
    turningPointEventIds: importantEvents(events, 0.85),
    summary: null,
    generationVersion
  };
}

function evidenceCreateData(ownerId, events, reportField, reportId) {
  return events.map((event) => ({
    ownerId,
    sourceEventId: event.id,
    sourceMemoryId: event.memory?.id || null,
    [reportField]: reportId
  }));
}

async function ownerTimezone(tx, ownerId) {
  const user = await tx.user.findUnique({ where: { id: ownerId }, select: { timezone: true } });
  if (!user) {
    const error = new Error("Authenticated PetalPal owner was not found");
    error.code = "AI_FORBIDDEN";
    throw error;
  }
  return user.timezone;
}

function periodEvents(tx, ownerId, period) {
  return tx.event.findMany({
    where: {
      ownerId,
      memoryProcessingAllowed: true,
      occurredAt: { gte: period.periodStartUtc, lt: period.periodEndUtc }
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    include: { memory: true }
  });
}

function reportEvidenceQuery(reportType, report) {
  const topics = report.topTopics.slice(0, 5).map((item) => item.topic).filter(Boolean);
  const scope = reportType === "WEEKLY" ? "week" : "month";
  return topics.length
    ? `Meaningful events, changes, progress, challenges, and repeated themes this ${scope} about ${topics.join(", ")}.`
    : `Meaningful events, changes, progress, challenges, and repeated themes this ${scope}.`;
}

export class ReportInputService {
  constructor({ prisma, semanticRetrieval, localizedWeekly = false, localizedMonthly = false, env = process.env }) {
    this.prisma = prisma;
    this.semanticRetrieval = semanticRetrieval;
    this.localizedWeekly = localizedWeekly;
    this.localizedMonthly = localizedMonthly;
    // Snapshot only this nonsecret flag. Undefined/false retain the V1 path.
    this.weeklySelectorV2 = env.AI_WEEKLY_EVIDENCE_SELECTOR_V2;
    this.weeklySignificance = env.AI_WEEKLY_EVIDENCE_SIGNIFICANCE;
    this.weeklyReflectionContract = env.AI_WEEKLY_REFLECTION_CONTRACT;
    this.weeklyShortOwners = env.AI_WEEKLY_SHORT_OWNER_IDS;
    this.weeklyInsightsOwners = env.WEEKLY_INSIGHTS_OWNER_IDS;
  }

  async buildWeeklyInput({ identity, localDate, asOf = new Date(), allowPartial = false }) {
    const ownerId = requireAiIdentity(identity);
    const consent = await requireMemoryConsent(this.prisma, identity);
    const timezone = await ownerTimezone(this.prisma, ownerId);
    const period = weeklyPeriodForLocalDate(localDate, timezone);
    const status = weeklyReportPeriodStatus(period, asOf, allowPartial);
    // Written from Sunday 23:59: this week's Events up to the report's own moment (time.md §3).
    const cutoff = weeklySourceEnd(period, asOf);
    // The short report (configured, or this owner on AI_WEEKLY_SHORT_OWNER_IDS) also reads the
    // four earlier weeks for "then and now" (same owner/consent scope).
    const short = this.localizedWeekly && weeklyContractFor({ AI_WEEKLY_SHORT_OWNER_IDS: this.weeklyShortOwners }, ownerId,
      this.weeklyReflectionContract) === WEEKLY_SHORT_CONTRACT;
    const previous = previousWeeklyPeriod(period);
    const [events, previousEvents, earlierEvents] = await Promise.all([
      periodEvents(this.prisma, ownerId, { ...period, periodEndUtc: cutoff }),
      periodEvents(this.prisma, ownerId, previous),
      short ? periodEvents(this.prisma, ownerId, { periodStartUtc: weeklyLookbackStart(period), periodEndUtc: previous.periodStartUtc }) : []
    ]);
    const aggregates = buildWeeklyReport({ identity, ...period, asOf, status, currentEvents: events, previousEvents });
    const preferredLocale = this.localizedWeekly
      ? (await this.prisma.user.findUnique({ where: { id: ownerId }, select: { preferredLocale: true } }))?.preferredLocale : null;
    const locale = this.localizedWeekly ? weeklyReportLocale(preferredLocale) : null;
    const input = await this.#buildInput({ reportType: "WEEKLY", identity, period, aggregates, consent, events, previousEvents,
      earlierEvents, lookback: short, locale, preferredLocale, cutoff: +cutoff < +new Date(period.periodEndUtc) ? cutoff : null });
    if (short) input.thenAndNow = await this.#thenAndNow({ identity, period, locale, events, earlier: [...previousEvents, ...earlierEvents] });
    if (short && weeklyInsightsEnabledFor({ WEEKLY_INSIGHTS_OWNER_IDS: this.weeklyInsightsOwners }, ownerId)) {
      Object.assign(input, await this.#weekly2Context(ownerId, [...events, ...previousEvents, ...earlierEvents], previous));
      // 闭环 (lib/insight-loop.js): muted words, threads, answers and letters. A read error only leaves them out.
      try { input.loop = await weeklyLoopContext(this.prisma, ownerId, period, events.map(event => event.id)); } catch { delete input.loop; }
      // 时间回声: an earlier Event outside the five weeks joins the fence as an echo source, checked like the others.
      try {
        const echo = await this.#echo({ identity, period, locale, current: events, window: [...previousEvents, ...earlierEvents] });
        if (echo) {
          input.echo = echo.pair;
          if (echo.extra) input.sourceFence.echoSources = reportSourceSnapshot([echo.extra]);
        }
      } catch { delete input.echo; }
    }
    return input;
  }

  // Weekly 2.0 (docs/product/WEEKLY_2.0.md): stored extractions of the window's Events and last week's
  // main insight type. Either missing (no table yet, a read error) only means code rules and no history.
  async #weekly2Context(ownerId, events, previous) {
    const context = { insightExtractions: {}, previousMainType: null };
    try {
      const rows = await this.prisma.eventInsightExtraction.findMany({ where: { ownerId, sourceEventId: { in: events.map(event => event.id) } },
        select: { sourceEventId: true, sensitive: true, spans: true, extractionVersion: true } });
      context.insightExtractions = Object.fromEntries(rows.map(row => [row.sourceEventId, row]));
    } catch { context.insightExtractions = {}; }
    try {
      const last = await this.prisma.weeklyReport.findUnique({ where: { ownerId_periodKey: { ownerId, periodKey: previous.periodKey } },
        select: { narrativeSections: true } });
      const headline = Array.isArray(last?.narrativeSections) ? last.narrativeSections.find(section => section?.kind === "HEADLINE") : null;
      context.previousMainType = typeof headline?.insightType === "string" ? headline.insightType : null;
    } catch { context.previousMainType = null; }
    return context;
  }

  // 时间回声 (lib/insight-echo.js): this week's Events against the owner's year before, ≥ 30 days apart. English finds
  // the earlier Event by its stored vector (no new inference); Chinese compares sentences in code.
  async #echo({ identity, period, locale, current, window }) {
    const ownerId = identity.userId, DAY = 86_400_000;
    const usable = list => list.filter(event => event.memoryProcessingAllowed && event.ownerId === ownerId &&
      event.memory?.memoryType === "EVENT" && event.memory.ownerId === ownerId && event.memory.sourceEventId === event.id &&
      typeof event.memory.summary === "string").map(event => ({ id: event.id, memoryId: event.memory.id, occurredAt: +new Date(event.occurredAt),
        text: event.memory.summary, date: localDateForInstant(new Date(event.occurredAt), period.timezone) }));
    const now = usable(current);
    if (!now.length || !["en", "zh-Hans"].includes(locale)) return null;
    const start = new Date(+new Date(period.periodStartUtc) - ECHO_LIMITS.lookbackDays * DAY);
    const far = await this.prisma.event.findMany({ where: { ownerId, memoryProcessingAllowed: true,
      occurredAt: { gte: start, lt: new Date(weeklyLookbackStart(period)) } }, include: { memory: true },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: ECHO_LIMITS.maxHistory });
    const history = [...usable(window), ...usable(far)];
    let vectorPairs = null;
    if (locale === "en") {
      const byMemory = new Map(history.map(item => [item.memoryId, item.id]));
      vectorPairs = new Map();
      for (const item of [...now].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, ECHO_LIMITS.maxCurrent)) {
        const rows = await this.semanticRetrieval.similarTo({ identity, memoryId: item.memoryId, take: 5, dateFrom: start,
          dateTo: new Date(item.occurredAt - ECHO_LIMITS.minDaysApart * DAY) });
        vectorPairs.set(item.id, rows.filter(row => row.ownerId === ownerId && byMemory.has(row.id))
          .map(row => ({ id: byMemory.get(row.id), similarity: Number(row.similarity) })));
      }
    }
    const pair = findEcho({ current: now, history, locale, vectorPairs });
    return pair ? { pair, extra: far.find(event => event.id === pair.then.sourceEventId) ?? null } : null;
  }

  // English adds similarity from each current memory's stored vector (no new embedding inference); Chinese is phrase-only.
  async #thenAndNow({ identity, period, locale, events, earlier }) {
    const ownerId = identity.userId;
    const usable = list => list.filter(event => event.memoryProcessingAllowed && event.ownerId === ownerId &&
      event.memory?.memoryType === "EVENT" && event.memory.ownerId === ownerId && event.memory.sourceEventId === event.id)
      .map(event => ({ eventId: event.id, memoryId: event.memory.id, occurredAt: +new Date(event.occurredAt), text: event.memory.summary }));
    const current = usable(events), past = usable(earlier), similar = new Map();
    if (locale === "en" && past.length) {
      const known = new Set(past.map(item => item.memoryId)), dateFrom = weeklyLookbackStart(period);
      for (const now of [...current].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, THEN_AND_NOW.maxCurrent)) {
        const rows = await this.semanticRetrieval.similarTo({ identity, memoryId: now.memoryId, take: 10, dateFrom,
          dateTo: new Date(now.occurredAt - THEN_AND_NOW.minDaysApart * 86_400_000) });
        similar.set(now.memoryId, new Map(rows.filter(row => row.ownerId === ownerId && known.has(row.id))
          .map(row => [row.id, Number(row.similarity)])));
      }
    }
    return selectThenAndNow({ locale, timezone: period.timezone, current, earlier: past, similar });
  }

  async buildMonthlyInput({ identity, year, month, asOf = new Date(), allowPartial = false }) {
    const ownerId = requireAiIdentity(identity);
    const consent = await requireMemoryConsent(this.prisma, identity);
    const timezone = await ownerTimezone(this.prisma, ownerId);
    const period = monthlyPeriodFor({ year, month, timezone });
    const status = reportPeriodStatus(period.periodEndUtc, asOf, allowPartial);
    const [events, previousEvents] = await Promise.all([
      periodEvents(this.prisma, ownerId, period),
      periodEvents(this.prisma, ownerId, previousMonthlyPeriod({ year, month, timezone }))
    ]);
    const aggregates = buildMonthlyReport({ identity, ...period, asOf, status, year, month, currentEvents: events, previousEvents });
    const preferredLocale = this.localizedMonthly
      ? (await this.prisma.user.findUnique({ where: { id: ownerId }, select: { preferredLocale: true } }))?.preferredLocale : null;
    const locale = this.localizedMonthly ? weeklyReportLocale(preferredLocale) : null;
    return this.#buildInput({ reportType: "MONTHLY", identity, period, aggregates, consent, events, previousEvents, locale, preferredLocale });
  }

  async #buildInput({ reportType, identity, period, aggregates, consent, events, previousEvents, earlierEvents = [], lookback = false,
    locale = null, preferredLocale = null, cutoff = null }) {
    // Kept server-side; report-narrative builds an explicit provider allowlist.
    const sourceFence = { consentUpdatedAt: consent.updatedAt, sources: reportSourceSnapshot([...events, ...previousEvents, ...earlierEvents]),
      ...(lookback ? { thenAndNowLookback: true } : {}), ...(cutoff ? { cutoffUtc: cutoff } : {}),
      ...(locale ? { evidencePolicy: reportType === "MONTHLY" ? MONTHLY_EVIDENCE_POLICY : WEEKLY_EVIDENCE_POLICY, preferredLocale } : {}) };
    const limits = REPORT_EVIDENCE_LIMITS[reportType];
    const weeklyV2 = reportType === "WEEKLY" && this.localizedWeekly && this.weeklySelectorV2 === "true";
    if (reportType === "WEEKLY" && this.localizedWeekly && this.weeklySelectorV2 !== undefined &&
        !["true", "false"].includes(this.weeklySelectorV2)) {
      throw Object.assign(new Error("Weekly selector configuration is invalid"), { code: "AI_GATEWAY_CONFIG_INVALID" });
    }
    // The candidate's byte-admission preview is for this exact output contract.
    if (weeklyV2 && this.weeklyReflectionContract !== "weekly-reflection-v2") {
      throw Object.assign(new Error("Weekly selector configuration is invalid"), { code: "AI_GATEWAY_CONFIG_INVALID" });
    }
    // Opt-in significance ordering is a Selector V2 refinement; literal true/false only.
    const significance = reportType === "WEEKLY" && this.localizedWeekly && this.weeklySignificance === "true";
    if (reportType === "WEEKLY" && this.localizedWeekly && this.weeklySignificance !== undefined &&
        (!["true", "false"].includes(this.weeklySignificance) || (significance && !weeklyV2))) {
      throw Object.assign(new Error("Weekly selector configuration is invalid"), { code: "AI_GATEWAY_CONFIG_INVALID" });
    }
    // The flags above stay validated as configured; a short-report owner uses the original selector.
    const selectorV2 = weeklyV2 && !lookback, ranked = significance && !lookback;
    if (reportType === "MONTHLY" && this.localizedMonthly) {
      // English retains BGE/pgvector ranking. All locales also receive bounded
      // chronological week anchors from the already owner-scoped period rows.
      const semanticCandidates = locale === "en" ? await this.semanticRetrieval.retrieve({ identity,
        query: reportEvidenceQuery(reportType, aggregates), take: limits.candidateTake,
        dateFrom: period.periodStartUtc, dateTo: period.periodEndUtc }) : [];
      const evidenceSelection = selectMonthlyEvidence({ identity, period, events, previousEvents, semanticCandidates, limits });
      return { reportType, ownerId: aggregates.ownerId, period, aggregates, evidenceSelection, sourceFence, locale };
    }
    // BGE remains English-only. Chinese reports use bounded period EventMemory
    // selection, without embedding Chinese text or weakening vector eligibility.
    const candidates = locale?.startsWith("zh") ? events.filter(event => event.memory?.memoryType === "EVENT").slice(-limits.candidateTake)
      .map(event => ({ ...event.memory, eventDate: event.occurredAt, similarity: 0 })) : await this.semanticRetrieval.retrieve({
      identity,
      query: reportEvidenceQuery(reportType, aggregates),
      take: limits.candidateTake,
      dateFrom: period.periodStartUtc,
      dateTo: period.periodEndUtc
    });
    const selectionArgs = {
      identity,
      candidates,
      periodStartUtc: period.periodStartUtc,
      periodEndUtc: period.periodEndUtc,
      limits
    };
    let evidenceSelection;
    if (selectorV2) {
      // Consent and owner-scoped period rows were loaded above. Reconcile every
      // retrieved candidate with those exact source versions before new selection.
      const sources = new Map(events.map(event => [event.id, event]));
      for (const row of candidates) {
        const event = sources.get(row.sourceEventId), memory = event?.memory;
        if (!event?.memoryProcessingAllowed || event.ownerId !== identity.userId || !memory ||
            memory.ownerId !== identity.userId || memory.sourceEventId !== event.id || memory.id !== row.id ||
            row.ownerId !== identity.userId || memory.memoryType !== "EVENT" || row.memoryType !== "EVENT" ||
            +new Date(row.eventDate) !== +new Date(event.occurredAt) || row.summary !== memory.summary ||
            JSON.stringify(row.topics) !== JSON.stringify(memory.topics) ||
            (row.importanceScore ?? null) !== (memory.importanceScore ?? null)) {
          throw Object.assign(new Error("Report input is no longer current"), { code: "REPORT_SOURCE_STALE" });
        }
      }
      // Lazy import keeps OFF/Monthly execution on the original selector and
      // avoids a packet-builder dependency cycle during module initialization.
      const { selectWeeklyEvidenceV2, weeklySignificanceCandidates } = await import("./weekly-evidence-selector-v2.js");
      if (ranked) {
        // The retrieved rows were reconciled above; they now contribute ranking only. The
        // bounded pool is drawn from every already-loaded owner/consent-scoped period row,
        // so an early (zh last-32 cut) or low-similarity (en) Event can still compete.
        const similarity = new Map(candidates.map(row => [row.id, row.similarity ?? 0]));
        const rows = events.filter(event => event.memoryProcessingAllowed && event.ownerId === identity.userId &&
          event.memory?.memoryType === "EVENT" && event.memory.ownerId === identity.userId && event.memory.sourceEventId === event.id)
          .map(event => ({ ...event.memory, eventDate: event.occurredAt, similarity: similarity.get(event.memory.id) ?? 0 }));
        selectionArgs.candidates = weeklySignificanceCandidates(rows, { locale, timezone: period.timezone, take: limits.candidateTake });
      }
      evidenceSelection = selectWeeklyEvidenceV2({ ...selectionArgs, reportType, locale, timezone: period.timezone,
        ...(ranked ? { significance: true } : {}) });
    } else evidenceSelection = selectReportEvidence(selectionArgs);
    return { reportType, ownerId: aggregates.ownerId, period, aggregates, evidenceSelection, sourceFence, ...(locale ? { locale } : {}) };
  }
}

export class WeeklyReportService {
  constructor(prisma) { this.prisma = prisma; }

  async generate({ identity, localDate, asOf = new Date(), allowPartial = false, generationVersion = "deterministic-v1" }) {
    const ownerId = requireAiIdentity(identity);
    return this.prisma.$transaction(async (tx) => {
      await requireLockedMemoryConsent(tx, identity);
      const timezone = await ownerTimezone(tx, ownerId);
      const period = weeklyPeriodForLocalDate(localDate, timezone);
      const previousPeriod = previousWeeklyPeriod(period);
      const status = weeklyReportPeriodStatus(period, asOf, allowPartial);
      const [events, previousEvents] = await Promise.all([
        periodEvents(tx, ownerId, { ...period, periodEndUtc: weeklySourceEnd(period, asOf) }),
        periodEvents(tx, ownerId, previousPeriod)
      ]);
      const data = buildWeeklyReport({
        identity,
        ...period,
        asOf,
        status,
        currentEvents: events,
        previousEvents,
        generationVersion
      });
      const finalized = typeof tx.weeklyReport.findUnique === "function"
        ? await tx.weeklyReport.findUnique({ where: { ownerId_periodKey: { ownerId, periodKey: period.periodKey } } })
        : null;
      if (finalized?.narrativeStatus && finalized.narrativeStatus !== "NOT_GENERATED") return finalized;
      const report = await tx.weeklyReport.upsert({
        where: { ownerId_periodKey: { ownerId, periodKey: period.periodKey } },
        update: data,
        create: data
      });
      await tx.aiEvidence.deleteMany({ where: { ownerId, weeklyReportId: report.id } });
      const evidence = evidenceCreateData(ownerId, events, "weeklyReportId", report.id);
      if (evidence.length) await tx.aiEvidence.createMany({ data: evidence });
      return report;
    });
  }
}

export class MonthlyReportService {
  constructor(prisma) { this.prisma = prisma; }

  async generate({ identity, year, month, asOf = new Date(), allowPartial = false, generationVersion = "deterministic-v1" }) {
    const ownerId = requireAiIdentity(identity);
    return this.prisma.$transaction(async (tx) => {
      await requireLockedMemoryConsent(tx, identity);
      const timezone = await ownerTimezone(tx, ownerId);
      const period = monthlyPeriodFor({ year, month, timezone });
      const previousPeriod = previousMonthlyPeriod({ year, month, timezone });
      const status = reportPeriodStatus(period.periodEndUtc, asOf, allowPartial);
      const [events, previousEvents] = await Promise.all([
        periodEvents(tx, ownerId, period),
        periodEvents(tx, ownerId, previousPeriod)
      ]);
      const data = buildMonthlyReport({
        identity,
        ...period,
        asOf,
        status,
        year,
        month,
        currentEvents: events,
        previousEvents,
        generationVersion
      });
      const finalized = typeof tx.monthlyReport.findUnique === "function"
        ? await tx.monthlyReport.findUnique({ where: { ownerId_year_month: { ownerId, year, month } } })
        : null;
      if (finalized?.narrativeStatus && finalized.narrativeStatus !== "NOT_GENERATED") return finalized;
      const report = await tx.monthlyReport.upsert({
        where: { ownerId_year_month: { ownerId, year, month } },
        update: data,
        create: data
      });
      await tx.aiEvidence.deleteMany({ where: { ownerId, monthlyReportId: report.id } });
      const evidence = evidenceCreateData(ownerId, events, "monthlyReportId", report.id);
      if (evidence.length) await tx.aiEvidence.createMany({ data: evidence });
      return report;
    });
  }
}

function reportModel(prisma, reportType) {
  if (reportType === "WEEKLY") return prisma.weeklyReport;
  if (reportType === "MONTHLY") return prisma.monthlyReport;
  throw new Error("Grounded persistence supports only Weekly and Monthly reports");
}

function reportUniqueWhere(reportType, ownerId, aggregates) {
  if (reportType === "WEEKLY") {
    return { ownerId_periodKey: { ownerId, periodKey: aggregates.periodKey } };
  }
  return { ownerId_year_month: { ownerId, year: aggregates.year, month: aggregates.month } };
}

function provenanceKey(value) {
  return `${value?.sourceEventId}\u0000${value?.sourceMemoryId}`;
}

function groundedEvidenceRows({ ownerId, reportType, reportId, reportInput, narrativeResult }) {
  const selectedInput = new Map(reportInput.evidenceSelection.evidence.map((item) => [provenanceKey(item), item]));
  const selectedResult = narrativeResult.provenance?.selectedEvidence || [];
  if (selectedResult.length !== selectedInput.size) {
    throw new Error("Narrative selected provenance does not match report input");
  }
  for (const item of selectedResult) {
    assertOwnerIdentity({ userId: ownerId }, item.ownerId);
    if (!selectedInput.has(provenanceKey(item))) throw new Error("Narrative selected provenance does not match report input");
  }

  const citedFromSections = new Set();
  for (const section of narrativeResult.sections || []) {
    for (const reference of section.evidenceRefs || []) citedFromSections.add(provenanceKey(reference));
  }
  const citedResult = new Set();
  for (const item of narrativeResult.provenance?.citedEvidence || []) {
    assertOwnerIdentity({ userId: ownerId }, item.ownerId);
    const key = provenanceKey(item);
    if (!selectedInput.has(key)) throw new Error("Narrative cited provenance was not selected");
    citedResult.add(key);
  }
  if (citedFromSections.size !== citedResult.size || [...citedFromSections].some((key) => !citedResult.has(key))) {
    throw new Error("Narrative claim citations do not match cited provenance");
  }

  const reportField = reportType === "WEEKLY" ? "weeklyReportId" : "monthlyReportId";
  return [...selectedInput.values()].map((item) => {
    const key = provenanceKey(item);
    return {
      ownerId,
      sourceEventId: item.sourceEventId,
      sourceMemoryId: item.sourceMemoryId,
      claimType: citedResult.has(key) ? "NARRATIVE_CITED" : "NARRATIVE_SELECTED",
      [reportField]: reportId
    };
  });
}

function assertGroundedOutcome(reportInput, narrativeResult, ownerId) {
  if (reportInput.reportType !== "WEEKLY" && reportInput.reportType !== "MONTHLY") {
    throw new Error("Grounded persistence supports only Weekly and Monthly reports");
  }
  assertOwnerIdentity({ userId: ownerId }, reportInput.ownerId);
  assertOwnerIdentity({ userId: ownerId }, reportInput.aggregates?.ownerId);
  assertOwnerIdentity({ userId: ownerId }, reportInput.evidenceSelection?.ownerId);
  assertOwnerIdentity({ userId: ownerId }, narrativeResult?.ownerId);
  if (narrativeResult.reportType !== reportInput.reportType || narrativeResult.periodKey !== reportInput.period?.periodKey) {
    throw new Error("Narrative outcome does not match the report input period");
  }
  if (!new Set(["GENERATED", "INSUFFICIENT_EVIDENCE"]).has(narrativeResult.status)) {
    throw new Error("Only final grounded narrative outcomes can be persisted");
  }
  if (narrativeResult.status === "GENERATED") {
    if (typeof narrativeResult.narrative !== "string" || !narrativeResult.narrative.trim() || !Array.isArray(narrativeResult.sections) || !narrativeResult.sections.length) {
      throw new Error("Generated narrative outcome is incomplete");
    }
  } else if (narrativeResult.narrative !== null || (narrativeResult.sections || []).length) {
    throw new Error("Insufficient-evidence outcome cannot contain a narrative");
  }
}

export class GroundedReportPersistenceService {
  constructor(prisma) { this.prisma = prisma; }

  async findFinalized({ identity, reportType, periodKey }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => reportModel(tx, reportType).findFirst({
      where: { ownerId, periodKey, narrativeStatus: { not: "NOT_GENERATED" } },
      include: { evidence: true }
    }));
  }

  async completeFinalized({ identity, reportType, periodKey, generationVersion, job, workerId }) {
    const ownerId = requireAiIdentity(identity);
    return this.prisma.$transaction(async (tx) => {
      await lockReportConsent(tx, ownerId, null, job?.lockedAt);
      await lockReportClaim(tx, { ownerId, job, workerId, generationVersion, reportType, periodKey });
      const report = await reportModel(tx, reportType).findFirst({
        where: { ownerId, periodKey, narrativeStatus: { not: "NOT_GENERATED" } }, include: { evidence: true }
      });
      if (!report || report.generationVersion !== generationVersion) {
        const error = new Error("Finalized report is no longer current");
        error.code = "REPORT_SOURCE_STALE";
        throw error;
      }
      await finishReportClaim(tx, { ownerId, job, workerId });
      return { skipped: true, status: report.narrativeStatus, report, jobCompleted: true };
    });
  }

  async persist({ identity, reportInput, narrativeResult, generationVersion, job, workerId }) {
    const ownerId = requireAiIdentity(identity);
    if (typeof generationVersion !== "string" || !generationVersion.trim() || generationVersion.length > 64) {
      throw new Error("A bounded report generation version is required");
    }
    assertGroundedOutcome(reportInput, narrativeResult, ownerId);
    const reportType = reportInput.reportType;
    const aggregates = reportInput.aggregates;

    return this.prisma.$transaction(async (tx) => {
      await lockReportConsent(tx, ownerId, reportInput.sourceFence?.consentUpdatedAt);
      await lockReportClaim(tx, { ownerId, job, workerId, generationVersion, reportType, periodKey: reportInput.period.periodKey });
      await assertReportSources(tx, ownerId, reportInput);
      const model = reportModel(tx, reportType);
      const where = reportUniqueWhere(reportType, ownerId, aggregates);
      const existing = await model.findUnique({ where });
      if (existing?.narrativeStatus && existing.narrativeStatus !== "NOT_GENERATED") {
        if (existing.generationVersion !== generationVersion) {
          const error = new Error("Finalized report generation version changed");
          error.code = "REPORT_SOURCE_STALE";
          throw error;
        }
        await finishReportClaim(tx, { ownerId, job, workerId });
        return { skipped: true, outcome: existing.narrativeStatus, report: existing, jobCompleted: true };
      }

      const narrativeStatus = narrativeResult.status;
      const data = {
        ...aggregates,
        summary: narrativeStatus === "GENERATED" ? narrativeResult.narrative : null,
        narrativeStatus,
        narrativeSections: narrativeStatus === "GENERATED" ? narrativeResult.sections : [],
        generationVersion: generationVersion.trim()
      };
      const report = await model.upsert({ where, update: data, create: data });
      const reportField = reportType === "WEEKLY" ? "weeklyReportId" : "monthlyReportId";
      await tx.aiEvidence.deleteMany({ where: { ownerId, [reportField]: report.id } });
      const evidence = groundedEvidenceRows({ ownerId, reportType, reportId: report.id, reportInput, narrativeResult });
      if (evidence.length) await tx.aiEvidence.createMany({ data: evidence });
      await finishReportClaim(tx, { ownerId, job, workerId });
      return { skipped: false, outcome: narrativeStatus, report, evidenceCount: evidence.length, jobCompleted: true };
    });
  }
}

export const WEEKLY_INSIGHT_FEEDBACK = Object.freeze(["INACCURATE", "HIDDEN"]);

export class PrivateReportRepository {
  constructor(prisma) { this.prisma = prisma; }

  async listSavedReports({ identity, limit = 20, cursor = null }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, async tx => {
      const select = { id: true, periodKey: true, periodStartUtc: true, periodEndUtc: true, createdAt: true, status: true };
      const read = async (type, model) => {
        const after = cursor ? { OR: [
          { periodStartUtc: { lt: new Date(cursor.start) } },
          { periodStartUtc: new Date(cursor.start), id: { lt: cursor.id } },
          ...(type > cursor.type ? [{ periodStartUtc: new Date(cursor.start), id: cursor.id }] : [])
        ] } : {};
        const rows = await model.findMany({ where: { ownerId, ...after }, select,
          orderBy: [{ periodStartUtc: "desc" }, { id: "desc" }], take: limit + 1 });
        return rows.map(row => ({ ...row, type }));
      };
      const batches = await Promise.all([read("weekly", tx.weeklyReport), read("monthly", tx.monthlyReport)]);
      const rows = batches.flat().sort((a, b) => new Date(b.periodStartUtc) - new Date(a.periodStartUtc)
        || (a.id < b.id ? 1 : a.id > b.id ? -1 : a.type.localeCompare(b.type)));
      const reports = rows.slice(0, limit);
      const last = reports.at(-1);
      const nextCursor = rows.length > limit ? Buffer.from(JSON.stringify({
        start: new Date(last.periodStartUtc).toISOString(), id: last.id, type: last.type
      })).toString("base64url") : null;
      return { reports, nextCursor };
    });
  }

  async getWeeklyReportById({ identity, reportId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => tx.weeklyReport.findFirst({ where: { id: reportId, ownerId }, include: { evidence: true } }));
  }

  // Weekly 2.0 "不准确 / 隐藏" (docs/product/WEEKLY_2.0.md): the owner marks one INSIGHT section of their own
  // report; the mark stays on that saved section (and goes wherever the report goes). null clears it.
  // Returns the updated sections, or null when the report or that insight is not the owner's.
  async setWeeklyInsightFeedback({ identity, reportId, index, verdict }) {
    const ownerId = requireAiIdentity(identity);
    if (!Number.isInteger(index) || index < 0 || index > 31 || ![...WEEKLY_INSIGHT_FEEDBACK, null].includes(verdict)) {
      const error = new Error("Invalid insight feedback"); error.code = "INSIGHT_FEEDBACK_INVALID"; throw error;
    }
    return withMemoryConsent(this.prisma, identity, async tx => {
      const locked = await tx.$queryRawUnsafe('SELECT "id" FROM "WeeklyReport" WHERE "id" = $1 AND "ownerId" = $2 FOR UPDATE', reportId, ownerId);
      if (locked.length !== 1) return null;
      const report = await tx.weeklyReport.findFirst({ where: { id: reportId, ownerId }, select: { narrativeSections: true } });
      const sections = Array.isArray(report?.narrativeSections) ? report.narrativeSections : [];
      if (sections[index]?.kind !== "INSIGHT") return null;
      const { feedback, ...section } = sections[index];
      const next = sections.map((item, i) => i === index ? (verdict ? { ...section, feedback: verdict } : section) : item);
      await tx.weeklyReport.update({ where: { id: reportId }, data: { narrativeSections: next } });
      return next;
    });
  }

  async getMonthlyReportById({ identity, reportId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => tx.monthlyReport.findFirst({ where: { id: reportId, ownerId }, include: { evidence: true } }));
  }

  async getYearlyReportById({ identity, reportId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => tx.yearlyReport.findFirst({ where: { id: reportId, ownerId }, include: { evidence: true } }));
  }
}
