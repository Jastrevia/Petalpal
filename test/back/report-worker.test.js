import assert from "node:assert/strict";
import test from "node:test";

import cloudflareWorker, { DEFAULT_REPORT_NARRATIVE_MODEL } from "../../cloudflare-worker/src/index.js";
import { AI_JOB_TYPES } from "../../lib/ai-jobs.js";
import { createProductionAiWorker } from "../../lib/ai-worker.js";
import { GroundedReportPersistenceService } from "../../lib/report-foundation.js";
import { getEmbeddingProfile, LOCAL_EMBEDDING_PROFILE_KEY } from "../../lib/embedding-profiles.js";
import {
  CloudflareWorkersReportNarrativeProvider,
  REPORT_NARRATIVE_GENERATION_VERSION
} from "../../lib/report-narrative.js";

const ownerId = "report-owner";
const otherOwnerId = "other-owner";

function embeddingProvider() {
  return {
    describeProfile() { return getEmbeddingProfile(LOCAL_EMBEDDING_PROFILE_KEY); },
    async embedDocuments() { throw new Error("report tests must not embed documents"); },
    async embedQuery() { throw new Error("injected report retrieval must handle queries"); }
  };
}

function reportEvents() {
  return [
    { id: "event-1", ownerId, memoryProcessingAllowed: true, occurredAt: new Date("2026-09-15T12:00:00Z"), memory: { id: "memory-1", topics: ["career"], importanceScore: 0.9 } },
    { id: "event-2", ownerId, memoryProcessingAllowed: true, occurredAt: new Date("2026-09-16T12:00:00Z"), memory: { id: "memory-2", topics: ["study"], importanceScore: 0.8 } },
    { id: "event-3", ownerId, memoryProcessingAllowed: true, occurredAt: new Date("2026-09-20T12:00:00Z"), memory: { id: "memory-3", topics: ["career"], importanceScore: 0.7 } },
    { id: "event-previous", ownerId, memoryProcessingAllowed: true, occurredAt: new Date("2026-09-10T12:00:00Z"), memory: { id: "memory-previous", topics: ["study"], importanceScore: 0.5 } }
  ].map((event) => ({ ...event, updatedAt: new Date("2026-09-21"), memory: {
    ...event.memory, ownerId, sourceEventId: event.id, memoryType: "EVENT",
    summary: `Selected evidence for ${event.id}`, updatedAt: new Date("2026-09-21"),
    embeddingInputRevision: 1, embeddingStatus: "GENERATED", embeddedInputRevision: 1
  } }));
}

function createReportPrisma() {
  const state = {
    events: reportEvents(),
    weeklyReports: [],
    monthlyReports: [],
    evidence: [],
    failEvidence: false,
    memoryConsent: true,
    consentUpdatedAt: new Date("2026-09-01"),
    now: new Date("2026-09-22"),
    job: null,
    costReservations: [],
    queries: [],
    expireBeforeCompletion: false
  };

  function rowsFor(type) {
    return type === "WEEKLY" ? state.weeklyReports : state.monthlyReports;
  }

  function reportFor(type, where) {
    const rows = rowsFor(type);
    const key = where.ownerId_periodKey || where.ownerId_year_month;
    return rows.find((row) => row.ownerId === key.ownerId && (
      type === "WEEKLY"
        ? row.periodKey === key.periodKey
        : row.year === key.year && row.month === key.month
    )) || null;
  }

  function model(type) {
    const reportField = type === "WEEKLY" ? "weeklyReportId" : "monthlyReportId";
    return {
      async findFirst({ where, include }) {
        const row = rowsFor(type).find((item) =>
          item.ownerId === where.ownerId &&
          item.periodKey === where.periodKey &&
          (!where.narrativeStatus || item.narrativeStatus !== where.narrativeStatus.not)
        ) || null;
        return row && include?.evidence
          ? { ...row, evidence: state.evidence.filter((item) => item[reportField] === row.id) }
          : row;
      },
      async findUnique({ where }) { return reportFor(type, where); },
      async upsert({ where, update, create }) {
        const existing = reportFor(type, where);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { id: `${type.toLowerCase()}-${rowsFor(type).length + 1}`, ...create };
        rowsFor(type).push(row);
        return { ...row };
      }
    };
  }

  const prisma = {
    state,
    user: {
      async findUnique({ where }) { return where.id === ownerId ? { timezone: "UTC" } : null; }
    },
    aiConsent: {
      async findUnique({ where }) {
        return where.userId === ownerId ? {
          aiProcessing: state.memoryConsent,
          personalization: state.memoryConsent,
          memoryEnabled: state.memoryConsent,
          updatedAt: state.consentUpdatedAt
        } : null;
      }
    },
    event: {
      async findMany({ where }) {
        return state.events.filter((event) =>
          event.ownerId === where.ownerId &&
          event.memoryProcessingAllowed === where.memoryProcessingAllowed &&
          event.occurredAt >= where.occurredAt.gte &&
          event.occurredAt < where.occurredAt.lt
        );
      }
    },
    async $queryRawUnsafe(query, ...args) {
      state.queries.push(query);
      if (query.includes("ai-cost:lock") || query.includes("ai-cost:clock")) return [{ now: state.now }];
      if (query.includes("ai-cost:owner")) return args[0] === ownerId ? [{ id: ownerId }] : [];
      if (query.includes("ai-cost:duplicate")) return state.costReservations.filter(row => row.id === args[0]);
      if (query.includes("ai-cost:usage")) {
        const rows = state.costReservations.filter(row => row.createdAt >= args[0]);
        const sum = selected => selected.reduce((total, row) => total + Number(row.reasonCode), 0);
        return [{ action: rows.filter(row => row.actorUserId === args[1] && row.actionCode === args[2]).length,
          user: sum(rows.filter(row => row.actorUserId === args[1])), global: sum(rows),
          provider: sum(rows.filter(row => row.targetClass === args[3])) }];
      }
      if (query.includes("ai-cost:reserve")) {
        const [id, createdAt, eventType, actorUserId, targetClass, actionCode, reasonCode] = args;
        state.costReservations.push({ id, createdAt, eventType, actorUserId, targetClass, actionCode, reasonCode });
        return [{ id }];
      }
      if (query.includes('FROM "AiConsent"')) return args[0] === ownerId
        ? [{ userId: ownerId, aiProcessing: state.memoryConsent, personalization: state.memoryConsent,
          memoryEnabled: state.memoryConsent, updatedAt: state.consentUpdatedAt }] : [];
      if (query.includes('FROM "User"')) return args[0] === ownerId ? [{ timezone: "UTC", preferredLocale: "en" }] : [];
      if (query.includes('FROM "AIJob"') || query.includes('UPDATE "AIJob"')) {
        const job = state.job;
        if (query.trimStart().startsWith('UPDATE') && state.expireBeforeCompletion) state.now = new Date(job.leaseExpiresAt);
        const [id, requestedOwner, worker, attempt, lockedAt, type, period, key] = args;
        const valid = job && job.id === id && job.ownerId === requestedOwner && job.status === "RUNNING" &&
          job.lockedBy === worker && job.attemptCount === attempt && +job.lockedAt === +lockedAt &&
          +job.leaseExpiresAt > +state.now && (!type || (job.jobType === type && job.resourceId === period && job.idempotencyKey === key));
        if (!valid) return [];
        if (query.trimStart().startsWith('UPDATE')) Object.assign(job, { status: "SUCCEEDED", lockedAt: null, lockedBy: null, leaseExpiresAt: null });
        return [{ id: job.id }];
      }
      if (query.includes('FROM "Event"') || query.includes('FROM "EventMemory"')) return [];
      throw new Error("Unexpected transaction query");
    },
    weeklyReport: model("WEEKLY"),
    monthlyReport: model("MONTHLY"),
    aiEvidence: {
      async deleteMany({ where }) {
        for (let index = state.evidence.length - 1; index >= 0; index -= 1) {
          const item = state.evidence[index];
          if (item.ownerId === where.ownerId && Object.entries(where).every(([key, value]) => key === "ownerId" || item[key] === value)) {
            state.evidence.splice(index, 1);
          }
        }
      },
      async createMany({ data }) {
        if (state.failEvidence) throw new Error("forced evidence persistence failure");
        state.evidence.push(...data.map((item, index) => ({ id: `evidence-${state.evidence.length + index + 1}`, ...item })));
      }
    },
    async $transaction(callback) {
      const snapshot = structuredClone({
        weeklyReports: state.weeklyReports,
        monthlyReports: state.monthlyReports,
        evidence: state.evidence, job: state.job
      });
      try {
        return await callback(prisma);
      } catch (error) {
        state.weeklyReports.splice(0, state.weeklyReports.length, ...snapshot.weeklyReports);
        state.monthlyReports.splice(0, state.monthlyReports.length, ...snapshot.monthlyReports);
        state.evidence.splice(0, state.evidence.length, ...snapshot.evidence);
        if (state.job) Object.assign(state.job, snapshot.job);
        throw error;
      }
    }
  };
  return prisma;
}

function semanticRetrieval(prisma, { take = Infinity, candidateOwnerId = ownerId } = {}) {
  return {
    async retrieve({ identity, dateFrom, dateTo }) {
      assert.equal(identity.userId, ownerId);
      return prisma.state.events
        .filter((event) => event.ownerId === ownerId && event.memoryProcessingAllowed && event.occurredAt >= dateFrom && event.occurredAt < dateTo)
        .slice(0, take)
        .map((event, index) => ({
          id: event.memory.id,
          ownerId: candidateOwnerId,
          sourceEventId: event.id,
          memoryType: "EVENT",
          summary: `Selected evidence for ${event.id}`,
          topics: event.memory.topics,
          eventDate: event.occurredAt,
          importanceScore: event.memory.importanceScore,
          similarity: 1 - index / 10
        }));
    }
  };
}

function validProviderOutput(reportType) {
  return {
    model: "test-grounded-model",
    sections: [{
      kind: reportType === "WEEKLY" ? "RECENT_MOMENTS" : "MAJOR_EXPERIENCES",
      claim: reportType === "WEEKLY" ? "The week included meaningful career and study moments." : "The month included meaningful career and study experiences.",
      evidenceRefs: [{ sourceEventId: "event-1", sourceMemoryId: "memory-1" }],
      aggregateRefs: ["topTopics"]
    }]
  };
}

function reportJob(jobType, resourceId, overrides = {}) {
  return {
    id: `job-${jobType.toLowerCase()}`,
    ownerId,
    jobType,
    resourceId,
    idempotencyKey: `${jobType}:${resourceId}:${REPORT_NARRATIVE_GENERATION_VERSION}`,
    status: "PENDING",
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides
  };
}

function jobRepository(job, prisma) {
  prisma.state.job = job;
  return {
    job,
    async claimNext({ workerId, now, leaseMs }) {
      if (job.status !== "PENDING") return null;
      job.status = "RUNNING";
      job.lockedBy = workerId;
      job.lockedAt = now;
      prisma.state.now = now;
      job.leaseExpiresAt = new Date(+now + leaseMs);
      job.attemptCount += 1;
      return { ...job };
    },
    async claimById({ jobId, ownerId: claimedOwnerId, jobType, workerId, now, leaseMs }) {
      if (
        job.status !== "PENDING" ||
        job.id !== jobId ||
        job.ownerId !== claimedOwnerId ||
        job.jobType !== jobType
      ) return null;
      job.status = "RUNNING";
      job.lockedBy = workerId;
      job.lockedAt = now;
      prisma.state.now = now;
      job.leaseExpiresAt = new Date(+now + leaseMs);
      job.attemptCount += 1;
      return { ...job };
    },
    async markSucceeded() {
      assert.fail("Report success must be committed inside the report transaction");
      job.status = "SUCCEEDED";
      job.lockedBy = null;
      return { count: 1 };
    },
    async markFailed({ claim }) {
      if (job.status !== "RUNNING" || job.attemptCount !== claim.attemptCount || job.lockedBy !== claim.lockedBy) return null;
      job.status = job.attemptCount >= job.maxAttempts ? "FAILED" : "PENDING";
      job.lockedBy = null;
      return { ...job };
    },
    async cancelClaimed() {
      if (job.status !== "RUNNING" && job.status !== "CANCELLED") return false;
      job.status = "CANCELLED";
      job.lockedBy = null;
      return true;
    }
  };
}

function reportWorker({ prisma, job, provider, retrieval = semanticRetrieval(prisma), timeoutMs = 100 }) {
  const worker = createProductionAiWorker({
    prisma,
    embeddingProvider: embeddingProvider(),
    semanticRetrieval: retrieval,
    reportNarrativeProvider: provider,
    reportNarrativeTimeoutMs: timeoutMs,
    logger: { error() {} },
    retryDelayMs: 0
  });
  worker.repository = jobRepository(job, prisma);
  return worker;
}

test("Weekly report worker generates and atomically persists grounded narrative evidence", async () => {
  const prisma = createReportPrisma();
  let providerCalls = 0;
  let aiCalls = 0;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  const liveSmoke = process.env.PETALPAL_REAL_REPORT_SMOKE === "1";
  const provider = new CloudflareWorkersReportNarrativeProvider({
    env: { CLOUDFLARE_WORKER_AI_URL: "https://worker.example", CLOUDFLARE_WORKER_AI_TOKEN: "secret" },
    async fetchImpl(url, options) {
      providerCalls += 1;
      if (liveSmoke) {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        if (!accountId || !apiToken) throw new Error("Real report smoke requires Cloudflare account credentials");
        return cloudflareWorker.fetch(new Request(url, options), {
          RENDER_SHARED_SECRET: "secret",
          REPORT_NARRATIVE_MODEL: DEFAULT_REPORT_NARRATIVE_MODEL,
          AI: {
            async run(model, input) {
              aiCalls += 1;
              const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
                body: JSON.stringify(input)
              });
              const envelope = await response.json();
              if (!response.ok || envelope.success !== true) {
                const error = new Error("Cloudflare Workers AI smoke inference failed");
                error.code = envelope.errors?.[0]?.code || response.status;
                throw error;
              }
              return envelope.result;
            }
          }
        });
      }
      const input = JSON.parse(options.body);
      return Response.json(validProviderOutput(input.report.reportType));
    }
  });
  const worker = reportWorker({
    prisma,
    job,
    provider
  });
  const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });

  assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(result.result.status, "GENERATED");
  assert.equal(job.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);
  assert.equal(aiCalls, liveSmoke ? 1 : 0);
  assert.equal(prisma.state.weeklyReports.length, 1);
  assert.equal(prisma.state.weeklyReports[0].narrativeStatus, "GENERATED");
  assert.equal(prisma.state.weeklyReports[0].narrativeSections.length, 1);
  assert.equal(prisma.state.evidence.length, 3);
  assert.equal(prisma.state.evidence.filter((item) => item.claimType === "NARRATIVE_CITED").length, 1);
});

test("targeted Weekly execution cannot claim another owner or arbitrary job type", async () => {
  const prisma = createReportPrisma();
  let providerCalls = 0;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  const worker = reportWorker({
    prisma,
    job,
    provider: {
      async generateNarrative(input) {
        providerCalls += 1;
        return validProviderOutput(input.report.reportType);
      }
    }
  });
  const now = new Date("2026-09-22T00:00:00Z");

  assert.deepEqual(await worker.runJob({
    jobId: job.id,
    ownerId: otherOwnerId,
    jobType: AI_JOB_TYPES.WEEKLY_REPORT,
    now
  }), { claimed: false });
  assert.deepEqual(await worker.runJob({
    jobId: job.id,
    ownerId,
    jobType: AI_JOB_TYPES.MONTHLY_REPORT,
    now
  }), { claimed: false });
  assert.equal(providerCalls, 0);

  const result = await worker.runJob({
    jobId: job.id,
    ownerId,
    jobType: AI_JOB_TYPES.WEEKLY_REPORT,
    now
  });
  assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(providerCalls, 1);
  assert.equal(job.status, "SUCCEEDED");
});

test("Monthly report worker generates and atomically persists grounded narrative evidence", async () => {
  const prisma = createReportPrisma();
  const job = reportJob(AI_JOB_TYPES.MONTHLY_REPORT, "2026-09");
  const worker = reportWorker({
    prisma,
    job,
    provider: { async generateNarrative(input) { return validProviderOutput(input.report.reportType); } }
  });
  const result = await worker.runOnce({ now: new Date("2026-10-02T00:00:00Z") });

  assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(prisma.state.monthlyReports.length, 1);
  assert.equal(prisma.state.monthlyReports[0].narrativeStatus, "GENERATED");
  assert.equal(prisma.state.monthlyReports[0].periodKey, "2026-09");
  assert.equal(prisma.state.evidence.length, 4);
  assert.equal(new Set(prisma.state.evidence.map((item) => item.sourceEventId)).size, 4);
});

test("Weekly and Monthly discard generated input when consent is revoked before persistence", async () => {
  for (const [jobType, periodKey, now] of [
    [AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", "2026-09-22T00:00:00Z"],
    [AI_JOB_TYPES.MONTHLY_REPORT, "2026-09", "2026-10-02T00:00:00Z"]
  ]) {
    const prisma = createReportPrisma();
    const job = reportJob(jobType, periodKey);
    let providerCalls = 0;
    const worker = reportWorker({ prisma, job, provider: {
      async generateNarrative(input) {
        providerCalls += 1;
        assert.ok(input.report.selectedEvidence.length >= 2);
        prisma.state.memoryConsent = false;
        job.status = "CANCELLED";
        return validProviderOutput(input.report.reportType);
      }
    } });
    const result = await worker.runOnce({ now: new Date(now) });
    assert.equal(result.succeeded, true, result.error?.stack);
    assert.equal(result.result.status, "CONSENT_INELIGIBLE");
    assert.equal(job.status, "CANCELLED");
    assert.equal(job.attemptCount, 1);
    assert.equal(providerCalls, 1);
    assert.equal(prisma.state.weeklyReports.length, 0);
    assert.equal(prisma.state.monthlyReports.length, 0);
    assert.equal(prisma.state.evidence.length, 0);
    assert.deepEqual(await worker.runOnce(), { claimed: false });
  }
});

test("ineligible and cross-owner Events cannot affect Weekly or Monthly aggregates, evidence, or claims", async () => {
  for (const [jobType, periodKey, now] of [
    [AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", "2026-09-22T00:00:00Z"],
    [AI_JOB_TYPES.MONTHLY_REPORT, "2026-09", "2026-10-02T00:00:00Z"]
  ]) {
    const prisma = createReportPrisma();
    prisma.state.events.push(
      { id: "ineligible", ownerId, memoryProcessingAllowed: false,
        occurredAt: new Date("2026-09-17T12:00:00Z"), memory: { id: "memory-ineligible", topics: ["private-topic"], importanceScore: 1 } },
      { id: "other-owner", ownerId: otherOwnerId, memoryProcessingAllowed: true,
        occurredAt: new Date("2026-09-18T12:00:00Z"), memory: { id: "memory-other", topics: ["foreign-topic"], importanceScore: 1 } }
    );
    let narrativeInput;
    const job = reportJob(jobType, periodKey);
    const worker = reportWorker({ prisma, job, provider: {
      async generateNarrative(input) {
        narrativeInput = input;
        return validProviderOutput(input.report.reportType);
      }
    } });
    const result = await worker.runOnce({ now: new Date(now) });
    assert.equal(result.succeeded, true, result.error?.stack);
    const expectedEventIds = jobType === AI_JOB_TYPES.WEEKLY_REPORT
      ? ["event-1", "event-2", "event-3"]
      : ["event-1", "event-2", "event-3", "event-previous"];
    assert.equal(narrativeInput.report.aggregates.eventCount, expectedEventIds.length);
    const payload = JSON.stringify(narrativeInput);
    assert.equal(payload.includes("ineligible"), false);
    assert.equal(payload.includes("private-topic"), false);
    assert.equal(payload.includes("other-owner"), false);
    assert.equal(payload.includes("foreign-topic"), false);
    assert.deepEqual(new Set(prisma.state.evidence.map((item) => item.sourceEventId)),
      new Set(expectedEventIds));
    assert.equal(result.result.report.eventCount, expectedEventIds.length);
  }
});

test("INSUFFICIENT_EVIDENCE is persisted without calling the provider", async () => {
  const prisma = createReportPrisma();
  let providerCalls = 0;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  const worker = reportWorker({
    prisma,
    job,
    retrieval: semanticRetrieval(prisma, { take: 1 }),
    provider: { async generateNarrative() { providerCalls += 1; } }
  });
  const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });

  assert.equal(result.succeeded, true, result.error?.stack);
  assert.equal(result.result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(providerCalls, 0);
  assert.equal(prisma.state.weeklyReports[0].narrativeStatus, "INSUFFICIENT_EVIDENCE");
  assert.equal(prisma.state.weeklyReports[0].summary, null);
  assert.deepEqual(prisma.state.weeklyReports[0].narrativeSections, []);
  assert.equal(prisma.state.evidence.length, 1);
});

test("provider failure and timeout use the existing bounded job failure lifecycle", async () => {
  for (const behavior of [
    async () => { throw new Error("provider unavailable"); },
    async () => new Promise(() => {})
  ]) {
    const prisma = createReportPrisma();
    const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", { maxAttempts: 1 });
    const worker = reportWorker({ prisma, job, timeoutMs: 5, provider: { generateNarrative: behavior } });
    const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });
    assert.equal(result.succeeded, false);
    assert.equal(job.status, "FAILED");
    assert.equal(prisma.state.weeklyReports.length, 0);
    assert.equal(prisma.state.evidence.length, 0);
  }
});

test("malformed provider output fails the job without persisting a report", async () => {
  const prisma = createReportPrisma();
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", { maxAttempts: 1 });
  const worker = reportWorker({ prisma, job, provider: { async generateNarrative() { return "not-json"; } } });
  const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });
  assert.equal(result.succeeded, false);
  assert.equal(result.error.code, "REPORT_NARRATIVE_INVALID_OUTPUT");
  assert.equal(job.status, "FAILED");
  assert.equal(prisma.state.weeklyReports.length, 0);
});

test("persistence failure rolls back report status, claims, and provenance together", async () => {
  const prisma = createReportPrisma();
  prisma.state.failEvidence = true;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  const worker = reportWorker({
    prisma,
    job,
    provider: { async generateNarrative(input) { return validProviderOutput(input.report.reportType); } }
  });
  const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });
  assert.equal(result.succeeded, false);
  assert.equal(job.status, "PENDING");
  assert.equal(prisma.state.weeklyReports.length, 0);
  assert.equal(prisma.state.evidence.length, 0);
});

test("ambiguous provider failure cannot buy another inference on job retry", async () => {
  const prisma = createReportPrisma();
  let providerCalls = 0;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", { maxAttempts: 2 });
  const worker = reportWorker({
    prisma,
    job,
    provider: {
      async generateNarrative(input) {
        providerCalls += 1;
        if (providerCalls === 1) throw new Error("temporary failure");
        return validProviderOutput(input.report.reportType);
      }
    }
  });
  const now = new Date("2026-09-22T00:00:00Z");
  assert.equal((await worker.runOnce({ now })).succeeded, false);
  const retry = await worker.runOnce({ now });
  assert.equal(retry.succeeded, false);
  assert.equal(retry.error.code, "AI_INFERENCE_ALREADY_RESERVED");
  assert.equal(job.attemptCount, 2);
  assert.equal(providerCalls, 1);
  assert.equal(job.status, "FAILED");
  assert.equal(prisma.state.weeklyReports.length, 0);
  assert.equal(prisma.state.evidence.length, 0);
});

test("pre-inference failure still retries and finalized replay avoids another paid call", async () => {
  const prisma = createReportPrisma(), job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  const now = new Date("2026-09-22"); let calls = 0;
  const unavailable = reportWorker({ prisma, job, provider: null });
  assert.equal((await unavailable.runOnce({ now })).succeeded, false);
  assert.equal(prisma.state.costReservations.length, 0);
  const worker = reportWorker({ prisma, job, provider: { async generateNarrative(input) { calls++; return validProviderOutput(input.report.reportType); } } });
  assert.equal((await worker.runOnce({ now })).succeeded, true);
  job.status = "PENDING";
  assert.equal((await worker.runOnce({ now })).result.skipped, true);
  assert.equal(calls, 1);
  assert.equal(prisma.state.weeklyReports.length, 1);
  assert.equal(prisma.state.evidence.length, 3);
});

test("cross-owner evidence is rejected across the worker path", async () => {
  const prisma = createReportPrisma();
  let providerCalls = 0;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", { maxAttempts: 1 });
  const worker = reportWorker({
    prisma,
    job,
    retrieval: semanticRetrieval(prisma, { candidateOwnerId: otherOwnerId }),
    provider: { async generateNarrative() { providerCalls += 1; } }
  });
  const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });
  assert.equal(result.succeeded, false);
  assert.equal(job.status, "FAILED");
  assert.equal(providerCalls, 0);
  assert.equal(prisma.state.weeklyReports.length, 0);
});

test("stale report jobs are rejected and cannot overwrite a finalized result", async () => {
  const prisma = createReportPrisma();
  prisma.state.weeklyReports.push({
    id: "weekly-newer",
    ownerId,
    periodKey: "2026-09-14",
    narrativeStatus: "GENERATED",
    narrativeSections: [{ kind: "RECENT_MOMENTS", claim: "Trusted newer result" }],
    summary: "Trusted newer result",
    generationVersion: "grounded-narrative-v2"
  });
  let providerCalls = 0;
  const job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", {
    idempotencyKey: `${AI_JOB_TYPES.WEEKLY_REPORT}:2026-09-14:grounded-narrative-v0`
  });
  const worker = reportWorker({
    prisma,
    job,
    provider: { async generateNarrative() { providerCalls += 1; return validProviderOutput("WEEKLY"); } }
  });
  const result = await worker.runOnce({ now: new Date("2026-09-22T00:00:00Z") });
  assert.equal(result.succeeded, false);
  assert.equal(result.error.code, "REPORT_SOURCE_STALE");
  assert.equal(providerCalls, 0);
  assert.equal(prisma.state.weeklyReports[0].summary, "Trusted newer result");
  assert.equal(prisma.state.weeklyReports.length, 1);
});

for (const [name, mutate, code] of [
  ["consent revoke then regrant", (p) => { p.state.consentUpdatedAt = new Date("2026-09-22T00:00:01Z"); }, "REPORT_SOURCE_STALE"],
  ["source deletion", (p) => { p.state.events = p.state.events.filter((e) => e.id !== "event-1"); }, "REPORT_SOURCE_STALE"],
  ["source revision", (p) => { p.state.events[0].updatedAt = new Date("2026-09-22"); }, "REPORT_SOURCE_STALE"],
  ["memory revision", (p) => { p.state.events[0].memory.embeddingInputRevision += 1; }, "REPORT_SOURCE_STALE"],
  ["memory deletion", (p) => { p.state.events[0].memory = null; }, "REPORT_SOURCE_STALE"],
  ["eligibility revoked", (p) => { p.state.events[0].memoryProcessingAllowed = false; }, "REPORT_SOURCE_STALE"],
  ["source moved outside period", (p) => { p.state.events[0].occurredAt = new Date("2026-10-03"); }, "REPORT_SOURCE_STALE"],
  ["previous-period aggregate source revised", (p) => { p.state.events.at(-1).updatedAt = new Date("2026-09-22"); }, "REPORT_SOURCE_STALE"],
  ["cross-owner source", (p) => { p.state.events[0].ownerId = otherOwnerId; }, "REPORT_SOURCE_STALE"],
  ["expired lease", (p, job) => { job.leaseExpiresAt = p.state.now; }, "AI_JOB_LEASE_LOST"],
  ["reclaimed lease", (_p, job) => { job.lockedBy = "new-worker"; job.attemptCount += 1; }, "AI_JOB_LEASE_LOST"],
  ["reclaimed lease with same worker ID", (_p, job) => { job.attemptCount += 1; }, "AI_JOB_LEASE_LOST"],
  ["expiry during persistence rolls back writes", (p) => { p.state.expireBeforeCompletion = true; }, "AI_JOB_LEASE_LOST"]
]) {
  test(`Weekly/Monthly reject ${name} after provider starts`, async () => {
    for (const [type, period, now] of [
      [AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14", "2026-09-22"],
      [AI_JOB_TYPES.MONTHLY_REPORT, "2026-09", "2026-10-02"]
    ]) {
      const prisma = createReportPrisma(), job = reportJob(type, period);
      const worker = reportWorker({ prisma, job, provider: { async generateNarrative(input) {
        assert.equal(JSON.stringify(input).includes("sourceFence"), false);
        mutate(prisma, job);
        return validProviderOutput(input.report.reportType);
      } } });
      const result = await worker.runOnce({ now: new Date(now) });
      assert.equal(result.succeeded, false);
      assert.equal(result.error.code, code, result.error.stack);
      assert.notEqual(job.status, "SUCCEEDED");
      assert.equal(prisma.state.weeklyReports.length + prisma.state.monthlyReports.length, 0);
      assert.equal(prisma.state.evidence.length, 0);
      if (name.includes("reclaimed")) {
        assert.equal(job.status, "RUNNING", "old worker must not fail/cancel the new claim");
        assert.equal(job.attemptCount, 2);
      }
    }
  });
}

test("lease reclaim cannot launch competing inference; old result remains fenced", async () => {
  const prisma = createReportPrisma(), job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  let releaseOld, entered;
  const oldPaused = new Promise((resolve) => { releaseOld = resolve; });
  const oldEntered = new Promise((resolve) => { entered = resolve; });
  const old = reportWorker({ prisma, job, timeoutMs: 5_000, provider: { async generateNarrative(input) {
    entered(); await oldPaused; return validProviderOutput(input.report.reportType);
  } } });
  const oldRun = old.runOnce({ now: new Date("2026-09-22") });
  await oldEntered;
  // Emulate SKIP LOCKED reclamation after expiry; new attempt uses the same
  // stable worker ID intentionally to exercise the claim-generation/ABA fence.
  job.status = "PENDING";
  const current = reportWorker({ prisma, job, provider: { async generateNarrative(input) {
    assert.fail("reclaimed worker must not launch duplicate inference");
  } } });
  current.workerId = old.workerId;
  const currentResult = await current.runOnce({ now: new Date("2026-09-22T00:01:01Z") });
  releaseOld();
  const oldResult = await oldRun;
  assert.equal(currentResult.succeeded, false);
  assert.equal(currentResult.error.code, "AI_INFERENCE_ALREADY_RESERVED");
  assert.equal(oldResult.succeeded, false);
  assert.equal(oldResult.error.code, "AI_JOB_LEASE_LOST");
  assert.equal(prisma.state.weeklyReports.length, 0);
  assert.equal(prisma.state.evidence.length, 0);
});

test("failed evidence write rolls back atomically; job retry cannot repeat paid inference", async () => {
  const prisma = createReportPrisma(), job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
  let calls = 0;
  const worker = reportWorker({ prisma, job, provider: { async generateNarrative(input) {
    calls += 1; return validProviderOutput(input.report.reportType);
  } } });
  prisma.state.failEvidence = true;
  assert.equal((await worker.runOnce({ now: new Date("2026-09-22") })).succeeded, false);
  assert.equal(prisma.state.weeklyReports.length, 0);
  assert.equal(job.status, "PENDING");
  prisma.state.failEvidence = false;
  const retry = await worker.runOnce({ now: new Date("2026-09-22") });
  assert.equal(retry.succeeded, false);
  assert.equal(retry.error.code, "AI_INFERENCE_ALREADY_RESERVED");
  await worker.runOnce({ now: new Date("2026-09-22") });
  assert.deepEqual(await worker.runOnce(), { claimed: false });
  assert.equal(calls, 1);
  assert.equal(prisma.state.weeklyReports.length, 0);
  assert.equal(job.status, "FAILED");
});

test("finalized replay cannot bypass revoked consent or lease expiry", async () => {
  for (const revoke of [false, true]) {
    const prisma = createReportPrisma(), job = reportJob(AI_JOB_TYPES.WEEKLY_REPORT, "2026-09-14");
    const worker = reportWorker({ prisma, job, provider: { async generateNarrative(input) { return validProviderOutput(input.report.reportType); } } });
    assert.equal((await worker.runOnce({ now: new Date("2026-09-22") })).succeeded, true);
    job.status = "PENDING";
    const claim = await worker.repository.claimNext({ workerId: worker.workerId, now: new Date("2026-09-22"), leaseMs: 60_000 });
    if (revoke) prisma.state.memoryConsent = false;
    else job.leaseExpiresAt = prisma.state.now;
    const result = await worker.executeClaimed(claim);
    assert.notEqual(job.status, "SUCCEEDED");
    assert.equal(prisma.state.weeklyReports.length, 1, "existing report must not be overwritten");
    if (!revoke) assert.equal(result.error.code, "AI_JOB_LEASE_LOST");
    else assert.equal(job.status, "CANCELLED");
  }
});


test("report persistence rejects forged owner identity before any database write", async () => {
  for (const field of ["identity", "aggregates", "narrative", "selection"]) {
    const prisma = createReportPrisma();
    const identity = { userId: field === "identity" ? otherOwnerId : ownerId };
    const reportInput = { reportType: "WEEKLY", ownerId,
      aggregates: { ownerId: field === "aggregates" ? otherOwnerId : ownerId },
      evidenceSelection: { ownerId: field === "selection" ? otherOwnerId : ownerId } };
    const narrativeResult = { ownerId: field === "narrative" ? otherOwnerId : ownerId };
    await assert.rejects(new GroundedReportPersistenceService(prisma).persist({ identity, reportInput, narrativeResult,
      generationVersion: REPORT_NARRATIVE_GENERATION_VERSION }), (error) => error.code === "AI_FORBIDDEN");
    assert.equal(prisma.state.weeklyReports.length, 0);
    assert.equal(prisma.state.monthlyReports.length, 0);
    assert.equal(prisma.state.queries.length, 0);
  }
});

test('deterministic contradiction fails Weekly/Monthly before report or evidence persistence', async () => {
  for (const type of [AI_JOB_TYPES.WEEKLY_REPORT, AI_JOB_TYPES.MONTHLY_REPORT]) {
    const prisma = createReportPrisma();
    const job = reportJob(type, type === AI_JOB_TYPES.WEEKLY_REPORT ? '2026-09-14' : '2026-09', { maxAttempts: 1 });
    let calls = 0;
    const worker = reportWorker({ prisma, job, provider: { async generateNarrative(input) {
      calls++;
      const output = validProviderOutput(input.report.reportType);
      output.sections[0].claim = 'There were 9999 Events.';
      output.sections[0].aggregateRefs = ['eventCount', 'topTopics'];
      return output;
    } } });
    const result = await worker.runOnce({ now: new Date('2026-10-02T00:00:00Z') });
    assert.equal(result.succeeded, false); assert.equal(result.error.code, 'REPORT_NARRATIVE_GROUNDING_FAILED');
    assert.equal(calls, 1); assert.equal(job.status, 'FAILED');
    assert.equal(prisma.state.weeklyReports.length, 0); assert.equal(prisma.state.monthlyReports.length, 0); assert.equal(prisma.state.evidence.length, 0);
  }
});

test("Monthly 2.0 owners: the worker writes the Monthly in code, with no provider call and no cost reservation", async () => {
  const prisma = createReportPrisma();
  const job = reportJob(AI_JOB_TYPES.MONTHLY_REPORT, "2026-09");
  const worker = createProductionAiWorker({ prisma, embeddingProvider: embeddingProvider(), semanticRetrieval: semanticRetrieval(prisma),
    reportNarrativeProvider: { async generateNarrative() { throw new Error("Monthly 2.0 must not call a provider"); } },
    reportNarrativeTimeoutMs: 100, logger: { error() {} }, retryDelayMs: 0, env: { MONTHLY_INSIGHTS_OWNER_IDS: "*" } });
  worker.repository = jobRepository(job, prisma);
  const result = await worker.runOnce({ now: new Date("2026-10-02T00:00:00Z") });
  assert.equal(result.succeeded, true, result.error?.stack);
  const saved = prisma.state.monthlyReports[0];
  assert.equal(saved.narrativeStatus, "GENERATED");
  assert.equal(saved.narrativeSections[0].kind, "MONTH_HEADLINE");
  assert.equal(saved.narrativeSections[0].reportVersion, "monthly-2.0");
  assert.equal(saved.narrativeSections.some(section => section.kind === "MONTH_GARDEN"), true);
});
