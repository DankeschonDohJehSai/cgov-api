/**
 * Governance action types catalog response.
 * Used by drep-lens to populate its action-type whitelist filter.
 */
export interface ActionTypeRow {
  /** Display label, e.g. "Treasury Withdrawals" — matches GovernanceAction.type wire format */
  type: string;
  /** Number of proposals with this governance action type */
  count: number;
}

export interface GetActionTypesResponse {
  types: ActionTypeRow[];
}
