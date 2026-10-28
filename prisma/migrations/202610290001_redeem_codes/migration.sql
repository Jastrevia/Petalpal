-- CreateTable
CREATE TABLE "RedeemCodeClaim" (
    "id" TEXT NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "batch" VARCHAR(64) NOT NULL,
    "reward" VARCHAR(64) NOT NULL,
    "rewardStatus" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedAt" TIMESTAMP(3),

    CONSTRAINT "RedeemCodeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedeemCodeClaim_codeHash_key" ON "RedeemCodeClaim"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "RedeemCodeClaim_userId_batch_key" ON "RedeemCodeClaim"("userId", "batch");

-- AddForeignKey
ALTER TABLE "RedeemCodeClaim" ADD CONSTRAINT "RedeemCodeClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
