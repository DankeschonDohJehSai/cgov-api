import { Request, Response, NextFunction } from "express";

/**
 * Sets cache headers based on the final response status:
 *   - 2xx/3xx: `Cache-Control: public, max-age=<sec>, stale-while-revalidate=<sec>`
 *     (only if the controller didn't already set its own — e.g. snapshot
 *     final-chunk handler sets `immutable, max-age=2592000`)
 *   - 4xx/5xx: `Cache-Control: no-store` to prevent CDNs and browsers from
 *     pinning transient errors.
 *
 * The decision is deferred until headers are about to be flushed by
 * intercepting `res.writeHead` — that's the last point we can adjust headers
 * before they go out, and we get the actual statusCode (not the optimistic
 * 200 from the start of the request).
 */
export const cacheControl = (
  maxAgeSec: number,
  staleWhileRevalidateSec: number = 60
) => (_req: Request, res: Response, next: NextFunction) => {
  const successHeader = `public, max-age=${maxAgeSec}, stale-while-revalidate=${staleWhileRevalidateSec}`;
  const originalWriteHead = res.writeHead.bind(res);

  res.writeHead = function (statusCode: number, ...rest: unknown[]) {
    if (statusCode >= 400) {
      res.setHeader("Cache-Control", "no-store");
    } else if (!res.getHeader("Cache-Control")) {
      res.setHeader("Cache-Control", successHeader);
    }
    return (originalWriteHead as any)(statusCode, ...rest);
  } as any;

  next();
};
