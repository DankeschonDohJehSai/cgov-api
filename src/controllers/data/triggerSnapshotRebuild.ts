import { Request, Response } from "express";
import { rebuildAfterEpoch } from "../../services/ingestion/snapshot-builder.service";
import { snapshotService } from "../../services/snapshot.service";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";

/**
 * POST /data/snapshot/rebuild
 *
 * Force a snapshot rebuild — composes dreps + current chunk + manifest from
 * scratch and persists into SnapshotCache. Useful after schemaVersion bumps
 * or backfills.
 *
 * Body (optional):
 *   { "epoch": 627 }     — rebuild as if currentEpoch were N (defaults to DB tip)
 *   { "invalidate": true } — also drop all in-memory L1 caches before rebuild
 */
export const postTriggerSnapshotRebuild = async (req: Request, res: Response) => {
  try {
    const epochRaw = (req.body && req.body.epoch) as unknown;
    const epoch =
      typeof epochRaw === "number" && Number.isFinite(epochRaw) && epochRaw >= 0
        ? epochRaw
        : undefined;
    const invalidate = !!(req.body && req.body.invalidate);

    if (invalidate) {
      const dropped = snapshotService.invalidateAll();
      console.log(`[snapshot-rebuild] invalidated ${dropped} L1 cache entries`);
    }

    const result = await rebuildAfterEpoch(epoch);
    res.json({ success: true, result });
  } catch (error) {
    console.error("[snapshot-rebuild] failed", formatAxiosLikeError(error));
    res.status(500).json({
      success: false,
      error: "Failed to rebuild snapshot",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
