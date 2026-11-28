import assert from "node:assert/strict";
import test from "node:test";
import { SILKTAIL_EVERY_DAYS, silktailFor, silktailMilestone } from "../../lib/silktail.js";

const days = (n, from = "2026-11-01") => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i * 2); return d.toISOString().slice(0, 10);
});

test("the fox comes on the day the 14th distinct Event day is reached, then counting starts over", () => {
  assert.equal(SILKTAIL_EVERY_DAYS, 14);
  const thirteen = days(13);
  assert.deepEqual(silktailMilestone(thirteen, "2026-11-30"), { eventDays: 13, nextIn: 1, milestone: null, milestoneDate: null, today: "2026-11-30", visiting: false });
  // The 14th day is written today: the fox visits all of today.
  const fourteen = [...thirteen, "2026-11-30"];
  const reached = silktailMilestone(fourteen, "2026-11-30");
  assert.equal(reached.visiting, true); assert.equal(reached.milestoneDate, "2026-11-30"); assert.equal(reached.milestone, 14); assert.equal(reached.nextIn, 14);
  // The next day it has gone; a 15th day starts the next count of 14.
  assert.equal(silktailMilestone(fourteen, "2026-12-01").visiting, false);
  const fifteen = silktailMilestone([...fourteen, "2026-12-01"], "2026-12-01");
  assert.equal(fifteen.visiting, false); assert.equal(fifteen.nextIn, 13); assert.equal(fifteen.milestoneDate, "2026-11-30");
  // Day 28 brings it back.
  const twentyEight = days(28);
  const again = silktailMilestone(twentyEight, twentyEight[27]);
  assert.equal(again.visiting, true); assert.equal(again.milestone, 28);
});

test("several Events on one day count once; order does not matter", () => {
  const list = days(14);
  const doubled = [...list, ...list].reverse();
  assert.deepEqual(silktailMilestone(doubled, list[13]), silktailMilestone(list, list[13]));
  assert.equal(silktailMilestone(doubled, list[13]).eventDays, 14);
});

test("silktailFor reads only the owner's distinct Event dates in the account timezone", async () => {
  const calls = [];
  const prisma = {
    user: { findUnique: async args => { calls.push(["user", args]); return { timezone: "Asia/Shanghai" }; } },
    event: { findMany: async args => { calls.push(["event", args]); return days(14, "2026-10-01").map(localDate => ({ localDate })); } }
  };
  // 2026-10-27 18:30 UTC is already 10-28 in Shanghai: the 14th day (10-27) is yesterday there.
  const state = await silktailFor(prisma, "user_1", new Date("2026-10-27T18:30:00Z"));
  assert.equal(state.today, "2026-10-28"); assert.equal(state.visiting, false);
  const sameDay = await silktailFor(prisma, "user_1", new Date("2026-10-27T10:00:00Z"));
  assert.equal(sameDay.today, "2026-10-27"); assert.equal(sameDay.visiting, true);
  const eventQuery = calls.find(([kind]) => kind === "event")[1];
  assert.deepEqual(eventQuery.where, { ownerId: "user_1" });
  assert.deepEqual(eventQuery.select, { localDate: true });
  assert.deepEqual(eventQuery.distinct, ["localDate"]);
  assert.equal(await silktailFor({ user: { findUnique: async () => null } }, "nobody"), null);
});
