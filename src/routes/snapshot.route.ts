import express from "express";
import { snapshotController } from "../controllers";
import { cacheControl } from "../middleware/cache.middleware";

const router = express.Router();

/**
 * @openapi
 * /snapshot/manifest:
 *   get:
 *     summary: Snapshot manifest
 *     description: Lists available chunks, current epoch tip, schema version, and stable URLs. Drives drep-lens's chunk-loading sequence.
 *     tags:
 *       - Snapshot
 *     parameters:
 *       - name: epochStart
 *         in: query
 *         schema: { type: integer }
 *         description: Optional lower bound — manifest only lists chunks intersecting this range.
 *       - name: epochEnd
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Manifest document
 *       500:
 *         description: Server error
 */
router.get("/manifest", cacheControl(60, 300), snapshotController.getSnapshotManifest);

/**
 * @openapi
 * /snapshot/dreps:
 *   get:
 *     summary: DRep roster (drep-lens-shaped)
 *     description: Current DRep roster in drep-lens RawDataset.DREPS shape. id/power/delegators field names match drep-lens, NOT cgov-api's regular /dreps shape.
 *     tags:
 *       - Snapshot
 *     parameters:
 *       - name: topN
 *         in: query
 *         schema: { type: integer }
 *         description: Optional cap — return only the top-N by current voting power.
 *       - name: includeHistory
 *         in: query
 *         schema: { type: boolean }
 *         description: If true, populates each DRep's powerSeries[] from per-epoch snapshots.
 *     responses:
 *       200:
 *         description: DRep roster
 *       500:
 *         description: Server error
 */
router.get("/dreps", cacheControl(300, 600), snapshotController.getSnapshotDreps);

/**
 * @openapi
 * /snapshot/chunks/{range}:
 *   get:
 *     summary: One snapshot chunk
 *     description: |
 *       Returns one chunk worth of governance data — proposals submitted in the
 *       range, votes cast on those proposals (sparse: only non-"none" entries),
 *       and migrations observed in the range.
 *
 *       Range MUST align with chunkSize=50: startEpoch is a multiple of 50,
 *       endEpoch = startEpoch + 49. Final chunks are immutable; their cache
 *       lives for hours. The current chunk is rebuilt on epoch boundaries.
 *     tags:
 *       - Snapshot
 *     parameters:
 *       - name: range
 *         in: path
 *         required: true
 *         schema: { type: string, pattern: '^[0-9]+-[0-9]+$' }
 *         description: "{startEpoch}-{endEpoch}, e.g. 600-649"
 *     responses:
 *       200:
 *         description: Chunk payload
 *       400:
 *         description: Range does not align with chunkSize
 *       500:
 *         description: Server error
 */
router.get(
  "/chunks/:range",
  // Final chunks deserve a longer TTL but the route can't tell upfront. Default to fresh cadence;
  // the controller-level service applies a longer in-memory TTL when isFinal=true.
  cacheControl(300, 600),
  snapshotController.getSnapshotChunk
);

/**
 * @openapi
 * /snapshot/full:
 *   get:
 *     summary: One-shot snapshot composer for non-browser callers
 *     description: |
 *       Stitches manifest + dreps + chunks server-side into one RawDataset
 *       blob (drep-lens-shaped). Browsers should use the chunked endpoints
 *       directly; this is for offline pipelines and research notebooks.
 *     tags:
 *       - Snapshot
 *     parameters:
 *       - name: epochStart
 *         in: query
 *         schema: { type: integer }
 *       - name: epochEnd
 *         in: query
 *         schema: { type: integer }
 *       - name: includeHistory
 *         in: query
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: RawDataset blob
 *       500:
 *         description: Server error
 */
router.get("/full", cacheControl(300, 600), snapshotController.getSnapshotFull);

export default router;
