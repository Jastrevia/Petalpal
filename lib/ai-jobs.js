import { assertContentAllowed } from './content-safety.js';
import { requireAiIdentity } from "./ai-identity.js";
import { localDateForInstant, normalizeIanaTimezone } from "./ai-periods.js";
import { getEmbeddingProfile, LOCAL_EMBEDDING_PROFILE_KEY, PRODUCTION_EMBEDDING_PROFILE_KEY } from "./embedding-profiles.js";
import { requireLockedMemoryConsent } from "./semantic-retrieval.js";

export const AI_JOB_TYPES = Object.freeze({
  MEMORY_EXTRACTION: "MEMORY_EXTRACTION",
  EMBEDDING_GENERATION: "EMBEDDING_GENERATION",
  WEEKLY_REPORT: "WEEKLY_REPORT",
  MONTHLY_REPORT: "MONTHLY_REPORT",
  INSIGHT_EXTRACTION: "INSIGHT_EXTRACTION"
});

export const EVENT_EXTRACTION_VERSION = "v1";
// Weekly 2.0 extraction jobs (lib/insight-extract.js INSIGHT_EXTRACTION_VERSION; kept here to avoid an import cycle).
export const INSIGHT_EXTRACTION_VERSION = "insight-v1";
export const MAX_EVENT_LENGTH = 4000;
export const MAX_EMBEDDING_BACKFILL_BATCH_SIZE = 500;

function assertIdempotencyKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length < 8 || key.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    const error = new Error("A valid Idempotency-Key header is required");
    error.code = "INVALID_IDEMPOTENCY_KEY";
    throw error;
  }
  return key;
}

function normalizeEventContent(value) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error("Event content is required");
    error.code = "INVALID_EVENT";
    throw error;
  }
  const content = value.trim();
  if (content.length > MAX_EVENT_LENGTH) {
    const error = new Error(`Event content must be ${MAX_EVENT_LENGTH} characters or fewer`);
    error.code = "EVENT_TOO_LARGE";
    throw error;
  }
  return content;
}

function normalizeOccurredAt(value) {
  const occurredAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(occurredAt.getTime())) {
    const error = new Error("occurredAt must be a valid ISO timestamp");
    error.code = "INVALID_EVENT";
    throw error;
  }
  return occurredAt;
}

function claimedGeneration(claim) {
  if (!claim) return {};
  return { ownerId: claim.ownerId, attemptCount: claim.attemptCount, lockedAt: claim.lockedAt };
}

function jobKey(jobType, resourceId, processingVersion) {
  return `${jobType}:${resourceId}:${processingVersion}`;
}

export function embeddingJobProcessingVersion(inputRevision) {
  if (!Number.isInteger(inputRevision) || inputRevision < 1) {
    throw new Error("Embedding input revision must be a positive integer");
  }
  const profile = getEmbeddingProfile(PRODUCTION_EMBEDDING_PROFILE_KEY);
  return `${profile.profileKey}.${inputRevision}`;
}

export class PrismaAiJobRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async enqueue({ identity, jobType, resourceId, eventId = null, processingVersion = "v1", maxAttempts = 3, transaction = null }) {
    const db = transaction || this.prisma;
    const ownerId = requireAiIdentity(identity);
    if (!Object.values(AI_JOB_TYPES).includes(jobType)) throw new Error("Unsupported AI job type");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error("maxAttempts must be between 1 and 20");
    const idempotencyKey = jobKey(jobType, resourceId, processingVersion);
    const existing = await db.aiJob.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } }
    });
    if (existing) {
      if (existing.jobType !== jobType || existing.resourceId !== resourceId || existing.eventId !== eventId) {
        throw new Error("AI job idempotency key conflicts with a different resource");
      }
      return existing;
    }
    const data = { ownerId, jobType, resourceId, eventId, idempotencyKey, maxAttempts };
    if (transaction) {
      await db.aiJob.createMany({ data: [data], skipDuplicates: true });
      const stored = await db.aiJob.findUnique({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } } });
      if (!stored || stored.jobType !== jobType || stored.resourceId !== resourceId || stored.eventId !== eventId) {
        throw new Error("AI job idempotency key conflicts with a different resource");
      }
      return stored;
    }
    try {
      return await db.aiJob.create({
        data
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      return db.aiJob.findUnique({
        where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } }
      });
    }
  }

  async claimNext({ workerId, now = new Date(), leaseMs = 60_000 }) {
    if (typeof workerId !== "string" || !workerId.trim() || workerId.length > 128) throw new Error("A valid workerId is required");
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 15 * 60_000) throw new Error("leaseMs must be between 1 second and 15 minutes");
    const claimedAt = normalizeOccurredAt(now);
    const leaseExpiresAt = new Date(claimedAt.getTime() + leaseMs);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`
        UPDATE "AIJob"
        SET "status" = 'FAILED',
            "completedAt" = $1,
            "lockedAt" = NULL,
            "lockedBy" = NULL,
            "leaseExpiresAt" = NULL,
            "lastError" = COALESCE("lastError", 'Worker lease expired after the final attempt'),
            "updatedAt" = $1
        WHERE "status" = 'RUNNING'
          AND "leaseExpiresAt" <= $1
          AND "attemptCount" >= "maxAttempts"
        RETURNING "id"
      `, claimedAt);
      const rows = await tx.$queryRawUnsafe(`
        WITH candidate AS (
          SELECT "id"
          FROM "AIJob"
          WHERE "attemptCount" < "maxAttempts"
            AND (
              ("status" = 'PENDING' AND "nextAttemptAt" <= $1)
              OR
              ("status" = 'RUNNING' AND "leaseExpiresAt" <= $1)
            )
          ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "AIJob" AS job
        SET "status" = 'RUNNING',
            "attemptCount" = job."attemptCount" + 1,
            "lockedAt" = $1,
            "lockedBy" = $2,
            "leaseExpiresAt" = $3,
            "startedAt" = COALESCE(job."startedAt", $1),
            "completedAt" = NULL,
            "updatedAt" = $1
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING job.*
      `, claimedAt, workerId.trim(), leaseExpiresAt);
      return rows[0] || null;
    });
  }

  async claimById({ jobId, ownerId, jobType, workerId, now = new Date(), leaseMs = 60_000 }) {
    if (typeof jobId !== "string" || !jobId.trim()) throw new Error("A valid jobId is required");
    if (typeof ownerId !== "string" || !ownerId.trim()) throw new Error("A valid ownerId is required");
    if (!Object.values(AI_JOB_TYPES).includes(jobType)) throw new Error("Unsupported AI job type");
    if (typeof workerId !== "string" || !workerId.trim() || workerId.length > 128) throw new Error("A valid workerId is required");
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 15 * 60_000) throw new Error("leaseMs must be between 1 second and 15 minutes");
    const claimedAt = normalizeOccurredAt(now);
    const leaseExpiresAt = new Date(claimedAt.getTime() + leaseMs);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`
        UPDATE "AIJob"
        SET "status" = 'FAILED',
            "completedAt" = $1,
            "lockedAt" = NULL,
            "lockedBy" = NULL,
            "leaseExpiresAt" = NULL,
            "lastError" = COALESCE("lastError", 'Worker lease expired after the final attempt'),
            "updatedAt" = $1
        WHERE "id" = $2
          AND "ownerId" = $3
          AND "jobType" = $4::"AIJobType"
          AND "status" = 'RUNNING'
          AND "leaseExpiresAt" <= $1
          AND "attemptCount" >= "maxAttempts"
        RETURNING "id"
      `, claimedAt, jobId.trim(), ownerId.trim(), jobType);
      const rows = await tx.$queryRawUnsafe(`
        UPDATE "AIJob"
        SET "status" = 'RUNNING',
            "attemptCount" = "attemptCount" + 1,
            "lockedAt" = $1,
            "lockedBy" = $2,
            "leaseExpiresAt" = $3,
            "startedAt" = COALESCE("startedAt", $1),
            "completedAt" = NULL,
            "updatedAt" = $1
        WHERE "id" = $4
          AND "ownerId" = $5
          AND "jobType" = $6::"AIJobType"
          AND "attemptCount" < "maxAttempts"
          AND (
            ("status" = 'PENDING' AND "nextAttemptAt" <= $1)
            OR
            ("status" = 'RUNNING' AND "leaseExpiresAt" <= $1)
          )
        RETURNING *
      `, claimedAt, workerId.trim(), leaseExpiresAt, jobId.trim(), ownerId.trim(), jobType);
      return rows[0] || null;
    });
  }

  async markSucceeded({ jobId, workerId, claim, now = new Date() }) {
    const completedAt = normalizeOccurredAt(now);
    return this.prisma.aiJob.updateMany({
      where: { id: jobId, status: "RUNNING", lockedBy: workerId, ...claimedGeneration(claim), leaseExpiresAt: { gt: completedAt } },
      data: {
        status: "SUCCEEDED",
        completedAt,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: null
      }
    });
  }

  async cancelClaimed({ jobId, workerId, claim, now = new Date() }) {
    const completedAt = normalizeOccurredAt(now);
    const result = await this.prisma.aiJob.updateMany({
      where: { id: jobId, status: "RUNNING", lockedBy: workerId, ...claimedGeneration(claim) },
      data: {
        status: "CANCELLED",
        completedAt,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: "AI memory processing is no longer authorized"
      }
    });
    if (result.count === 1) return true;
    const job = await this.prisma.aiJob.findUnique({ where: { id: jobId }, select: { status: true } });
    return job?.status === "CANCELLED";
  }

  async markFailed({ jobId, workerId, claim, error, now = new Date(), retryDelayMs = 1_000 }) {
    const failedAt = normalizeOccurredAt(now);
    const nextAttemptAt = new Date(failedAt.getTime() + Math.max(0, retryDelayMs));
    const message = String(error?.message || error || "AI job failed").slice(0, 4000);
    const rows = await this.prisma.$queryRawUnsafe(`
      UPDATE "AIJob"
      SET "status" = CASE WHEN "attemptCount" >= "maxAttempts" THEN 'FAILED'::"AIJobStatus" ELSE 'PENDING'::"AIJobStatus" END,
          "nextAttemptAt" = $1,
          "completedAt" = CASE WHEN "attemptCount" >= "maxAttempts" THEN $2::timestamp(3) ELSE NULL END,
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "leaseExpiresAt" = NULL,
          "lastError" = $3,
          "updatedAt" = $2
      WHERE "id" = $4 AND "status" = 'RUNNING' AND "lockedBy" = $5
        AND ($6::integer IS NULL OR ("attemptCount" = $6 AND "lockedAt" = $7 AND "ownerId" = $8))
      RETURNING *
    `, nextAttemptAt, failedAt, message, jobId, workerId, claim?.attemptCount ?? null, claim?.lockedAt ?? null, claim?.ownerId ?? null);
    return rows[0] || null;
  }

  async renewLease({ jobId, workerId, claim, now = new Date(), leaseMs = 60_000 }) {
    const heartbeatAt = normalizeOccurredAt(now);
    return this.prisma.aiJob.updateMany({
      where: { id: jobId, status: "RUNNING", lockedBy: workerId, ...claimedGeneration(claim), leaseExpiresAt: { gt: heartbeatAt } },
      data: { leaseExpiresAt: new Date(heartbeatAt.getTime() + leaseMs) }
    });
  }
}

export async function enqueueEventMemoryEmbeddingBackfill({
  prisma,
  batchSize = 100,
  afterId = null
}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_EMBEDDING_BACKFILL_BATCH_SIZE) {
    throw new Error(`Embedding backfill batchSize must be between 1 and ${MAX_EMBEDDING_BACKFILL_BATCH_SIZE}`);
  }
  if (afterId !== null && (typeof afterId !== "string" || !afterId.trim())) {
    throw new Error("Embedding backfill afterId must be a non-empty EventMemory id");
  }

  const profile = getEmbeddingProfile(LOCAL_EMBEDDING_PROFILE_KEY);
  const rows = await prisma.$queryRawUnsafe(`
    SELECT memory."id", memory."ownerId", memory."sourceEventId", memory."embeddingInputRevision"
    FROM "EventMemory" AS memory
    INNER JOIN "Event" AS event
      ON event."id" = memory."sourceEventId" AND event."ownerId" = memory."ownerId"
    INNER JOIN "User" AS owner ON owner."id" = memory."ownerId"
    INNER JOIN "AiConsent" AS consent ON consent."userId" = memory."ownerId"
    WHERE memory."memoryType" = 'EVENT'
      AND event."memoryProcessingAllowed" = true
      AND consent."aiProcessing" = true
      AND consent."personalization" = true
      AND consent."memoryEnabled" = true
      AND (lower(owner."preferredLocale") = 'en' OR lower(owner."preferredLocale") LIKE 'en-%')
      AND ($1::text IS NULL OR memory."id" > $1)
      AND (
        memory."embedding" IS NULL
        OR memory."embeddingStatus" <> 'GENERATED'
        OR memory."embeddingProfileKey" IS DISTINCT FROM $2
        OR memory."embeddingModel" IS DISTINCT FROM $3
        OR memory."embeddingModelRevision" IS DISTINCT FROM $4
        OR memory."embeddingInputVersion" IS DISTINCT FROM $5
        OR memory."embeddedInputRevision" IS DISTINCT FROM memory."embeddingInputRevision"
      )
    ORDER BY memory."id" ASC
    LIMIT $6
  `, afterId, profile.profileKey, profile.model, profile.modelRevision,
  profile.inputVersion, batchSize + 1);

  const candidates = rows.slice(0, batchSize);
  const repository = new PrismaAiJobRepository(prisma);
  const jobs = [];
  for (const memory of candidates) {
    const identity = { userId: memory.ownerId };
    try {
      const job = await prisma.$transaction(async (tx) => {
        await requireLockedMemoryConsent(tx, identity);
        const [event, owner] = await Promise.all([
          tx.event.findFirst({ where: { id: memory.sourceEventId, ownerId: memory.ownerId, memoryProcessingAllowed: true } }),
          tx.user.findUnique({ where: { id: memory.ownerId }, select: { preferredLocale: true } })
        ]);
        const locale = String(owner?.preferredLocale || "").toLowerCase();
        if (!event || (locale !== "en" && !locale.startsWith("en-"))) return null;
        return repository.enqueue({
          identity,
          jobType: AI_JOB_TYPES.EMBEDDING_GENERATION,
          resourceId: memory.id,
          eventId: memory.sourceEventId,
          processingVersion: `${profile.profileKey}.${memory.embeddingInputRevision}`,
          transaction: tx
        });
      });
      if (job) jobs.push(job);
    } catch (error) {
      if (error?.code !== "AI_FORBIDDEN") throw error;
    }
  }

  return {
    profileKey: profile.profileKey,
    selected: candidates.length,
    jobIds: jobs.map((job) => job.id),
    nextCursor: candidates.at(-1)?.id || null,
    hasMore: rows.length > batchSize
  };
}

// True only for the Event (ownerId, idempotencyKey) unique violation raised when a
// concurrent request with the same key committed first. Any other P2002 is not this race.
function isEventIdempotencyRace(error) {
  if (error?.code !== "P2002" || error?.meta?.modelName !== "Event") return false;
  const constraint = error.meta.driverAdapterError?.cause?.constraint;
  // Prisma 7.10.1+ reports the violated index by name instead of its fields.
  if (constraint?.index !== undefined) return constraint.index === "Event_ownerId_idempotencyKey_key";
  const fields = constraint?.fields ?? error.meta.target;
  const names = Array.isArray(fields) ? fields.map((field) => String(field).replaceAll('"', "")).sort() : [];
  return names.length === 2 && names[0] === "idempotencyKey" && names[1] === "ownerId";
}

export async function createEventAndEnqueueMemoryJob(input) {
  try {
    return await createEventAndEnqueueMemoryJobOnce(input);
  } catch (error) {
    if (!isEventIdempotencyRace(error)) throw error;
    // The competing request's Event (and its memory job) is committed, and this
    // transaction rolled back. One more pass takes the existing-Event branch:
    // same payload replays it, a different payload is IDEMPOTENCY_CONFLICT.
    return createEventAndEnqueueMemoryJobOnce(input);
  }
}

async function createEventAndEnqueueMemoryJobOnce({
  prisma,
  identity,
  content,
  primaryGardenMood = null,
  enrichmentPending = false,
  occurredAt = new Date(),
  idempotencyKey,
  extractionVersion = EVENT_EXTRACTION_VERSION
}) {
  const ownerId = requireAiIdentity(identity);
  const normalizedContent = normalizeEventContent(content);
  const normalizedOccurredAt = normalizeOccurredAt(occurredAt);
  const normalizedIdempotencyKey = assertIdempotencyKey(idempotencyKey);
  // The content-policy check is CPU-only. Run it before the interactive
  // transaction opens: its one-time regex compilation can take seconds on a small
  // CPU and would otherwise count against the transaction timeout (P2028).
  // The verdict is applied at the original point, so an idempotent replay or
  // IDEMPOTENCY_CONFLICT still takes precedence over a content rejection.
  let contentRejection = null;
  try {
    assertContentAllowed(normalizedContent);
  } catch (error) {
    contentRejection = error;
  }

  return prisma.$transaction(async (tx) => {
    const existingEvent = await tx.event.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: normalizedIdempotencyKey } }
    });
    if (existingEvent) {
      if (existingEvent.content !== normalizedContent || (existingEvent.primaryGardenMood || null) !== primaryGardenMood) {
        const error = new Error("Idempotency-Key was already used for a different Event");
        error.code = "IDEMPOTENCY_CONFLICT";
        throw error;
      }
      const existingJob = await tx.aiJob.findUnique({
        where: {
          ownerId_idempotencyKey: {
            ownerId,
            idempotencyKey: jobKey(AI_JOB_TYPES.MEMORY_EXTRACTION, existingEvent.id, extractionVersion)
          }
        }
      });
      return { event: existingEvent, job: existingJob, created: false };
    }

    if (contentRejection) throw contentRejection;
    const user = await tx.user.findUnique({
      where: { id: ownerId },
      select: { timezone: true }
    });
    if (!user) {
      const error = new Error("Authenticated PetalPal owner was not found");
      error.code = "AI_FORBIDDEN";
      throw error;
    }
    const timezone = normalizeIanaTimezone(user.timezone);
    if (!timezone) throw new Error("User profile has an invalid IANA timezone");
    const consentRows = await tx.$queryRawUnsafe(`
      SELECT "termsVersion", "aiProcessing", "personalization", "memoryEnabled", "updatedAt"
      FROM "AiConsent"
      WHERE "userId" = $1
      FOR SHARE
    `, ownerId);
    const consent = consentRows[0] || null;
    const memoryProcessingAllowed = Boolean(
      consent?.aiProcessing &&
      consent?.personalization &&
      consent?.memoryEnabled
    );
    const event = await tx.event.create({
      data: {
        ownerId,
        content: normalizedContent,
        occurredAt: normalizedOccurredAt,
        timezone,
        localDate: localDateForInstant(normalizedOccurredAt, timezone),
        idempotencyKey: normalizedIdempotencyKey,
        memoryProcessingAllowed,
        consentTermsVersion: memoryProcessingAllowed ? consent.termsVersion : null,
        primaryGardenMood,
        emotionStatus: enrichmentPending ? "PENDING" : "SKIPPED"
      }
    });
    const job = memoryProcessingAllowed
      ? await tx.aiJob.create({
          data: {
            ownerId,
            jobType: AI_JOB_TYPES.MEMORY_EXTRACTION,
            resourceId: event.id,
            eventId: event.id,
            idempotencyKey: jobKey(AI_JOB_TYPES.MEMORY_EXTRACTION, event.id, extractionVersion)
          }
        })
      : null;
    return { event, job, created: true, aiProcessingAllowed: consent?.aiProcessing === true,
      aiProcessingConsentUpdatedAt: consent?.updatedAt || null };
  });
}

// Weekly 2.0 history backfill (docs/product/WEEKLY_2.0.md): one INSIGHT_EXTRACTION job per eligible
// Event of the listed owners that has no extraction yet, newest first from `since`, a batch at a time.
// Only queues jobs; the normal worker runs them under each owner's consent. dryRun counts only.
export async function enqueueInsightExtractionBackfill({ prisma, ownerIds, since, batchSize = 100, afterId = null, dryRun = true }) {
  if (!Array.isArray(ownerIds) || !ownerIds.length || ownerIds.length > 100 || ownerIds.some(id => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) {
    throw new Error("Insight backfill needs 1–100 explicit owner ids");
  }
  if (!(since instanceof Date) || Number.isNaN(since.getTime())) throw new Error("Insight backfill needs a valid since date");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_EMBEDDING_BACKFILL_BATCH_SIZE) {
    throw new Error(`Insight backfill batchSize must be between 1 and ${MAX_EMBEDDING_BACKFILL_BATCH_SIZE}`);
  }
  const rows = await prisma.$queryRawUnsafe(`
    SELECT event."id", event."ownerId" FROM "Event" AS event
    INNER JOIN "AiConsent" AS consent ON consent."userId" = event."ownerId"
    LEFT JOIN "EventInsightExtraction" AS extraction ON extraction."sourceEventId" = event."id"
    WHERE event."ownerId" = ANY($1::text[]) AND event."memoryProcessingAllowed" = true AND event."occurredAt" >= $2
      AND consent."aiProcessing" = true AND consent."personalization" = true AND consent."memoryEnabled" = true
      AND extraction."id" IS NULL AND ($3::text IS NULL OR event."id" > $3)
    ORDER BY event."id" ASC LIMIT $4
  `, ownerIds, since, afterId, batchSize + 1);
  const candidates = rows.slice(0, batchSize), repository = new PrismaAiJobRepository(prisma), jobs = [];
  if (!dryRun) for (const event of candidates) {
    const identity = { userId: event.ownerId };
    try {
      const job = await prisma.$transaction(async tx => {
        await requireLockedMemoryConsent(tx, identity);
        const current = await tx.event.findFirst({ where: { id: event.id, ownerId: event.ownerId, memoryProcessingAllowed: true } });
        return current ? repository.enqueue({ identity, jobType: AI_JOB_TYPES.INSIGHT_EXTRACTION, resourceId: event.id, eventId: event.id,
          processingVersion: INSIGHT_EXTRACTION_VERSION, transaction: tx }) : null;
      });
      if (job) jobs.push(job);
    } catch (error) {
      if (error?.code !== "AI_FORBIDDEN") throw error;
    }
  }
  return { dryRun, selected: candidates.length, jobIds: jobs.map(job => job.id), nextCursor: candidates.at(-1)?.id || null,
    hasMore: rows.length > batchSize };
}
