// Read-only HTTP load test for a hosted TEST backend: N concurrent virtual users call
// GET endpoints for a fixed duration and the script prints throughput, status counts
// and p50/p95/p99 latency. It writes nothing, but run it only against a TEST service
// with a TEST identity, never production. 429s are the rate limiter working and are
// reported separately from errors.
//
// Usage (the token is read from the environment and never printed):
//   read -rs PETALPAL_TEST_ID_TOKEN && export PETALPAL_TEST_ID_TOKEN
//   node scripts/load-test.mjs --base https://<test-service> --duration 30 --concurrency 10
import { pathToFileURL } from "node:url";

// Nearest-rank percentile of sorted values.
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function parseArgs(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const options = {
    base: String(value("base", "")).replace(/\/$/, ""),
    durationS: Number(value("duration", 30)),
    concurrency: Number(value("concurrency", 10))
  };
  if (!/^https?:\/\//.test(options.base)) throw new Error("Pass --base https://<test-service>.");
  if (!(options.durationS > 0 && options.durationS <= 600)) throw new Error("--duration must be 1-600 seconds.");
  if (!(Number.isInteger(options.concurrency) && options.concurrency >= 1 && options.concurrency <= 200)) {
    throw new Error("--concurrency must be 1-200.");
  }
  return options;
}

export function report(samples, durationS) {
  const statuses = {};
  for (const { status } of samples) statuses[status] = (statuses[status] || 0) + 1;
  const byPath = new Map();
  for (const sample of samples) {
    if (sample.status < 200 || sample.status >= 300) continue;
    if (!byPath.has(sample.path)) byPath.set(sample.path, []);
    byPath.get(sample.path).push(sample.ms);
  }
  const ok = [...byPath.values()].flat().sort((a, b) => a - b);
  const latency = values => ({ count: values.length, p50: percentile(values, 50), p95: percentile(values, 95), p99: percentile(values, 99) });
  return {
    requests: samples.length,
    requestsPerSecond: Number((samples.length / durationS).toFixed(1)),
    statuses,
    okLatencyMs: latency(ok),
    paths: Object.fromEntries([...byPath].map(([path, values]) => [path, latency(values.sort((a, b) => a - b))]))
  };
}

export async function runLoad({ base, durationS, concurrency, paths, headers, fetchImpl = fetch, now = () => performance.now() }) {
  const samples = [];
  const deadline = now() + durationS * 1000;
  let next = 0;
  async function virtualUser() {
    while (now() < deadline) {
      const path = paths[next++ % paths.length];
      const started = now();
      let status = 0;
      try {
        const response = await fetchImpl(`${base}${path}`, { headers });
        status = response.status;
        await response.arrayBuffer();
      } catch { status = 0; }
      samples.push({ path, status, ms: Math.round(now() - started) });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, virtualUser));
  return samples;
}

async function main(argv) {
  const options = parseArgs(argv);
  const token = process.env.PETALPAL_TEST_ID_TOKEN;
  if (!token) throw new Error("Set PETALPAL_TEST_ID_TOKEN (read -rs PETALPAL_TEST_ID_TOKEN && export PETALPAL_TEST_ID_TOKEN).");
  const headers = { Authorization: `Bearer ${token}` };
  const session = await fetch(`${options.base}/session`, { headers });
  if (!session.ok) throw new Error(`GET /session returned ${session.status}; check the base URL and TEST identity.`);
  const userId = (await session.json())?.user?.id;
  if (typeof userId !== "string") throw new Error("GET /session did not return a user id.");
  const paths = ["/session", `/users/${encodeURIComponent(userId)}/garden`, "/api/fairy/runtime"];
  const samples = await runLoad({ ...options, paths, headers });
  const result = report(samples, options.durationS);
  // Paths carry the TEST user id; print them by template only.
  result.paths = Object.fromEntries(Object.entries(result.paths).map(([path, value]) =>
    [path.replace(encodeURIComponent(userId), ":userId"), value]));
  console.log(JSON.stringify({ base: new URL(options.base).host, durationS: options.durationS,
    concurrency: options.concurrency, ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
