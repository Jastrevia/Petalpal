-- AlterTable
ALTER TABLE "PetalCardDraw" ADD COLUMN     "reversed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "topic" VARCHAR(16);

-- CreateTable
CREATE TABLE "PetalCardReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "paragraphs" JSONB NOT NULL DEFAULT '[]',
    "model" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetalCardReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PetalCardReading_drawId_key" ON "PetalCardReading"("drawId");

-- CreateIndex
CREATE INDEX "PetalCardReading_userId_idx" ON "PetalCardReading"("userId");

-- AddForeignKey
ALTER TABLE "PetalCardReading" ADD CONSTRAINT "PetalCardReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetalCardReading" ADD CONSTRAINT "PetalCardReading_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "PetalCardDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE;
