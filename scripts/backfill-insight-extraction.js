// Weekly 2.0 history backfill (docs/product/WEEKLY_2.0.md). Queues INSIGHT_EXTRACTION jobs for the
// owners in INSIGHT_BACKFILL_OWNER_IDS (comma-separated, explicit ids only) whose Events since
// INSIGHT_BACKFILL_SINCE (YYYY-MM-DD, default 90 days ago) have no extraction yet. Dry run by default:
// set INSIGHT_BACKFILL_APPLY=true to queue. With Haiku configured each job is one paid call, so the
// owner approves every applied run. Prints counts and job ids only.
import { enqueueInsightExtractionBackfill } from "../lib/ai-jobs.js";
import prisma from "../lib/prisma.js";

const ownerIds = String(process.env.INSIGHT_BACKFILL_OWNER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
const since = process.env.INSIGHT_BACKFILL_SINCE ? new Date(`${process.env.INSIGHT_BACKFILL_SINCE}T00:00:00Z`)
  : new Date(Date.now() - 90 * 86_400_000);
const batchSize = process.env.INSIGHT_BACKFILL_BATCH_SIZE ? Number(process.env.INSIGHT_BACKFILL_BATCH_SIZE) : 100;
const afterId = process.env.INSIGHT_BACKFILL_AFTER_ID || null;

try {
  const result = await enqueueInsightExtractionBackfill({ prisma, ownerIds, since, batchSize, afterId,
    dryRun: process.env.INSIGHT_BACKFILL_APPLY !== "true" });
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
