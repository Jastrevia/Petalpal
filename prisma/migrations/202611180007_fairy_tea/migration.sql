-- Tea house: one row per tea the owner makes with the fairy.
CREATE TABLE "FairyTeaSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "drink" VARCHAR(24) NOT NULL,
  "localDate" VARCHAR(10) NOT NULL,
  "status" VARCHAR(10) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "FairyTeaSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FairyTeaSession_userId_status_startedAt_idx" ON "FairyTeaSession"("userId", "status", "startedAt");
CREATE INDEX "FairyTeaSession_userId_localDate_idx" ON "FairyTeaSession"("userId", "localDate");
ALTER TABLE "FairyTeaSession" ADD CONSTRAINT "FairyTeaSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
