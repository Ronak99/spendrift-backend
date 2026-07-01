import { Router, raw } from "express";
import type { NextFunction, Request, Response } from "express";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { env } from "../config/env.js";

/**
 * Reverse proxy (tunnel) for Sentry envelope ingestion from the iOS app.
 *
 * The iOS SDK DSN host is rewritten to the backend base URL, so envelopes arrive
 * at `/api/:projectId/envelope/` (Sentry's standard ingest path). A legacy
 * `POST /sentry` route is kept for manual testing.
 */
export const sentryRouter = Router();

sentryRouter.use(raw({ type: () => true, limit: "25mb" }));

function envelopeUrlFromDsn(dsn: string): string {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) {
    throw new Error("Invalid Sentry DSN");
  }
  // Authenticate via query params so the request works regardless of which
  // auth headers the SDK forwarded through the tunnel.
  const auth = `?sentry_key=${parsed.publicKey}&sentry_version=7`;
  return `${parsed.protocol}//${parsed.host}/api/${parsed.projectId}/envelope/${auth}`;
}

interface ParsedSentryDsn {
  protocol: string;
  host: string;
  publicKey: string;
  projectId: string;
}

function parseSentryDsn(dsn: string): ParsedSentryDsn | undefined {
  try {
    const url = new URL(dsn.trim());
    const projectId = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!projectId || !url.hostname) return undefined;
    return {
      protocol: url.protocol,
      host: url.port
        ? `${url.hostname}:${url.port}`
        : url.hostname,
      publicKey: url.username,
      projectId,
    };
  } catch {
    return undefined;
  }
}

function decodeEnvelopeBody(
  body: Buffer,
  contentEncoding?: string,
): Buffer {
  if (body.length > 0 && body[0] === 0x7b) {
    return body;
  }

  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) {
    try {
      return gunzipSync(body);
    } catch {
      return body;
    }
  }

  const encoding = contentEncoding?.toLowerCase() ?? "";
  if (encoding.includes("gzip")) {
    try {
      return gunzipSync(body);
    } catch {
      return body;
    }
  }
  if (encoding.includes("deflate")) {
    try {
      return inflateSync(body);
    } catch {
      return body;
    }
  }
  if (encoding.includes("br")) {
    try {
      return brotliDecompressSync(body);
    } catch {
      return body;
    }
  }

  return body;
}

function dsnFromEnvelope(body: Buffer): string | undefined {
  const headerLine = body.toString("utf8").split("\n")[0]?.trim();
  if (!headerLine) return undefined;

  try {
    const header = JSON.parse(headerLine) as { dsn?: string };
    return header.dsn;
  } catch {
    return undefined;
  }
}

async function handleEnvelope(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!env.SENTRY_TUNNEL_DSN) {
      res.status(503).json({ error: "Sentry tunnel is not configured" });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Missing envelope body" });
      return;
    }

    const contentEncoding =
      typeof req.headers["content-encoding"] === "string"
        ? req.headers["content-encoding"]
        : undefined;
    const envelopeBody = decodeEnvelopeBody(req.body, contentEncoding);

    const configured = parseSentryDsn(env.SENTRY_TUNNEL_DSN);
    if (!configured) {
      res.status(500).json({ error: "Sentry tunnel DSN is invalid" });
      return;
    }

    // On the standard ingest path (`/api/:projectId/envelope/`) the SDK identifies
    // the project via the URL and omits `dsn` from the envelope header. The legacy
    // `/sentry` route has no URL project id, so fall back to the header `dsn`.
    const urlProjectId =
      typeof req.params.projectId === "string" ? req.params.projectId : undefined;
    const envelopeDsn = dsnFromEnvelope(envelopeBody);
    const envelopeParsed = envelopeDsn ? parseSentryDsn(envelopeDsn) : undefined;
    const effectiveProjectId = urlProjectId ?? envelopeParsed?.projectId;

    const projectOk = effectiveProjectId === configured.projectId;
    const publicKeyOk =
      !envelopeParsed || envelopeParsed.publicKey === configured.publicKey;

    if (!projectOk || !publicKeyOk) {
      if (env.NODE_ENV === "development") {
        console.warn(
          "Sentry tunnel rejected envelope:",
          `projectOk=${projectOk} publicKeyOk=${publicKeyOk} urlProjectId=${urlProjectId ?? "none"} headerDsn=${envelopeDsn ?? "none"}`,
        );
      }
      res.status(403).json({ error: "Invalid envelope project" });
      return;
    }

    const targetUrl = envelopeUrlFromDsn(env.SENTRY_TUNNEL_DSN);
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
      },
      body: envelopeBody,
    });

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.send(payload);
  } catch (err) {
    next(err);
  }
}

sentryRouter.post("/api/:projectId/envelope/", handleEnvelope);
sentryRouter.post("/", handleEnvelope);
