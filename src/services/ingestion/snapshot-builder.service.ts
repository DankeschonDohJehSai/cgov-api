/**
 * Snapshot rebuild orchestration.
 *
 * Called from epoch-analytics.service after each successful epoch sync, and
 * from the manual `POST /data/snapshot/rebuild` endpoint. Composes the
 * three snapshot artifacts (dreps, current chunk, manifest) and persists
 * them to SnapshotCache. Crossing a chunk boundary additionally finalises
 * the just-ended chunk one last time and marks it isFinal=true.
 *
 * Idempotent — safe to call repeatedly. Best-effort wrt failure: caller
 * should log + carry on rather than fail their pipeline.
 */

import { prisma } from "../prisma";
import {
  composeChunk,
  composeDreps,
  composeManifest,
  cacheKeys,
  writeCachedSnapshot,
  snapshotService,
  SNAPSHOT_CHUNK_SIZE,
  SNAPSHOT_SCHEMA_VERSION,
} from "../snapshot.service";
import { refreshDrepDenormColumnsWithResilience } from "./drep-denorm.service";
import { backfillAmountAtSwitch } from "./migration-amount-backfill.service";
import { refreshMigrationAggregateWithResilience } from "./migration-aggregate.service";

export interface SnapshotRebuildResult {
  durationMs: number;
  drepsByteSize: number;
  chunkByteSize: number;
  manifestByteSize: number;
  finalisedChunk: { start: number; end: number; byteSize: number } | null;
  currentEpoch: number;
}

async function readCurrentEpoch(): Promise<number> {
  const row = await prisma.epochTotals.aggregate({ _max: { epoch: true } });
  return row._max.epoch ?? 0;
}

export async function rebuildAfterEpoch(
  epochNo?: number
): Promise<SnapshotRebuildResult> {
  const startedAt = Date.now();
  const currentEpoch = epochNo ?? (await readCurrentEpoch());

  const currentChunkStart =
    Math.floor(currentEpoch / SNAPSHOT_CHUNK_SIZE) * SNAPSHOT_CHUNK_SIZE;

  // Refresh denorm columns FIRST so dreps blob picks up fresh values.
  try {
    await refreshDrepDenormColumnsWithResilience();
  } catch (e) {
    console.error("[snapshot-builder] denorm refresh failed (continuing)", e);
  }

  // Process a small batch of amount_at_switch backfill each cycle so new
  // changelog rows get historical active_stake without a thundering herd of
  // Koios calls. One-off bulk drain is the standalone script.
  // Skipped via env when ops want to disable Koios pressure during incidents.
  let backfillTouchedRows = 0;
  let backfillMinEpoch = Number.POSITIVE_INFINITY;
  if (process.env.SNAPSHOT_REBUILD_AMOUNT_BACKFILL !== "false") {
    try {
      const cap = Number.parseInt(
        process.env.SNAPSHOT_REBUILD_AMOUNT_BACKFILL_MAX_ROWS ?? "200",
        10
      );
      const result = await backfillAmountAtSwitch({
        maxRows: Number.isFinite(cap) ? cap : 200,
        source: "ingestion.snapshot-builder.amount-backfill",
      });
      if (result.rowsScanned > 0) {
        console.log(
          `[migration-amount-backfill] scanned=${result.rowsScanned} updated=${result.rowsUpdated} unknown=${result.rowsUnknown} epochs=${result.epochsProcessed} in ${result.durationMs}ms`
        );
        backfillTouchedRows = result.rowsScanned;
        if (result.epochSpan) backfillMinEpoch = result.epochSpan.min;
      }
    } catch (e) {
      console.error("[migration-amount-backfill] tick failed (continuing)", e);
    }
  }

  // If the backfill changed rows, re-aggregate so the chunks compose against
  // fresh amount_at_switch values, and invalidate every cached chunk whose
  // epoch span overlaps the backfilled range — otherwise older chunks (which
  // we don't recompose explicitly below) keep serving the old current-proxy totals.
  if (backfillTouchedRows > 0) {
    const fromEpoch = Number.isFinite(backfillMinEpoch) ? backfillMinEpoch : 0;
    try {
      const aggResult = await refreshMigrationAggregateWithResilience(prisma, fromEpoch);
      console.log(
        `[migration-aggregate] post-backfill refresh wrote ${aggResult.rowsWritten} rows from epoch ${fromEpoch} in ${aggResult.durationMs}ms`
      );
    } catch (e) {
      console.error("[migration-aggregate] post-backfill refresh failed (continuing)", e);
    }
    try {
      const firstAffectedChunkStart =
        Math.floor(fromEpoch / SNAPSHOT_CHUNK_SIZE) * SNAPSHOT_CHUNK_SIZE;
      const affectedKeys: string[] = [];
      for (let s = firstAffectedChunkStart; s <= currentChunkStart; s += SNAPSHOT_CHUNK_SIZE) {
        affectedKeys.push(cacheKeys.chunk(s));
      }
      if (affectedKeys.length > 0) {
        await prisma.snapshotCache.deleteMany({
          where: { cacheKey: { in: affectedKeys } },
        });
        snapshotService.invalidateAll(); // clear L1 too
        console.log(
          `[snapshot-builder] invalidated ${affectedKeys.length} chunk cache rows from epoch ${firstAffectedChunkStart}`
        );
      }
    } catch (e) {
      console.error("[snapshot-builder] post-backfill chunk invalidation failed (continuing)", e);
    }
  }

  // 1. Rebuild DReps roster (default + topN/includeHistory variants are read-time)
  const dreps = await composeDreps({});
  const drepsWritten = await writeCachedSnapshot(
    cacheKeys.dreps({}),
    dreps,
    { isFinal: false }
  );

  // 2. Rebuild current chunk
  const currentChunk = await composeChunk(currentChunkStart);
  const chunkWritten = await writeCachedSnapshot(
    cacheKeys.chunk(currentChunkStart),
    currentChunk,
    { isFinal: currentChunk.isFinal }
  );

  // 3. Finalise any chunk whose endEpoch < currentEpoch but is still flagged
  //    isFinal=false in the cache. This catches the boundary-miss case where
  //    the service was down or busy at the exact moment the epoch ticked over,
  //    and the previous-chunk row would otherwise stay mutable forever.
  let finalisedChunk: SnapshotRebuildResult["finalisedChunk"] = null;
  const previousChunkStart = currentChunkStart - SNAPSHOT_CHUNK_SIZE;
  if (previousChunkStart >= 0) {
    const previousChunkEnd = previousChunkStart + SNAPSHOT_CHUNK_SIZE - 1;
    if (previousChunkEnd < currentEpoch) {
      const previousChunkKey = cacheKeys.chunk(previousChunkStart);
      const cached = await prisma.snapshotCache.findUnique({
        where: { cacheKey: previousChunkKey },
        select: { isFinal: true },
      });
      // Only re-finalize if missing or still mutable. Already-final chunks are
      // immutable by contract — re-composing them would change generatedAt and
      // ETag on every rebuild, defeating CDN caching and re-doing historical work.
      // Targeted invalidation (e.g. amount-backfill) handles the legitimate
      // "redo a final chunk" case via explicit deleteMany above.
      const needsFinalize = !cached || !cached.isFinal;
      if (needsFinalize) {
        const finalChunk = await composeChunk(previousChunkStart);
        // composeChunk computes isFinal/isStable from DB tip + amount_source
        // distribution — preserve those values rather than forcing isFinal: true,
        // since "final but unstable" is a real state during backfill.
        const written = await writeCachedSnapshot(
          previousChunkKey,
          finalChunk,
          { isFinal: finalChunk.isFinal }
        );
        finalisedChunk = {
          start: previousChunkStart,
          end: previousChunkEnd,
          byteSize: written.byteSize,
        };
      }
    }
  }

  // 4. Manifest last — reflects new generatedAt + ETags + isFinal status of all chunks.
  const manifest = await composeManifest();
  const manifestWritten = await writeCachedSnapshot(
    cacheKeys.manifest(),
    manifest,
    { isFinal: false }
  );

  return {
    durationMs: Date.now() - startedAt,
    drepsByteSize: drepsWritten.byteSize,
    chunkByteSize: chunkWritten.byteSize,
    manifestByteSize: manifestWritten.byteSize,
    finalisedChunk,
    currentEpoch,
  };
}

/**
 * Boot recovery — at API startup, ensure SnapshotCache has at least the
 * minimum required artifacts. If anything is missing or stale, trigger a
 * one-shot rebuild. Runs in background; never blocks startup.
 */
export async function bootRecover(): Promise<void> {
  try {
    const currentEpoch = await readCurrentEpoch();
    if (currentEpoch === 0) {
      console.log("[snapshot-builder] boot-recover skipped — no epoch data yet");
      return;
    }

    const [manifest, dreps] = await Promise.all([
      prisma.snapshotCache.findUnique({ where: { cacheKey: cacheKeys.manifest() } }),
      prisma.snapshotCache.findUnique({ where: { cacheKey: cacheKeys.dreps({}) } }),
    ]);

    const stalenessThresholdMs = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    const needsRebuild =
      !manifest ||
      !dreps ||
      manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
      dreps.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
      now - manifest.generatedAt.getTime() > stalenessThresholdMs;

    if (!needsRebuild) {
      console.log(
        `[snapshot-builder] boot-recover OK — manifest age ${(
          (now - manifest.generatedAt.getTime()) / 1000
        ).toFixed(0)}s`
      );
      return;
    }

    console.log("[snapshot-builder] boot-recover: rebuilding snapshot");
    const result = await rebuildAfterEpoch(currentEpoch);
    console.log(
      `[snapshot-builder] boot-recover complete in ${result.durationMs}ms — dreps ${result.drepsByteSize}B chunk ${result.chunkByteSize}B manifest ${result.manifestByteSize}B`
    );
  } catch (e) {
    console.error("[snapshot-builder] boot-recover failed", e);
  }
}
