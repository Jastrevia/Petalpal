-- Weekly 2.0 extraction layer (docs/product/WEEKLY_2.0.md). Additive only.

-- AlterEnum
ALTER TYPE "AIJobType" ADD VALUE 'INSIGHT_EXTRACTION';

-- CreateTable
CREATE TABLE "EventInsightExtraction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "extractionVersion" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "spans" JSONB NOT NULL DEFAULT '[]',
    "model" VARCHAR(64),
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInsightExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventInsightExtraction_sourceEventId_key" ON "EventInsightExtraction"("sourceEventId");

-- CreateIndex
CREATE INDEX "EventInsightExtraction_ownerId_idx" ON "EventInsightExtraction"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInsightExtraction_sourceEventId_ownerId_key" ON "EventInsightExtraction"("sourceEventId", "ownerId");

-- AddForeignKey
ALTER TABLE "EventInsightExtraction" ADD CONSTRAINT "EventInsightExtraction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInsightExtraction" ADD CONSTRAINT "EventInsightExtraction_sourceEventId_ownerId_fkey" FOREIGN KEY ("sourceEventId", "ownerId") REFERENCES "Event"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

