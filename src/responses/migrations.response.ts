/**
 * Migration response types — per-epoch DRep migrations aggregated from
 * the StakeDelegationChange changelog.
 */

export interface MigrationRow {
  /** Delegation switch epoch (delegated_epoch_no) */
  epoch: number;
  /** Source DRep bech32 id; empty/sentinel rows are excluded by default */
  fromDrepId: string;
  /** Target DRep bech32 id */
  toDrepId: string;
  /** Lovelace moved (BigInt as string) — sum of amount_at_switch (or current-proxy fallback) */
  lovelace: string;
  /** Lovelace converted to ADA, rounded to 6 dp */
  ada: string;
  /** Distinct stake addresses moved between (fromDrepId, toDrepId) in this epoch */
  delegators: number;
}

export interface GetMigrationsResponse {
  migrations: MigrationRow[];
  meta: {
    epochStart: number;
    epochEnd: number;
    /** Aggregated row count returned */
    rowCount: number;
    /**
     * Provenance of `lovelace`:
     *  - "koios-history": ≥99% of changelog rows have `amount_at_switch` from Koios /account_history.
     *  - "mixed":         partial — some rows historical, some fall back to current-state proxy.
     *  - "current":       fallback path — current StakeDelegationState.amount used everywhere.
     */
    accuracy: "koios-history" | "mixed" | "current";
    /** Distribution counts feeding the accuracy classification */
    sourceDistribution: {
      total: number;
      koiosHistory: number;
      currentProxy: number;
      unknown: number;
    };
    /** Most recent computedAt for any row in [epochStart, epochEnd], if any */
    lastComputedAt: string | null;
  };
}
