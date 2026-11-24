// The Silktail Fox's milestone visits: it spends a whole day in the Garden on the day the owner
// has written Events on 14 different days, then counting starts over for the next 14 (days 28,
// 42 ...). Days are Event.localDate (the account's local day, fixed when the Event was saved; see
// time.md), counted once each however many Events that day has; a day whose Events were all
// deleted no longer counts. Holiday visits are the app's own (device local date), not here.
import { localDateForInstant, normalizeIanaTimezone } from "./ai-periods.js";

export const SILKTAIL_EVERY_DAYS = 14;

// `days`: the owner's distinct Event local dates (any order). `today`: the account's local date.
export function silktailMilestone(days, today) {
  const sorted = [...new Set(days)].sort();
  const eventDays = sorted.length;
  const reached = Math.floor(eventDays / SILKTAIL_EVERY_DAYS);
  const milestoneDate = reached ? sorted[reached * SILKTAIL_EVERY_DAYS - 1] : null;
  return {
    eventDays,
    // Days still to write before the next visit (14 just after one).
    nextIn: SILKTAIL_EVERY_DAYS - (eventDays % SILKTAIL_EVERY_DAYS),
    milestone: reached * SILKTAIL_EVERY_DAYS || null,
    milestoneDate,
    today,
    visiting: milestoneDate !== null && milestoneDate === today
  };
}

export async function silktailFor(prisma, userId, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) return null;
  const today = localDateForInstant(now, normalizeIanaTimezone(user.timezone) || "UTC");
  const rows = await prisma.event.findMany({
    where: { ownerId: userId }, distinct: ["localDate"], select: { localDate: true }, orderBy: { localDate: "asc" }
  });
  return silktailMilestone(rows.map(row => row.localDate).filter(Boolean), today);
}
