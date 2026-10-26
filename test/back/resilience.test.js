import assert from "node:assert/strict";
import test from "node:test";
import { CircuitBreaker } from "../../lib/circuit-breaker.js";
import { retryBackoffMs } from "../../lib/ai-worker.js";
import { parseArgs, report, runLoad } from "../../scripts/load-test.mjs";

test("circuit opens after consecutive failures, skips calls during cooldown, then lets one trial through", () => {
  let clock = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000, now: () => clock });
  breaker.record(false); breaker.record(true); breaker.record(false); breaker.record(false);
  assert.equal(breaker.state, "CLOSED", "a success resets the consecutive count");
  breaker.record(false);
  assert.equal(breaker.state, "OPEN");
  assert.equal(breaker.allow(), false);
  clock = 1_000;
  assert.equal(breaker.state, "HALF_OPEN");
  assert.equal(breaker.allow(), true, "one trial call");
  assert.equal(breaker.allow(), false, "only one trial at a time");
  breaker.record(false);
  assert.equal(breaker.state, "OPEN", "a failed trial reopens");
  clock = 2_000;
  assert.equal(breaker.allow(), true);
  breaker.record(true);
  assert.equal(breaker.state, "CLOSED");
  assert.equal(breaker.allow(), true);
});

test("a trial that never reports back expires instead of blocking the provider forever", () => {
  let clock = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: () => clock });
  breaker.record(false);
  clock = 1_000;
  assert.equal(breaker.allow(), true);
  clock = 1_500;
  assert.equal(breaker.allow(), false);
  clock = 2_000;
  assert.equal(breaker.allow(), true);
});

test("job retries back off exponentially with jitter and a cap", () => {
  assert.equal(retryBackoffMs(1, 1_000, { random: () => 0 }), 500);
  assert.equal(retryBackoffMs(1, 1_000, { random: () => 1 }), 1_000);
  assert.equal(retryBackoffMs(3, 1_000, { random: () => 1 }), 4_000);
  assert.equal(retryBackoffMs(20, 1_000, { random: () => 1 }), 60_000);
  assert.equal(retryBackoffMs(2, 0, { random: () => 1 }), 0);
});

test("load test runs concurrent users until the deadline and reports latency and statuses", async () => {
  let clock = 0;
  const fetchImpl = async path => {
    clock += 10;
    return { status: path.endsWith("/limited") ? 429 : 200, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const samples = await runLoad({ base: "https://test.invalid", durationS: 1, concurrency: 4,
    paths: ["/session", "/limited"], headers: {}, fetchImpl, now: () => clock });
  assert.ok(samples.length >= 100);
  const result = report(samples, 1);
  assert.equal(result.statuses[200] + result.statuses[429], samples.length);
  assert.equal(result.okLatencyMs.count, result.statuses[200]);
  assert.deepEqual(Object.keys(result.paths), ["/session"], "429s are not counted as successful latency");
  assert.throws(() => parseArgs(["--base", "ftp://x"]), /--base/);
  assert.throws(() => parseArgs(["--base", "https://x", "--concurrency", "500"]), /concurrency/);
});
