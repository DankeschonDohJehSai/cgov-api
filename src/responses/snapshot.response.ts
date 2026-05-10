/**
 * drep-lens snapshot wire format.
 *
 * IMPORTANT: field names match drep-lens's RawDataset / DRep / GovAction shape
 * (snake_case / camelCase mix is intentional — this is the bridge layer):
 *   - DRep.id  (NOT drepId)
 *   - power    (kADA = lovelace / 1e9)
 *   - delegators (NOT delegatorCount)
 *   - vote enum is lowercase: "yes" | "no" | "abstain"
 *   - GovAction.type is the display label, NOT the DB enum
 */

export type SnapshotVote = "yes" | "no" | "abstain";

export interface SnapshotManifestChunk {
  startEpoch: number;
  endEpoch: number;
  url: string;
  isFinal: boolean;
  /** Final + amounts fully backfilled — safe for long CDN immutable cache */
  isStable: boolean;
  actionCount: number;
  voteCount: number;
  migrationCount: number;
}

export interface SnapshotManifest {
  schemaVersion: "v1";
  generatedAt: string;
  chunkSize: number;
  currentEpoch: number;
  firstGovEpoch: number;
  drepsUrl: string;
  drepCount: number;
  chunks: SnapshotManifestChunk[];
}

export interface SnapshotDrep {
  id: string;
  name: string;
  handle: string;
  power: number;
  delegators: number;
  participation: number;
  joined: number;
  cluster: number;
  iconUrl: string | null;
  powerSeries?: Array<{ epoch: number; power: number; delegators: number }>;
}

export interface SnapshotDreps {
  schemaVersion: "v1";
  generatedAt: string;
  drepCount: number;
  DREPS: SnapshotDrep[];
  featuredIds: string[];
}

export interface SnapshotChunkAction {
  id: string;
  title: string;
  type: string;
  epoch: number;
}

export interface SnapshotChunkMigration {
  epoch: number;
  from: string;
  to: string;
  /** Always 0 — drep-lens analysis remaps clusters per-pass; this is the fallback */
  fromCluster: number;
  /** Always 0 — drep-lens analysis remaps clusters per-pass; this is the fallback */
  toCluster: number;
  ada: number;
  delegators: number;
}

export interface SnapshotChunk {
  schemaVersion: "v1";
  generatedAt: string;
  epochStart: number;
  epochEnd: number;
  /** Chunk's epoch range is in the past (no new proposals/votes/migrations) */
  isFinal: boolean;
  /**
   * Additionally, every migration row in this chunk has `amount_source = "koios-history"`.
   * Only when both `isFinal && isStable` is the chunk safe to serve with
   * `Cache-Control: immutable, max-age=30d`. Otherwise migration lovelace values
   * may still change as the amount-at-switch backfill drains.
   */
  isStable: boolean;
  ACTIONS: SnapshotChunkAction[];
  /** Sparse: outer key drep_id, inner key gov_action_id */
  votes: Record<string, Record<string, SnapshotVote>>;
  MIGRATIONS: SnapshotChunkMigration[];
}
