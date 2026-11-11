-- Per-owner Mailbox state: which letters this person has read and which they deleted from their
-- own mailbox. Additive: one new table, nothing existing changes. Letter content is app content
-- and is not stored here.
CREATE TABLE "MailboxLetterState" (
    "userId" TEXT NOT NULL,
    "letterId" VARCHAR(64) NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MailboxLetterState_pkey" PRIMARY KEY ("userId","letterId")
);

ALTER TABLE "MailboxLetterState" ADD CONSTRAINT "MailboxLetterState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
