-- One item system (owned SHOP/GRANT items) and the Garden Fairy's wardrobe.
CREATE TABLE "ItemOwnership" (
  "userId" TEXT NOT NULL,
  "itemId" VARCHAR(48) NOT NULL,
  "source" VARCHAR(16) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemOwnership_pkey" PRIMARY KEY ("userId", "itemId")
);
ALTER TABLE "ItemOwnership" ADD CONSTRAINT "ItemOwnership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FairyWardrobe" (
  "userId" TEXT NOT NULL,
  "equipped" JSONB NOT NULL DEFAULT '{}',
  "looks" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FairyWardrobe_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "FairyWardrobe" ADD CONSTRAINT "FairyWardrobe_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
