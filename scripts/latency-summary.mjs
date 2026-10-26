// Summarizes API latency from Render log text: reads the "http_request" lines that
// lib/request-timing.js writes and prints count, p50 and p95 per route and overall.
//
// Usage: save the Render log search for "http_request" to a file, then
//   node scripts/latency-summary.mjs < render-logs.txt
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function parseTimingLines(text) {
  const rows = [];
  for (const line of String(text).split("\n")) {
    const start = line.indexOf('{"msg":"http_request"');
    if (start < 0) continue;
    try {
      const row = JSON.parse(line.slice(start, line.indexOf("}", start) + 1));
      if (typeof row.route === "string" && Number.isFinite(row.ms)) rows.push(row);
    } catch { /* not a timing line */ }
  }
  return rows;
}

// Nearest-rank percentile of sorted values.
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function summarize(rows) {
  const groups = new Map([["ALL", []]]);
  for (const row of rows) {
    const key = `${row.method} ${row.route}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.ms);
    groups.get("ALL").push(row.ms);
  }
  return [...groups].map(([route, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { route, count: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
  }).sort((a, b) => (a.route === "ALL" ? -1 : b.route === "ALL" ? 1 : b.count - a.count));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = summarize(parseTimingLines(fs.readFileSync(0, "utf8")));
  if (summary[0].count === 0) {
    console.log("No http_request lines found.");
  } else {
    console.log("route,count,p50Ms,p95Ms");
    for (const { route, count, p50, p95 } of summary) console.log(`${route},${count},${p50},${p95}`);
  }
}
