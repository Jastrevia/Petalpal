import assert from "node:assert/strict";
import test from "node:test";

import {
  aiAsyncExecutionMode,
  aiJobDispatchAllowed,
  aiJobServiceAuthorized,
  dispatchAiJob,
  executeAiJobById,
  listDispatchableAiJobs
} from "../../lib/ai-async-dispatch.js";
import cloudflareWorker from "../../cloudflare-worker/src/index.js";

const ownerId = "safe-test-owner";
const jobId = "cmtestjob000001";
const createdAt = new Date("2026-09-28T00:00:00Z");
const shadow = { AI_ASYNC_EXECUTION_MODE: "shadow", AI_ASYNC_SHADOW_OWNER_ID: ownerId,
  AI_ASYNC_SHADOW_STARTED_AT: "2026-09-27T00:00:00Z" };

test("manual mode is the default and shadow dispatch is owner-scoped", () => {
  assert.equal(aiAsyncExecutionMode({}), "manual");
  assert.equal(aiJobDispatchAllowed({ ownerId }, {}), false);
  assert.equal(aiJobDispatchAllowed({ ownerId, createdAt }, shadow), true);
  assert.equal(aiJobDispatchAllowed({ ownerId, createdAt: new Date("2026-09-26T00:00:00Z") }, shadow), false);
  assert.equal(aiJobDispatchAllowed({ ownerId, createdAt }, { ...shadow, AI_ASYNC_SHADOW_STARTED_AT: "" }), false);
  assert.equal(aiJobDispatchAllowed({ ownerId: "another-owner", createdAt }, shadow), false);
  assert.throws(() => aiAsyncExecutionMode({ AI_ASYNC_EXECUTION_MODE: "unknown" }));
});

test("executor requires the dedicated bearer token", () => {
  const env = { AI_JOB_EXECUTOR_TOKEN: "private-executor-secret" };
  assert.equal(aiJobServiceAuthorized("Bearer private-executor-secret", env), true);
  assert.equal(aiJobServiceAuthorized("Bearer wrong-token", env), false);
  assert.equal(aiJobServiceAuthorized("Bearer private-executor-secret", {}), false);
  assert.equal(aiJobServiceAuthorized("Firebase private-executor-secret", env), false);
});

test("immediate dispatch sends only an opaque job ID and failure leaves the job recoverable", async () => {
  const job = { id: jobId, ownerId, createdAt, status: "PENDING" };
  const env = { ...shadow, AI_JOB_DISPATCH_URL: "https://worker.example", AI_JOB_DISPATCH_TOKEN: "dispatch-secret" };
  let captured;
  const success = await dispatchAiJob(job, { env, fetchImpl: async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(null, { status: 202 });
  } });
  assert.deepEqual(success, { dispatched: true });
  assert.deepEqual(captured, { jobId });
  assert.deepEqual(job, { id: jobId, ownerId, createdAt, status: "PENDING" });
  await assert.rejects(dispatchAiJob(job, { env, fetchImpl: async () => new Response(null, { status: 503 }) }));
  assert.equal(job.status, "PENDING");
});

test("reconciliation is bounded and disabled for ordinary manual traffic", async () => {
  let args;
  const prisma = { $queryRawUnsafe: async (...values) => { args = values; return [{ id: jobId }]; } };
  assert.deepEqual(await listDispatchableAiJobs(prisma, { env: {} }), []);
  assert.deepEqual(await listDispatchableAiJobs(prisma, { env: shadow }), [{ jobId }]);
  assert.equal(args[2], ownerId);
  assert.equal(args[3].getTime(), new Date(shadow.AI_ASYNC_SHADOW_STARTED_AT).getTime());
  assert.equal(args[4], 5);
  assert.deepEqual(await listDispatchableAiJobs(prisma, {
    env: { ...shadow, AI_ASYNC_EXECUTION_MODE: "cloudflare_queue" }
  }), [{ jobId }]);
  assert.equal(args[2], null);
  assert.equal(args[3], null);
});

test("duplicate and terminal deliveries never invoke the targeted worker", async () => {
  for (const status of ["SUCCEEDED", "CANCELLED", "FAILED"]) {
    const prisma = { aiJob: { findUnique: async () => ({ id: jobId, ownerId, createdAt, jobType: "MEMORY_EXTRACTION", status }) } };
    const result = await executeAiJobById({ prisma, jobId, env: shadow, workerFactory: () => { throw new Error("should not run"); } });
    assert.deepEqual(result, { outcome: status });
  }
});

test("healthy lease and another owner's job cannot execute", async () => {
  const now = new Date("2026-09-28T00:00:00Z");
  for (const job of [
    { id: jobId, ownerId, createdAt, jobType: "MEMORY_EXTRACTION", status: "RUNNING", leaseExpiresAt: new Date(now.getTime() + 60_000) },
    { id: jobId, ownerId: "another-owner", createdAt, jobType: "MEMORY_EXTRACTION", status: "PENDING", nextAttemptAt: now }
  ]) {
    const prisma = { aiJob: { findUnique: async () => job } };
    const result = await executeAiJobById({ prisma, jobId, env: shadow, now, workerFactory: () => { throw new Error("should not run"); } });
    assert.ok(["LEASED", "NOT_SELECTED"].includes(result.outcome));
  }
});

test("targeted execution returns only safe status and child job ID", async () => {
  const now = new Date("2026-09-28T00:00:00Z");
  const job = { id: jobId, ownerId, createdAt, jobType: "MEMORY_EXTRACTION", status: "PENDING", nextAttemptAt: now };
  const prisma = { aiJob: { findUnique: async ({ select }) => select?.ownerId ? job : { status: "SUCCEEDED" } } };
  let runInput;
  const result = await executeAiJobById({ prisma, jobId, env: shadow, now, workerFactory: () => ({
    runJob: async (input) => { runInput = input; return { succeeded: true, result: { embeddingJob: { id: "cmchildjob000002" } } }; }
  }) });
  assert.deepEqual(result, { outcome: "SUCCEEDED", nextJobId: "cmchildjob000002" });
  assert.deepEqual({ jobId: runInput.jobId, ownerId: runInput.ownerId, jobType: runInput.jobType },
    { jobId, ownerId, jobType: "MEMORY_EXTRACTION" });
});

test("Cloudflare dispatch rejects private text and Queue payload contains job ID only", async () => {
  const messages = [];
  const env = { AI_JOB_DISPATCH_TOKEN: "dispatch-secret", AI_JOB_QUEUE: { send: async (message) => messages.push(message) } };
  const send = (body, token = "dispatch-secret") => cloudflareWorker.fetch(new Request("https://worker.example/v1/ai-jobs/dispatch", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
  }), env);
  assert.equal((await send({ jobId }, "invalid")).status, 401);
  assert.equal((await send({ jobId, eventText: "private event" })).status, 400);
  assert.equal((await send({ jobId })).status, 202);
  assert.deepEqual(messages, [{ jobId }]);
});

test("Queue consumer ACKs successful delivery and boundedly retries transport failure", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  const env = { AI_JOB_EXECUTOR_URL: "https://render.example", AI_JOB_EXECUTOR_TOKEN: "executor-secret",
    AI_JOB_QUEUE: { send: async (message) => sent.push(message) } };
  const message = () => ({ body: { jobId }, ackCount: 0, retryCount: 0,
    ack() { this.ackCount++; }, retry() { this.retryCount++; } });
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers.Authorization, "Bearer executor-secret");
      return Response.json({ outcome: "SUCCEEDED", nextJobId: "cmchildjob000002" });
    };
    const delivered = message();
    await cloudflareWorker.queue({ messages: [delivered] }, env);
    assert.equal(delivered.ackCount, 1);
    assert.deepEqual(sent, [{ jobId: "cmchildjob000002" }]);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    const failed = message();
    await cloudflareWorker.queue({ messages: [failed] }, env);
    assert.equal(failed.retryCount, 1);
    assert.equal(failed.ackCount, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Cloudflare Cron enqueues only bounded opaque IDs from the authenticated reconciler", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  const env = { AI_JOB_EXECUTOR_URL: "https://render.example", AI_JOB_EXECUTOR_TOKEN: "executor-secret",
    AI_JOB_QUEUE: { send: async (message) => sent.push(message) } };
  try {
    const weeklyJob = "cmweeklyjob00001";
    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer executor-secret");
      return Response.json({ jobs: [{ jobId: String(url).endsWith("/schedule-weekly") ? weeklyJob : jobId }] });
    };
    await cloudflareWorker.scheduled({}, env);
    assert.deepEqual(sent, [{ jobId: weeklyJob }, { jobId }], "server-written Weekly jobs first, then reconciliation");
    // The Weekly schedule failing, or answering with anything but bounded ids, never stops reconciliation.
    for (const schedule of [() => new Response(null, { status: 503 }), () => Response.json({ jobs: [{ jobId, text: "private" }] })]) {
      sent.length = 0;
      globalThis.fetch = async url => String(url).endsWith("/schedule-weekly") ? schedule() : Response.json({ jobs: [{ jobId }] });
      await cloudflareWorker.scheduled({}, env);
      assert.deepEqual(sent, [{ jobId }]);
    }
  } finally { globalThis.fetch = originalFetch; }
});
