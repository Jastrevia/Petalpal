// Per-owner opt-in to the short Weekly report. AI_WEEKLY_SHORT_OWNER_IDS lists the owner
// ids (comma-separated) who get `weekly-short-v1`, or "*" alone for every owner (the beta,
// behind Cloudflare Access); everyone else keeps the configured
// AI_WEEKLY_REFLECTION_CONTRACT and its flags. Unset or empty: nobody. A malformed list
// fails closed. No dependencies, so report-foundation and sonnet-weekly can both use it.
export const WEEKLY_SHORT_CONTRACT = "weekly-short-v1";
const MAX_OWNERS = 100;
const EVERYONE = "*";

export function weeklyShortOwners(env = process.env) {
  // Spaces and line breaks around the value or the ids are ignored (dashboard paste).
  const raw = typeof env.AI_WEEKLY_SHORT_OWNER_IDS === "string" ? env.AI_WEEKLY_SHORT_OWNER_IDS.trim() : env.AI_WEEKLY_SHORT_OWNER_IDS;
  if (raw === undefined || raw === "") return new Set();
  if (raw === EVERYONE) return new Set([EVERYONE]); // never a valid id, so no collision
  const ids = typeof raw === "string" ? raw.split(",").map(id => id.trim()) : [];
  if (!ids.length || ids.length > MAX_OWNERS || ids.some(id => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) {
    throw Object.assign(new Error("Weekly short-report owner list is invalid"), { code: "AI_GATEWAY_CONFIG_INVALID" });
  }
  return new Set(ids);
}

// The contract one owner's Weekly report uses, given the configured one.
export function weeklyContractFor(env, ownerId, configured) {
  const owners = weeklyShortOwners(env);
  return owners.has(EVERYONE) || owners.has(ownerId) ? WEEKLY_SHORT_CONTRACT : configured;
}

// Weekly insights (docs/product/WEEKLY_INSIGHTS_V1.md) for owners listed in
// WEEKLY_INSIGHTS_OWNER_IDS (comma-separated ids, or "*" alone), on top of the short report.
// Unset, empty or malformed: nobody, and the short report is unchanged.
export function weeklyInsightsEnabledFor(env, ownerId) {
  const raw = typeof env?.WEEKLY_INSIGHTS_OWNER_IDS === "string" ? env.WEEKLY_INSIGHTS_OWNER_IDS.trim() : "";
  if (!raw || typeof ownerId !== "string" || !ownerId) return false;
  if (raw === EVERYONE) return true;
  const ids = raw.split(",").map(id => id.trim());
  if (ids.length > MAX_OWNERS || ids.some(id => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) return false;
  return ids.includes(ownerId);
}
