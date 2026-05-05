import { Request, Response } from "express";
import { gunzipSync } from "node:zlib";
import { CachedSnapshot } from "../../services/snapshot.service";

/**
 * Sends a cached snapshot artifact with proper ETag/304 handling.
 * If the client accepts gzip, streams the pre-gzipped body directly with
 * Content-Encoding: gzip. Otherwise gunzips and sends plain JSON.
 *
 * Setting Content-Encoding bypasses the Express compression middleware,
 * which is exactly what we want — body is already compressed once at
 * cache-write time and reused on every read.
 */
export function sendCachedSnapshot<T>(
  req: Request,
  res: Response,
  cached: CachedSnapshot<T>
): void {
  const etag = `"${cached.etag}"`;
  res.setHeader("ETag", etag);
  // Body bytes vary by negotiated encoding — must be set BEFORE 304 too,
  // otherwise a CDN can match a gzip 304 against a no-encoding cache entry.
  res.setHeader("Vary", "Accept-Encoding");

  const ifNoneMatch = req.headers["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const acceptEncoding = String(req.headers["accept-encoding"] ?? "");
  if (acceptEncoding.includes("gzip")) {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", String(cached.gzippedBody.byteLength));
    res.status(200).end(cached.gzippedBody);
    return;
  }

  const json = gunzipSync(cached.gzippedBody);
  res.setHeader("Content-Length", String(json.byteLength));
  res.status(200).end(json);
}
