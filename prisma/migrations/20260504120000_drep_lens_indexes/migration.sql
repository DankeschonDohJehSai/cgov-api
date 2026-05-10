-- CreateIndex
CREATE INDEX "proposal_submission_epoch_idx" ON "proposal"("submission_epoch");

-- CreateIndex
CREATE INDEX "stake_delegation_change_delegated_epoch_no_idx" ON "stake_delegation_change"("delegated_epoch_no");

-- CreateIndex
CREATE INDEX "stake_delegation_change_delegated_epoch_no_from_drep_id_to_drep_id_idx" ON "stake_delegation_change"("delegated_epoch_no", "from_drep_id", "to_drep_id");
