import { Router, raw } from "express";
import { env } from "../config/env.js";

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

// Buffer the raw body for every content type so it can be forwarded verbatim
// (PostHog batches may be gzip-compressed JSON).
ingestRouter.use(raw({ type: () => true, limit: "25mb" }));

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
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
