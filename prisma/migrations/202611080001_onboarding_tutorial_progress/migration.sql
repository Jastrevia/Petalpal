-- First-time guided tour progress, kept on the server so it resumes on any device
-- (lib/onboarding-tutorial.js). All columns are nullable and additive.
ALTER TABLE "FairyState" ADD COLUMN "tutorialStep" VARCHAR(32),
ADD COLUMN "tutorialCompletedAt" TIMESTAMP(3),
ADD COLUMN "fairyNamedAt" TIMESTAMP(3),
ADD COLUMN "tutorialFirstEventId" VARCHAR(128),
ADD COLUMN "tutorialFirstFlowerId" VARCHAR(128),
ADD COLUMN "tutorialFlowerPlantedAt" TIMESTAMP(3);

-- Every account that exists before the tour ships is an existing owner: it never sees the tour
-- and keeps its fairy's current name. New accounts are created with tutorialStep = 'intro.name'.
UPDATE "FairyState"
SET "tutorialStep" = 'done',
    "tutorialCompletedAt" = CURRENT_TIMESTAMP,
    "fairyNamedAt" = CURRENT_TIMESTAMP
WHERE "tutorialCompletedAt" IS NULL;
