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
 * GET /snapshot/manifest
 */
export const getSnapshotManifest = async (req: Request, res: Response) => {
  try {
    const epochStart = parseIntOpt(req.query.epochStart);
    const epochEnd = parseIntOpt(req.query.epochEnd);
    const cached = await snapshotService.getManifest({ epochStart, epochEnd });
    sendCachedSnapshot(req, res, cached);
  } catch (error) {
    console.error("Error fetching snapshot manifest", formatAxiosLikeError(error));
    res.status(500).json({
      error: "Failed to fetch snapshot manifest",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
