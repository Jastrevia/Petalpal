// Fairy persona (docs/ai/FAIRY_PERSONA.md): each Garden Fairy has a stable personality, her own memories
// and opinions, so her Moments read like one friend over months. Her memories are her own earlier
// posts, never the owner's Events, Journals or memories. The persona is picked from the fairy id until the
// owner chooses one (at most once every PERSONA_CHANGE_DAYS).
import { createHash } from "node:crypto";

export const PERSONA_CHANGE_DAYS = 30;
export const PERSONAS = Object.freeze([
  { id: "botanist", name: { en: "The little botanist", "zh-Hans": "小小植物学家" },
    traits: "patient, precise, quietly amazed by small living things; names plants and insects she meets",
    likes: ["RAIN", "FOG", "flower-tea", "STEPPING_STONES"], dislikes: ["STORM"],
    voice: "short observations with one exact detail (a colour, a count, a texture)" },
  { id: "tea-lover", name: { en: "The tea lover", "zh-Hans": "爱喝茶的小花仙" },
    traits: "warm, unhurried, a homebody who turns everything into a reason for tea",
    likes: ["CLOUDY", "rose-tea", "honey-coffee", "TEA_TIME"], dislikes: ["CLEAR"],
    voice: "cosy, a little teasing, often ends on what she will drink next" },
  { id: "stargazer", name: { en: "The stargazer", "zh-Hans": "看星星的小花仙" },
    traits: "dreamy, thoughtful, awake late, notices the sky and the moon more than the ground",
    likes: ["CLEAR", "SLEEPING", "PAVILION"], dislikes: ["FOG"],
    voice: "soft and slow, one quiet image at a time, never lofty" },
  { id: "explorer", name: { en: "The explorer", "zh-Hans": "小小探险家" },
    traits: "brave, restless, funny, always checking the far corners of the garden and the bridges",
    likes: ["STORM", "SNOW", "EAST_BRIDGE", "SOUTH_BRIDGE"], dislikes: ["RAIN"],
    voice: "bright and quick, small exclamations, reports finds like treasure" }
].map(persona => Object.freeze({ ...persona, likes: Object.freeze(persona.likes), dislikes: Object.freeze(persona.dislikes) })));
const BY_ID = new Map(PERSONAS.map(persona => [persona.id, persona]));

export const personaEnabled = (env = process.env) => env.AI_FAIRY_PERSONA === "true";

// Stored choice, else a stable pick from the fairy id (the same fairy always gets the same one).
export function personaFor(fairy) {
  if (fairy?.personaId && BY_ID.has(fairy.personaId)) return BY_ID.get(fairy.personaId);
  const hash = createHash("sha256").update(String(fairy?.id ?? "")).digest();
  return PERSONAS[hash[0] % PERSONAS.length];
}

// The persona as the caption model sees it (no names of the owner, nothing private).
export const personaPrompt = persona => ({ traits: persona.traits, likes: persona.likes, dislikes: persona.dislikes, voice: persona.voice });

// Her memories for one post: her own earlier model-written captions, older than the recent ones she must not
// repeat, preferring the same place. Short ids e1… so the model can refer to one; database ids stay here.
export function pickFairyMemories(rows, { topic, limit = 6 }) {
  const sorted = [...rows].sort((a, b) => (b.topic === topic) - (a.topic === topic) || new Date(b.postedAt) - new Date(a.postedAt));
  return sorted.slice(0, limit).map((row, index) => ({ id: `e${index + 1}`, momentId: row.id, c: row.caption,
    d: new Date(row.postedAt).toISOString().slice(0, 10), p: row.topic }));
}

export function presentPersona(persona, fairy, locale = "en", now = new Date()) {
  const lang = locale === "zh-Hans" ? "zh-Hans" : "en";
  const changedAt = fairy?.personaChangedAt ? new Date(fairy.personaChangedAt) : null;
  const nextChangeAt = changedAt ? new Date(changedAt.getTime() + PERSONA_CHANGE_DAYS * 86_400_000) : null;
  return { id: persona.id, name: persona.name[lang], chosen: Boolean(fairy?.personaId),
    nextChangeAt: nextChangeAt && nextChangeAt > now ? nextChangeAt.toISOString() : null,
    options: PERSONAS.map(item => ({ id: item.id, name: item.name[lang] })) };
}

export class PersonaError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

async function activeFairy(db, userId) {
  return db.userFairy.findFirst({ where: { userId, isActive: true }, select: { id: true, personaId: true, personaChangedAt: true } });
}

export async function personaSummary(db, userId, { locale = "en", now = new Date() } = {}) {
  const fairy = await activeFairy(db, userId);
  if (!fairy) throw new PersonaError("No fairy yet", 404, "FAIRY_NOT_FOUND");
  return presentPersona(personaFor(fairy), fairy, locale, now);
}

export async function choosePersona(db, userId, body, { locale = "en", now = new Date() } = {}) {
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !BY_ID.has(body.personaId)) throw new PersonaError("Choose a persona", 400, "PERSONA_INVALID");
  const fairy = await activeFairy(db, userId);
  if (!fairy) throw new PersonaError("No fairy yet", 404, "FAIRY_NOT_FOUND");
  if (fairy.personaChangedAt && now.getTime() - new Date(fairy.personaChangedAt).getTime() < PERSONA_CHANGE_DAYS * 86_400_000) {
    throw new PersonaError("She is still getting used to this one", 409, "PERSONA_TOO_SOON");
  }
  await db.userFairy.updateMany({ where: { id: fairy.id, userId }, data: { personaId: body.personaId, personaChangedAt: now } });
  return presentPersona(BY_ID.get(body.personaId), { ...fairy, personaId: body.personaId, personaChangedAt: now }, locale, now);
}
