/**
 * Epoch Range Response Types
 */

/**
 * Aggregate epoch range available in the database.
 * Used by drep-lens to size its epoch sparkline / slider.
 */
export interface GetEpochsRangeResponse {
  /** First governance epoch with any proposal data (MIN(submissionEpoch) FROM proposal) */
  min: number;
  /** Last fully-synced epoch (MAX(epoch) FROM epoch_totals) */
  max: number;
  /** On-chain tip epoch (same as max for now — bounded by epoch_totals freshness) */
  current: number;
}
