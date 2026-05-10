-- AlterTable
ALTER TABLE "stake_delegation_change"
  ADD COLUMN "amount_at_switch" BIGINT,
  ADD COLUMN "amount_source" TEXT;

-- CreateTable
CREATE TABLE "migration_aggregate" (
  "epoch" INTEGER NOT NULL,
  "from_drep_id" TEXT NOT NULL,
  "to_drep_id" TEXT NOT NULL,
  "ada_lovelace" BIGINT NOT NULL DEFAULT 0,
  "delegators" INTEGER NOT NULL DEFAULT 0,
  "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "migration_aggregate_pkey" PRIMARY KEY ("epoch", "from_drep_id", "to_drep_id")
);

-- CreateIndex
CREATE INDEX "migration_aggregate_epoch_idx" ON "migration_aggregate"("epoch");

-- CreateIndex
CREATE INDEX "migration_aggregate_from_drep_id_idx" ON "migration_aggregate"("from_drep_id");

-- CreateIndex
CREATE INDEX "migration_aggregate_to_drep_id_idx" ON "migration_aggregate"("to_drep_id");
