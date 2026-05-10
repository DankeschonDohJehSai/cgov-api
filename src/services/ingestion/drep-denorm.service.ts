/**
 * Recomputes the denormalised columns on Drep:
 *   - firstSeenEpoch                 — MIN(drepLifecycleEvent.epochNo) WHERE action='registration'
 *   - proposalParticipationPercent   — distinct proposals voted on / total proposals * 100
 *
 * Two whole-table SQL UPDATEs — cheap (~1k rows) and called from
 * syncEpochTotalsStep (i.e. once per minute when the cron runs). Idempotent.
 */

import { prisma } from "../prisma";
import { withDbWrite } from "../prisma";

export interface DrepDenormRefreshResult {
  durationMs: number;
  firstSeenUpdated: number;
  participationUpdated: number;
}

export async function refreshDrepDenormColumns(): Promise<DrepDenormRefreshResult> {
  const startedAt = Date.now();

  const firstSeenUpdated = await prisma.$executeRaw`
    UPDATE "drep" d
    SET "first_seen_epoch" = sub.min_epoch
    FROM (
      SELECT "drep_id", MIN("epoch_no") AS min_epoch
      FROM "drep_lifecycle_event"
      WHERE "action" = 'registration'
      GROUP BY "drep_id"
    ) sub
    WHERE d."drep_id" = sub."drep_id"
      AND (d."first_seen_epoch" IS DISTINCT FROM sub.min_epoch)
  `;

  const participationUpdated = await prisma.$executeRaw`
    WITH total AS (SELECT COUNT(*)::float AS n FROM "proposal"),
    per_drep AS (
      SELECT "drep_id", COUNT(DISTINCT "proposal_id")::float AS distinct_voted
      FROM "onchain_vote"
      WHERE "voter_type" = 'DREP' AND "drep_id" IS NOT NULL
      GROUP BY "drep_id"
    )
    UPDATE "drep" d
    SET "proposal_participation_percent" = CASE
      WHEN (SELECT n FROM total) > 0
        THEN ROUND((COALESCE(pd.distinct_voted, 0) / (SELECT n FROM total) * 100)::numeric, 2)::float
        ELSE 0
    END
    FROM (SELECT "drep_id" FROM "drep") all_dreps
    LEFT JOIN per_drep pd ON pd."drep_id" = all_dreps."drep_id"
    WHERE d."drep_id" = all_dreps."drep_id"
      AND (d."proposal_participation_percent" IS DISTINCT FROM CASE
        WHEN (SELECT n FROM total) > 0
          THEN ROUND((COALESCE(pd.distinct_voted, 0) / (SELECT n FROM total) * 100)::numeric, 2)::float
          ELSE 0
      END)
  `;

  return {
    durationMs: Date.now() - startedAt,
    firstSeenUpdated: Number(firstSeenUpdated),
    participationUpdated: Number(participationUpdated),
  };
}

export async function refreshDrepDenormColumnsWithResilience(): Promise<DrepDenormRefreshResult> {
  return withDbWrite("drep-denorm.refresh", () => refreshDrepDenormColumns());
}
