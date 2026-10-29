import { withMemoryConsent } from "./ai-consent.js";
import { requireLockedMemoryConsent } from "./semantic-retrieval.js";
import { assertOwnerIdentity, requireAiIdentity } from "./ai-identity.js";

export const EVENT_SOURCE = "EVENT";

function assertEvent(event) {
  if (!event || event.kind !== EVENT_SOURCE) {
    const error = new Error("Only user-authored Events may enter the long-term AI pipeline");
    error.code = "AI_SOURCE_NOT_ALLOWED";
    throw error;
  }
  if (typeof event.id !== "string" || !event.id || typeof event.content !== "string" || !event.content.trim()) {
    const error = new Error("A valid Event id and content are required");
    error.code = "INVALID_EVENT";
    throw error;
  }
  return event;
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))]
    : [];
}

export class DeterministicMemoryExtractor {
  async extract(event) {
    assertEvent(event);
    return {
      sourceEventId: event.id,
      memoryType: "EVENT",
      summary: event.content.trim().slice(0, 500),
      topics: normalizeStringList(event.topics),
      people: normalizeStringList(event.people),
      importanceScore: Number.isFinite(event.importanceScore)
        ? Math.max(0, Math.min(1, event.importanceScore))
        : null,
      eventDate: event.occurredAt || event.eventDate || event.createdAt || new Date(),
      primaryMood: event.primaryGardenMood || null,
      secondaryEmotions: Array.isArray(event.secondaryEmotions) ? event.secondaryEmotions : [],
      emotionOutcome: event.emotionOutcome || event.emotionStatus || "SKIPPED",
      emotionProvenance: event.emotionProvenance || null,
      emotionModelId: event.emotionModelId || null,
      emotionModelVersion: event.emotionModelVersion || null,
      emotionModelStatus: event.emotionModelStatus || null,
      emotionProbabilities: event.emotionProbabilities || null
    };
  }
}

export class PrismaMemoryRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async saveMemory({ identity, memory, transaction = null }) {
    if (!transaction) return withMemoryConsent(this.prisma, identity, tx => this.saveMemory({ identity, memory, transaction: tx }));
    const db = transaction;
    await requireLockedMemoryConsent(db, identity);
    const ownerId = assertOwnerIdentity(identity, memory?.ownerId);
    if (!memory?.sourceEventId) throw new Error("Memory provenance sourceEventId is required");
    if (typeof db.event?.findFirst === "function") {
      const sourceEvent = await db.event.findFirst({ where: { id: memory.sourceEventId, ownerId } });
      if (!sourceEvent) {
        const error = new Error("Source Event is not available to the authenticated owner");
        error.code = "AI_FORBIDDEN";
        throw error;
      }
    }
    const existing = await db.eventMemory.findFirst({
      where: { sourceEventId: memory.sourceEventId, ownerId }
    });
    const data = {
      ownerId,
      sourceEventId: memory.sourceEventId,
      memoryType: memory.memoryType || "EVENT",
      summary: memory.summary,
      topics: normalizeStringList(memory.topics),
      people: normalizeStringList(memory.people),
      importanceScore: memory.importanceScore ?? null,
      eventDate: memory.eventDate,
      primaryMood: memory.primaryMood ?? null,
      secondaryEmotions: memory.secondaryEmotions ?? undefined,
      emotionConfidence: memory.emotionConfidence ?? null,
      emotionModelVersion: memory.emotionModelVersion ?? null,
      emotionOutcome: memory.emotionOutcome ?? null,
      emotionProvenance: memory.emotionProvenance ?? null,
      emotionModelId: memory.emotionModelId ?? null,
      emotionModelStatus: memory.emotionModelStatus ?? null,
      emotionProbabilities: memory.emotionProbabilities ?? undefined,
      memoryVersion: memory.memoryVersion || "v1",
      extractionVersion: memory.extractionVersion || "v1"
    };
    if (!existing) return db.eventMemory.create({ data });

    const summaryChanged = existing.summary !== data.summary;
    if (!summaryChanged) return db.eventMemory.update({ where: { id: existing.id }, data });
    const updateAndInvalidate = async (tx) => {
      const updated = await tx.eventMemory.update({
        where: { id: existing.id },
        data: {
          ...data,
          embeddingStatus: "NOT_REQUESTED",
          embeddingModel: null,
          embeddingProfileKey: null,
          embeddingModelRevision: null,
          embeddingInputVersion: null,
          embeddingInputRevision: { increment: 1 },
          embeddedInputRevision: null,
          embeddedAt: null
        }
      });
      await tx.$executeRawUnsafe(`
        UPDATE "EventMemory"
        SET "embedding" = NULL
        WHERE "id" = $1 AND "ownerId" = $2
      `, existing.id, ownerId);
      await tx.$executeRawUnsafe(`
        UPDATE "EventMemoryEmbedding"
        SET "embedding" = NULL, "embeddedAt" = NULL, "status" = 'NOT_REQUESTED',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "eventMemoryId" = $1 AND "ownerId" = $2
      `, existing.id, ownerId);
      return updated;
    };
    return transaction ? updateAndInvalidate(transaction) : this.prisma.$transaction(updateAndInvalidate);
  }

  async getMemoryById({ identity, memoryId }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => tx.eventMemory.findFirst({ where: { id: memoryId, ownerId } }));
  }

  async listMemoriesForUser({ identity, filters = {}, take = 100 }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => this.#find({ tx, ownerId, filters, take }));
  }

  async searchMemoriesForUser({ identity, query = "", filters = {}, take = 50 }) {
    const ownerId = requireAiIdentity(identity);
    return withMemoryConsent(this.prisma, identity, tx => this.#find({ tx, ownerId, filters, query, take }));
  }

  async #find({ tx, ownerId, filters, query = "", take }) {
    const safeTake = Math.max(1, Math.min(200, Number(take) || 50));
    const where = { ownerId };
    if (filters.memoryType) where.memoryType = filters.memoryType;
    if (filters.dateFrom || filters.dateTo) {
      where.eventDate = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {})
      };
    }
    if (Number.isFinite(filters.importanceMin)) {
      where.importanceScore = { gte: filters.importanceMin };
    }
    const rows = await tx.eventMemory.findMany({
      where,
      orderBy: { eventDate: "desc" },
      take: Math.min(1000, safeTake * 5)
    });
    const normalizedQuery = String(query).trim().toLowerCase();
    const topics = normalizeStringList(filters.topics).map((topic) => topic.toLowerCase());
    const people = normalizeStringList(filters.people).map((person) => person.toLowerCase());
    return rows.filter((row) => {
      const rowTopics = normalizeStringList(row.topics).map((topic) => topic.toLowerCase());
      const rowPeople = normalizeStringList(row.people).map((person) => person.toLowerCase());
      return (!topics.length || topics.every((topic) => rowTopics.includes(topic))) &&
        (!people.length || people.every((person) => rowPeople.includes(person))) &&
        (!normalizedQuery || row.summary.toLowerCase().includes(normalizedQuery) || rowTopics.some((topic) => topic.includes(normalizedQuery)));
    }).slice(0, safeTake);
  }
}

export class EventMemoryPipeline {
  constructor({ extractor, memoryRepository }) {
    this.extractor = extractor;
    this.memoryRepository = memoryRepository;
  }

  async processEvent({ identity, event, transaction = null }) {
    const ownerId = requireAiIdentity(identity);
    assertEvent(event);
    if (event.ownerId !== undefined && event.ownerId !== ownerId) {
      const error = new Error("Event does not belong to the authenticated owner");
      error.code = "AI_FORBIDDEN";
      throw error;
    }
    const memory = await this.extractor.extract(event);
    if (memory.sourceEventId !== event.id) {
      throw new Error("Memory provenance must point to the source Event");
    }
    const saved = await this.memoryRepository.saveMemory({ identity, memory, transaction });
    return { memory: saved };
  }
}

export function createEventMemoryPipeline(options) {
  return new EventMemoryPipeline(options);
}
