// Redemption codes (Me → Redeem a code): each code is 20 Crockford base-32 characters (100
// random bits), shown as XXXXX-XXXXX-XXXXX-XXXXX. Only their SHA-256 hashes are in the
// repository (lib/redeem-code-hashes.js). A code works once, ever; an account redeems at most
// one code per batch. The claim keeps its code spent even after the account is deleted.
// Rewards are recorded as "pending" and granted later, once the reward itself is built.
import { createHash } from "node:crypto";
import { BETA_GIFT_2026_10 } from "./redeem-code-hashes.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 20;

export const REDEEM_BATCHES = Object.freeze([
  Object.freeze({ id: "beta-gift-2026-10", reward: "beta-gift", hashes: BETA_GIFT_2026_10 })
]);

// Typed codes are forgiving: any case, spaces or dashes, O for 0 and I or L for 1.
export function normalizeRedeemCode(input) {
  if (typeof input !== "string" || input.length > 64) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (code.length !== CODE_LENGTH || [...code].some(char => !ALPHABET.includes(char))) return null;
  return code;
}

export const hashRedeemCode = code => createHash("sha256").update(code).digest("hex");

function batchIndex(batches) {
  const index = new Map();
  for (const batch of batches) for (const hash of batch.hashes) index.set(hash, batch);
  return index;
}
const BATCH_BY_HASH = batchIndex(REDEEM_BATCHES);

export class RedeemError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}

const present = row => ({ batch: row.batch, reward: row.reward, status: row.rewardStatus, redeemedAt: row.createdAt });

// Redeems `code` for `userId`. Throws RedeemError: INVALID_CODE (not one of ours, or mistyped),
// CODE_USED (someone already redeemed it), ALREADY_REDEEMED (this account has one from the batch).
export async function redeemCode(prisma, { userId, code, batches = BATCH_BY_HASH }) {
  const normalized = normalizeRedeemCode(code);
  const hash = normalized && hashRedeemCode(normalized);
  const batch = hash && batches.get(hash);
  if (!batch) throw new RedeemError("INVALID_CODE", 400, "That code isn't valid. Check it and try again.");
  return prisma.$transaction(async tx => {
    // One redemption at a time per account, so two taps cannot claim two codes from a batch.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`redeem-code:${userId}`}))::text AS "locked"`;
    const spent = await tx.redeemCodeClaim.findUnique({ where: { codeHash: hash } });
    if (spent) {
      if (spent.userId === userId) return { created: false, ...present(spent) };
      throw new RedeemError("CODE_USED", 409, "This code has already been used.");
    }
    const mine = await tx.redeemCodeClaim.findFirst({ where: { userId, batch: batch.id } });
    if (mine) throw new RedeemError("ALREADY_REDEEMED", 409, "You've already redeemed a code like this one.");
    try {
      const row = await tx.redeemCodeClaim.create({ data: { codeHash: hash, batch: batch.id, reward: batch.reward, userId } });
      return { created: true, ...present(row) };
    } catch (error) {
      // Another account claimed the same code in the same instant.
      if (error?.code === "P2002") throw new RedeemError("CODE_USED", 409, "This code has already been used.");
      throw error;
    }
  });
}

export async function listRedemptions(db, { userId }) {
  const rows = await db.redeemCodeClaim.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return rows.map(present);
}
