// Weekly 2.0 "不准确" summary (docs/product/WEEKLY_2.0.md). Reads the narrative sections of Weekly reports for periods since
// INSIGHT_FEEDBACK_SINCE (YYYY-MM-DD, default 56 days ago) and prints per-type counts as JSON: shown, main, template,
// inaccurate, hidden, inaccurateRate. Read-only; prints no report text or owner ids. Running it against TEST or
// production is a database read the owner approves.
import { summarizeInsightFeedback } from "../lib/insight-feedback-summary.js";
import prisma from "../lib/prisma.js";

const since = process.env.INSIGHT_FEEDBACK_SINCE ? new Date(`${process.env.INSIGHT_FEEDBACK_SINCE}T00:00:00Z`) : new Date(Date.now() - 56 * 86_400_000);
if (Number.isNaN(+since)) throw new Error("INSIGHT_FEEDBACK_SINCE must be YYYY-MM-DD");

try {
  const totals = {};
  let cursor = null, reports = 0;
  for (;;) {
    const page = await prisma.weeklyReport.findMany({ where: { periodStartUtc: { gte: since } }, orderBy: { id: "asc" }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, narrativeSections: true } });
    if (!page.length) break;
    reports += page.length; cursor = page.at(-1).id;
    for (const [type, row] of Object.entries(summarizeInsightFeedback(page))) {
      const total = totals[type] ??= { shown: 0, main: 0, template: 0, inaccurate: 0, hidden: 0 };
      for (const key of Object.keys(total)) total[key] += row[key];
    }
  }
  for (const row of Object.values(totals)) row.inaccurateRate = row.shown ? Math.round(row.inaccurate / row.shown * 1000) / 1000 : 0;
  console.log(JSON.stringify({ since: since.toISOString().slice(0, 10), reports, byType: totals }));
} finally {
  await prisma.$disconnect();
}
