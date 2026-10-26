import assert from "node:assert/strict";
import test from "node:test";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { AI_JOB_TYPES } from "../../lib/ai-jobs.js";
import { localDateForInstant, previousMonthlyPeriod } from "../../lib/ai-periods.js";
import { app, setWeeklyReportWorkerFactoryForTests } from "../../server.js";

const consent = { termsVersion: "2026-09", aiProcessing: true, personalization: true, memoryEnabled: true };

async function served(t) {
  const users = {
    alice: { id: "alice", timezone: "America/Vancouver", aiConsent: consent },
    bob: { id: "bob", timezone: "UTC", aiConsent: { ...consent, aiProcessing: false, personalization: false, memoryEnabled: false } }
  };
  const jobs = [];
  const reports = new Map();
  const workerCalls = [];
  const tx = {
    $queryRawUnsafe: async (_query, ownerId) => (users[ownerId]?.aiConsent ? [{ ...users[ownerId].aiConsent }] : []),
    aiJob: {
      findUnique: async ({ where }) => jobs.find((job) => job.ownerId === where.ownerId_idempotencyKey.ownerId &&
        job.idempotencyKey === where.ownerId_idempotencyKey.idempotencyKey) || null,
      createMany: async ({ data }) => {
        for (const item of data) {
          if (!jobs.some((job) => job.ownerId === item.ownerId && job.idempotencyKey === item.idempotencyKey)) {
            jobs.push({ id: `job-${jobs.length + 1}`, status: "PENDING", attemptCount: 0, completedAt: null, createdAt: new Date(), nextAttemptAt: new Date(), ...item });
          }
        }
        return { count: data.length };
      }
    }
  };
  const originals = {
    userFindUnique: prisma.user.findUnique, aiJobFindFirst: prisma.aiJob.findFirst,
    monthlyFindUnique: prisma.monthlyReport.findUnique, transaction: prisma.$transaction
  };
  prisma.user.findUnique = async ({ where }) => where.firebaseUid
    ? { id: where.firebaseUid === "firebase-alice" ? "alice" : "bob" }
    : users[where.id] || null;
  prisma.aiJob.findFirst = async ({ where }) => jobs.find((job) =>
    job.id === where.id && job.ownerId === where.ownerId && job.jobType === where.jobType) || null;
  prisma.monthlyReport.findUnique = async ({ where }) =>
    reports.get(`${where.ownerId_periodKey.ownerId}:${where.ownerId_periodKey.periodKey}`) || null;
  prisma.$transaction = async (callback) => callback(tx);
  setFirebaseTokenVerifierForTests(async (token) => ({ uid: token === "alice-token" ? "firebase-alice" : "firebase-bob", email_verified: true }));
  setWeeklyReportWorkerFactoryForTests(() => ({
    async runJob(input) {
      workerCalls.push(input);
      const job = jobs.find((candidate) => candidate.id === input.jobId && candidate.ownerId === input.ownerId);
      if (!job || job.status === "SUCCEEDED") return { claimed: false };
      job.status = "SUCCEEDED"; job.attemptCount += 1; job.completedAt = new Date();
      reports.set(`${input.ownerId}:${job.resourceId}`, {
        id: `monthly-${reports.size + 1}`, periodKey: job.resourceId, narrativeStatus: "GENERATED", generationVersion: "grounded-narrative-v1"
      });
      return { claimed: true, succeeded: true };
    }
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    prisma.user.findUnique = originals.userFindUnique;
    prisma.aiJob.findFirst = originals.aiJobFindFirst;
    prisma.monthlyReport.findUnique = originals.monthlyFindUnique;
    prisma.$transaction = originals.transaction;
    setWeeklyReportWorkerFactoryForTests();
    setFirebaseTokenVerifierForTests();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const trigger = async (body = {}, token = "alice-token") => {
    const response = await fetch(`${base}/ai/reports/monthly/trigger`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  return { trigger, jobs, workerCalls };
}

test("Monthly trigger writes one owner-scoped job per closed month and runs it once", async (t) => {
  const { trigger, jobs, workerCalls } = await served(t);

  assert.equal((await trigger({ month: "2026-09" }, null)).status, 401);
  assert.equal((await trigger({ month: "2026-09", ownerId: "bob" })).status, 400);
  assert.equal((await trigger({ month: "2026-09", jobType: AI_JOB_TYPES.WEEKLY_REPORT })).status, 400);
  assert.equal((await trigger({ month: "September" })).status, 400);
  const open = localDateForInstant(new Date(), "America/Vancouver").slice(0, 7);
  assert.equal((await trigger({ month: open })).status, 400, "the current month is still open");
  assert.equal((await trigger({ month: "2026-09" }, "bob-token")).status, 403, "no memory consent");
  assert.equal(jobs.length, 0);
  assert.equal(workerCalls.length, 0);

  const triggered = await trigger({ month: "2026-09" });
  assert.equal(triggered.status, 200);
  assert.equal(triggered.body.periodKey, "2026-09");
  assert.equal(triggered.body.execution, "COMPLETED");
  assert.equal(triggered.body.report.narrativeStatus, "GENERATED");
  assert.deepEqual({ ownerId: workerCalls[0].ownerId, jobType: workerCalls[0].jobType },
    { ownerId: "alice", jobType: AI_JOB_TYPES.MONTHLY_REPORT });
  assert.equal(jobs[0].maxAttempts, 1);

  const replay = await trigger({ month: "2026-09" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.job.id, triggered.body.job.id);
  assert.equal(jobs.length, 1, "one job per owner and month");
});

test("Monthly trigger without a body targets the previous month in the account timezone", async (t) => {
  const { trigger, jobs } = await served(t);
  const [year, month] = localDateForInstant(new Date(), "America/Vancouver").split("-").map(Number);
  const expected = previousMonthlyPeriod({ year, month, timezone: "America/Vancouver" }).periodKey;
  const triggered = await trigger();
  assert.equal(triggered.status, 200);
  assert.equal(triggered.body.periodKey, expected);
  assert.equal(jobs[0].resourceId, expected);
});
