import express from "express";
import { migrationsController } from "../controllers";
import { cacheControl } from "../middleware/cache.middleware";

const router = express.Router();

/**
 * @openapi
 * /migrations:
 *   get:
 *     summary: Per-epoch DRep migration aggregates
 *     description: |
 *       Returns rows grouped by `(epoch, fromDrepId, toDrepId)` from the
 *       StakeDelegationChange changelog, with summed lovelace and distinct
 *       delegator counts. Sentinel DReps (drep_always_*) are excluded by default.
 *
 *       Source distribution and accuracy classification are reported in
 *       `meta.accuracy` so callers can interpret the numeric weight:
 *         - "koios-history" — historical active_stake at the switch epoch
 *         - "mixed"         — partial backfill in progress
 *         - "current"       — current StakeDelegationState.amount proxy
 *     tags:
 *       - Migrations
 *     parameters:
 *       - name: epochStart
 *         in: query
 *         description: Inclusive lower bound on delegated_epoch_no
 *         schema: { type: integer }
 *       - name: epochEnd
 *         in: query
 *         description: Inclusive upper bound on delegated_epoch_no
 *         schema: { type: integer }
 *       - name: fromDrepId
 *         in: query
 *         schema: { type: string }
 *       - name: toDrepId
 *         in: query
 *         schema: { type: string }
 *       - name: excludeSentinels
 *         in: query
 *         description: Drop rows touching drep_always_* (default true)
 *         schema: { type: boolean }
 *       - name: topNByPower
 *         in: query
 *         description: Cap to migrations whose source AND target DReps are top-N by current voting power
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Successfully retrieved migrations
 *       500:
 *         description: Server error
 */
router.get("/", cacheControl(300, 600), migrationsController.getMigrations);

export default router;
