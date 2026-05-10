import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { sendCachedSnapshot } from "../src/controllers/snapshot/sendCachedSnapshot";
import type { CachedSnapshot } from "../src/services/snapshot.service";

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | number>;
  body: Buffer | null;
  ended: boolean;
  setHeader(name: string, value: string | number): void;
  status(code: number): MockResponse;
  end(payload?: Buffer | string): MockResponse;
}

function makeRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end(payload?: Buffer | string) {
      if (payload !== undefined) {
        this.body = Buffer.isBuffer(payload)
          ? payload
          : Buffer.from(String(payload));
      }
      this.ended = true;
      return this;
    },
  };
  return res;
}

function buildCached<T>(payload: T): CachedSnapshot<T> {
  const json = Buffer.from(JSON.stringify(payload));
  const gzipped = gzipSync(json);
  const etag = createHash("sha1").update(gzipped).digest("hex");
  return {
    data: payload,
    etag,
    generatedAt: new Date(),
    isFinal: false,
    byteSize: gzipped.byteLength,
    gzippedBody: gzipped,
  };
}

describe("sendCachedSnapshot", () => {
  it("streams gzipped body when client accepts gzip", () => {
    const payload = { hello: "world" };
    const cached = buildCached(payload);

    const req: any = { headers: { "accept-encoding": "gzip, deflate, br" } };
    const res = makeRes();

    sendCachedSnapshot(req, res as any, cached);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["etag"]).toBe(`"${cached.etag}"`);
    expect(res.headers["vary"]).toBe("Accept-Encoding");
    expect(res.body).toEqual(cached.gzippedBody);
    // Round-trip: gunzip body matches the original payload
    const decoded = JSON.parse(gunzipSync(res.body!).toString("utf-8"));
    expect(decoded).toEqual(payload);
  });

  it("falls back to plain JSON when client does not accept gzip", () => {
    const payload = { foo: 42 };
    const cached = buildCached(payload);

    const req: any = { headers: { "accept-encoding": "identity" } };
    const res = makeRes();

    sendCachedSnapshot(req, res as any, cached);

    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString("utf-8"))).toEqual(payload);
  });

  it("returns 304 when If-None-Match matches", () => {
    const cached = buildCached({ a: 1 });
    const req: any = {
      headers: { "if-none-match": `"${cached.etag}"`, "accept-encoding": "gzip" },
    };
    const res = makeRes();

    sendCachedSnapshot(req, res as any, cached);

    expect(res.statusCode).toBe(304);
    expect(res.body).toBeNull();
    expect(res.headers["etag"]).toBe(`"${cached.etag}"`);
    expect(res.headers["vary"]).toBe("Accept-Encoding");
  });
});
