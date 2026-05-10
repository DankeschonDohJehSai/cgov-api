-- AlterTable
ALTER TABLE "drep"
  ADD COLUMN "first_seen_epoch" INTEGER,
  ADD COLUMN "proposal_participation_percent" DOUBLE PRECISION;
