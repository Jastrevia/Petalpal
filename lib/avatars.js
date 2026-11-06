// The avatar library: portraits bundled in the app as mobile/assets/avatars/<id>.webp. A User's
// avatar is one of these ids or a legacy emoji; the Fairy's Moments avatar is one of these ids or
// null for her default photo. Ownership and Fairy Bond rewards live in lib/avatar-collection.js.
//
// Three tiers, ids stable forever (renaming one would orphan ownership rows and profiles):
// - Tier 1, open from the start: the original portraits fairy-1 … fairy-8
//   (scripts/compress-avatars.mjs) and l1-01 … l1-24 (Resources/avatar/level1).
// - Tier 2, from Fairy Bond Lv 6: l2-01 … l2-16 (level2).
// - Tier 3, from Fairy Bond Lv 14: l3-01 … l3-27 (level3-1 … level3-6, three level3-1 cells left out).
// The sheet ids are cut by scripts/crop-avatar-sheets.py.
const numbered = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);

export const LEGACY_AVATAR_IDS = Object.freeze(["fairy-1", "fairy-2", "fairy-3", "fairy-4", "fairy-5", "fairy-6", "fairy-7", "fairy-8"]);
export const AVATAR_TIERS = Object.freeze([
  Object.freeze({ tier: 1, unlockLevel: 1, ids: Object.freeze([...LEGACY_AVATAR_IDS, ...numbered("l1", 24)]) }),
  Object.freeze({ tier: 2, unlockLevel: 6, ids: Object.freeze(numbered("l2", 16)) }),
  Object.freeze({ tier: 3, unlockLevel: 14, ids: Object.freeze(numbered("l3", 27)) })
]);
export const AVATAR_IDS = Object.freeze(AVATAR_TIERS.flatMap(tier => tier.ids));

const TIER_OF = new Map(AVATAR_TIERS.flatMap(tier => tier.ids.map(id => [id, tier.tier])));
export const isLibraryAvatar = value => typeof value === "string" && TIER_OF.has(value);
export const avatarTier = id => TIER_OF.get(id) ?? null;
export const avatarsOfTier = tier => AVATAR_TIERS.find(entry => entry.tier === tier)?.ids ?? [];
