// Read-only export of aggregate operations metrics for the Power BI dashboard
// (docs/analytics/POWER_BI.md). Every query groups by UTC calendar day and returns
// counts and totals only: no ids, emails, names or user-written text leave the database.
//
// Usage (the operator supplies the connection; the script never prints it):
//   read -rs DATABASE_URL && export DATABASE_URL
//   node scripts/export-ops-metrics.mjs [--out output/ops-metrics]
//   unset DATABASE_URL
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GATEWAY_MODELS } from "../lib/ai-gateway-config.js";

const day = column => `to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;

export const QUERIES = {
  newUsers: `SELECT ${day('"createdAt"')} AS "date", count(*)::int AS "newUsers" FROM "User" GROUP BY 1`,
  events: `SELECT ${day('"occurredAt"')} AS "date", count(*)::int AS "events", count(DISTINCT "ownerId")::int AS "activeUsers"
    FROM "Event" GROUP BY 1`,
  flowers: `SELECT ${day('"createdAt"')} AS "date", count(*)::int AS "flowers" FROM "Flower" GROUP BY 1`,
  // One row per Claude call through the AI Gateway (lib/ai-cost-gate.js recordGatewayUsage):
  // actionCode = task, targetClass = provider, targetSafeId = model, reasonCode = "input:output:cached" tokens.
  gatewayUsage: `SELECT ${day('"createdAt"')} AS "date", "actionCode" AS "action", "targetClass" AS "provider",
    "targetSafeId" AS "model", "reasonCode" AS "tokens" FROM "AuditEvent" WHERE "eventType" = 'AI_GATEWAY_USAGE'`,
  // Cloudflare Workers AI and other direct inference calls.
  aiCalls: `SELECT ${day('"createdAt"')} AS "date", "task", "provider", count(*)::int AS "calls",
    count(*) FILTER (WHERE NOT "success")::int AS "failures", round(avg("latencyMs"))::int AS "avgLatencyMs",
    coalesce(sum("inputTokens"), 0)::int AS "inputTokens", coalesce(sum("outputTokens"), 0)::int AS "outputTokens"
    FROM "AiInteractionMetadata" GROUP BY 1, 2, 3`,
  aiJobs: `SELECT ${day('"createdAt"')} AS "date", "jobType"::text AS "jobType", "status"::text AS "status",
    count(*)::int AS "jobs", round(avg("attemptCount")::numeric, 2)::float AS "avgAttempts"
    FROM "AIJob" GROUP BY 1, 2, 3`,
  // Failed jobs by the allowlisted code the worker stores in lastError ("AI job failed: CODE").
  // Only codes matching [A-Z0-9_] leave the database; rows from before codes were stored read UNRECORDED.
  aiJobFailures: `SELECT ${day('"createdAt"')} AS "date", "jobType"::text AS "jobType",
    coalesce(substring("lastError" from '^AI job failed: ([A-Z0-9_]+)$'), 'UNRECORDED') AS "code", count(*)::int AS "jobs"
    FROM "AIJob" WHERE "status"::text = 'FAILED' GROUP BY 1, 2, 3`
};

const byDate = (a, b) => a.date.localeCompare(b.date);
const keyed = rows => [...rows].sort((a, b) => Object.values(a).join("|").localeCompare(Object.values(b).join("|")));

// Claude calls → tokens and estimated USD at the reviewed gateway rates (nano-USD per token).
export function gatewayDaily(rows) {
  const groups = new Map();
  for (const row of rows) {
    const [input, output] = String(row.tokens ?? "").split(":").map(Number);
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output)) continue;
    const key = [row.date, row.action, row.provider, row.model].join("|");
    const group = groups.get(key) ?? { date: row.date, action: row.action, provider: row.provider, model: row.model,
      calls: 0, inputTokens: 0, outputTokens: 0, nanoUsd: 0 };
    const rate = GATEWAY_MODELS[row.model];
    group.calls++; group.inputTokens += input; group.outputTokens += output;
    group.nanoUsd += rate ? input * rate.inputRate + output * rate.outputRate : 0;
    groups.set(key, group);
  }
  return keyed([...groups.values()].map(({ nanoUsd, ...group }) => ({ ...group, estCostUsd: Number((nanoUsd / 1e9).toFixed(6)) })));
}

export function dailyActivity({ newUsers, events, flowers }) {
  const days = new Map();
  const add = (rows, fields) => { for (const row of rows) {
    const entry = days.get(row.date) ?? { date: row.date, newUsers: 0, events: 0, activeUsers: 0, flowers: 0 };
    for (const field of fields) entry[field] = Number(row[field]);
    days.set(row.date, entry);
  } };
  add(newUsers, ["newUsers"]); add(events, ["events", "activeUsers"]); add(flowers, ["flowers"]);
  return [...days.values()].sort(byDate);
}

const cell = value => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export function toCsv(rows, columns) {
  return [columns.join(","), ...rows.map(row => columns.map(column => cell(row[column])).join(","))].join("\n") + "\n";
}

export const FILES = {
  "daily_activity.csv": ["date", "newUsers", "events", "activeUsers", "flowers"],
  "ai_gateway_daily.csv": ["date", "action", "provider", "model", "calls", "inputTokens", "outputTokens", "estCostUsd"],
  "ai_calls_daily.csv": ["date", "task", "provider", "calls", "failures", "avgLatencyMs", "inputTokens", "outputTokens"],
  "ai_jobs_daily.csv": ["date", "jobType", "status", "jobs", "avgAttempts"],
  "ai_job_failures_daily.csv": ["date", "jobType", "code", "jobs"]
};

// query(sql) → rows. Returns { fileName: csvText }.
export async function exportOpsMetrics(query) {
  const rows = {};
  for (const [name, sql] of Object.entries(QUERIES)) rows[name] = await query(sql);
  const tables = {
    "daily_activity.csv": dailyActivity(rows),
    "ai_gateway_daily.csv": gatewayDaily(rows.gatewayUsage),
    "ai_calls_daily.csv": keyed(rows.aiCalls),
    "ai_jobs_daily.csv": keyed(rows.aiJobs),
    "ai_job_failures_daily.csv": keyed(rows.aiJobFailures)
  };
  return Object.fromEntries(Object.entries(tables).map(([file, table]) => [file, toCsv(table, FILES[file])]));
}

async function main(argv) {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first (read -rs DATABASE_URL && export DATABASE_URL).");
  const flag = argv.indexOf("--out");
  const out = path.resolve(flag >= 0 ? argv[flag + 1] : "output/ops-metrics");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const files = await exportOpsMetrics(async sql => (await client.query(sql)).rows);
    await client.query("COMMIT");
    fs.mkdirSync(out, { recursive: true });
    for (const [file, csv] of Object.entries(files)) {
      fs.writeFileSync(path.join(out, file), csv);
      console.log(`${file}: ${csv.trimEnd().split("\n").length - 1} rows`);
    }
    console.log(`Wrote aggregate CSVs to ${path.relative(process.cwd(), out)}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Connection errors can echo the URL; print only a generic line.
  main(process.argv.slice(2)).catch(error => {
    console.error(/DATABASE_URL/.test(error.message) ? error.message : "Export failed (details withheld so no connection string is printed).");
    process.exitCode = 1;
  });
}
