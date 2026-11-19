-- Keepsake DIY: decorations placed in the owner's Garden.
CREATE TABLE "GardenLayout" (
  "userId" TEXT NOT NULL,
  "placements" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GardenLayout_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "GardenLayout" ADD CONSTRAINT "GardenLayout_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
