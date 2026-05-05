import { Request, Response } from "express";
import { prisma } from "../../services";
import { cacheGet, cacheSet } from "../../services/cache";
import { GetEpochsRangeResponse } from "../../responses";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";

const CACHE_KEY = "epochs:range:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

let inFlight: Promise<GetEpochsRangeResponse> | null = null;

async function loadEpochsRange(): Promise<GetEpochsRangeResponse> {
  const [proposalAgg, totalsMax] = await Promise.all([
    prisma.proposal.aggregate({ _min: { submissionEpoch: true } }),
    prisma.epochTotals.aggregate({ _max: { epoch: true } }),
  ]);

  const min = proposalAgg._min.submissionEpoch ?? 0;
  const max = totalsMax._max.epoch ?? min;

  return { min, max, current: max };
}

/**
 * GET /epochs/range
 * Aggregate epoch span available across the database.
 */
export const getEpochsRange = async (_req: Request, res: Response) => {
  try {
    const cached = cacheGet<GetEpochsRangeResponse>(CACHE_KEY);
    if (cached) return res.json(cached);

    if (!inFlight) {
      inFlight = loadEpochsRange()
        .then((data) => {
          cacheSet(CACHE_KEY, data, CACHE_TTL_MS);
          return data;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    const data = await inFlight;
    res.json(data);
  } catch (error) {
    console.error("Error fetching epoch range", formatAxiosLikeError(error));
    res.status(500).json({
      error: "Failed to fetch epoch range",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
