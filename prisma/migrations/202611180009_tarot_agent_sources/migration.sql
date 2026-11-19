-- Deeper tarot readings record which memory dates they drew on (no text).
ALTER TABLE "PetalCardReading" ADD COLUMN "sources" JSONB NOT NULL DEFAULT '[]';
