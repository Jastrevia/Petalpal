import { assertSocialContent, requireCommunityAcceptance } from './community-policy.js';
import { awaitsPlanting, toSocialFlower } from "./garden-response.js";
import { filterSocialPayload, hiddenSocialIds, withSocialAuthorization } from "./garden-access.js";
import { localDateForInstant, normalizeIanaTimezone } from "./ai-periods.js";

// Flower Support reuses VisitRecord, the prototype's existing social history.
// The database unique index is authoritative even for simultaneous requests.
export const FLOWER_DETAIL_INCLUDE = {
  messages: { orderBy: { createdAt: "asc" } },
  dailyCheckIn: {
    select: {
      id: true,
      localDate: true,
      timezone: true,
      journal: {
        select: {
          id: true,
          userId: true,
          content: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  }
};

export class FlowerSupportError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "FlowerSupportError";
    this.status = status;
    this.code = code;
  }
}

export function getSupportCalendarDay(storedTimezone, now = new Date()) {
  // A missing or unknown stored zone falls back to UTC; the cached helpers do the work.
  const timezone = normalizeIanaTimezone(storedTimezone) || "UTC";
  return { timezone, localDate: localDateForInstant(now, timezone) };
}

async function getViewer(database, viewerUserId) {
  if (!viewerUserId) {
    throw new FlowerSupportError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }
  const viewer = await database.user.findUnique({
    where: { id: viewerUserId },
    select: { id: true, name: true, avatar: true, timezone: true }
  });
  if (!viewer) {
    throw new FlowerSupportError("Authenticated user not found", 401, "AUTHENTICATION_REQUIRED");
  }
  return viewer;
}

function supportState(flower, viewer, day, supportedToday) {
  const isOwner = flower.userId === viewer.id;
  return {
    ...day,
    supportedToday: Boolean(supportedToday),
    canSupport: !isOwner && !supportedToday,
    isOwner
  };
}

function detailWithState(flower, state) {
  return {
    ...(state.isOwner ? flower : { ...toSocialFlower(flower), userId: flower.userId }),
    ...(state.isOwner ? { journalEntryId: flower.dailyCheckIn?.journal?.id || null } : {}),
    supportState: state
  };
}

const supportWhere = (flowerId, viewerId, localDate) => ({
  action: "support",
  visitorId: viewerId,
  flowerId,
  localDate
});

function requireFlowerIdentity(ownerUserId, flowerId) {
  if (typeof ownerUserId !== "string" || !ownerUserId ||
      typeof flowerId !== "string" || !flowerId) {
    throw new FlowerSupportError("Flower not found", 404, "FLOWER_NOT_FOUND");
  }
}


// A visitor reaches only the flowers their Garden view shows: an Event flower its owner has not planted yet
// (lib/garden-response.js awaitsPlanting) is "not found" to everyone but its owner.
function requireVisibleFlower(flower, viewerUserId) {
  if (!flower || (flower.userId !== viewerUserId && awaitsPlanting(flower))) {
    throw new FlowerSupportError("Flower not found", 404, "FLOWER_NOT_FOUND");
  }
}

export async function getFlowerDetail(database, {
  ownerUserId, flowerId, viewerUserId, now = new Date()
}) {
  requireFlowerIdentity(ownerUserId, flowerId);
  if (!viewerUserId) throw new FlowerSupportError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  return withSocialAuthorization(database, ownerUserId, viewerUserId, async database => {
    const [viewer, flower] = await Promise.all([
      getViewer(database, viewerUserId),
      database.flower.findFirst({
        where: { id: flowerId, userId: ownerUserId },
        include: FLOWER_DETAIL_INCLUDE
      })
    ]);
    requireVisibleFlower(flower, viewerUserId);
    const day = getSupportCalendarDay(viewer.timezone, now);
    const previous = await database.visitRecord.findFirst({
      where: supportWhere(flower.id, viewer.id, day.localDate),
      select: { id: true }
    });
    return filterSocialPayload(detailWithState(flower, supportState(flower, viewer, day, previous)), await hiddenSocialIds(database, viewerUserId));
  });
}

export function sendFlowerMessage(database, { ownerUserId, flowerId, viewerUserId, text, visitorAvatar }) {
  return withSocialAuthorization(database, ownerUserId, viewerUserId, async tx => {
    const flower = await tx.flower.findFirst({ where: { id: flowerId, userId: ownerUserId },
      select: { id: true, gardenId: true, userId: true, sourceEventId: true, worldX: true } });
    requireVisibleFlower(flower, viewerUserId);
    const visitor = await getViewer(tx, viewerUserId);
    await requireCommunityAcceptance(tx, viewerUserId);
    assertSocialContent(text);
    const message = await tx.message.create({ data: { author: visitor.name, text, flowerId: flower.id, userId: visitor.id } });
    const visitRecord = await tx.visitRecord.create({ data: {
      visitorId: visitor.id, visitorName: visitor.name, visitorAvatar: visitor.avatar || "🦋",
      action: "message", gardenId: flower.gardenId, userId: visitor.id
    } });
    const updated = await tx.flower.findUnique({ where: { id: flower.id }, include: { messages: true } });
    return { flower: toSocialFlower(updated), message, visitRecord };
  });
}

export async function withGardenFlowerSupportState(database, flowers, viewerUserId, now = new Date()) {
  const viewer = await getViewer(database, viewerUserId);
  const day = getSupportCalendarDay(viewer.timezone, now);
  const todayRecords = flowers.length ? await database.visitRecord.findMany({
    where: {
      action: "support",
      visitorId: viewer.id,
      flowerId: { in: flowers.map((flower) => flower.id) },
      localDate: day.localDate
    },
    select: { flowerId: true }
  }) : [];
  const supportedIds = new Set(todayRecords.map((record) => record.flowerId));
  return flowers.map((flower) => detailWithState(
    flower,
    supportState(flower, viewer, day, supportedIds.has(flower.id))
  ));
}

export async function giveFlowerSupport(database, {
  ownerUserId, flowerId, supporterUserId, visitorAvatar, now = new Date()
}) {
  requireFlowerIdentity(ownerUserId, flowerId);
  const viewer = await getViewer(database, supporterUserId);
  const day = getSupportCalendarDay(viewer.timezone, now);
  try {
    return await withSocialAuthorization(database, ownerUserId, supporterUserId, async (transaction) => {
      await requireCommunityAcceptance(transaction, supporterUserId);
      assertSocialContent(viewer.name);
      assertSocialContent(viewer.avatar || "🦋");
      const flower = await transaction.flower.findFirst({
        where: { id: flowerId, userId: ownerUserId },
        include: FLOWER_DETAIL_INCLUDE
      });
      requireVisibleFlower(flower, viewer.id);
      if (flower.userId === viewer.id) {
        throw new FlowerSupportError(
          "You cannot support your own flower", 403, "SELF_SUPPORT_FORBIDDEN"
        );
      }
      const previous = await transaction.visitRecord.findFirst({
        where: supportWhere(flower.id, viewer.id, day.localDate),
        select: { id: true }
      });
      if (previous) {
        // Another request may have committed between the flower read and this
        // history read. Fetch the count again before returning the duplicate.
        const current = await transaction.flower.findFirst({
          where: { id: flowerId, userId: ownerUserId },
          include: FLOWER_DETAIL_INCLUDE
        });
        if (!current) throw new FlowerSupportError("Flower not found", 404, "FLOWER_NOT_FOUND");
        return {
          flower: detailWithState(current, supportState(current, viewer, day, true)),
          visitRecord: null
        };
      }

      const visitRecord = await transaction.visitRecord.create({
        data: {
          visitorId: viewer.id,
          visitorName: viewer.name,
          visitorAvatar: viewer.avatar || "🦋",
          action: "support",
          gardenId: flower.gardenId,
          userId: viewer.id,
          flowerId: flower.id,
          ...day
        }
      });
      const updated = await transaction.flower.update({
        where: { id: flower.id },
        data: { supportCount: { increment: 1 } },
        include: FLOWER_DETAIL_INCLUDE
      });
      return {
        flower: detailWithState(updated, supportState(updated, viewer, day, true)),
        visitRecord
      };
    });
  } catch (error) {
    // A competing request may have inserted the same supporter/flower/day.
    // Its transaction committed exactly one increment; read it after rollback.
    if (error?.code === "P2002") {
      const flower = await getFlowerDetail(database, {
        ownerUserId, flowerId, viewerUserId: viewer.id, now
      });
      if (flower.supportState.supportedToday) return { flower, visitRecord: null };
    }
    throw error;
  }
}
