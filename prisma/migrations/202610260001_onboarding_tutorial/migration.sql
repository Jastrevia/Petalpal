-- First-time guided tour progress, kept beside the original first-flower onboarding flags.
-- Additive and nullable: existing rows and older API builds are unaffected.
ALTER TABLE "FairyState"
    ADD COLUMN "tutorialStep" VARCHAR(64),
    ADD COLUMN "tutorialCompletedAt" TIMESTAMP(3),
    ADD COLUMN "fairyNamedAt" TIMESTAMP(3),
    ADD COLUMN "tutorialFirstEventId" VARCHAR(128),
    ADD COLUMN "tutorialFirstFlowerId" VARCHAR(128),
    ADD COLUMN "tutorialFlowerPlantedAt" TIMESTAMP(3);

-- Owners who already grew a Garden never see the tour: an earlier first-flower onboarding,
-- any Event, any Flower or an existing Fairy marks it complete.
UPDATE "FairyState" AS fs
SET "tutorialCompletedAt" = CURRENT_TIMESTAMP, "tutorialStep" = 'done'
WHERE fs."tutorialCompletedAt" IS NULL AND (
    fs."onboardingCompleted" = true
    OR EXISTS (SELECT 1 FROM "Event" e WHERE e."ownerId" = fs."userId")
    OR EXISTS (SELECT 1 FROM "Flower" f WHERE f."userId" = fs."userId")
    OR EXISTS (SELECT 1 FROM "UserFairy" uf WHERE uf."userId" = fs."userId")
);
