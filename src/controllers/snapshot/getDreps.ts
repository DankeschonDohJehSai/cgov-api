import { Request, Response } from "express";
import { snapshotService } from "../../services/snapshot.service";
import { sendCachedSnapshot } from "./sendCachedSnapshot";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";

function parseIntOpt(value: unknown): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /snapshot/dreps
 */
export const getSnapshotDreps = async (req: Request, res: Response) => {
  try {
    const topN = parseIntOpt(req.query.topN);
    const includeHistory = req.query.includeHistory === "true";
    const cached = await snapshotService.getDreps({ topN, includeHistory });
    sendCachedSnapshot(req, res, cached);
  } catch (error) {
    console.error("Error fetching snapshot dreps", formatAxiosLikeError(error));
    res.status(500).json({
      error: "Failed to fetch snapshot dreps",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
