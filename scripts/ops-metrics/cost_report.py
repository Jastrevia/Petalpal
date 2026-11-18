"""Monthly AI cost report: spend by feature, budget check and invoice reconciliation.

Input:  the aggregate CSVs from scripts/export-ops-metrics.mjs (UTC calendar days, no user data).
        Only ai_gateway_daily.csv is required.
        Optional --invoices CSV with columns month,provider,billedUsd, typed in by the owner
        from each provider's billing page (e.g. 2026-10,ANTHROPIC,4.12).
Output: CostByFeature.csv, MonthlyBudget.csv, Reconciliation.csv and cost_report.md.

Usage:
  python3 scripts/ops-metrics/cost_report.py --in output/ops-metrics --out output/cost-report \
      --budget ANTHROPIC=20 --invoices output/invoices.csv
  python3 scripts/ops-metrics/cost_report.py --demo --out output/cost-report-demo   # synthetic data
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

GATEWAY = "ai_gateway_daily.csv"
WARN_AT = 0.8            # budget share that turns a month to WARN
DEFAULT_TOLERANCE = 0.10  # invoice variance that still counts as MATCH


def load_gateway(folder):
    frame = pd.read_csv(Path(folder) / GATEWAY, parse_dates=["date"])
    return with_month(frame)


def with_month(frame):
    frame = frame.copy()
    # An export with no rows reads the date column as text; coerce it so empty input stays empty.
    frame["date"] = pd.to_datetime(frame["date"])
    frame["month"] = frame["date"].dt.strftime("%Y-%m")
    return frame


def cost_by_feature(gateway):
    """Spend per month, feature (gateway action) and model, with each row's share of that month."""
    sums = ["calls", "inputTokens", "outputTokens", "estCostUsd"]
    table = gateway.groupby(["month", "provider", "action", "model"], as_index=False)[sums].sum()
    month_total = table.groupby("month")["estCostUsd"].transform("sum")
    table["shareOfMonth"] = (table["estCostUsd"] / month_total.replace(0, np.nan)).round(4)
    table["estCostUsd"] = table["estCostUsd"].round(6)
    return table.sort_values(["month", "estCostUsd"], ascending=[True, False]).reset_index(drop=True)


def monthly_budget(gateway, budgets):
    """Spend per month and provider against its budget, with a straight-line month-end projection.

    A month whose data stops before its last day is partial: the projection scales the spend so far
    by days in month / days covered. Providers without a budget get no status.
    """
    rows = []
    for (month, provider), frame in gateway.groupby(["month", "provider"]):
        spent = float(frame["estCostUsd"].sum())
        first_day = pd.Period(month, freq="M").start_time
        days_in_month = pd.Period(month, freq="M").days_in_month
        days_covered = (frame["date"].max() - first_day).days + 1
        projected = spent * days_in_month / days_covered
        budget = budgets.get(provider)
        row = {"month": month, "provider": provider, "estCostUsd": round(spent, 6),
               "daysCovered": days_covered, "daysInMonth": days_in_month,
               "projectedUsd": round(projected, 6), "budgetUsd": budget, "usedPct": None,
               "projectedPct": None, "status": "NO_BUDGET"}
        if budget:
            row["usedPct"] = round(spent / budget, 4)
            row["projectedPct"] = round(projected / budget, 4)
            worst = max(row["usedPct"], row["projectedPct"])
            row["status"] = "OVER" if worst > 1 else "WARN" if worst >= WARN_AT else "OK"
        rows.append(row)
    return pd.DataFrame(rows, columns=["month", "provider", "estCostUsd", "daysCovered", "daysInMonth",
                                       "projectedUsd", "budgetUsd", "usedPct", "projectedPct", "status"])


def reconcile(gateway, invoices, tolerance=DEFAULT_TOLERANCE):
    """Compare logged spend with what each provider billed, per month.

    MATCH: within tolerance. CHECK: outside it. MISSING_INVOICE / MISSING_LOGS: one side has no row.
    """
    logged = gateway.groupby(["month", "provider"], as_index=False)["estCostUsd"].sum()
    billed = invoices.groupby(["month", "provider"], as_index=False)["billedUsd"].sum()
    table = logged.merge(billed, on=["month", "provider"], how="outer")
    table["varianceUsd"] = (table["billedUsd"] - table["estCostUsd"]).round(6)
    table["variancePct"] = (table["varianceUsd"] / table["billedUsd"].replace(0, np.nan)).round(4)

    def status(row):
        if pd.isna(row["billedUsd"]):
            return "MISSING_INVOICE"
        if pd.isna(row["estCostUsd"]):
            return "MISSING_LOGS"
        if row["billedUsd"] == 0:
            return "MATCH" if row["estCostUsd"] == 0 else "CHECK"
        return "MATCH" if abs(row["variancePct"]) <= tolerance else "CHECK"

    table["status"] = table.apply(status, axis=1)
    table["estCostUsd"] = table["estCostUsd"].round(6)
    return table.sort_values(["month", "provider"]).reset_index(drop=True)


def markdown(features, budget, reconciliation, synthetic=False):
    def money(value):
        return "n/a" if value is None or pd.isna(value) else f"${value:,.2f}"

    def pct(value):
        return "n/a" if value is None or pd.isna(value) else f"{value:.0%}"

    lines = ["# AI cost report", ""]
    if synthetic:
        lines += ["**Synthetic demo data. Never use these figures as real costs.**", ""]
    lines += ["## Budget by month", "", "| Month | Provider | Spent | Projected | Budget | Used | Status |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for row in budget.itertuples():
        lines.append(f"| {row.month} | {row.provider} | {money(row.estCostUsd)} | {money(row.projectedUsd)} | "
                     f"{money(row.budgetUsd)} | {pct(row.usedPct)} | {row.status} |")
    lines += ["", "## Top features in the latest month", "", "| Feature | Model | Calls | Spent | Share |",
              "| --- | --- | --- | --- | --- |"]
    if not features.empty:
        latest = features[features["month"] == features["month"].max()].head(5)
        for row in latest.itertuples():
            lines.append(f"| {row.action} | {row.model} | {row.calls} | {money(row.estCostUsd)} | {pct(row.shareOfMonth)} |")
    if reconciliation is not None:
        lines += ["", "## Invoice reconciliation", "", "| Month | Provider | Logged | Billed | Variance | Status |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for row in reconciliation.itertuples():
            lines.append(f"| {row.month} | {row.provider} | {money(row.estCostUsd)} | {money(row.billedUsd)} | "
                         f"{money(row.varianceUsd)} | {row.status} |")
    return "\n".join(lines) + "\n"


def parse_budgets(values):
    budgets = {}
    for value in values or []:
        provider, _, amount = value.partition("=")
        if not provider or not amount:
            raise SystemExit(f"--budget expects PROVIDER=USD, got {value!r}")
        budgets[provider.strip().upper()] = float(amount)
    return budgets


def demo_gateway():
    from prepare_powerbi import demo  # synthetic practice data with the export's columns
    return with_month(demo()["gateway"])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--in", dest="source", default="output/ops-metrics")
    parser.add_argument("--out", default="output/cost-report")
    parser.add_argument("--budget", action="append", help="PROVIDER=USD per month, e.g. ANTHROPIC=20 (repeatable)")
    parser.add_argument("--invoices", help="CSV with month,provider,billedUsd")
    parser.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE)
    parser.add_argument("--demo", action="store_true", help="use synthetic practice data instead of --in")
    args = parser.parse_args()

    gateway = demo_gateway() if args.demo else load_gateway(args.source)
    if gateway.empty:
        raise SystemExit("ai_gateway_daily.csv has no rows: this database logged no Claude gateway usage, "
                         "so there is no cost to report. Check which database you exported.")
    budgets = parse_budgets(args.budget or ["ANTHROPIC=20"])
    features = cost_by_feature(gateway)
    budget = monthly_budget(gateway, budgets)
    reconciliation = None
    if args.invoices:
        invoices = pd.read_csv(args.invoices, dtype={"month": str})
        invoices["provider"] = invoices["provider"].str.upper()
        reconciliation = reconcile(gateway, invoices, args.tolerance)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    features.to_csv(out / "CostByFeature.csv", index=False, float_format="%.6f")
    budget.to_csv(out / "MonthlyBudget.csv", index=False, float_format="%.6f")
    if reconciliation is not None:
        reconciliation.to_csv(out / "Reconciliation.csv", index=False, float_format="%.6f")
    (out / "cost_report.md").write_text(markdown(features, budget, reconciliation, synthetic=args.demo))
    print(f"Wrote cost report to {out}" + (" (SYNTHETIC demo data)" if args.demo else ""))


if __name__ == "__main__":
    main()
