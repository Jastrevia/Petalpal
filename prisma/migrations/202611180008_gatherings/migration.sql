-- Garden gatherings and their invites.
CREATE TABLE "Gathering" (
  "id" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "title" VARCHAR(60),
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Gathering_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Gathering_hostId_endsAt_idx" ON "Gathering"("hostId", "endsAt");
CREATE INDEX "Gathering_endsAt_idx" ON "Gathering"("endsAt");
ALTER TABLE "Gathering" ADD CONSTRAINT "Gathering_hostId_fkey"
  FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GatheringInvite" (
  "gatheringId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'INVITED',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GatheringInvite_pkey" PRIMARY KEY ("gatheringId", "userId")
);
CREATE INDEX "GatheringInvite_userId_idx" ON "GatheringInvite"("userId");
ALTER TABLE "GatheringInvite" ADD CONSTRAINT "GatheringInvite_gatheringId_fkey"
  FOREIGN KEY ("gatheringId") REFERENCES "Gathering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GatheringInvite" ADD CONSTRAINT "GatheringInvite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
