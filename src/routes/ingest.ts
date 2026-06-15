import { Router, raw } from "express";
import { env } from "../config/env.js";
import { resolveClientIp } from "../utils/clientIp.js";

/**
 * Reverse proxy for PostHog analytics ingestion.
 *
 * The iOS app points its PostHog `host` at `<backend>/ingest`, so ingestion
 * traffic and the public project key are funneled through our first-party
 * domain instead of hitting PostHog directly (avoids content-blocker drops and
 * keeps analytics on our infrastructure).
 *
 * This is NOT an open proxy: the upstream is fixed to `env.POSTHOG_HOST`; only
 * the path, query string, and body are forwarded.
 */
export const ingestRouter = Router();

// Buffer the body for every content type. posthog-ios always gzips its /batch/
// body and sends `Content-Encoding: gzip`; `inflate: true` (the default) lets
// body-parser transparently decompress it so `req.body` is plain JSON bytes.
// We then strip the `content-encoding` header below before forwarding, so the
// bytes and the header stay consistent (PostHog accepts uncompressed JSON).
ingestRouter.use(raw({ type: () => true, limit: "25mb" }));

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  // body-parser decompresses the request body, so the original encoding/length
  // no longer describe the forwarded bytes. Drop both and let fetch recompute
  // content-length from the (now plain JSON) buffer.
  "content-encoding",
  // Set explicitly below so PostHog always sees the end-user IP, not an
  // intermediate proxy hop (Caddy → Node is 127.0.0.1 in production).
  "x-forwarded-for",
  "x-real-ip",
]);

ingestRouter.use(async (req, res, next) => {
  try {
    const upstreamBase = env.POSTHOG_HOST.replace(/\/+$/, "");
    // Inside the mounted router, req.url is relative to /ingest and keeps the query string.
    const targetUrl = `${upstreamBase}${req.url}`;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (HOP_BY_HOP.has(key.toLowerCase())) continue;
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    // PostHog geoip reads X-Forwarded-For / X-Real-IP on the ingest request.
    // Behind Caddy, socket.remoteAddress is 127.0.0.1 — resolve the real client
    // from req.ip (trust proxy) or the leftmost X-Forwarded-For entry.
    const clientIp = resolveClientIp(req);
    if (clientIp) {
      headers["x-forwarded-for"] = clientIp;
      headers["x-real-ip"] = clientIp;
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body =
      hasBody && Buffer.isBuffer(req.body) && req.body.length > 0
        ? req.body
        : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.send(payload);
  } catch (err) {
    next(err);
  }
});
