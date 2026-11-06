-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarWelcomeAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AvatarOwnership" (
    "userId" TEXT NOT NULL,
    "avatarId" VARCHAR(32) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "rewardLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarOwnership_pkey" PRIMARY KEY ("userId","avatarId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarOwnership_userId_rewardLevel_key" ON "AvatarOwnership"("userId", "rewardLevel");

-- AddForeignKey
ALTER TABLE "AvatarOwnership" ADD CONSTRAINT "AvatarOwnership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing accounts: every original portrait they could already choose stays theirs, their current
-- avatar is untouched, and they never go through the new-account welcome choice.
INSERT INTO "AvatarOwnership" ("userId", "avatarId", "source")
SELECT u."id", a."avatarId", 'LEGACY'
FROM "User" u
CROSS JOIN (VALUES ('fairy-1'), ('fairy-2'), ('fairy-3'), ('fairy-4'), ('fairy-5'), ('fairy-6'), ('fairy-7'), ('fairy-8')) AS a("avatarId");

UPDATE "User" SET "avatarWelcomeAt" = CURRENT_TIMESTAMP WHERE "avatarWelcomeAt" IS NULL;
