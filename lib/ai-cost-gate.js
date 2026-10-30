import { randomUUID } from "node:crypto";
import { gatewayQuote, gatewayBudgetLimits, gatewayModel } from "./ai-gateway-config.js";
import { EVENT_SECONDARY_MODEL_VERSION } from "./event-emotion.js";
import { requireAiIdentity } from "./ai-identity.js";
import { requireLockedMemoryConsent } from "./semantic-retrieval.js";

// Reservations live in the existing non-cascading AuditEvent table. Never
// refund an attempted/ambiguous call: reclaim, retry or deletion must not buy
// another inference. Reports reserve both retrieval and one narrative call.
export const AI_COST_ACTIONS = Object.freeze({
  WEEKLY_REPORT: { daily: 4, calls: 2 },
  MONTHLY_REPORT: { daily: 2, calls: 2 },
  EMBEDDING_GENERATION: { daily: 200, calls: 1 },
  EVENT_EMOTION: { daily: 100, calls: 1 },
  FAIRY_MOMENT: { daily: 6, calls: 1 },
  INSIGHT_EXTRACTION: { daily: 100, calls: 1 },
  PETAL_READING: { daily: 3, calls: 1 },
  SPEECH_TRANSCRIPTION: { daily: 20, calls: 1 }
});
// Gateway actions that send no owner content need AI Processing only, not
// Personalization or Memory: Event emotion reads one Event; Fairy Moment captions
// read only the Fairy's own state and earlier captions. A petal card reading sends the
// drawn card and topic; it adds the week's mood counts only while Personalization is on,
// which its own authorize policy checks (lib/petal-reading.js).
const PROCESSING_ONLY_GATEWAY_ACTIONS = new Set(["EVENT_EMOTION", "FAIRY_MOMENT", "PETAL_READING"]);
const EVENT_TYPE = "AI_COST_RESERVED";
const PROVIDER = "CLOUDFLARE_WORKERS_AI";
const messages = {
  AI_QUOTA_EXCEEDED: "AI usage limit reached. Try again after the daily window resets.",
  AI_INFERENCE_ALREADY_RESERVED: "This AI operation was already attempted; automatic inference replay is blocked.",
  AI_BUDGET_UNAVAILABLE: "AI usage authorization is temporarily unavailable.",
  AI_JOB_LEASE_LOST: "AI job claim is no longer current.",
  AI_FORBIDDEN: "AI processing is not currently authorized."
};
export function aiCostError(code) {
  const error = new Error(messages[code] || messages.AI_BUDGET_UNAVAILABLE);
  error.code = Object.hasOwn(messages, code) ? code : "AI_BUDGET_UNAVAILABLE";
  return error;
}
export function aiCostHttpStatus(code) {
  return code === "AI_FORBIDDEN" ? 403 : code === "AI_QUOTA_EXCEEDED" ? 429 : code === "AI_INFERENCE_ALREADY_RESERVED" ? 409 : 503;
}
export function isAiCostError(error) { return Object.hasOwn(messages, error?.code); }
function limit(env, name, fallback) {
  if (env[name] === undefined) return fallback;
  const value = String(env[name]);
  if (!/^\d{1,7}$/.test(value) || Number(value) > 1_000_000) throw aiCostError("AI_BUDGET_UNAVAILABLE");
  return Number(value); // zero is an explicit fail-closed kill switch
}

async function requireCostClaim(tx, { identity, ownerId, action, key, job, workerId }) {
  if (!job) return;
  if (job.ownerId !== ownerId || job.jobType !== action || key !== job.idempotencyKey || !workerId) throw aiCostError("AI_FORBIDDEN");
  await requireLockedMemoryConsent(tx, identity);
  const rows = await tx.$queryRawUnsafe(`/* ai-cost:claim */
    SELECT "id" FROM "AIJob"
    WHERE "id" = $1 AND "ownerId" = $2 AND "lockedBy" = $3
      AND "attemptCount" = $4 AND "lockedAt" = $5
      AND "jobType"::text = $6 AND "resourceId" = $7 AND "idempotencyKey" = $8
      AND "status" = 'RUNNING' AND "leaseExpiresAt" > clock_timestamp()
    FOR SHARE`, job.id, ownerId, workerId, job.attemptCount, job.lockedAt, action, job.resourceId, key);
  if (rows.length !== 1) throw aiCostError("AI_JOB_LEASE_LOST");
}

export class PrismaAiCostGate {
  constructor(prisma, { env = process.env } = {}) { this.prisma = prisma; this.env = env; }

  async checkProcessingConsent({ identity, consentUpdatedAt }) {
    const ownerId = requireAiIdentity(identity);
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe(`/* ai-cost:processing-consent */
        SELECT "aiProcessing", "updatedAt" FROM "AiConsent" WHERE "userId" = $1 FOR SHARE`, ownerId);
      if (rows.length !== 1 || !rows[0].aiProcessing ||
          !consentUpdatedAt || new Date(rows[0].updatedAt).getTime() !== new Date(consentUpdatedAt).getTime()) {
        throw aiCostError("AI_FORBIDDEN");
      }
    });
  }

  async checkGatewayConsent({ identity, action, consentUpdatedAt, eventId, job, workerId, key }) {
    try {
      const ownerId = requireAiIdentity(identity);
      await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe(`/* ai-cost:gateway-consent */
          SELECT "aiProcessing","personalization","memoryEnabled","updatedAt" FROM "AiConsent" WHERE "userId"=$1 FOR SHARE`, ownerId);
        const consent = rows[0];
        if (rows.length !== 1 || !consent.aiProcessing || !consentUpdatedAt ||
            new Date(consent.updatedAt).getTime() !== new Date(consentUpdatedAt).getTime() ||
            (!PROCESSING_ONLY_GATEWAY_ACTIONS.has(action) && (!consent.personalization || !consent.memoryEnabled))) throw aiCostError("AI_FORBIDDEN");
        await requireCostClaim(tx, { identity, ownerId, action, key, job, workerId });
        if (action === "EVENT_EMOTION") {
          const events = await tx.$queryRawUnsafe(`/* ai-cost:gateway-event */ SELECT "id" FROM "Event" WHERE "id"=$1 AND "ownerId"=$2 FOR SHARE`, eventId, ownerId);
          if (events.length !== 1) throw aiCostError("AI_FORBIDDEN");
        }
      });
    } catch (error) { throw aiCostError(error?.code); }
  }

  async recordGatewayUsage({ reservationId, provider, model, usage }) {
    try {
      const { inputTokens, outputTokens, cachedInputTokens } = usage;
      if (![inputTokens, outputTokens, cachedInputTokens].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000) || cachedInputTokens > inputTokens) throw aiCostError("AI_BUDGET_UNAVAILABLE");
      await this.prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe(`/* ai-cost:lock */ SELECT pg_advisory_xact_lock(73001604)::text AS "locked"`);
        const rows = await tx.$queryRawUnsafe(`/* ai-cost:gateway-receipt */
          SELECT "actorUserId","actionCode" FROM "AuditEvent" WHERE "id"=$1 AND "targetClass"=$2 AND "eventType"='AI_GATEWAY_USD_RESERVED' FOR UPDATE`, `${reservationId}:usd`, provider);
        if (rows.length !== 1) throw aiCostError("AI_BUDGET_UNAVAILABLE");
        const spec = gatewayModel(model, rows[0].actionCode);
        const liability = Math.ceil(inputTokens * spec.inputRate * 1.25) + outputTokens * spec.outputRate;
        if (spec.provider !== provider) throw aiCostError("AI_BUDGET_UNAVAILABLE");
        await tx.$queryRawUnsafe(`/* ai-cost:gateway-usage */
          INSERT INTO "AuditEvent" ("id","eventType","outcome","actorUserId","targetClass","targetSafeId","actionCode","reasonCode")
          VALUES ($1,'AI_GATEWAY_USAGE','RECEIVED',$2,$3,$4,$5,$6) ON CONFLICT ("id") DO NOTHING RETURNING "id"`,
          `${reservationId}:usage`, rows[0].actorUserId, provider, model, rows[0].actionCode, `${inputTokens}:${outputTokens}:${cachedInputTokens}`);
        // Never refund a reservation. Unexpected usage can only increase liability.
        await tx.$queryRawUnsafe(`/* ai-cost:gateway-liability */
          UPDATE "AuditEvent" SET "reasonCode"=GREATEST("reasonCode"::bigint,$2::bigint)::text WHERE "id"=$1`, `${reservationId}:usd`, String(liability));
      });
    } catch { throw aiCostError("AI_BUDGET_UNAVAILABLE"); }
  }

  async reserve({ identity, action, key = null, job = null, workerId = null, gateway = null, eventId = null, retrieval = false }) {
    try {
      const ownerId = requireAiIdentity(identity), policy = AI_COST_ACTIONS[action];
      if (!Object.hasOwn(AI_COST_ACTIONS, action) || !policy || ownerId.length > 128) throw aiCostError("AI_FORBIDDEN");
      if (key !== null && (typeof key !== "string" || !key || key.length > 191)) throw aiCostError("AI_FORBIDDEN");
      if (["WEEKLY_REPORT", "MONTHLY_REPORT", "EMBEDDING_GENERATION", "INSIGHT_EXTRACTION"].includes(action) && (!job || !key)) throw aiCostError("AI_FORBIDDEN");
      const quote = gateway === null ? null : gatewayQuote({ ...gateway, action });
      if (retrieval !== false && (retrieval !== true || !quote || !["WEEKLY_REPORT", "MONTHLY_REPORT"].includes(action))) throw aiCostError("AI_FORBIDDEN");
      const provider = quote?.provider || PROVIDER;
      const budgets = quote ? gatewayBudgetLimits(this.env, provider) : null;
      if (quote && (!key || (action === "EVENT_EMOTION" && !eventId))) throw aiCostError("AI_FORBIDDEN");
      const reservationId = key === null ? randomUUID() : JSON.stringify(["ai-cost-v1", ownerId, action, key]);
      const actionLimit = limit(this.env, `AI_${action}_DAILY_LIMIT`, policy.daily);
      const userLimit = limit(this.env, "AI_USER_DAILY_CALL_LIMIT", 300);
      const globalLimit = limit(this.env, "AI_GLOBAL_DAILY_CALL_LIMIT", 10_000);
      const providerLimit = limit(this.env, "AI_PROVIDER_DAILY_CALL_LIMIT", 10_000);
      return await this.prisma.$transaction(async tx => {
        // One short shared DB critical section for all instances/actions.
        // This fixed advisory-lock namespace is not a process-local limiter.
        const [lock] = await tx.$queryRawUnsafe(`/* ai-cost:lock */
          SELECT pg_advisory_xact_lock(73001604)::text AS "locked"`);
        // Read the clock only after obtaining the lock (including UTC midnight).
        const [time] = await tx.$queryRawUnsafe(`/* ai-cost:clock */ SELECT clock_timestamp() AS "now"`);
        if (!lock || !time?.now) throw aiCostError("AI_BUDGET_UNAVAILABLE");
        const owners = await tx.$queryRawUnsafe(`/* ai-cost:owner */ SELECT "id" FROM "User" WHERE "id" = $1 FOR SHARE`, ownerId);
        if (owners.length !== 1) throw aiCostError("AI_FORBIDDEN");
        let consentUpdatedAt;
        if (quote || ["EVENT_EMOTION", "SPEECH_TRANSCRIPTION"].includes(action)) {
          const consents = await tx.$queryRawUnsafe(`/* ai-cost:processing-consent */
            SELECT "aiProcessing", "personalization", "memoryEnabled", "updatedAt" FROM "AiConsent" WHERE "userId" = $1 FOR SHARE`, ownerId);
          if (consents.length !== 1 || !consents[0].aiProcessing || !consents[0].updatedAt) throw aiCostError("AI_FORBIDDEN");
          consentUpdatedAt = consents[0].updatedAt;
          if (quote && !PROCESSING_ONLY_GATEWAY_ACTIONS.has(action) && (!consents[0].personalization || !consents[0].memoryEnabled)) throw aiCostError("AI_FORBIDDEN");
          if (quote && action === "EVENT_EMOTION") {
            const events = await tx.$queryRawUnsafe(`/* ai-cost:gateway-event */ SELECT "id" FROM "Event" WHERE "id"=$1 AND "ownerId"=$2 FOR SHARE`, eventId, ownerId);
            if (events.length !== 1 || key !== `${eventId}:${EVENT_SECONDARY_MODEL_VERSION}`) throw aiCostError("AI_FORBIDDEN");
          }
        }
        await requireCostClaim(tx, { identity, ownerId, action, key, job, workerId });
        const existing = await tx.$queryRawUnsafe(`/* ai-cost:duplicate */ SELECT "id" FROM "AuditEvent" WHERE "id" = $1`, reservationId);
        if (existing.length) throw aiCostError("AI_INFERENCE_ALREADY_RESERVED");
        const now = new Date(time.now);
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const [usage] = await tx.$queryRawUnsafe(`/* ai-cost:usage */
          SELECT COUNT(*) FILTER (WHERE "actorUserId" = $2 AND "actionCode" = $3)::integer AS "action",
            COALESCE(SUM("reasonCode"::integer) FILTER (WHERE "actorUserId" = $2), 0)::integer AS "user",
            COALESCE(SUM("reasonCode"::integer), 0)::integer AS "global",
            (COALESCE(SUM("reasonCode"::integer) FILTER (WHERE "targetClass" = $4), 0) +
              COALESCE((SELECT SUM("reasonCode"::integer) FROM "AuditEvent" WHERE "eventType"='AI_RETRIEVAL_RESERVED'
                AND "targetClass"=$4 AND "createdAt">=$1),0))::integer AS "provider"
          FROM "AuditEvent" WHERE "eventType" = 'AI_COST_RESERVED' AND "createdAt" >= $1`, start, ownerId, action, provider);
        if (!usage || ![usage.action, usage.user, usage.global, usage.provider].every(Number.isSafeInteger)) throw aiCostError("AI_BUDGET_UNAVAILABLE");
        if (usage.action >= actionLimit || usage.user + policy.calls > userLimit ||
            usage.global + policy.calls > globalLimit || usage.provider + policy.calls > providerLimit) throw aiCostError("AI_QUOTA_EXCEEDED");
        if (retrieval) {
          // Provider-only liability for the potential BGE query. The report's
          // existing two-call reservation already covers owner/global totals.
          const [queryUsage] = await tx.$queryRawUnsafe(`/* ai-cost:retrieval-usage */
            SELECT COALESCE(SUM("reasonCode"::integer),0)::integer AS "calls" FROM "AuditEvent"
            WHERE "eventType" IN ('AI_COST_RESERVED','AI_RETRIEVAL_RESERVED') AND "targetClass"=$2 AND "createdAt">=$1`, start, PROVIDER);
          if (!Number.isSafeInteger(queryUsage?.calls)) throw aiCostError("AI_BUDGET_UNAVAILABLE");
          if (queryUsage.calls + 1 > providerLimit) throw aiCostError("AI_QUOTA_EXCEEDED");
          await tx.$queryRawUnsafe(`/* ai-cost:retrieval-reserve */
            INSERT INTO "AuditEvent" ("id","createdAt","eventType","outcome","actorUserId","targetClass","actionCode","reasonCode")
            VALUES ($1,$2,'AI_RETRIEVAL_RESERVED','RESERVED',$3,$4,$5,'1') RETURNING "id"`,
            `${reservationId}:retrieval`, now, ownerId, PROVIDER, action);
        }
        if (quote) {
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const [spend] = await tx.$queryRawUnsafe(`/* ai-cost:gateway-budget */
            SELECT COALESCE(SUM("reasonCode"::bigint) FILTER (WHERE "actorUserId"=$2 AND "createdAt">=$3),0)::text AS "userDay",
              COALESCE(SUM("reasonCode"::bigint) FILTER (WHERE "actorUserId"=$2),0)::text AS "userMonth",
              COALESCE(SUM("reasonCode"::bigint) FILTER (WHERE "createdAt">=$3),0)::text AS "globalDay",
              COALESCE(SUM("reasonCode"::bigint),0)::text AS "globalMonth",
              COALESCE(SUM("reasonCode"::bigint) FILTER (WHERE "targetClass"=$4),0)::text AS "providerMonth"
            FROM "AuditEvent" WHERE "eventType"='AI_GATEWAY_USD_RESERVED' AND "createdAt">=$1`, monthStart, ownerId, start, provider);
          for (const name of Object.keys(budgets)) {
            if (!spend || !/^\d+$/.test(spend[name])) throw aiCostError("AI_BUDGET_UNAVAILABLE");
            if (BigInt(spend[name]) + BigInt(quote.reservedNanoUsd) > BigInt(budgets[name])) throw aiCostError("AI_QUOTA_EXCEEDED");
          }
          await tx.$queryRawUnsafe(`/* ai-cost:gateway-reserve */
            INSERT INTO "AuditEvent" ("id","createdAt","eventType","outcome","actorUserId","targetClass","actionCode","reasonCode")
            VALUES ($1,$2,'AI_GATEWAY_USD_RESERVED','RESERVED',$3,$4,$5,$6) RETURNING "id"`,
            `${reservationId}:usd`, now, ownerId, provider, action, String(quote.reservedNanoUsd));
        }
        await tx.$queryRawUnsafe(`/* ai-cost:reserve */
          INSERT INTO "AuditEvent" ("id", "createdAt", "eventType", "outcome", "actorUserId", "targetClass", "actionCode", "reasonCode")
          VALUES ($1, $2, $3, 'RESERVED', $4, $5, $6, $7) RETURNING "id"`, reservationId, now, EVENT_TYPE, ownerId, provider, action, String(policy.calls));
        return { reserved: true, ...(quote ? { reservationId, ...quote } : {}), ...(consentUpdatedAt ? { consentUpdatedAt } : {}) };
      });
    } catch (error) { throw aiCostError(error?.code); }
  }
}
