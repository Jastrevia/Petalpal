// At most DAILY_FLOWER_LIMIT new flowers per account-local day (time.md); VIP owners pass their own
// limit (lib/billing.js VIP_LIMITS.dailyFlowers). The count lives in
// DailyFlowerQuota, not in Flower rows, so deleting a flower never gives the day's planting back.
// DAILY_GROW_LIMIT_ENABLED=false (synthetic TEST runs) lifts the limit, as for Daily Grow.
export const DAILY_FLOWER_LIMIT = 2;
export const flowerLimitEnabled = () => process.env.DAILY_GROW_LIMIT_ENABLED !== "false";

// Takes one of the day's plantings inside the caller's transaction. A single conditional
// upsert, so two requests at once can never both take the last one.
export async function reserveFlowerPlanting(tx, { userId, localDate, limit = DAILY_FLOWER_LIMIT }) {
  if (!flowerLimitEnabled()) return { granted: true, limit: null, planted: null };
  const rows = await tx.$queryRawUnsafe(
    `/* flower-quota:reserve */ INSERT INTO "DailyFlowerQuota" ("userId", "localDate", "planted", "updatedAt")
     VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
     ON CONFLICT ("userId", "localDate") DO UPDATE
       SET "planted" = "DailyFlowerQuota"."planted" + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "DailyFlowerQuota"."planted" < $3
     RETURNING "planted"`,
    userId, localDate, limit);
  if (rows.length) return { granted: true, limit, planted: Number(rows[0].planted) };
  return { granted: false, limit, planted: limit };
}

export async function flowerQuotaToday(prisma, { userId, localDate, limit = DAILY_FLOWER_LIMIT }) {
  if (!flowerLimitEnabled()) return { localDate, limit: null, planted: null, remaining: null };
  const row = await prisma.dailyFlowerQuota.findUnique({ where: { userId_localDate: { userId, localDate } } });
  const planted = Math.min(row?.planted ?? 0, limit);
  return { localDate, limit, planted, remaining: limit - planted };
}
