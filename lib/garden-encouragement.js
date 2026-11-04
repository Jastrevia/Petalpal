import { assertSocialContent, requireCommunityAcceptance } from "./community-policy.js";
import { hiddenSocialIds, withSocialAuthorization } from "./garden-access.js";
import { getSupportCalendarDay } from "./flower-support.js";
import { addLocalDays, localTimeToUtc } from "./ai-periods.js";

// Daily Garden encouragement: while visiting a friend's Garden a visitor may give one
// Support and leave one short note per Garden owner per local calendar day. The day is
// the visitor's account-timezone date (the same rule as Flower Support). The unique
// index on (senderId, ownerId, kind, localDate) is the authoritative limit; inserts use
// ON CONFLICT DO NOTHING, so double taps, refreshes and parallel devices never create a
// second row and never abort the surrounding social-authorization transaction.

export const GARDEN_NOTE_MAX_LENGTH = 200;
export const SUPPORT = "SUPPORT";
export const MESSAGE = "MESSAGE";
const OWNER_PAGE_SIZE = 50;
// C0/C1 controls other than tab and newline, and bidi overrides, are malformed note text.
const MALFORMED_TEXT = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/u;

export class GardenEncouragementError extends Error {
  constructor(message, status, code, extra = {}) {
    super(message);
    this.name = "GardenEncouragementError";
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

// The local day and its bounds as UTC instants. localTimeToUtc never throws for
// days whose midnight is skipped by a DST change.
export function encouragementDay(timezone, now = new Date()) {
  const day = getSupportCalendarDay(timezone, now);
  return {
    ...day,
    startsAt: localTimeToUtc(day.localDate, 0, day.timezone),
    resetsAt: localTimeToUtc(addLocalDays(day.localDate, 1), 0, day.timezone)
  };
}

export function validateGardenNote(text) {
  if (typeof text !== "string") {
    throw new GardenEncouragementError("A note must be text", 400, "NOTE_INVALID");
  }
  const trimmed = text.replace(/\r\n?/g, "\n").trim();
  if (!trimmed) throw new GardenEncouragementError("A note cannot be empty", 400, "NOTE_EMPTY");
  if (MALFORMED_TEXT.test(trimmed)) {
    throw new GardenEncouragementError("This note contains characters that cannot be sent", 400, "NOTE_INVALID");
  }
  // Count characters as people see them (an emoji is one), matching VARCHAR(200).
  if ([...trimmed].length > GARDEN_NOTE_MAX_LENGTH) {
    throw new GardenEncouragementError(
      `A note must be ${GARDEN_NOTE_MAX_LENGTH} characters or fewer`, 413, "NOTE_TOO_LONG"
    );
  }
  return trimmed;
}

function requireVisitIdentity(ownerUserId, viewerUserId) {
  if (!viewerUserId) throw new GardenEncouragementError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  if (typeof ownerUserId !== "string" || !ownerUserId) {
    throw new GardenEncouragementError("Garden not found", 404, "GARDEN_NOT_FOUND");
  }
  if (ownerUserId === viewerUserId) {
    throw new GardenEncouragementError("Encouragement is for a friend's Garden", 403, "OWN_GARDEN");
  }
}

async function visitParties(tx, ownerUserId, viewerUserId) {
  const [viewer, owner] = await Promise.all([
    tx.user.findUnique({ where: { id: viewerUserId }, select: { id: true, timezone: true } }),
    tx.user.findUnique({ where: { id: ownerUserId }, select: { id: true, name: true, avatar: true } })
  ]);
  if (!viewer) throw new GardenEncouragementError("Authenticated user not found", 401, "AUTHENTICATION_REQUIRED");
  if (!owner) throw new GardenEncouragementError("Garden not found", 404, "GARDEN_NOT_FOUND");
  return { viewer, owner };
}

async function visitorState(tx, owner, viewer, day) {
  const rows = await tx.gardenEncouragement.findMany({
    where: { senderId: viewer.id, ownerId: owner.id, localDate: day.localDate },
    select: { kind: true }
  });
  const kinds = new Set(rows.map((row) => row.kind));
  return {
    owner: { id: owner.id, name: owner.name, avatar: owner.avatar },
    localDate: day.localDate,
    timezone: day.timezone,
    resetsAt: day.resetsAt.toISOString(),
    hasSupportedToday: kinds.has(SUPPORT),
    hasMessagedToday: kinds.has(MESSAGE),
    messageMaxLength: GARDEN_NOTE_MAX_LENGTH
  };
}

// Today's interaction state between the visitor and this friend's Garden.
export async function getGardenEncouragementState(database, { ownerUserId, viewerUserId, now = new Date() }) {
  requireVisitIdentity(ownerUserId, viewerUserId);
  return withSocialAuthorization(database, ownerUserId, viewerUserId, async (tx) => {
    const { viewer, owner } = await visitParties(tx, ownerUserId, viewerUserId);
    return visitorState(tx, owner, viewer, encouragementDay(viewer.timezone, now));
  });
}

async function recordEncouragement(database, { ownerUserId, viewerUserId, kind, text = null, now }) {
  requireVisitIdentity(ownerUserId, viewerUserId);
  return withSocialAuthorization(database, ownerUserId, viewerUserId, async (tx) => {
    const { viewer, owner } = await visitParties(tx, ownerUserId, viewerUserId);
    await requireCommunityAcceptance(tx, viewer.id);
    if (text !== null) assertSocialContent(text);
    const day = encouragementDay(viewer.timezone, now);
    const { count } = await tx.gardenEncouragement.createMany({
      data: [{
        senderId: viewer.id, ownerId: owner.id, kind, text,
        localDate: day.localDate, timezone: day.timezone, createdAt: now
      }],
      skipDuplicates: true
    });
    const state = await visitorState(tx, owner, viewer, day);
    if (count === 0) {
      throw kind === SUPPORT
        ? new GardenEncouragementError("You have already supported this Garden today", 409, "ALREADY_SUPPORTED_TODAY", { state })
        : new GardenEncouragementError("You have already left a note in this Garden today", 409, "ALREADY_MESSAGED_TODAY", { state });
    }
    return state;
  });
}

export async function giveGardenSupport(database, { ownerUserId, viewerUserId, now = new Date() }) {
  return recordEncouragement(database, { ownerUserId, viewerUserId, kind: SUPPORT, now });
}

export async function leaveGardenNote(database, { ownerUserId, viewerUserId, text, now = new Date() }) {
  const note = validateGardenNote(text);
  return recordEncouragement(database, { ownerUserId, viewerUserId, kind: MESSAGE, text: note, now });
}

function toOwnerNote(row) {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    read: row.readAt !== null && row.readAt !== undefined,
    sender: { id: row.sender.id, name: row.sender.name, avatar: row.sender.avatar }
  };
}

// What the Garden owner received: Support counts (today in the owner's timezone, and in
// all), unread counts, and notes newest first with the sender's live profile. Blocked
// or restricted senders are hidden, as everywhere else in the social surface.
export async function listGardenEncouragements(database, { ownerUserId, cursor, now = new Date() }) {
  const owner = await database.user.findUnique({ where: { id: ownerUserId }, select: { id: true, timezone: true } });
  if (!owner) throw new GardenEncouragementError("Authenticated user not found", 401, "AUTHENTICATION_REQUIRED");
  const hidden = [...await hiddenSocialIds(database, owner.id)];
  const day = encouragementDay(owner.timezone, now);
  const visible = { ownerId: owner.id, ...(hidden.length ? { senderId: { notIn: hidden } } : {}) };
  const today = { createdAt: { gte: day.startsAt, lt: day.resetsAt } };
  const [supportToday, supportTotal, messagesToday, unreadSupport, unreadMessages, rows] = await Promise.all([
    database.gardenEncouragement.count({ where: { ...visible, kind: SUPPORT, ...today } }),
    database.gardenEncouragement.count({ where: { ...visible, kind: SUPPORT } }),
    database.gardenEncouragement.count({ where: { ...visible, kind: MESSAGE, ...today } }),
    database.gardenEncouragement.count({ where: { ...visible, kind: SUPPORT, readAt: null } }),
    database.gardenEncouragement.count({ where: { ...visible, kind: MESSAGE, readAt: null } }),
    database.gardenEncouragement.findMany({
      where: { ...visible, kind: MESSAGE },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: OWNER_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, text: true, createdAt: true, readAt: true,
        sender: { select: { id: true, name: true, avatar: true } }
      }
    })
  ]);
  const page = rows.slice(0, OWNER_PAGE_SIZE);
  return {
    localDate: day.localDate,
    timezone: day.timezone,
    resetsAt: day.resetsAt.toISOString(),
    support: { today: supportToday, total: supportTotal, unread: unreadSupport },
    messages: {
      today: messagesToday,
      unread: unreadMessages,
      items: page.map(toOwnerNote),
      nextCursor: rows.length > OWNER_PAGE_SIZE ? page.at(-1).id : null
    }
  };
}

// The owner marks notes as read (when a letter is opened) and/or all Support as seen.
// Only the owner's own rows can change; unknown ids are ignored.
export async function markGardenEncouragementsRead(database, { ownerUserId, messageIds = [], supports = false, now = new Date() }) {
  const ids = [...new Set(messageIds)];
  const targets = [
    ...(supports ? [{ kind: SUPPORT }] : []),
    ...(ids.length ? [{ kind: MESSAGE, id: { in: ids } }] : [])
  ];
  if (!targets.length) return { updated: 0 };
  const { count } = await database.gardenEncouragement.updateMany({
    where: { ownerId: ownerUserId, readAt: null, OR: targets },
    data: { readAt: now }
  });
  return { updated: count };
}
