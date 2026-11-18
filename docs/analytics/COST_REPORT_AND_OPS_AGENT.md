# AI cost report and ops agent

Two internal tools that read the same **aggregate** CSVs as the Power BI dashboard
([POWER_BI.md](POWER_BI.md), step 1). Neither touches the database, user data or any secret except
the ops agent's own `ANTHROPIC_API_KEY`. Days are UTC calendar days.

| Tool | What it answers | Cost |
|---|---|---|
| `scripts/ops-metrics/cost_report.py` | What did AI cost per feature each month, are we inside the budget, and does it match the provider's bill? | None, pandas only |
| `scripts/ops-agent/ops_agent.py` | Plain-language questions such as "why did AI jobs fail last week?", answered by a LangChain agent that can only call five read-only tools | A few Haiku calls per question |

## Cost report

```bash
output/.venv-ops/bin/python scripts/ops-metrics/cost_report.py \
  --in output/ops-metrics --out output/cost-report \
  --budget ANTHROPIC=20 --invoices output/invoices.csv
```

- **CostByFeature.csv**: spend per month, provider, gateway action (feature) and model, with each
  row's share of the month.
- **MonthlyBudget.csv**: spend per month and provider against `--budget PROVIDER=USD` (default
  `ANTHROPIC=20`, the owner's cap). A month whose data stops early gets a straight-line month-end
  projection. Status is `OK`, `WARN` (spent or projected ≥ 80%) or `OVER` (> 100%).
- **Reconciliation.csv**, only with `--invoices`: logged `estCostUsd` against what each provider
  billed. `MATCH` within `--tolerance` (default 10%), otherwise `CHECK`; `MISSING_INVOICE` or
  `MISSING_LOGS` when one side has no row. The invoices file is typed in by the owner from each
  billing page: `month,provider,billedUsd`, e.g. `2026-10,ANTHROPIC,4.12`. Keep it in `output/`.
- **cost_report.md**: the same three tables as a short readable report.

`estCostUsd` is an estimate from token counts and the reviewed rates in `lib/ai-gateway-config.js`,
so a small variance against the bill is expected; a `CHECK` row means the rates or the logging need a
look. `--demo` uses the synthetic Power BI practice data; never quote demo figures.

## Ops agent

```bash
python3 -m venv output/.venv-agent && output/.venv-agent/bin/pip install -r scripts/ops-agent/requirements.txt
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
output/.venv-agent/bin/python scripts/ops-agent/ops_agent.py --in output/ops-metrics \
  --question "Why did AI jobs fail last week, and are we on budget this month?"
unset ANTHROPIC_API_KEY
```

The agent is a LangChain tool-calling loop on `claude-haiku-5-5` (change with `--model`). It sees
only these tools, all read-only over the exported aggregates:

| Tool | Returns |
|---|---|
| `data_coverage` | first and last date and row count of each dataset |
| `job_summary(start_date, end_date)` | succeeded, failed and success rate per job type |
| `top_failure_codes(start_date, end_date, limit)` | the most common allowlisted failure codes, at most 20 rows |
| `monthly_ai_cost(month, budget_usd)` | top features and the budget status with projection, from the cost report |
| `tarot_reading_summary(start_date, end_date)` | daily tarot readings by status and failed attempts by code |

Daily tarot readings are not AI jobs, so they have their own export files:
`petal_readings_daily.csv` (readings per day, locale and status, from `PetalCardReading`) and
`petal_reading_failures_daily.csv` (failed attempts per day and code). Each failed attempt writes one
`PETAL_READING_FAILED` audit row with only its allowlisted code (`lib/petal-reading.js`), with no
user, draw or card id. Failures from before this change have no row. A failure with no gateway usage
row on the same day failed before the provider answered (HTTP error, timeout or a rejected response
shape); `AI_GATEWAY_GROUNDING_FAILED` means the answer arrived but failed the reading's own checks.

Guardrails: the system prompt treats tool results as data, not instructions; an unknown tool name or a
bad argument goes back to the model as an error result instead of running anything; every result is
capped at 20 rows; the loop stops after 6 model turns (`--max-steps`). The script prints which tools
ran, then the answer. It checks that the key is set but never prints it.

Each question is a paid call, so run it only when the owner has approved paid inference for that use
(CLAUDE.md). `--demo` still calls the model, on synthetic data.

## Tests

No network and no API key: the agent tests replace the model with a scripted fake.

```bash
output/.venv-agent/bin/python -m unittest scripts/ops-agent/test_ops_agent.py \
  scripts/ops-metrics/test_cost_report.py scripts/ops-metrics/test_prepare_powerbi.py
```
