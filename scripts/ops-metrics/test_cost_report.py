"""Run: python3 -m unittest scripts/ops-metrics/test_cost_report.py (needs requirements.txt)."""
import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from cost_report import (cost_by_feature, markdown, monthly_budget, parse_budgets,  # noqa: E402
                         reconcile, with_month)

D = pd.Timestamp


def gateway_fixture():
    return with_month(pd.DataFrame({
        "date": [D("2026-10-01"), D("2026-10-31"), D("2026-10-15"), D("2026-11-01"), D("2026-11-10")],
        "action": ["EVENT_EMOTION", "EVENT_EMOTION", "WEEKLY_REPORT", "EVENT_EMOTION", "WEEKLY_REPORT"],
        "provider": ["ANTHROPIC"] * 5,
        "model": ["claude-haiku-5-5", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-5-5"],
        "calls": [10, 10, 2, 5, 1],
        "inputTokens": [9000, 9000, 12000, 4500, 6000],
        "outputTokens": [1200, 1200, 1800, 600, 900],
        "estCostUsd": [1.0, 1.0, 6.0, 0.5, 2.5],
    }))


class CostByFeatureTest(unittest.TestCase):
    def test_sums_each_feature_per_month_and_ranks_by_cost(self):
        table = cost_by_feature(gateway_fixture())
        october = table[table["month"] == "2026-10"].reset_index(drop=True)
        self.assertEqual(list(october["action"]), ["WEEKLY_REPORT", "EVENT_EMOTION"])
        self.assertEqual(october.loc[1, "calls"], 20)
        self.assertAlmostEqual(october.loc[1, "estCostUsd"], 2.0)
        self.assertAlmostEqual(october.loc[0, "shareOfMonth"], 0.75)  # 6 of 8 dollars


class MonthlyBudgetTest(unittest.TestCase):
    def test_full_month_is_not_projected_and_partial_month_is(self):
        budget = monthly_budget(gateway_fixture(), {"ANTHROPIC": 20}).set_index("month")
        october, november = budget.loc["2026-10"], budget.loc["2026-11"]
        self.assertEqual(october["daysCovered"], 31)
        self.assertAlmostEqual(october["projectedUsd"], october["estCostUsd"])
        self.assertEqual(october["status"], "OK")  # 8 of 20 dollars
        self.assertEqual(november["daysCovered"], 10)
        self.assertAlmostEqual(november["projectedUsd"], 3.0 * 30 / 10)
        self.assertEqual(november["projectedPct"], 0.45)

    def test_warns_at_eighty_percent_and_flags_over_budget(self):
        statuses = monthly_budget(gateway_fixture(), {"ANTHROPIC": 9}).set_index("month")["status"]
        self.assertEqual(statuses["2026-10"], "WARN")   # 8 of 9 dollars
        self.assertEqual(statuses["2026-11"], "WARN")   # projected 9 of 9 dollars: at the cap, not over
        tight = monthly_budget(gateway_fixture(), {"ANTHROPIC": 7}).set_index("month")["status"]
        self.assertEqual(tight["2026-10"], "OVER")      # 8 of 7 dollars
        self.assertEqual(tight["2026-11"], "OVER")      # projected 9 of 7 dollars

    def test_provider_without_budget_has_no_status(self):
        budget = monthly_budget(gateway_fixture(), {})
        self.assertTrue((budget["status"] == "NO_BUDGET").all())
        self.assertTrue(budget["usedPct"].isna().all())


class ReconcileTest(unittest.TestCase):
    def test_match_check_and_missing_rows(self):
        invoices = pd.DataFrame({"month": ["2026-10", "2026-11", "2026-09"],
                                 "provider": ["ANTHROPIC"] * 3, "billedUsd": [8.4, 4.0, 1.0]})
        table = reconcile(gateway_fixture(), invoices).set_index("month")
        self.assertEqual(table.loc["2026-10", "status"], "MATCH")   # 8.0 vs 8.4 is under 10%
        self.assertAlmostEqual(table.loc["2026-10", "varianceUsd"], 0.4)
        self.assertEqual(table.loc["2026-11", "status"], "CHECK")   # 3.0 vs 4.0 is 25%
        self.assertEqual(table.loc["2026-09", "status"], "MISSING_LOGS")

    def test_month_without_invoice(self):
        invoices = pd.DataFrame({"month": ["2026-10"], "provider": ["ANTHROPIC"], "billedUsd": [8.0]})
        table = reconcile(gateway_fixture(), invoices).set_index("month")
        self.assertEqual(table.loc["2026-11", "status"], "MISSING_INVOICE")


class ReportTest(unittest.TestCase):
    def test_markdown_lists_budget_features_and_reconciliation(self):
        gateway = gateway_fixture()
        invoices = pd.DataFrame({"month": ["2026-10"], "provider": ["ANTHROPIC"], "billedUsd": [8.0]})
        text = markdown(cost_by_feature(gateway), monthly_budget(gateway, {"ANTHROPIC": 20}),
                        reconcile(gateway, invoices), synthetic=True)
        self.assertIn("Synthetic demo data", text)
        self.assertIn("| 2026-11 | ANTHROPIC | $3.00 | $9.00 | $20.00 | 15% | OK |", text)
        self.assertIn("| WEEKLY_REPORT | claude-sonnet-5-5 |", text)
        self.assertIn("MISSING_INVOICE", text)

    def test_parse_budgets(self):
        self.assertEqual(parse_budgets(["anthropic=20", "CLOUDFLARE=5"]), {"ANTHROPIC": 20.0, "CLOUDFLARE": 5.0})
        with self.assertRaises(SystemExit):
            parse_budgets(["ANTHROPIC"])


if __name__ == "__main__":
    unittest.main()
