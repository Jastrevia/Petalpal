-- Planted flowers keep their Garden position on the server: written once, never moved.
-- AlterTable
ALTER TABLE "Flower" ADD COLUMN     "placedAt" TIMESTAMP(3),
ADD COLUMN     "worldX" DOUBLE PRECISION,
ADD COLUMN     "worldY" DOUBLE PRECISION;
