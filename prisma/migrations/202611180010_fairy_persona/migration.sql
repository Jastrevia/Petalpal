-- Fairy persona: the owner's chosen personality for their Garden Fairy.
ALTER TABLE "UserFairy" ADD COLUMN "personaId" VARCHAR(24), ADD COLUMN "personaChangedAt" TIMESTAMP(3);
