# PetalPal ops dashboard in Power BI

An internal dashboard of **aggregate** operations metrics: daily activity, Claude cost by model,
other AI calls, and background-job success. It never contains user ids, emails, names or anything
a user wrote. Days are **UTC** calendar days (see [time.md](../../time.md), "Ops-metrics day").

| Step | Who | Command / place | Output |
|---|---|---|---|
| 1. Export aggregates | Owner, with the database URL | `node scripts/export-ops-metrics.mjs` | `output/ops-metrics/*.csv` |
| 2. Shape for Power BI (pandas) | Anyone | `python3 scripts/ops-metrics/prepare_powerbi.py` | `output/powerbi/*.csv` |
| 3. Build the report | Anyone with Power BI | Power BI Desktop (Windows) or Power BI service | `.pbix` / published report |

`output/` is git-ignored; never commit exported CSVs.

## 1. Export (read-only)

Exporting production data needs the owner's explicit approval each time (WARNING.md §6). The script
opens a `READ ONLY` transaction, runs `GROUP BY day` queries and writes four CSVs:

| File | Columns |
|---|---|
| `daily_activity.csv` | date, newUsers, events, activeUsers, flowers |
| `ai_gateway_daily.csv` | date, action, provider, model, calls, inputTokens, outputTokens, estCostUsd |
| `ai_calls_daily.csv` | date, task, provider, calls, failures, avgLatencyMs, inputTokens, outputTokens |
| `ai_jobs_daily.csv` | date, jobType, status, jobs, avgAttempts |
| `ai_job_failures_daily.csv` | date, jobType, code, jobs — FAILED jobs by the allowlisted code stored in `lastError`; jobs that failed before codes were stored read `UNRECORDED`. Load it directly in Power BI; the pandas step does not reshape it |

`estCostUsd` = tokens × the reviewed rates in `lib/ai-gateway-config.js` (cache tokens counted as input).
It estimates provider cost; the cost gate's reserved liability (`AI_GATEWAY_USD_RESERVED`) is higher by design.

In your own terminal (not through chat), from the repository root:

```bash
read -rs DATABASE_URL && export DATABASE_URL
node scripts/export-ops-metrics.mjs
unset DATABASE_URL
```

## 2. Shape with pandas

```bash
python3 -m venv output/.venv-ops && output/.venv-ops/bin/pip install -r scripts/ops-metrics/requirements.txt
output/.venv-ops/bin/python scripts/ops-metrics/prepare_powerbi.py
```

Writes `PetalPal_Ops.xlsx` (one sheet per table, for the Power BI service) and CSVs of `Calendar`, `DailySummary` (gap days filled with 0, 7-day averages, job success rate,
cost per active user), `AiCostByModel`, `AiCalls` and `AiJobs`. `--demo --out output/powerbi-demo`
writes 60 days of **synthetic** practice data with the same columns; never quote demo figures.
Tests: `output/.venv-ops/bin/python -m unittest scripts/ops-metrics/test_prepare_powerbi.py`.

## 3. Build the report

Power BI Desktop runs only on Windows. On a Mac, use the Power BI service at app.powerbi.com with a
work or school Microsoft account (Create → Excel → upload `PetalPal_Ops.xlsx` and select every sheet), or a Windows machine.

1. Load all five CSVs. Set `date` to type **Date** in every table.
2. Model: `Calendar[date]` one-to-many to `date` in `DailySummary`, `AiCostByModel`, `AiCalls`, `AiJobs`.
   Mark `Calendar` as the date table.
3. Measures (on `DailySummary` unless noted):

```DAX
Total AI Cost (USD) = SUM ( DailySummary[aiCostUsd] )
Events = SUM ( DailySummary[events] )
Avg Daily Active Users = AVERAGE ( DailySummary[activeUsers] )
Job Success Rate = DIVIDE ( SUM ( DailySummary[jobsSucceeded] ), SUM ( DailySummary[jobsSucceeded] ) + SUM ( DailySummary[jobsFailed] ) )
Cost per Active User-Day = DIVIDE ( [Total AI Cost (USD)], SUM ( DailySummary[activeUsers] ) )
Claude Cost by Model = SUM ( AiCostByModel[estCostUsd] )
```

4. One page, top to bottom:
   - Cards: Total AI Cost, Events, Avg Daily Active Users, Job Success Rate.
   - Line chart: `Calendar[date]` × Events, with `events7dAvg`.
   - Line chart: `Calendar[date]` × `aiCost7dAvg`.
   - Stacked bar: `Calendar[monthName]` × Claude Cost by Model, legend `AiCostByModel[model]`.
   - Table: `AiJobs` jobType × status × jobs.
   - Slicer: `Calendar[monthName]`.

Refresh: rerun steps 1–2, then replace the CSVs (service) or Refresh (Desktop).
