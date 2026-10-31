import { requireAiIdentity } from "./ai-identity.js";
import { reportShowsEvent } from "./weekly-short.js";

export class PrivateEventRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async getEventById({ identity, eventId }) {
    const ownerId = requireAiIdentity(identity);
    return this.prisma.event.findFirst({ where: { id: eventId, ownerId } });
  }

  async deleteEventAndAffectedReports({ identity, eventId }) {
    const ownerId = requireAiIdentity(identity);
    return this.prisma.$transaction(async (tx) => {
      // Serialize report finalization and discovery before deleting/cascading evidence.
      // Do not require active consent: owners must still be able to delete.
      await tx.$queryRawUnsafe('SELECT "userId" FROM "AiConsent" WHERE "userId" = $1 FOR UPDATE', ownerId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "Event" WHERE "id" = $1 AND "ownerId" = $2 FOR UPDATE', eventId, ownerId);
      const event = await tx.event.findFirst({ where: { id: eventId, ownerId }, select: { id: true, occurredAt: true } });
      if (!event) return null;

      const evidence = await tx.aiEvidence.findMany({
        where: { ownerId, sourceEventId: eventId },
        select: { weeklyReportId: true, monthlyReportId: true, yearlyReportId: true }
      });
      // A short Weekly report's mood curve and "then and now" show uncited Events too, and a Weekly 2.0 时间回声 can quote
      // an Event from up to a year before: every Weekly report of this owner that shows it (at most ~52 a year).
      const shown = await tx.weeklyReport.findMany({
        where: { ownerId, periodEndUtc: { gt: event.occurredAt } },
        select: { id: true, narrativeSections: true }
      });
      const weeklyReportIds = [...new Set([...evidence.map((item) => item.weeklyReportId).filter(Boolean),
        ...shown.filter((report) => reportShowsEvent(report.narrativeSections, eventId)).map((report) => report.id)])];
      // A Monthly 2.0 report shows every Event of its month in its garden and quotes the month before.
      const shownMonthly = await tx.monthlyReport.findMany({
        where: { ownerId, periodEndUtc: { gt: event.occurredAt } },
        select: { id: true, narrativeSections: true }
      });
      const monthlyReportIds = [...new Set([...evidence.map((item) => item.monthlyReportId).filter(Boolean),
        ...shownMonthly.filter((report) => reportShowsEvent(report.narrativeSections, eventId)).map((report) => report.id)])];
      const yearlyReportIds = [...new Set(evidence.map((item) => item.yearlyReportId).filter(Boolean))];

      if (weeklyReportIds.length) {
        await tx.weeklyReport.deleteMany({ where: { ownerId, id: { in: weeklyReportIds } } });
      }
      if (monthlyReportIds.length) {
        await tx.monthlyReport.deleteMany({ where: { ownerId, id: { in: monthlyReportIds } } });
      }
      if (yearlyReportIds.length) {
        await tx.yearlyReport.deleteMany({ where: { ownerId, id: { in: yearlyReportIds } } });
      }
      await tx.event.deleteMany({ where: { id: eventId, ownerId } });
      return {
        id: eventId,
        deletedReports: {
          weekly: weeklyReportIds.length,
          monthly: monthlyReportIds.length,
          yearly: yearlyReportIds.length
        }
      };
    });
  }
}
