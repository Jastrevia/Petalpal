import assert from "node:assert/strict";
import test from "node:test";
import { choosePersona, PERSONAS, personaFor, personaSummary, pickFairyMemories, PERSONA_CHANGE_DAYS } from "../../lib/fairy-persona.js";

test("a fairy keeps the same persona until the owner picks one", () => {
  assert.equal(PERSONAS.length, 4);
  assert.equal(personaFor({ id: "fairy-a" }).id, personaFor({ id: "fairy-a" }).id);
  assert.equal(personaFor({ id: "fairy-a", personaId: "explorer" }).id, "explorer");
  assert.equal(personaFor({ id: "fairy-a", personaId: "nonsense" }).id, personaFor({ id: "fairy-a" }).id);
  const spread = new Set(Array.from({ length: 40 }, (_, i) => personaFor({ id: `fairy-${i}` }).id));
  assert.equal(spread.size, 4, "the four personas are all used");
});

test("memories: her own posts, same place first, short ids only", () => {
  const rows = [
    { id: "a", caption: "found a snail", topic: "TEA_TIME", postedAt: "2026-10-01T00:00:00Z" },
    { id: "b", caption: "swing went high", topic: "SWINGING", postedAt: "2026-10-05T00:00:00Z" },
    { id: "c", caption: "tea too hot", topic: "TEA_TIME", postedAt: "2026-10-03T00:00:00Z" }];
  assert.deepEqual(pickFairyMemories(rows, { topic: "TEA_TIME", limit: 2 }), [
    { id: "e1", momentId: "c", c: "tea too hot", d: "2026-10-03", p: "TEA_TIME" },
    { id: "e2", momentId: "a", c: "found a snail", d: "2026-10-01", p: "TEA_TIME" }]);
});

test("the owner chooses a persona at most once every 30 days", async () => {
  let fairy = { id: "fairy-1", personaId: null, personaChangedAt: null };
  const db = { userFairy: { findFirst: async () => fairy, updateMany: async ({ data }) => { fairy = { ...fairy, ...data }; return { count: 1 }; } } };
  const now = new Date("2026-11-18T20:00:00Z");
  const before = await personaSummary(db, "user_1", { locale: "zh-Hans", now });
  assert.equal(before.chosen, false); assert.equal(before.options.length, 4); assert.equal(before.nextChangeAt, null);
  const chosen = await choosePersona(db, "user_1", { personaId: "stargazer" }, { now });
  assert.equal(chosen.id, "stargazer"); assert.equal(chosen.chosen, true);
  assert.equal(chosen.nextChangeAt, new Date(now.getTime() + PERSONA_CHANGE_DAYS * 86_400_000).toISOString());
  await assert.rejects(choosePersona(db, "user_1", { personaId: "explorer" }, { now: new Date(now.getTime() + 86_400_000) }), { code: "PERSONA_TOO_SOON" });
  await assert.rejects(choosePersona(db, "user_1", { personaId: "pirate" }, { now }), { code: "PERSONA_INVALID" });
  assert.equal((await choosePersona(db, "user_1", { personaId: "explorer" }, { now: new Date(now.getTime() + 31 * 86_400_000) })).id, "explorer");
  const none = { userFairy: { findFirst: async () => null } };
  await assert.rejects(personaSummary(none, "user_1"), { code: "FAIRY_NOT_FOUND" });
});
