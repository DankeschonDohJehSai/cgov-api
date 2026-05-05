/**
 * Populate StakeDelegationChange.amount_at_switch from Koios /account_history.
 * Each row records `active_stake` at the delegation switch epoch (true historical
 * weight, not the current-state proxy via stake_delegation_state.amount).
 *
 * Idempotent: only operates on rows where amount_at_switch IS NULL.
 * Rows that come back without a /account_history entry are stamped
 * amount_source='unknown' (active_stake was zero or stake was unbonded
 * at that epoch start) — they contribute 0 lovelace to MigrationAggregate.
 *
 * Steady-state: small batch every cron tick fills new rows as they land.
 * One-off: run scripts/backfill-amount-at-switch.ts to drain the backlog.
 */

import { prisma } from "../prisma";
import { getAccountHistoryBatch } from "../governanceProvider";

export interface MigrationAmountBackfillResult {
  durationMs: number;
  rowsScanned: number;
  rowsUpdated: number;
  rowsUnknown: number;
  epochsProcessed: number;
  epochSpan: { min: number; max: number } | null;
}

export interface MigrationAmountBackfillOptions {
  /** Cap on changelog rows to attempt this run. Default 1000. */
  maxRows?: number;
  /** Cap on (addr, epoch) pairs per Koios call. Default 50 (matches /account_info batch). */
  batchSize?: number;
  /** Source tag for Koios telemetry / pressure-guard logs. */
  source?: string;
}

/**
 * Drains up to `maxRows` rows from StakeDelegationChange where amount_at_switch IS NULL.
 * Groups by epoch (Koios /account_history takes one epoch per call), fans out 50 stake
 * addresses per call, updates rows in bulk.
 */
export async function backfillAmountAtSwitch(
  opts: MigrationAmountBackfillOptions = {}
): Promise<MigrationAmountBackfillResult> {
  const startedAt = Date.now();
  const maxRows = opts.maxRows ?? 1000;
  const source = opts.source ?? "ingestion.migration-amount-backfill";

  const candidates = await prisma.stakeDelegationChange.findMany({
    where: {
      amountAtSwitch: null,
      delegatedEpoch: { not: -1 },
      stakeAddress: { not: "" },
    },
    orderBy: [{ delegatedEpoch: "asc" }, { id: "asc" }],
    take: maxRows,
    select: { id: true, stakeAddress: true, delegatedEpoch: true },
  });

  if (candidates.length === 0) {
    return {
      durationMs: Date.now() - startedAt,
      rowsScanned: 0,
      rowsUpdated: 0,
      rowsUnknown: 0,
      epochsProcessed: 0,
      epochSpan: null,
    };
  }

  const byEpoch = new Map<number, Array<{ id: number; stakeAddress: string }>>();
  for (const r of candidates) {
    const list = byEpoch.get(r.delegatedEpoch) ?? [];
    list.push({ id: r.id, stakeAddress: r.stakeAddress });
    byEpoch.set(r.delegatedEpoch, list);
  }

  let rowsUpdated = 0;
  let rowsUnknown = 0;
  const epochs = [...byEpoch.keys()].sort((a, b) => a - b);

  for (const epoch of epochs) {
    const stakes = byEpoch.get(epoch) ?? [];
    const addrs = [...new Set(stakes.map((s) => s.stakeAddress))];

    const entries = await getAccountHistoryBatch({
      stakeAddresses: addrs,
      epochNo: epoch,
      source,
    });

    const amountByAddr = new Map<string, bigint>();
    for (const e of entries) {
      for (const h of e.history ?? []) {
        if (h.epoch_no !== epoch) continue;
        try {
          amountByAddr.set(e.stake_address, BigInt(h.active_stake));
        } catch {
          // Skip malformed rows
        }
        break; // one record per stake/epoch when filtered
      }
    }

    // Bulk update — one update per row. Cheap when ~50 addrs/epoch.
    // Unknown rows get `amount_at_switch = 0` (Koios reports no active_stake at
    // epoch start → contributed nothing) so they don't re-appear on the next
    // pass's `WHERE amount_at_switch IS NULL` candidate query.
    for (const stake of stakes) {
      const amt = amountByAddr.get(stake.stakeAddress);
      const ok = amt != null;
      await prisma.stakeDelegationChange.update({
        where: { id: stake.id },
        data: {
          amountAtSwitch: ok ? amt! : 0n,
          amountSource: ok ? "koios-history" : "unknown",
        },
      });
      if (ok) rowsUpdated++;
      else rowsUnknown++;
    }
  }

  return {
    durationMs: Date.now() - startedAt,
    rowsScanned: candidates.length,
    rowsUpdated,
    rowsUnknown,
    epochsProcessed: epochs.length,
    epochSpan: epochs.length > 0 ? { min: epochs[0], max: epochs[epochs.length - 1] } : null,
  };
}
