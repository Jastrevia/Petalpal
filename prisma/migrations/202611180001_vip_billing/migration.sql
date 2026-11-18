-- VIP plans (monthly and lifetime) synced from RevenueCat, and free-trial uses of paid features.
CREATE TYPE "VipPlan" AS ENUM ('MONTHLY', 'LIFETIME');

ALTER TABLE "SubscriptionEntitlement"
  ADD COLUMN "plan" "VipPlan",
  ADD COLUMN "productId" VARCHAR(128),
  ADD COLUMN "willRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "purchasedAt" TIMESTAMP(3),
  ADD COLUMN "syncedAt" TIMESTAMP(3);

CREATE TABLE "BillingTrialUse" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feature" VARCHAR(32) NOT NULL,
  "periodKey" VARCHAR(16) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingTrialUse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingTrialUse_userId_feature_periodKey_key" ON "BillingTrialUse"("userId", "feature", "periodKey");
CREATE INDEX "BillingTrialUse_userId_feature_idx" ON "BillingTrialUse"("userId", "feature");

ALTER TABLE "BillingTrialUse" ADD CONSTRAINT "BillingTrialUse_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
