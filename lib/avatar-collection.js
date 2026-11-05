// The avatar collection: which library avatars (lib/avatars.js) an account owns, the one-time
// welcome gift and the Fairy Bond level-up rewards.
//
// - Welcome: a new account chooses one Tier 1 avatar and is given three more Tier 1 avatars at
//   random (never the chosen one). Once per account: User.avatarWelcomeAt marks it done.
// - Level-up: every Fairy Bond level reached from 2 to 20 is one reward, chosen by the owner:
//   Lv 2–5 any unowned Tier 1 avatar, Lv 6–13 Tier 1–2, Lv 14–20 Tier 1–3. The level comes from
//   the closeness ledger (lib/fairy-closeness.js), never from the client. A reward is pending
//   until a row with its `rewardLevel` exists; the unique (userId, rewardLevel) and
//   (userId, avatarId) keys make every grant happen once, whatever retries or races do.
// - Claiming or receiving avatars never changes the equipped one (User.avatar).
// Every write runs under a per-owner advisory lock.
import { randomInt } from "node:crypto";
import { AVATAR_IDS, AVATAR_TIERS, avatarTier, avatarsOfTier } from "./avatars.js";
import { MAX_LEVEL, closenessLevel, fairyClosenessEnabledFor } from "./fairy-closeness.js";

export const WELCOME_GIFTS = 3;
export const FIRST_REWARD_LEVEL = 2;
// The highest tier a reward for reaching `level` may choose from.
export const rewardTier = level => (level >= 14 ? 3 : level >= 6 ? 2 : 1);

export class AvatarError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}

async function lockOwner(tx, userId) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`avatar-collection:${userId}`}))::text AS "locked"`;
}

// The Fairy Bond level, or null while the closeness switch leaves the owner out (no rewards then).
async function bondLevel(tx, userId, env) {
  if (!fairyClosenessEnabledFor(userId, env)) return null;
  const sum = await tx.fairyClosenessAward.aggregate({ where: { userId }, _sum: { points: true } });
  return closenessLevel(sum._sum.points || 0).level;
}

const ownedRows = (tx, userId) => tx.avatarOwnership.findMany({
  where: { userId }, orderBy: { createdAt: "asc" }, select: { avatarId: true, source: true, rewardLevel: true, createdAt: true }
});

function pendingRewards(level, rows) {
  if (!level) return [];
  const owned = new Set(rows.map(row => row.avatarId));
  const claimed = new Set(rows.filter(row => row.rewardLevel !== null).map(row => row.rewardLevel));
  const pending = [];
  for (let reached = FIRST_REWARD_LEVEL; reached <= Math.min(level, MAX_LEVEL); reached += 1) {
    if (claimed.has(reached)) continue;
    const tier = rewardTier(reached);
    const eligible = AVATAR_IDS.filter(id => avatarTier(id) <= tier && !owned.has(id)).length;
    pending.push({ level: reached, tier, eligible });
  }
  return pending;
}

function present(user, rows, level) {
  const pending = pendingRewards(level, rows);
  return {
    equipped: user.avatar,
    bondOn: level !== null, level,
    tiers: AVATAR_TIERS.map(({ tier, unlockLevel, ids }) => ({ tier, unlockLevel, total: ids.length, unlocked: level !== null && level >= unlockLevel })),
    owned: rows.map(row => row.avatarId).filter(id => avatarTier(id) !== null),
    total: AVATAR_IDS.length,
    welcome: {
      needed: !user.avatarWelcomeAt,
      selected: rows.find(row => row.source === "WELCOME_CHOICE")?.avatarId ?? null,
      gifted: rows.filter(row => row.source === "WELCOME_GIFT").map(row => row.avatarId)
    },
    // One entry per level reached and not yet claimed, lowest first. `eligible` 0: every avatar
    // that reward may choose is already owned; it stays listed but never blocks anything.
    pending,
    ready: pending.filter(reward => reward.eligible > 0).length,
    nextRewardLevel: level !== null && level < MAX_LEVEL ? level + 1 : null,
    claims: rows.filter(row => row.rewardLevel !== null)
      .map(row => ({ level: row.rewardLevel, avatar: row.avatarId, claimedAt: row.createdAt }))
      .sort((a, b) => a.level - b.level)
  };
}

async function loadUser(tx, userId) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { avatar: true, avatarWelcomeAt: true } });
  if (!user) throw new AvatarError("NOT_FOUND", 404, "Account not found");
  return user;
}

export async function avatarCollection(prisma, { userId, env = process.env }) {
  return prisma.$transaction(async tx => {
    const user = await loadUser(tx, userId);
    return present(user, await ownedRows(tx, userId), await bondLevel(tx, userId, env));
  });
}

// The welcome gift: `avatar` (Tier 1) is owned and equipped, three other Tier 1 avatars are owned.
// A repeat returns the first result unchanged (created: false).
export async function grantWelcomeAvatars(prisma, { userId, avatar, env = process.env, pick = randomInt, now = new Date() }) {
  if (avatarTier(avatar) !== 1) throw new AvatarError("NOT_ELIGIBLE", 400, "Choose a Level 1 avatar to begin");
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const user = await loadUser(tx, userId);
    let rows = await ownedRows(tx, userId);
    if (user.avatarWelcomeAt) return { created: false, ...present(user, rows, await bondLevel(tx, userId, env)) };
    const owned = new Set(rows.map(row => row.avatarId));
    const pool = avatarsOfTier(1).filter(id => id !== avatar && !owned.has(id));
    const gifts = [];
    while (gifts.length < WELCOME_GIFTS && pool.length) gifts.push(pool.splice(pick(pool.length), 1)[0]);
    const data = [{ avatarId: avatar, source: "WELCOME_CHOICE" }, ...gifts.map(avatarId => ({ avatarId, source: "WELCOME_GIFT" }))]
      .filter(row => !owned.has(row.avatarId)).map(row => ({ userId, ...row, createdAt: now }));
    await tx.avatarOwnership.createMany({ data, skipDuplicates: true });
    // The guard keeps a second writer that slipped past the lock from equipping twice.
    const marked = await tx.user.updateMany({ where: { id: userId, avatarWelcomeAt: null }, data: { avatar, avatarWelcomeAt: now } });
    if (marked.count !== 1) throw new AvatarError("CONFLICT", 409, "The welcome gift was already given");
    rows = await ownedRows(tx, userId);
    return { created: true, ...present({ avatar, avatarWelcomeAt: now }, rows, await bondLevel(tx, userId, env)) };
  });
}

// Claims the reward for reaching `level` with `avatar`. A retry of the same claim returns
// created: false; anything else that does not fit is refused.
export async function claimLevelAvatar(prisma, { userId, level, avatar, env = process.env, now = new Date() }) {
  if (!Number.isInteger(level) || level < FIRST_REWARD_LEVEL || level > MAX_LEVEL) throw new AvatarError("INVALID_LEVEL", 400, "Unknown reward level");
  if (avatarTier(avatar) === null) throw new AvatarError("UNKNOWN_AVATAR", 400, "Unknown avatar");
  return prisma.$transaction(async tx => {
    await lockOwner(tx, userId);
    const user = await loadUser(tx, userId);
    const reached = await bondLevel(tx, userId, env);
    if (reached === null) throw new AvatarError("NOT_FOUND", 404, "Not found");
    let rows = await ownedRows(tx, userId);
    const earlier = rows.find(row => row.rewardLevel === level);
    if (earlier) {
      if (earlier.avatarId === avatar) return { created: false, avatar, level, ...present(user, rows, reached) };
      throw new AvatarError("ALREADY_CLAIMED", 409, "This reward was already claimed");
    }
    if (level > reached) throw new AvatarError("NOT_EARNED", 403, "Reach this Fairy Bond level first");
    if (avatarTier(avatar) > rewardTier(level)) throw new AvatarError("NOT_ELIGIBLE", 403, "This avatar opens at a higher Fairy Bond level");
    if (rows.some(row => row.avatarId === avatar)) throw new AvatarError("OWNED", 409, "You already have this avatar");
    await tx.avatarOwnership.create({ data: { userId, avatarId: avatar, source: "LEVEL", rewardLevel: level, createdAt: now } });
    rows = await ownedRows(tx, userId);
    return { created: true, avatar, level, ...present(user, rows, reached) };
  });
}

export async function ownsAvatar(db, { userId, avatar }) {
  return Boolean(await db.avatarOwnership.findUnique({ where: { userId_avatarId: { userId, avatarId: avatar } }, select: { avatarId: true } }));
}
