import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { requestTiming, requestTimingEnabled } from "../../lib/request-timing.js";
import { parseTimingLines, percentile, summarize } from "../../scripts/latency-summary.mjs";

async function served(t, log) {
  let clock = 0;
  const app = express();
  app.use(requestTiming({ log, now: () => (clock += 25) }));
  app.get("/users/:userId/garden", (req, res) => res.json({ ok: true }));
  app.use((req, res) => res.status(404).end());
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise(resolve => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test("logs the route pattern, status and duration, never the URL, ids or query", async t => {
  const lines = [];
  const base = await served(t, line => lines.push(line));
  await (await fetch(`${base}/users/private-user-42/garden?token=secret`)).text();
  await (await fetch(`${base}/not-a-route`)).text();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { msg: "http_request", method: "GET", route: "/users/:userId/garden", status: 200, ms: 25 });
  assert.equal(lines.join("").includes("private-user-42"), false);
  assert.equal(lines.join("").includes("secret"), false);
});

test("timing logs are on in production unless disabled, and opt-in elsewhere", () => {
  assert.equal(requestTimingEnabled({ NODE_ENV: "production" }), true);
  assert.equal(requestTimingEnabled({ NODE_ENV: "production", REQUEST_TIMING_LOG: "0" }), false);
  assert.equal(requestTimingEnabled({}), false);
  assert.equal(requestTimingEnabled({ REQUEST_TIMING_LOG: "1" }), true);
});

test("latency summary reads timing lines from prefixed log text and reports p50 and p95", () => {
  const text = [
    "2026-10-26T10:00:00Z app[web.1]: {\"msg\":\"http_request\",\"method\":\"GET\",\"route\":\"/session\",\"status\":200,\"ms\":40}",
    "2026-10-26T10:00:01Z app[web.1]: unrelated line",
    ...[10, 20, 30, 40, 50, 60, 70, 80, 90, 500].map(ms =>
      `{"msg":"http_request","method":"POST","route":"/events","status":201,"ms":${ms}}`)
  ].join("\n");
  const rows = parseTimingLines(text);
  assert.equal(rows.length, 11);
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  const summary = summarize(rows);
  assert.deepEqual(summary[0], { route: "ALL", count: 11, p50: 50, p95: 500 });
  assert.deepEqual(summary[1], { route: "POST /events", count: 10, p50: 50, p95: 500 });
});
