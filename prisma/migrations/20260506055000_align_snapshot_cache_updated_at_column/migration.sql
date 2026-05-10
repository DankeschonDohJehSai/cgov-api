-- AlterTable
ALTER TABLE "snapshot_cache" ALTER COLUMN "last_accessed_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "stake_delegation_change_delegated_epoch_no_from_drep_id_to_drep" RENAME TO "stake_delegation_change_delegated_epoch_no_from_drep_id_to__idx";
