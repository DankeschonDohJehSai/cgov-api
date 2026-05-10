import { Request, Response } from "express";
import { GovernanceType } from "@prisma/client";
import { prisma } from "../../services";
import { cacheGet, cacheSet } from "../../services/cache";
import { governanceTypeLabelMap } from "../../libs/proposalMapper";
import { GetActionTypesResponse } from "../../responses";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";

const CACHE_KEY = "actions:types:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

let inFlight: Promise<GetActionTypesResponse> | null = null;

async function loadActionTypes(): Promise<GetActionTypesResponse> {
  const grouped = await prisma.proposal.groupBy({
    by: ["governanceActionType"],
    _count: { _all: true },
  });

  const types = grouped
    .filter((row) => row.governanceActionType !== null)
    .map((row) => ({
      type:
        governanceTypeLabelMap[row.governanceActionType as GovernanceType] ??
        "Unknown",
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return { types };
}

/**
 * GET /actions/types
 * Lists distinct governance action types with proposal counts.
 */
export const getActionTypes = async (_req: Request, res: Response) => {
  try {
    const cached = cacheGet<GetActionTypesResponse>(CACHE_KEY);
    if (cached) return res.json(cached);

    if (!inFlight) {
      inFlight = loadActionTypes()
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
    console.error("Error fetching action types", formatAxiosLikeError(error));
    res.status(500).json({
      error: "Failed to fetch action types",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
