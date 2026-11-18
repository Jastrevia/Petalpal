"""Run: python3 -m unittest scripts/ops-agent/test_ops_agent.py (needs requirements.txt; no API key, no network)."""
import json
import sys
import unittest
from pathlib import Path

import pandas as pd
from langchain_core.messages import AIMessage, ToolMessage

sys.path.insert(0, str(Path(__file__).parent))
from ops_agent import build_tools, demo_data, run_agent  # noqa: E402

D = pd.Timestamp


def data_fixture():
    return {
        "gateway": pd.DataFrame({"date": [D("2026-11-02"), D("2026-11-03")], "action": ["EVENT_EMOTION", "WEEKLY_REPORT"],
                                 "provider": ["ANTHROPIC"] * 2, "model": ["claude-haiku-5-5", "claude-sonnet-5-5"],
                                 "calls": [10, 2], "inputTokens": [9000, 12000], "outputTokens": [1200, 1800],
                                 "estCostUsd": [0.5, 1.5]}),
        "jobs": pd.DataFrame({"date": [D("2026-11-02")] * 4 + [D("2026-10-20")],
                              "jobType": ["EMBEDDING_GENERATION", "EMBEDDING_GENERATION", "WEEKLY_REPORT", "WEEKLY_REPORT",
                                          "WEEKLY_REPORT"],
                              "status": ["SUCCEEDED", "FAILED", "SUCCEEDED", "FAILED", "FAILED"],
                              "jobs": [8, 2, 3, 1, 9], "avgAttempts": [1.0, 3.0, 1.0, 3.0, 3.0]}),
        "failures": pd.DataFrame({"date": [D("2026-11-02")] * 3, "jobType": ["EMBEDDING_GENERATION", "EMBEDDING_GENERATION",
                                                                            "WEEKLY_REPORT"],
                                  "code": ["PROVIDER_TIMEOUT", "RATE_LIMITED", "PROVIDER_TIMEOUT"], "jobs": [1, 1, 1]}),
    }


def tools_by_name(data=None):
    return {t.name: t for t in build_tools(data or data_fixture())}


class FakeModel:
    """Stands in for ChatAnthropic: replays scripted replies and records what it was sent."""

    def __init__(self, replies):
        self.replies, self.seen, self.bound = list(replies), [], None

    def bind_tools(self, tools):
        self.bound = [t.name for t in tools]
        return self

    def invoke(self, messages):
        self.seen.append(list(messages))
        return self.replies.pop(0)


def call(name, args, call_id="1"):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


class ToolTest(unittest.TestCase):
    def test_job_summary_counts_window_and_rates(self):
        result = json.loads(tools_by_name()["job_summary"].invoke({"start_date": "2026-11-01", "end_date": "2026-11-07"}))
        rows = {row["jobType"]: row for row in result["jobTypes"]}
        self.assertEqual(rows["EMBEDDING_GENERATION"], {"jobType": "EMBEDDING_GENERATION", "succeeded": 8, "failed": 2,
                                                        "successRate": 0.8})
        self.assertEqual(rows["WEEKLY_REPORT"]["failed"], 1)  # the October failures are outside the window

    def test_top_failure_codes_ranks_and_clamps_limit(self):
        result = json.loads(tools_by_name()["top_failure_codes"].invoke(
            {"start_date": "2026-11-01", "end_date": "2026-11-07", "limit": 999}))
        self.assertEqual(result["totalFailed"], 3)
        self.assertEqual(result["codes"][0]["code"], "PROVIDER_TIMEOUT")
        self.assertLessEqual(len(result["codes"]), 20)

    def test_monthly_ai_cost_reports_features_and_budget(self):
        result = json.loads(tools_by_name()["monthly_ai_cost"].invoke({"month": "2026-11", "budget_usd": 20}))
        self.assertEqual(result["features"][0]["action"], "WEEKLY_REPORT")
        budget = result["budget"][0]
        self.assertAlmostEqual(budget["estCostUsd"], 2.0)
        self.assertAlmostEqual(budget["projectedUsd"], 20.0)  # $2 in 3 days, straight-lined over 30 days
        self.assertEqual(budget["status"], "WARN")
        empty = json.loads(tools_by_name()["monthly_ai_cost"].invoke({"month": "2025-01"}))
        self.assertIn("error", empty)

    def test_tarot_reading_summary_counts_statuses_and_codes(self):
        data = data_fixture()
        data["readings"] = pd.DataFrame({"date": [D("2026-11-17")] * 2 + [D("2026-10-01")], "locale": ["zh-Hans", "en", "en"],
                                         "status": ["FAILED", "READY", "READY"], "readings": [1, 2, 5],
                                         "avgAttempts": [2.0, 1.0, 1.0]})
        data["reading_failures"] = pd.DataFrame({"date": [D("2026-11-17")] * 2, "code": ["AI_GATEWAY_PROVIDER_FAILED",
                                                                                       "AI_QUOTA_EXCEEDED"],
                                                 "attempts": [2, 1]})
        result = json.loads(tools_by_name(data)["tarot_reading_summary"].invoke(
            {"start_date": "2026-11-01", "end_date": "2026-11-30"}))
        self.assertEqual(result["readingsByStatus"], {"FAILED": 1, "READY": 2})
        self.assertEqual(result["failedAttempts"], 3)
        self.assertEqual(result["codes"][0], {"code": "AI_GATEWAY_PROVIDER_FAILED", "attempts": 2})
        # An export from before the tarot files existed: empty, not an error.
        empty = json.loads(tools_by_name()["tarot_reading_summary"].invoke({"start_date": "2026-11-01", "end_date": "2026-11-30"}))
        self.assertEqual(empty["failedAttempts"], 0)

    def test_bad_dates_raise_clear_errors(self):
        with self.assertRaises(ValueError):
            tools_by_name()["job_summary"].invoke({"start_date": "last week", "end_date": "2026-11-07"})

    def test_demo_data_has_failure_codes(self):
        self.assertFalse(demo_data()["failures"].empty)


class AgentLoopTest(unittest.TestCase):
    def test_runs_requested_tool_and_returns_final_answer(self):
        model = FakeModel([call("job_summary", {"start_date": "2026-11-01", "end_date": "2026-11-07"}),
                           AIMessage(content="Embedding jobs failed 2 of 10 times.")])
        result = run_agent("Why did jobs fail?", model, build_tools(data_fixture()))
        self.assertEqual(result["answer"], "Embedding jobs failed 2 of 10 times.")
        self.assertEqual(result["steps"], [{"tool": "job_summary",
                                            "args": {"start_date": "2026-11-01", "end_date": "2026-11-07"}, "ok": True}])
        self.assertEqual(model.bound, ["data_coverage", "job_summary", "top_failure_codes", "monthly_ai_cost",
                                       "tarot_reading_summary"])
        tool_result = model.seen[1][-1]
        self.assertIsInstance(tool_result, ToolMessage)
        self.assertIn('"failed": 2', tool_result.content)

    def test_unknown_tool_and_tool_error_go_back_to_the_model(self):
        model = FakeModel([call("delete_everything", {}, "a"),
                           call("job_summary", {"start_date": "nope", "end_date": "2026-11-07"}, "b"),
                           AIMessage(content="I could not read those dates.")])
        result = run_agent("q", model, build_tools(data_fixture()))
        self.assertEqual([s["ok"] for s in result["steps"]], [False, False])
        self.assertIn("unknown tool", model.seen[1][-1].content)
        self.assertIn("start_date must be a date", model.seen[2][-1].content)
        self.assertEqual(result["answer"], "I could not read those dates.")

    def test_stops_after_max_steps(self):
        model = FakeModel([call("data_coverage", {}, str(i)) for i in range(3)])
        result = run_agent("q", model, build_tools(data_fixture()), max_steps=3)
        self.assertIn("Stopped after 3 steps", result["answer"])
        self.assertEqual(len(result["steps"]), 3)


if __name__ == "__main__":
    unittest.main()
