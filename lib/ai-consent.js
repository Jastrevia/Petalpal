import { requireAiIdentity } from "./ai-identity.js";
import { requireLockedMemoryConsent } from "./semantic-retrieval.js";

// Reads share the same owner consent lock as final writes/revocation. A revoked
// read fails before querying derived data, even when cleanup was not yet run.
export function withMemoryConsent(prisma, identity, read) {
  requireAiIdentity(identity);
  return prisma.$transaction(async tx => {
    await requireLockedMemoryConsent(tx, identity);
    return read(tx);
  });
}

export async function updateAiConsent(prisma, { identity, termsVersion, aiProcessing, personalization, memoryEnabled, now = new Date() }) {
  const ownerId = requireAiIdentity(identity);
  personalization = Boolean(aiProcessing && personalization);
  memoryEnabled = Boolean(personalization && memoryEnabled);
  const data = { termsVersion, aiProcessing: Boolean(aiProcessing), personalization, memoryEnabled,
    grantedAt: aiProcessing ? now : null, revokedAt: aiProcessing ? null : now };
  return prisma.$transaction(async tx => {
    // Upsert holds the exclusive consent row lock through cleanup. Writers and
    // private readers use that same row before touching owner-derived data.
    const previous = await tx.$queryRawUnsafe('SELECT "updatedAt" FROM "AiConsent" WHERE "userId" = $1 FOR UPDATE', ownerId);
    // Even revoke/regrant inside one millisecond must invalidate old results.
    const updatedAt = new Date(Math.max(now.getTime(), previous[0]?.updatedAt ? new Date(previous[0].updatedAt).getTime() + 1 : 0));
    const consent = await tx.aiConsent.upsert({ where: { userId: ownerId },
      update: { ...data, updatedAt }, create: { userId: ownerId, ...data, updatedAt } });
    if (!memoryEnabled) {
      await tx.aiJob.updateMany({ where: { ownerId, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: "CANCELLED", completedAt: now, lockedAt: null, lockedBy: null,
          leaseExpiresAt: null, lastError: "Memory processing consent was disabled" } });
      for (const model of ["weeklyReport", "monthlyReport", "yearlyReport", "aiEvidence", "eventMemory", "eventInsightExtraction"]) {
        await tx[model].deleteMany({ where: { ownerId } });
      }
      // EventMemory cascades both vector representations/evidence; Weekly 2.0 fact spans go too; original
      // Events, Journals and durable job/paid-attempt tombstones are retained.
    }
    return consent;
  });
}
