// Weekly reports written by the server (time.md §3, §6 Automation): from Sunday 23:59 in each owner's timezone,
// one WEEKLY_REPORT job per consenting owner and week, with the trigger's own job key, so a week is never written
// twice and the trigger and the schedule never race. The existing dispatch path sends the jobs to the executor.
// Off unless AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS lists owners (comma-separated ids, or "*" alone); malformed is off.
// A week with too few entries costs nothing (Weekly 2.0 writes it in code); others are one model call each, within
// the existing per-user and global AI budgets.
import { AI_JOB_TYPES, PrismaAiJobRepository } from "./ai-jobs.js";
import { latestReadyWeeklyPeriod, localDateForInstant, previousMonthlyPeriod } from "./ai-periods.js";
import { REPORT_NARRATIVE_GENERATION_VERSION } from "./report-narrative.js";
import { requireLockedMemoryConsent } from "./semantic-retrieval.js";
import { monthlyInsightsEnabledFor } from "./weekly-contract.js";

export const WEEKLY_SCHEDULE_LIMIT = 25;
const MAX_OWNERS = 100, OWNER_ID = /^[A-Za-z0-9_-]{1,64}$/;

// null when off, "*" for everyone with consent, else the listed ids.
export const weeklyScheduleOwners = (env = process.env) => scheduleOwners(env.AI_WEEKLY_AUTO_SCHEDULE_OWNER_IDS);
// Monthly reports written by the server from 00:00 on the 1st (owner's timezone), same format, off by default. Only
// owners on MONTHLY_INSIGHTS_OWNER_IDS are scheduled: Monthly 2.0 is code only, so these jobs never call a model.
export const monthlyScheduleOwners = (env = process.env) => scheduleOwners(env.AI_MONTHLY_AUTO_SCHEDULE_OWNER_IDS);
function scheduleOwners(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw === "*") return "*";
  const ids = raw.split(",").map(id => id.trim());
  return ids.length > MAX_OWNERS || ids.some(id => !OWNER_ID.test(id)) ? null : ids;
}

const validTimezone = value => {
  try { return typeof value === "string" && Boolean(new Intl.DateTimeFormat("en-US", { timeZone: value }).format()); }
  catch { return false; }
};

// Queues the missing jobs (at most `limit`) and returns them; owners whose week already has a job are skipped.
export const scheduleWeeklyReports = ({ prisma, now = new Date(), env = process.env, limit = WEEKLY_SCHEDULE_LIMIT }) =>
  scheduleReports({ prisma, limit, owners: weeklyScheduleOwners(env), jobType: AI_JOB_TYPES.WEEKLY_REPORT,
    periodKey: user => latestReadyWeeklyPeriod(now, user.timezone).periodKey });
export const scheduleMonthlyReports = ({ prisma, now = new Date(), env = process.env, limit = WEEKLY_SCHEDULE_LIMIT }) =>
  scheduleReports({ prisma, limit, owners: monthlyScheduleOwners(env), jobType: AI_JOB_TYPES.MONTHLY_REPORT,
    eligible: user => monthlyInsightsEnabledFor(env, user.id), periodKey: user => {
      const [year, month] = localDateForInstant(now, user.timezone).split("-").map(Number);
      return previousMonthlyPeriod({ year, month, timezone: user.timezone }).periodKey;
    } });

async function scheduleReports({ prisma, limit, owners, jobType, periodKey, eligible = () => true }) {
  if (!owners) return [];
  const users = await prisma.$queryRawUnsafe(`
    SELECT u."id", u."timezone" FROM "User" AS u
    INNER JOIN "AiConsent" AS consent ON consent."userId" = u."id"
    WHERE consent."aiProcessing" = true AND consent."personalization" = true AND consent."memoryEnabled" = true
      AND ($1::text[] IS NULL OR u."id" = ANY($1::text[]))
    ORDER BY u."id" ASC LIMIT 2000
  `, owners === "*" ? null : owners);
  const due = users.filter(user => validTimezone(user.timezone) && eligible(user))
    .map(user => ({ ownerId: user.id, periodKey: periodKey(user) }));
  if (!due.length) return [];
  const keys = due.map(item => `${jobType}:${item.periodKey}:${REPORT_NARRATIVE_GENERATION_VERSION}`);
  const existing = await prisma.aiJob.findMany({ where: { ownerId: { in: due.map(item => item.ownerId) }, idempotencyKey: { in: keys } },
    select: { ownerId: true, idempotencyKey: true } });
  const have = new Set(existing.map(job => `${job.ownerId} ${job.idempotencyKey}`));
  const repository = new PrismaAiJobRepository(prisma), jobs = [];
  for (const [i, item] of due.entries()) {
    if (jobs.length >= limit) break;
    if (have.has(`${item.ownerId} ${keys[i]}`)) continue;
    const identity = { userId: item.ownerId };
    try {
      jobs.push(await prisma.$transaction(async tx => {
        await requireLockedMemoryConsent(tx, identity);
        return repository.enqueue({ identity, jobType, resourceId: item.periodKey,
          processingVersion: REPORT_NARRATIVE_GENERATION_VERSION, maxAttempts: 1, transaction: tx });
      }));
    } catch (error) {
      if (error?.code !== "AI_FORBIDDEN") throw error; // consent withdrawn in between: skip this owner
    }
  }
  return jobs;
}
