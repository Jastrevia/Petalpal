import assert from "node:assert/strict";
import test from "node:test";

import { isBetaTester } from "../../lib/beta-cohort.js";
import { sessionMetadata } from "../../lib/history-metadata.js";

test("every account is a beta tester until the cohort end is set", () => {
  assert.equal(isBetaTester(new Date("2030-01-01T00:00:00Z"), {}), true);
  assert.equal(isBetaTester(new Date("2030-01-01T00:00:00Z"), { BETA_COHORT_ENDS_AT: "  " }), true);
});

test("after the cohort end only earlier accounts keep the badge; a bad value marks no one", () => {
  const env = { BETA_COHORT_ENDS_AT: "2026-12-01T08:00:00Z" };
  assert.equal(isBetaTester(new Date("2026-11-30T23:59:59Z"), env), true);
  assert.equal(isBetaTester(new Date("2026-12-01T08:00:00Z"), env), false);
  assert.equal(isBetaTester(new Date("2026-10-23T00:00:00Z"), { BETA_COHORT_ENDS_AT: "soon" }), false);
});

test("session metadata carries the badge flag and nothing about the creation time", () => {
  const metadata = sessionMetadata({ user: { id: "u1", name: "A", email: "a@example.com", avatar: "fairy-1",
    timezone: "UTC", preferredLocale: "en", betaTester: true, createdAt: new Date() }, fairyState: null, todayCheckIn: null,
    dailyGrowLimitEnabled: true });
  assert.equal(metadata.user.betaTester, true);
  assert.equal(Object.hasOwn(metadata.user, "createdAt"), false);
});
