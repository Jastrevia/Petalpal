// Tap-to-interact at the tea house (docs/items/INTERACTIONS.md). The owner taps the fairy, helps make a
// drink, and watches her drink it. The app plays the mini-interaction; the server owns the rules:
//   start  -> STARTED (one open session; reused if the owner taps again)
//   finish -> FINISHED after at least TEA_RULES.minBrewMs (no instant finishes), within expireMs
// Each finished tea gives Fairy Bond points (CLOSENESS_SOURCES.TEA, capped per local day), at most
// TEA_RULES.dailyLimit teas per account-local day, TEA_RULES.cooldownMs apart.
import { localDateForInstant, localMidnightToUtc, addLocalDays, normalizeIanaTimezone } from "./ai-periods.js";
import { awardCloseness } from "./fairy-closeness.js";

export const TEA_DRINKS = Object.freeze([
  { id: "flower-tea", name: { en: "Flower tea", "zh-Hans": "花草茶" } },
  { id: "rose-tea", name: { en: "Rose tea", "zh-Hans": "玫瑰茶" } },
  { id: "honey-coffee", name: { en: "Honey coffee", "zh-Hans": "蜂蜜咖啡" } }
].map(drink => Object.freeze(drink)));
export const TEA_RULES = Object.freeze({ minBrewMs: 8_000, expireMs: 10 * 60_000, cooldownMs: 20 * 60_000, dailyLimit: 3 });
export const TEA_STEPS = Object.freeze(["pick", "brew", "pour", "drink"]);

export class TeaError extends Error {
  constructor(message, status, code, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

const lock = (tx, userId) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`fairy-tea:${userId}`}))::text AS "locked"`;

async function clockFor(db, userId, now) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true, preferredLocale: true } });
  if (!user) throw new TeaError("User not found", 404, "USER_NOT_FOUND");
  const timezone = normalizeIanaTimezone(user.timezone) || "UTC";
  return { timezone, today: localDateForInstant(now, timezone), locale: user.preferredLocale === "zh-Hans" ? "zh-Hans" : "en" };
}

// When the next tea may start: after the cooldown, and tomorrow (local midnight) once today's are used.
async function availability(db, userId, clock, now) {
  const finished = await db.fairyTeaSession.findMany({ where: { userId, status: "FINISHED", localDate: clock.today },
    orderBy: { finishedAt: "desc" }, select: { finishedAt: true } });
  const last = await db.fairyTeaSession.findFirst({ where: { userId, status: "FINISHED" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } });
  let nextAt = null, reason = null;
  if (finished.length >= TEA_RULES.dailyLimit) {
    nextAt = localMidnightToUtc(addLocalDays(clock.today, 1), clock.timezone); reason = "DAILY_LIMIT";
  } else if (last?.finishedAt && now.getTime() - new Date(last.finishedAt).getTime() < TEA_RULES.cooldownMs) {
    nextAt = new Date(new Date(last.finishedAt).getTime() + TEA_RULES.cooldownMs); reason = "COOLDOWN";
  }
  return { todayCount: finished.length, nextAvailableAt: nextAt, reason };
}

const presentSession = session => session ? { id: session.id, drink: session.drink, status: session.status,
  startedAt: new Date(session.startedAt).toISOString(), finishAfter: new Date(new Date(session.startedAt).getTime() + TEA_RULES.minBrewMs).toISOString(),
  expiresAt: new Date(new Date(session.startedAt).getTime() + TEA_RULES.expireMs).toISOString() } : null;

async function openSession(db, userId, now) {
  const open = await db.fairyTeaSession.findFirst({ where: { userId, status: "STARTED" }, orderBy: { startedAt: "desc" } });
  if (open && now.getTime() - new Date(open.startedAt).getTime() > TEA_RULES.expireMs) {
    await db.fairyTeaSession.updateMany({ where: { id: open.id, status: "STARTED" }, data: { status: "EXPIRED" } });
    return null;
  }
  return open;
}

export async function teaState(db, userId, { now = new Date() } = {}) {
  const clock = await clockFor(db, userId, now);
  const open = await openSession(db, userId, now);
  const { todayCount, nextAvailableAt, reason } = await availability(db, userId, clock, now);
  return { drinks: TEA_DRINKS.map(drink => ({ id: drink.id, name: drink.name[clock.locale] })), steps: TEA_STEPS,
    session: presentSession(open), todayCount, dailyLimit: TEA_RULES.dailyLimit,
    nextAvailableAt: nextAvailableAt?.toISOString() ?? null, waitReason: reason };
}

export async function startTea(db, userId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "drink") || !TEA_DRINKS.some(drink => drink.id === body.drink)) {
    throw new TeaError("Choose a drink", 400, "TEA_INVALID");
  }
  const session = await db.$transaction(async tx => {
    await lock(tx, userId);
    const clock = await clockFor(tx, userId, now);
    const open = await openSession(tx, userId, now);
    if (open) return open; // a second tap keeps the same session
    const { nextAvailableAt, reason } = await availability(tx, userId, clock, now);
    if (nextAvailableAt) throw new TeaError("The fairy is resting", 429, reason === "DAILY_LIMIT" ? "TEA_DAILY_LIMIT" : "TEA_COOLDOWN",
      { nextAvailableAt: nextAvailableAt.toISOString() });
    return tx.fairyTeaSession.create({ data: { userId, drink: body.drink, localDate: clock.today, status: "STARTED", startedAt: now } });
  });
  return presentSession(session);
}

export async function finishTea(db, userId, sessionId, { now = new Date(), award = awardCloseness } = {}) {
  if (typeof sessionId !== "string" || !/^[a-z0-9]{10,40}$/.test(sessionId)) throw new TeaError("Tea not found", 404, "TEA_NOT_FOUND");
  const finished = await db.$transaction(async tx => {
    await lock(tx, userId);
    const session = await tx.fairyTeaSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new TeaError("Tea not found", 404, "TEA_NOT_FOUND");
    if (session.status === "FINISHED") return { session, repeated: true };
    if (session.status !== "STARTED") throw new TeaError("This tea went cold", 410, "TEA_EXPIRED");
    const elapsed = now.getTime() - new Date(session.startedAt).getTime();
    if (elapsed > TEA_RULES.expireMs) {
      await tx.fairyTeaSession.updateMany({ where: { id: session.id, status: "STARTED" }, data: { status: "EXPIRED" } });
      throw new TeaError("This tea went cold", 410, "TEA_EXPIRED");
    }
    if (elapsed < TEA_RULES.minBrewMs) throw new TeaError("The tea is still brewing", 409, "TEA_TOO_FAST",
      { finishAfter: new Date(new Date(session.startedAt).getTime() + TEA_RULES.minBrewMs).toISOString() });
    await tx.fairyTeaSession.updateMany({ where: { id: session.id, status: "STARTED" }, data: { status: "FINISHED", finishedAt: now } });
    return { session: { ...session, status: "FINISHED", finishedAt: now }, repeated: false };
  });
  // Bond points once per tea (the session id is the award key), capped per local day by the closeness rules.
  const reward = await award(db, { userId, source: "TEA", key: `tea:${finished.session.id}`, now });
  return { session: presentSession(finished.session), awarded: reward.awarded, levelUp: reward.levelUp, repeated: finished.repeated };
}
