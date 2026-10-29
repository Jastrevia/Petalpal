import { immediateSupportRequired } from "./emotional-safety.js";
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

// Fact spans for the Weekly insights (docs/product/WEEKLY_INSIGHTS_V1.md): fixed code rules
// over the stored summary, run while a Weekly report is built. Nothing is stored and no
// model is called. Every span is one whole sentence in the user's own characters, so a
// quote of it can be checked exactly. An entry with a sensitive word gives no spans at all.
const PEOPLE = {
  zh: "妈妈 母亲 爸爸 父亲 爷爷 奶奶 外公 外婆 姥姥 姥爷 哥哥 姐姐 弟弟 妹妹 老公 老婆 丈夫 妻子 男朋友 女朋友 对象 室友 同事 同学 老师 老板 领导 上司 朋友 闺蜜 儿子 女儿 孩子 宝宝 邻居 医生 教练",
  en: "mom mum mother dad father grandma grandpa grandmother grandfather brother sister husband wife boyfriend girlfriend partner roommate coworker colleague classmate teacher boss manager friend son daughter kid neighbor neighbour doctor coach"
};
const TOPICS = {
  zh: "跑步 健身 运动 瑜伽 游泳 散步 爬山 考试 作业 论文 复习 学习 面试 工作 加班 上班 实习 项目 开会 求职 编程 做饭 早睡 睡觉 失眠 画画 读书 看书 写作 日记 音乐 弹琴 吉他 唱歌 旅行 搬家 咖啡 花园 植物",
  en: "running run gym workout yoga swimming swim walk hike exam homework essay study interview work job project meeting coding cooking sleep painting drawing reading writing journal music piano guitar singing travel trip moving coffee garden plants"
};
const lexicon = list => list.split(" ").sort((a, b) => b.length - a.length);
const WORDS = { zh: { people: lexicon(PEOPLE.zh), topics: lexicon(TOPICS.zh) }, en: { people: lexicon(PEOPLE.en), topics: lexicon(TOPICS.en) } };
const SENSITIVE = [/自杀|自残|割腕|想死|不想活|轻生|伤害自己|结束生命|跳楼|家暴|虐待|强奸|性侵|猥亵|性骚扰|做爱|杀人|杀了|打我|打了我/u,
  /\b(?:suicid\w*|kill(?:ing)? myself|self[- ]?harm\w*|cut(?:ting)? myself|hurt(?:ing)? myself|want(?:ed)? to die|abus\w*|rape[ds]?|raping|sex\w*|assault\w*|molest\w*|hit me|beat me|violen\w*)\b/iu];
const BRIGHT_MOODS = new Set(["SUNNY_BLOOM", "PEACEFUL_BLOOM", "HEALING_BLOOM", "GENTLE_BLOOM"]);
const INTENT = [/(?:^|我们|我)(?:还|也|真|很|一直|特别|好)?(?:想|要|打算|准备|计划|决定)(?![到起过法象念着了是想不])([^，,。！？；!?;]{2,})/u,
  /\bI(?:\s+(?:really|still|also|just))?(?:\s+want to|\s+wanna|\s+plan to|(?:\s+am|'m|’m)\s+(?:planning|going) to|\s+decided to|\s+will|'ll|’ll)\s+([^,.;!?]{2,})/iu];
const NEGATIVE = [/不|没|别|未|无法|难过|难受|累|烦|哭|怕|担心|焦虑|但|可是|却|讨厌|生气|痛|病/u,
  /\b(?:not|no|never|but|tired|sad|angry|hate|worried|anxious|sick|hurt|cry|cried|awful|bad)\b|n['’]t\b/iu];
const squashed = text => String(text).replace(/\s+/gu, " ").trim();
const han = text => /\p{Script=Han}/u.test(text);
const clippedSummary = text => text.length >= 500 && !/[。！？.!?」』”"）)]$/u.test(text.trim());

// Whole sentences (a closing quotation mark stays with its sentence); a clipped summary's last fragment is dropped.
export function summarySentences(text) {
  const parts = String(text ?? "").split(/(?<=[。！？；!?;])(?![”」』"])|(?<=[。！？!?][”」』"])|(?<=\.)\s+|\n/u).map(squashed).filter(Boolean);
  return clippedSummary(String(text ?? "")) ? parts.slice(0, -1) : parts;
}
export const spanSensitive = text => immediateSupportRequired(text) || SENSITIVE.some(pattern => pattern.test(String(text).normalize("NFKC")));

// People and topic words from the fixed lists; a longer word hides the shorter one inside it (男朋友, not 朋友).
export function lexiconWords(text) {
  const found = { people: [], topics: [] };
  let zh = String(text).normalize("NFKC");
  const en = zh.toLowerCase();
  for (const kind of ["people", "topics"]) {
    for (const word of WORDS.zh[kind]) if (zh.includes(word)) { found[kind].push(word); zh = zh.replaceAll(word, "□"); }
    for (const word of WORDS.en[kind]) if (new RegExp(`\\b${word}s?\\b`, "u").test(en)) found[kind].push(word);
  }
  return found;
}

// { sensitive, sentences, people, topics, intents, questions, smallGoods } for one Event.
// Small good things only come from an Event whose own Primary Garden Mood is bright.
export function eventSpans({ id, text, mood = null }) {
  const empty = { sourceEventId: id, sensitive: true, sentences: [], people: [], topics: [], intents: [], questions: [], smallGoods: [] };
  if (typeof text !== "string" || !text.trim() || spanSensitive(text)) return empty;
  const spans = { ...empty, sensitive: false };
  for (const sentence of summarySentences(text)) {
    const zh = han(sentence), words = lexiconWords(sentence), question = /[?？]$/u.test(sentence);
    spans.sentences.push(sentence);
    for (const kind of ["people", "topics"]) for (const word of words[kind]) spans[kind].push({ word, text: sentence });
    const intent = !question && sentence.match(INTENT[zh ? 0 : 1]);
    if (intent) spans.intents.push({ text: sentence, thing: intent[1].trim() });
    const quoted = /[“”「」『』"]/u.test(sentence), told = zh ? /问我|[他她]问|说：/u.test(sentence) : /\basked me\b/iu.test(sentence);
    if (question && !quoted && !told && (zh ? /我|自己/u.test(sentence) : /\b(?:i|me|my|myself)\b/iu.test(sentence))) spans.questions.push({ text: sentence });
    const size = zh ? [...sentence].length : sentence.split(" ").length;
    if (BRIGHT_MOODS.has(mood) && !/[?？]/u.test(sentence) && !quoted && !intent && !NEGATIVE[zh ? 0 : 1].test(sentence) &&
        size >= (zh ? 4 : 3) && size <= (zh ? 40 : 20)) spans.smallGoods.push({ text: sentence });
  }
  return spans;
}
