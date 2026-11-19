-- In-app feedback read by staff in the staff page.
CREATE TABLE "AppFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "subject" VARCHAR(160),
  "message" TEXT NOT NULL,
  "replyEmail" VARCHAR(254),
  "route" VARCHAR(120),
  "appVersion" VARCHAR(32),
  "platform" VARCHAR(16),
  "status" VARCHAR(8) NOT NULL DEFAULT 'NEW',
  "staffNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "AppFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppFeedback_status_createdAt_idx" ON "AppFeedback"("status", "createdAt");
CREATE INDEX "AppFeedback_userId_createdAt_idx" ON "AppFeedback"("userId", "createdAt");

ALTER TABLE "AppFeedback" ADD CONSTRAINT "AppFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
