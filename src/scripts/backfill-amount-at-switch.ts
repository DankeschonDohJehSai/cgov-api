/**
 * Backfill StakeDelegationChange.amount_at_switch from Koios /account_history.
 * Populates historical active_stake at each delegation switch epoch so the
 * MigrationAggregate sums true on-chain values rather than the current-state
 * proxy via stake_delegation_state.
 *
 * Idempotent + resumable: only touches rows where amount_at_switch IS NULL.
 *
 * Prerequisites:
 *   - DATABASE_URL configured.
 *   - Koios pressure budget tolerates ~1000 calls (full mainnet drain ~30 min).
 *
 * Environment (optional):
 *   - AMOUNT_AT_SWITCH_BATCH_ROWS=2000  // rows per pass (default 2000)
 *   - AMOUNT_AT_SWITCH_MAX_PASSES=200   // safety cap (default 200; ~400k rows)
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-amount-at-switch.ts
 */

import "dotenv/config";
import { formatAxiosLikeError } from "../utils/format-http-client-error";
import { prisma } from "../services/prisma";
import { backfillAmountAtSwitch } from "../services/ingestion/migration-amount-backfill.service";
import { refreshMigrationAggregate } from "../services/ingestion/migration-aggregate.service";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

async function main() {
  const batchSize = parseIntEnv("AMOUNT_AT_SWITCH_BATCH_ROWS", 2000);
  const maxPasses = parseIntEnv("AMOUNT_AT_SWITCH_MAX_PASSES", 200);

  console.log(
    `[backfill-amount-at-switch] starting — batchSize=${batchSize} maxPasses=${maxPasses}`
  );

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalUnknown = 0;
  let totalEpochs = 0;
  let pass = 0;

  for (pass = 0; pass < maxPasses; pass++) {
    const result = await backfillAmountAtSwitch({
      maxRows: batchSize,
      source: "scripts.backfill-amount-at-switch",
    });

    totalScanned += result.rowsScanned;
    totalUpdated += result.rowsUpdated;
    totalUnknown += result.rowsUnknown;
    totalEpochs += result.epochsProcessed;

    console.log(
      `[backfill-amount-at-switch] pass ${pass + 1}: scanned=${result.rowsScanned} updated=${result.rowsUpdated} unknown=${result.rowsUnknown} epochs=${result.epochsProcessed} span=${
        result.epochSpan ? `[${result.epochSpan.min}, ${result.epochSpan.max}]` : "none"
      } in ${result.durationMs}ms`
    );

    if (result.rowsScanned === 0) {
      console.log("[backfill-amount-at-switch] no more rows — done.");
      break;
    }
  }

  console.log(
    `[backfill-amount-at-switch] FINISHED in ${pass} pass(es): scanned=${totalScanned} updated=${totalUpdated} unknown=${totalUnknown} epochs=${totalEpochs}`
  );

  console.log("[backfill-amount-at-switch] refreshing MigrationAggregate so it picks up the new amounts...");
  const aggResult = await refreshMigrationAggregate(prisma, 0);
  console.log(
    `[backfill-amount-at-switch] MigrationAggregate refreshed — ${aggResult.rowsWritten} rows in ${aggResult.durationMs}ms`
  );

  // Invalidate snapshot cache so /snapshot/chunks/* don't keep serving the
  // pre-backfill migration totals from L2 (and so final chunks become eligible
  // for `immutable` once isStable=true on the next compose).
  const dropped = await prisma.snapshotCache.deleteMany({
    where: {
      OR: [
        { cacheKey: { startsWith: "snapshot:v1:chunk:" } },
        { cacheKey: { startsWith: "snapshot:v1:manifest" } },
      ],
    },
  });
  console.log(
    `[backfill-amount-at-switch] dropped ${dropped.count} snapshot_cache rows so /snapshot/* recomposes against fresh aggregate`
  );
}

main()
  .catch((e) => {
    console.error("[backfill-amount-at-switch] FAILED", formatAxiosLikeError(e));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
