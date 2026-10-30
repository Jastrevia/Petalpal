import { finishReportClaim } from "./report-write-fence.js";
import { randomUUID } from "node:crypto";
import { PrismaAiCostGate, isAiCostError } from "./ai-cost-gate.js";

import {
  AI_JOB_TYPES,
  INSIGHT_EXTRACTION_VERSION,
  PrismaAiJobRepository,
  embeddingJobProcessingVersion
} from "./ai-jobs.js";
import { createProductionEmbeddingProvider } from "./embedding-provider.js";
import {
  DeterministicMemoryExtractor,
  EventMemoryPipeline,
  PrismaMemoryRepository
} from "./event-memory.js";
import { GroundedReportPersistenceService, ReportInputService } from "./report-foundation.js";
import {
  GroundedReportNarrativeService,
  REPORT_NARRATIVE_GENERATION_VERSION
} from "./report-narrative.js";
import { EventEmbeddingService, SemanticEventRetrievalService, requireLockedMemoryConsent, requireMemoryConsent } from "./semantic-retrieval.js";
import { SonnetWeeklyReflectionService, weeklyReportProvider } from "./sonnet-weekly.js";
import { OpusMonthlyReflectionService, monthlyReportProvider } from "./opus-monthly.js";
import { runInsightExtraction } from "./insight-extract.js";
import { monthlyInsightsEnabledFor, weeklyInsightsEnabledFor } from "./weekly-contract.js";
import { renderMonthly2 } from "./monthly-insights.js";

function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Delay before the next attempt of a failed job: base × 2^(attempt − 1), capped, with
// "equal jitter" (half fixed, half random) so jobs that failed together do not retry together.
export function retryBackoffMs(attempt, baseMs, { maxMs = 60_000, random = Math.random } = {}) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

const SAFE_JOB_ERROR_CODES = new Set([
  "AI_FORBIDDEN", "AI_JOB_LEASE_LOST", "INVALID_REPORT_JOB", "REPORT_SOURCE_STALE",
  "REPORT_NARRATIVE_PROVIDER_NOT_CONFIGURED", "REPORT_NARRATIVE_PROVIDER_FAILED", "REPORT_NARRATIVE_TIMEOUT",
  "REPORT_NARRATIVE_INVALID_INPUT", "REPORT_NARRATIVE_INVALID_OUTPUT", "REPORT_NARRATIVE_GROUNDING_FAILED", "INVALID_EMBEDDING_VECTOR",
  "EMBEDDING_NOT_CONFIGURED", "EMBEDDING_RATE_LIMITED", "EMBEDDING_PROVIDER_ERROR", "EMBEDDING_PROVIDER_REJECTED",
  "EMBEDDING_ABORTED", "EMBEDDING_TIMEOUT", "EMBEDDING_SOURCE_CHANGED", "EMBEDDING_MODEL_REVISION_MISMATCH",
  "AI_GATEWAY_DISABLED", "AI_GATEWAY_CONFIG_INVALID", "AI_GATEWAY_INVALID_INPUT", "AI_GATEWAY_FORBIDDEN",
  "AI_GATEWAY_TIMEOUT", "AI_GATEWAY_TRANSPORT_FAILED", "AI_GATEWAY_RATE_LIMITED", "AI_GATEWAY_PROVIDER_AUTH_FAILED",
  "AI_GATEWAY_PROVIDER_FAILED", "AI_GATEWAY_INVALID_OUTPUT", "AI_GATEWAY_GROUNDING_FAILED"
]);

export class AiJobWorker {
  constructor({
    repository,
    handlers,
    workerId = `ai-worker-${randomUUID()}`,
    leaseMs = 60_000,
    pollIntervalMs = 1_000,
    retryDelayMs = 1_000,
    logger = console
  }) {
    if (!repository) throw new Error("AiJobWorker requires a job repository");
    if (!handlers || typeof handlers !== "object") throw new Error("AiJobWorker requires job handlers");
    this.repository = repository;
    this.handlers = handlers;
    this.workerId = workerId;
    this.leaseMs = leaseMs;
    this.pollIntervalMs = pollIntervalMs;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
  }

  async runOnce({ now = new Date() } = {}) {
    const job = await this.repository.claimNext({ workerId: this.workerId, now, leaseMs: this.leaseMs });
    if (!job) return { claimed: false };

    return this.executeClaimed(job);
  }

  async runJob({ jobId, ownerId, jobType, now = new Date() }) {
    const job = await this.repository.claimById({
      jobId,
      ownerId,
      jobType,
      workerId: this.workerId,
      now,
      leaseMs: this.leaseMs
    });
    if (!job) return { claimed: false };

    return this.executeClaimed(job);
  }

  async executeClaimed(job) {
    const handler = this.handlers[job.jobType];
    let renewal = null;
    let renewalError = null;
    const heartbeat = setInterval(() => {
      if (renewal || renewalError) return;
      renewal = Promise.resolve().then(() => this.repository.renewLease({
        jobId: job.id, workerId: this.workerId, leaseMs: this.leaseMs, claim: job
      })).then((result) => {
        if ((result?.count ?? 0) !== 1) {
          const error = new Error(`Worker ${this.workerId} lost the lease for job ${job.id}`);
          error.code = "AI_JOB_LEASE_LOST";
          throw error;
        }
      }).catch((error) => { renewalError = error; }).finally(() => { renewal = null; });
    }, Math.max(250, Math.floor(this.leaseMs / 3)));
    const stopHeartbeat = async ({ consentIneligible = false, jobCompleted = false } = {}) => {
      clearInterval(heartbeat);
      if (renewal) await renewal;
      // The committed report transaction is authoritative after guarded completion.
      if (renewalError && !jobCompleted && !(consentIneligible && renewalError.code === "AI_JOB_LEASE_LOST")) throw renewalError;
    };
    try {
      if (typeof handler !== "function") throw new Error(`No handler is configured for ${job.jobType}`);
      const result = await handler(job, { workerId: this.workerId });
      await stopHeartbeat({ consentIneligible: result?.status === "CONSENT_INELIGIBLE", jobCompleted: result?.jobCompleted === true });
      if (result?.jobCompleted === true) return { claimed: true, succeeded: true, job, result };
      if (result?.status === "CONSENT_INELIGIBLE") {
        const cancelled = await this.repository.cancelClaimed({ jobId: job.id, workerId: this.workerId, claim: job });
        if (!cancelled) {
          const error = new Error(`Worker ${this.workerId} lost the lease for job ${job.id}`);
          error.code = "AI_JOB_LEASE_LOST";
          throw error;
        }
        return { claimed: true, succeeded: true, skipped: true, job, result };
      }
      const completed = await this.repository.markSucceeded({
        jobId: job.id,
        workerId: this.workerId,
        claim: job,
        now: new Date()
      });
      if ((completed?.count ?? 0) !== 1) {
        const error = new Error(`Worker ${this.workerId} lost the lease for job ${job.id}`);
        error.code = "AI_JOB_LEASE_LOST";
        throw error;
      }
      return { claimed: true, succeeded: true, job, result };
    } catch (error) {
      clearInterval(heartbeat);
      if (renewal) await renewal;
      // Persist the allowlisted code with the failure so lastError says why a job failed.
      const code = isAiCostError(error) || SAFE_JOB_ERROR_CODES.has(error?.code) ? error.code : "AI_JOB_FAILED";
      const safeError = new Error(`AI job failed: ${code}`);
      safeError.code = code;
      const failed = await this.repository.markFailed({
        jobId: job.id,
        workerId: this.workerId,
        claim: job,
        error: safeError,
        now: new Date(),
        retryDelayMs: error.retryDelayMs ?? retryBackoffMs(job.attemptCount, this.retryDelayMs)
      });
      this.logger?.error?.("AI job failed", { jobId: job.id, workerId: this.workerId, code: safeError.code });
      return { claimed: true, succeeded: false, job, error: safeError, rescheduled: Boolean(failed) };
    }
  }

  async start({ signal } = {}) {
    while (!signal?.aborted) {
      const result = await this.runOnce();
      if (!result.claimed) await abortableDelay(this.pollIntervalMs, signal);
    }
  }
}

function reportJobInput(job) {
  if (job.jobType === AI_JOB_TYPES.WEEKLY_REPORT && /^\d{4}-\d{2}-\d{2}$/.test(job.resourceId)) {
    return { reportType: "WEEKLY", args: { localDate: job.resourceId } };
  }
  const monthly = /^(\d{4})-(\d{2})$/.exec(job.resourceId || "");
  if (job.jobType === AI_JOB_TYPES.MONTHLY_REPORT && monthly) {
    return { reportType: "MONTHLY", args: { year: Number(monthly[1]), month: Number(monthly[2]) } };
  }
  const error = new Error("Report job resourceId does not match its Weekly or Monthly period");
  error.code = "INVALID_REPORT_JOB";
  throw error;
}

function reportJobIdempotencyKey(job) {
  return `${job.jobType}:${job.resourceId}:${REPORT_NARRATIVE_GENERATION_VERSION}`;
}

function reportFailure(result) {
  const error = new Error(`Grounded report generation failed: ${result.errorCode || "REPORT_NARRATIVE_PROVIDER_FAILED"}`);
  error.code = result.errorCode || "REPORT_NARRATIVE_PROVIDER_FAILED";
  return error;
}

export function createProductionAiWorker({
  prisma,
  embeddingProvider = createProductionEmbeddingProvider(),
  reportNarrativeProvider = null,
  reportNarrativeTimeoutMs = 20_000,
  semanticRetrieval = null,
  costGate = new PrismaAiCostGate(prisma),
  env = process.env,
  gatewayFetchImpl = fetch,
  ...options
}) {
  const jobRepository = new PrismaAiJobRepository(prisma);
  const memoryPipeline = new EventMemoryPipeline({
    extractor: new DeterministicMemoryExtractor(),
    memoryRepository: new PrismaMemoryRepository(prisma)
  });
  const embeddingService = new EventEmbeddingService({ prisma, provider: embeddingProvider });
  const reportInputService = new ReportInputService({
    prisma,
    semanticRetrieval: semanticRetrieval || new SemanticEventRetrievalService({ prisma, provider: embeddingProvider }),
    localizedWeekly: weeklyReportProvider(env) !== "workers-ai",
    localizedMonthly: monthlyReportProvider(env) !== "workers-ai",
    env
  });
  const reportNarrativeService = reportNarrativeProvider
    ? new GroundedReportNarrativeService({ provider: reportNarrativeProvider, timeoutMs: reportNarrativeTimeoutMs, maxAttempts: 1 })
    : null;
  const reportPersistence = new GroundedReportPersistenceService(prisma);
  const weeklySonnet = weeklyReportProvider(env) !== "workers-ai"
    ? new SonnetWeeklyReflectionService({ prisma, env, fetchImpl: gatewayFetchImpl }) : null;
  const monthlyOpus = monthlyReportProvider(env) !== "workers-ai"
    ? new OpusMonthlyReflectionService({ prisma, env, fetchImpl: gatewayFetchImpl }) : null;

  async function isConsentIneligible(identity) {
    try {
      await requireMemoryConsent(prisma, identity);
      return false;
    } catch (error) {
      if (error?.code === "AI_FORBIDDEN") return true;
      throw error;
    }
  }

  async function readyEventForMemory(event, job) {
    if (event.emotionStatus !== "PENDING") return event;
    // The request may still be running its bounded inference. Defer early job attempts.
    if (job.attemptCount < job.maxAttempts) {
      const error = new Error("Event enrichment is pending");
      error.retryDelayMs = 5_000;
      throw error;
    }
    const ageMs = Date.now() - new Date(event.updatedAt || event.createdAt).getTime();
    if (Number.isFinite(ageMs) && ageMs < 8_000) {
      await new Promise((resolve) => setTimeout(resolve, 8_000 - ageMs));
    }
    await prisma.event.updateMany({
      where: { id: event.id, ownerId: job.ownerId, emotionStatus: "PENDING" },
      data: { emotionStatus: "FAILED", emotionOutcome: "FAILED", secondaryEmotions: [], emotionProbabilities: null }
    });
    const resolved = await prisma.event.findFirst({
      where: { id: event.id, ownerId: job.ownerId, memoryProcessingAllowed: true }
    });
    if (!resolved || resolved.emotionStatus === "PENDING") throw new Error("Event enrichment could not be finalized");
    return resolved;
  }

  const processReport = async (job, { workerId }) => {
    try {
      if (job.idempotencyKey !== reportJobIdempotencyKey(job)) {
        const error = new Error("Report job generation version is stale");
        error.code = "REPORT_SOURCE_STALE";
        throw error;
      }
      const { reportType, args } = reportJobInput(job);
      const identity = { userId: job.ownerId };
      const finalized = await reportPersistence.findFinalized({ identity, reportType, periodKey: job.resourceId });
      if (finalized) return await reportPersistence.completeFinalized({ identity, reportType, periodKey: job.resourceId, generationVersion: REPORT_NARRATIVE_GENERATION_VERSION, job, workerId });
      const useSonnet = reportType === "WEEKLY" && weeklySonnet;
      // Monthly 2.0 (lib/monthly-insights.js) is code only: no provider, no cost reservation, no model call.
      const monthly2 = reportType === "MONTHLY" && monthlyInsightsEnabledFor(env, job.ownerId);
      const useOpus = reportType === "MONTHLY" && monthlyOpus && !monthly2;
      if (!useSonnet && !useOpus && !monthly2 && !reportNarrativeService) {
        const error = new Error("Grounded report narrative provider is not configured");
        error.code = "REPORT_NARRATIVE_PROVIDER_NOT_CONFIGURED";
        throw error;
      }
      const asOf = job.lockedAt instanceof Date ? job.lockedAt : new Date(job.lockedAt || Date.now());
      let reportInput, narrativeResult;
      if (useSonnet) {
        ({ reportInput, narrativeResult } = await weeklySonnet.generate({ identity, job, workerId,
          prepareReportInput: () => reportInputService.buildWeeklyInput({ identity, ...args, asOf }) }));
      } else if (monthly2) {
        reportInput = await reportInputService.buildMonthlyInput({ identity, ...args, asOf });
        narrativeResult = { ownerId: identity.userId, reportType: "MONTHLY", periodKey: reportInput.period.periodKey, status: "GENERATED",
          ...renderMonthly2(reportInput), provider: null, attempts: 0,
          provenance: { selectedEvidence: (reportInput.evidenceSelection?.evidence ?? []).map(({ sourceEventId, sourceMemoryId }) =>
            ({ ownerId: identity.userId, sourceEventId, sourceMemoryId })), citedEvidence: [], aggregateRefs: [] } };
      } else if (useOpus) {
        ({ reportInput, narrativeResult } = await monthlyOpus.generate({ identity, job, workerId,
          prepareReportInput: () => reportInputService.buildMonthlyInput({ identity, ...args, asOf }) }));
      } else {
        await costGate.reserve({ identity, action: job.jobType, key: job.idempotencyKey, job, workerId });
        reportInput = reportType === "WEEKLY"
          ? await reportInputService.buildWeeklyInput({ identity, ...args, asOf })
          : await reportInputService.buildMonthlyInput({ identity, ...args, asOf });
      }
      if (reportInput.period.periodKey !== job.resourceId) {
        const error = new Error("Report job resourceId must be the canonical report period key");
        error.code = "INVALID_REPORT_JOB";
        throw error;
      }
      if (!useSonnet && !useOpus && !monthly2) narrativeResult = await reportNarrativeService.generate(reportInput);
      if (narrativeResult.status === "FAILED") throw reportFailure(narrativeResult);
      const persistence = await reportPersistence.persist({
        identity,
        reportInput,
        narrativeResult,
        generationVersion: REPORT_NARRATIVE_GENERATION_VERSION,
        job, workerId
      });
      return { skipped: persistence.skipped, status: persistence.outcome, report: persistence.report, jobCompleted: persistence.jobCompleted };
    } catch (error) {
      if (error?.code === "AI_FORBIDDEN" && await isConsentIneligible({ userId: job.ownerId })) {
        return { skipped: true, status: "CONSENT_INELIGIBLE" };
      }
      throw error;
    }
  };

  return new AiJobWorker({
    repository: jobRepository,
    handlers: {
      [AI_JOB_TYPES.MEMORY_EXTRACTION]: async (job, { workerId } = {}) => {
        const event = await prisma.event.findFirst({
          where: { id: job.eventId, ownerId: job.ownerId, memoryProcessingAllowed: true }
        });
        if (!event) return { skipped: true, status: "CONSENT_INELIGIBLE" };
        await readyEventForMemory(event, job);
        const identity = { userId: job.ownerId };
        let result;
        try {
          result = await prisma.$transaction(async (tx) => {
            await requireLockedMemoryConsent(tx, identity);
            const claims = await tx.$queryRawUnsafe(`
              SELECT "id" FROM "AIJob" WHERE "id" = $1 AND "ownerId" = $2
                AND "status" = 'RUNNING' AND "lockedBy" = $3
                AND "jobType" = 'MEMORY_EXTRACTION'::"AIJobType"
                AND "attemptCount" = $4 AND "lockedAt" = $5
                AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
              FOR UPDATE`, job.id, job.ownerId, workerId, job.attemptCount, job.lockedAt);
            if (!workerId || claims.length !== 1) {
              const error = new Error("AI job claim is no longer current");
              error.code = "AI_JOB_LEASE_LOST";
              throw error;
            }
            const currentEvent = await tx.event.findFirst({
              where: { id: event.id, ownerId: job.ownerId, memoryProcessingAllowed: true }
            });
            if (!currentEvent) return { skipped: true, status: "CONSENT_INELIGIBLE" };
            const result = await memoryPipeline.processEvent({
              identity,
              event: { ...currentEvent, kind: "EVENT" },
              transaction: tx
            });
            const embeddingJob = await jobRepository.enqueue({
              identity,
              jobType: AI_JOB_TYPES.EMBEDDING_GENERATION,
              resourceId: result.memory.id,
              eventId: event.id,
              processingVersion: embeddingJobProcessingVersion(result.memory.embeddingInputRevision),
              transaction: tx
            });
            await finishReportClaim(tx, { ownerId: job.ownerId, job, workerId });
            return { ...result, embeddingJob, jobCompleted: true };
          });
        } catch (error) {
          if (error?.code === "AI_FORBIDDEN" && await isConsentIneligible(identity)) {
            return { skipped: true, status: "CONSENT_INELIGIBLE" };
          }
          throw error;
        }
        // Weekly 2.0 extraction (WEEKLY_INSIGHTS_OWNER_IDS only), queued after the memory is saved and
        // outside its transaction: a problem here never undoes or fails the memory.
        if (result?.memory && weeklyInsightsEnabledFor(env, job.ownerId)) {
          try {
            await jobRepository.enqueue({ identity, jobType: AI_JOB_TYPES.INSIGHT_EXTRACTION, resourceId: event.id, eventId: event.id,
              processingVersion: INSIGHT_EXTRACTION_VERSION });
          } catch {
            options.logger?.error?.("Insight extraction was not queued", { jobId: job.id, code: "INSIGHT_EXTRACTION_NOT_QUEUED" });
          }
        }
        return result;
      },
      [AI_JOB_TYPES.INSIGHT_EXTRACTION]: async (job, { workerId } = {}) => {
        try {
          return await runInsightExtraction({ prisma, job, workerId, env, fetchImpl: gatewayFetchImpl });
        } catch (error) {
          if (error?.code === "AI_FORBIDDEN" && await isConsentIneligible({ userId: job.ownerId })) {
            return { skipped: true, status: "CONSENT_INELIGIBLE" };
          }
          throw error;
        }
      },
      [AI_JOB_TYPES.EMBEDDING_GENERATION]: async (job, { workerId } = {}) => {
        const identity = { userId: job.ownerId };
        try {
          return await embeddingService.generate({ identity, memoryId: job.resourceId,
            beforeInference: embeddingProvider.describeProfile().provider === "CLOUDFLARE_WORKERS_AI"
              ? () => costGate.reserve({ identity, action: job.jobType, key: job.idempotencyKey, job, workerId }) : null });
        } catch (error) {
          if (error?.code === "AI_FORBIDDEN" && await isConsentIneligible(identity)) {
            return { skipped: true, status: "CONSENT_INELIGIBLE" };
          }
          throw error;
        }
      },
      [AI_JOB_TYPES.WEEKLY_REPORT]: processReport,
      [AI_JOB_TYPES.MONTHLY_REPORT]: processReport
    },
    ...options
  });
}
