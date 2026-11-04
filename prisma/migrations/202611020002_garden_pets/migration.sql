-- CreateTable
CREATE TABLE "GardenPetFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodId" VARCHAR(48) NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(16) NOT NULL,
    "awardKey" VARCHAR(96) NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GardenPetFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GardenPetOutfit" (
    "userId" TEXT NOT NULL,
    "petId" VARCHAR(16) NOT NULL,
    "hat" VARCHAR(48),
    "collar" VARCHAR(48),
    "pendant" VARCHAR(48),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GardenPetOutfit_pkey" PRIMARY KEY ("userId","petId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GardenPetFood_userId_awardKey_key" ON "GardenPetFood"("userId", "awardKey");

-- CreateIndex
CREATE INDEX "GardenPetFood_userId_reason_idx" ON "GardenPetFood"("userId", "reason");

-- AddForeignKey
ALTER TABLE "GardenPetFood" ADD CONSTRAINT "GardenPetFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GardenPetOutfit" ADD CONSTRAINT "GardenPetOutfit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
