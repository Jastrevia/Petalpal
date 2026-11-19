// Garden gatherings (docs/items/INTERACTIONS.md): a host invites friends to a one-hour garden dinner,
// picnic or tea party in their Garden. During the hour, accepted guests visit the host's Garden as usual
// (POST /visit) and everyone's fairies are drawn together (GET /api/visits/:hostUserId/fairies).
// Guests must be the host's friends, not blocked either way, and the host must allow Garden visits.
import { socialPairAllowed } from "./garden-access.js";

export const GATHERING_KINDS = Object.freeze(["DINNER", "PICNIC", "TEA_PARTY"]);
export const GATHERING_RULES = Object.freeze({ durationMs: 60 * 60_000, maxAheadMs: 30 * 86_400_000, maxUpcoming: 3, titleChars: 40 });
const BODY = new Set(["kind", "title", "startsAt", "guestIds"]);

// Guests per Garden (the host is extra). Set from the capacity test: GARDEN_VISITOR_LIMIT on Render.
export function gardenVisitorLimit(env = process.env) {
  const value = Number(env.GARDEN_VISITOR_LIMIT);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : 6;
}

export class GatheringError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

const tidy = value => (typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "");

const SELECT = { id: true, hostId: true, kind: true, title: true, startsAt: true, endsAt: true, status: true, createdAt: true,
  host: { select: { id: true, name: true, avatar: true } },
  invites: { select: { userId: true, status: true, user: { select: { id: true, name: true, avatar: true } } } } };

export function presentGathering(row, viewerId, now = new Date()) {
  const startsAt = new Date(row.startsAt), endsAt = new Date(row.endsAt);
  return { id: row.id, kind: row.kind, title: row.title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    status: row.status, live: row.status === "SCHEDULED" && startsAt <= now && now < endsAt, host: row.host,
    youAreHost: row.hostId === viewerId, yourInvite: row.invites.find(invite => invite.userId === viewerId)?.status ?? null,
    guests: row.invites.map(invite => ({ ...invite.user, status: invite.status })) };
}

export async function createGathering(db, hostId, body, { now = new Date(), env = process.env, assertText = () => {} } = {}) {
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !BODY.has(key))) throw new GatheringError("Unsupported fields", 400, "GATHERING_INVALID");
  const { kind, startsAt, guestIds } = body;
  if (!GATHERING_KINDS.includes(kind)) throw new GatheringError("Choose dinner, picnic or tea party", 400, "GATHERING_INVALID");
  const title = body.title === undefined ? null : tidy(body.title) || null;
  if (title && [...title].length > GATHERING_RULES.titleChars) throw new GatheringError("Title is too long", 400, "GATHERING_INVALID");
  if (title) assertText(title); // community content check, same as other public text
  const start = new Date(typeof startsAt === "string" ? startsAt : NaN);
  if (Number.isNaN(start.getTime()) || start.getTime() < now.getTime() - 60_000 || start.getTime() > now.getTime() + GATHERING_RULES.maxAheadMs) {
    throw new GatheringError("Start within the next 30 days", 400, "GATHERING_INVALID");
  }
  const guests = Array.isArray(guestIds) ? [...new Set(guestIds)] : [];
  if (!guests.length || guests.length > gardenVisitorLimit(env) || guests.some(id => typeof id !== "string" || id === hostId)) {
    throw new GatheringError(`Invite 1-${gardenVisitorLimit(env)} friends`, 400, "GATHERING_INVALID");
  }
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`gathering:${hostId}`}))::text AS "locked"`;
    const host = await tx.user.findUnique({ where: { id: hostId }, select: { allowGardenVisits: true } });
    if (!host) throw new GatheringError("User not found", 404, "USER_NOT_FOUND");
    if (host.allowGardenVisits !== true) throw new GatheringError("Turn on Garden visits first", 409, "VISITS_OFF");
    const upcoming = await tx.gathering.count({ where: { hostId, status: "SCHEDULED", endsAt: { gt: now } } });
    if (upcoming >= GATHERING_RULES.maxUpcoming) throw new GatheringError(`At most ${GATHERING_RULES.maxUpcoming} upcoming gatherings`, 409, "GATHERING_LIMIT");
    for (const guestId of guests) {
      const friend = await tx.friendship.findUnique({ where: { userId_friendId: { userId: hostId, friendId: guestId } }, select: { id: true } });
      if (!friend || !await socialPairAllowed(tx, hostId, guestId)) throw new GatheringError("Only friends can be invited", 403, "NOT_FRIENDS");
    }
    const created = await tx.gathering.create({ data: { hostId, kind, title, startsAt: start, endsAt: new Date(start.getTime() + GATHERING_RULES.durationMs),
      status: "SCHEDULED", invites: { create: guests.map(userId => ({ userId, status: "INVITED" })) } }, select: SELECT });
    return presentGathering(created, hostId, now);
  });
}

// Upcoming and live gatherings the viewer hosts or is invited to (ended ones drop off after a day).
export async function listGatherings(db, viewerId, { now = new Date() } = {}) {
  const rows = await db.gathering.findMany({
    where: { endsAt: { gt: new Date(now.getTime() - 86_400_000) }, OR: [{ hostId: viewerId }, { invites: { some: { userId: viewerId } } }] },
    orderBy: { startsAt: "asc" }, take: 30, select: SELECT });
  return rows.map(row => presentGathering(row, viewerId, now));
}

export async function respondToGathering(db, viewerId, gatheringId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || typeof body.accept !== "boolean") throw new GatheringError("Send { accept: true|false }", 400, "GATHERING_INVALID");
  const row = await db.gathering.findUnique({ where: { id: String(gatheringId) }, select: SELECT });
  const invite = row?.invites.find(item => item.userId === viewerId);
  if (!row || !invite) throw new GatheringError("Gathering not found", 404, "GATHERING_NOT_FOUND");
  if (row.status !== "SCHEDULED" || new Date(row.endsAt) <= now) throw new GatheringError("This gathering is over", 409, "GATHERING_CLOSED");
  if (!await socialPairAllowed(db, row.hostId, viewerId)) throw new GatheringError("Gathering not found", 404, "GATHERING_NOT_FOUND");
  await db.gatheringInvite.update({ where: { gatheringId_userId: { gatheringId: row.id, userId: viewerId } }, data: { status: body.accept ? "ACCEPTED" : "DECLINED" } });
  return presentGathering({ ...row, invites: row.invites.map(item => item.userId === viewerId ? { ...item, status: body.accept ? "ACCEPTED" : "DECLINED" } : item) }, viewerId, now);
}

export async function cancelGathering(db, hostId, gatheringId, { now = new Date() } = {}) {
  const row = await db.gathering.findUnique({ where: { id: String(gatheringId) }, select: SELECT });
  if (!row || row.hostId !== hostId) throw new GatheringError("Gathering not found", 404, "GATHERING_NOT_FOUND");
  if (row.status !== "SCHEDULED") return presentGathering(row, hostId, now);
  await db.gathering.update({ where: { id: row.id }, data: { status: "CANCELED" } });
  return presentGathering({ ...row, status: "CANCELED" }, hostId, now);
}
