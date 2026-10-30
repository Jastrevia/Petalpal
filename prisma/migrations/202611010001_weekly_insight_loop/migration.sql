-- Weekly 2.0 M2 loop tables (docs/product/WEEKLY_2.0.md): 花语集, 跟进线索, 回答问题, 给未来的信, 屏蔽. Additive only.

-- CreateTable
CREATE TABLE "InsightKeep" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "weeklyReportId" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "cardId" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightKeep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightThread" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "word" VARCHAR(64) NOT NULL,
    "insightType" VARCHAR(24) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "InsightThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "weeklyReportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FutureLetter" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "text" VARCHAR(280) NOT NULL,
    "deliverOn" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "FutureLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightMute" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "word" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightKeep_ownerId_createdAt_idx" ON "InsightKeep"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsightKeep_ownerId_weeklyReportId_sectionIndex_key" ON "InsightKeep"("ownerId", "weeklyReportId", "sectionIndex");

-- CreateIndex
CREATE INDEX "InsightThread_ownerId_endedAt_idx" ON "InsightThread"("ownerId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAnswer_eventId_key" ON "QuestionAnswer"("eventId");

-- CreateIndex
CREATE INDEX "QuestionAnswer_ownerId_weeklyReportId_idx" ON "QuestionAnswer"("ownerId", "weeklyReportId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAnswer_eventId_ownerId_key" ON "QuestionAnswer"("eventId", "ownerId");

-- CreateIndex
CREATE INDEX "FutureLetter_ownerId_deliverOn_idx" ON "FutureLetter"("ownerId", "deliverOn");

-- CreateIndex
CREATE UNIQUE INDEX "InsightMute_ownerId_word_key" ON "InsightMute"("ownerId", "word");

-- AddForeignKey
ALTER TABLE "InsightKeep" ADD CONSTRAINT "InsightKeep_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightKeep" ADD CONSTRAINT "InsightKeep_weeklyReportId_ownerId_fkey" FOREIGN KEY ("weeklyReportId", "ownerId") REFERENCES "WeeklyReport"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightThread" ADD CONSTRAINT "InsightThread_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_eventId_ownerId_fkey" FOREIGN KEY ("eventId", "ownerId") REFERENCES "Event"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_weeklyReportId_ownerId_fkey" FOREIGN KEY ("weeklyReportId", "ownerId") REFERENCES "WeeklyReport"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FutureLetter" ADD CONSTRAINT "FutureLetter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightMute" ADD CONSTRAINT "InsightMute_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
