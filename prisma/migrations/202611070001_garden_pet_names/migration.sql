-- A name the owner gives the golden puppy or Xiaobai (Collection → Pet dress-up), and when it was
-- last changed: a pet can be renamed once every 7 days (lib/garden-pets.js renamePet). Both nullable:
-- existing rows keep the pets' own names.
ALTER TABLE "GardenPetOutfit" ADD COLUMN "name" VARCHAR(24),
ADD COLUMN "nameChangedAt" TIMESTAMP(3);
