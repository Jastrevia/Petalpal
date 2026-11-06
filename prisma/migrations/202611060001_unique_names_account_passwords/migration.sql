-- Names are unique, ignoring case, width and repeated spaces. If two accounts already share a
-- name, the oldest keeps it and the others gain the end of their PP number.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY lower(btrim(regexp_replace(normalize("name", NFKC), '\s+', ' ', 'g')))
    ORDER BY "createdAt", "id") AS "position"
  FROM "User"
)
UPDATE "User" AS u
SET "name" = left(u."name", 70) || '_' || right(COALESCE(u."accountId", u."id"), 6)
FROM ranked
WHERE ranked."id" = u."id" AND ranked."position" > 1;

-- Prisma's schema cannot describe an expression index; lib/accounts.js uses the same expression.
CREATE UNIQUE INDEX "User_name_normalized_key"
  ON "User" (lower(btrim(regexp_replace(normalize("name", NFKC), '\s+', ' ', 'g'))));

-- A table of its own, so no query that loads a User can ever carry the hash.
CREATE TABLE "AccountPassword" (
  "userId" TEXT NOT NULL,
  "hash" VARCHAR(255) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountPassword_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AccountPassword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
