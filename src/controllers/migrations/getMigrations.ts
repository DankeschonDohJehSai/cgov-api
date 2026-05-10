import { Request, Response } from "express";
import { prisma } from "../../services";
import {
  getMigrationAggregateAccuracy,
} from "../../services/ingestion/migration-aggregate.service";
import { GetMigrationsResponse, MigrationRow } from "../../responses";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";

const ALWAYS_ABSTAIN = "drep_always_abstain";
const ALWAYS_NO_CONFIDENCE = "drep_always_no_confidence";

function lovelaceToAda(lovelace: bigint): string {
  return (Number(lovelace) / 1_000_000).toFixed(6);
}

function parseIntOpt(value: unknown, fallback: number): number {
  if (typeof value !== "string" || !value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /migrations
 *
 * Query params:
 *   epochStart      — inclusive lower bound on delegated epoch (default 0)
 *   epochEnd        — inclusive upper bound (default Number.MAX_SAFE_INTEGER)
 *   fromDrepId      — optional source-DRep filter
 *   toDrepId        — optional target-DRep filter
 *   excludeSentinels — drop rows touching drep_always_* (default true)
 *   topNByPower     — optional cap: only return rows whose source AND target
 *                     DReps are among the top-N DReps by current voting_power.
 */
export const getMigrations = async (req: Request, res: Response) => {
  try {
    const epochStart = parseIntOpt(req.query.epochStart, 0);
    // Postgres INT max — Prisma rejects MAX_SAFE_INTEGER as out-of-range for an Int column.
    const POSTGRES_INT_MAX = 2_147_483_647;
    const epochEnd = parseIntOpt(req.query.epochEnd, POSTGRES_INT_MAX);
    const fromDrepId = typeof req.query.fromDrepId === "string" ? req.query.fromDrepId : undefined;
    const toDrepId = typeof req.query.toDrepId === "string" ? req.query.toDrepId : undefined;
    const excludeSentinels = req.query.excludeSentinels !== "false";
    const topNByPower = parseIntOpt(req.query.topNByPower, 0);

    let topNDrepIds: string[] | null = null;
    if (topNByPower > 0) {
      const topRows = await prisma.drep.findMany({
        where: { OR: [{ doNotList: false }, { doNotList: null }] },
        orderBy: { votingPower: "desc" },
        take: topNByPower,
        select: { drepId: true },
      });
      topNDrepIds = topRows.map((r) => r.drepId);
    }

    const fromDrepIdFilter: Record<string, unknown> = {};
    if (fromDrepId) fromDrepIdFilter.equals = fromDrepId;
    if (excludeSentinels) {
      fromDrepIdFilter.notIn = [ALWAYS_ABSTAIN, ALWAYS_NO_CONFIDENCE];
    }
    if (topNDrepIds) {
      fromDrepIdFilter.in = topNDrepIds;
    }

    const toDrepIdFilter: Record<string, unknown> = {};
    if (toDrepId) toDrepIdFilter.equals = toDrepId;
    if (excludeSentinels) {
      toDrepIdFilter.notIn = [ALWAYS_ABSTAIN, ALWAYS_NO_CONFIDENCE];
    }
    if (topNDrepIds) {
      toDrepIdFilter.in = topNDrepIds;
    }

    const rows = await prisma.migrationAggregate.findMany({
      where: {
        epoch: { gte: epochStart, lte: epochEnd },
        ...(Object.keys(fromDrepIdFilter).length ? { fromDrepId: fromDrepIdFilter as any } : {}),
        ...(Object.keys(toDrepIdFilter).length ? { toDrepId: toDrepIdFilter as any } : {}),
      },
      orderBy: [{ epoch: "asc" }, { fromDrepId: "asc" }, { toDrepId: "asc" }],
    });

    const migrations: MigrationRow[] = rows.map((r) => ({
      epoch: r.epoch,
      fromDrepId: r.fromDrepId,
      toDrepId: r.toDrepId,
      lovelace: r.adaLovelace.toString(),
      ada: lovelaceToAda(r.adaLovelace),
      delegators: r.delegators,
    }));

    const accuracy = await getMigrationAggregateAccuracy(prisma, {
      epochStart,
      epochEnd,
      fromDrepId,
      toDrepId,
      excludeSentinels,
      drepIdAllowlist: topNDrepIds ?? undefined,
    });

    const lastComputedAt = rows.reduce<Date | null>((acc, r) => {
      if (!acc || r.computedAt > acc) return r.computedAt;
      return acc;
    }, null);

    const response: GetMigrationsResponse = {
      migrations,
      meta: {
        epochStart,
        epochEnd: epochEnd === POSTGRES_INT_MAX ? -1 : epochEnd,
        rowCount: migrations.length,
        accuracy: accuracy.level,
        sourceDistribution: {
          total: accuracy.totalChangeRows,
          koiosHistory: accuracy.rowsWithKoiosHistory,
          currentProxy: accuracy.rowsWithCurrentProxy,
          unknown: accuracy.rowsUnknown,
        },
        lastComputedAt: lastComputedAt ? lastComputedAt.toISOString() : null,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching migrations", formatAxiosLikeError(error));
    res.status(500).json({
      error: "Failed to fetch migrations",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
