import type { NextFunction, Request, Response } from "express";

/** Route prefixes this service actually serves. A 404 under one of these is a
 * real client bug worth logging; a 404 anywhere else is an internet scanner. */
const KNOWN_PREFIXES = ["/v1", "/ingest", "/sentry", "/api"];

function requestTarget(req: Request): string {
  const baseUrl = req.baseUrl ?? "";
  const path = req.path ?? req.url?.split("?")[0] ?? "/";
  const query = req.url?.includes("?")
    ? req.url.slice(req.url.indexOf("?"))
    : "";
  return `${baseUrl}${path}${query}`;
}

/**
 * Suppresses two high-volume, zero-signal categories that otherwise dominate
 * the journal and the Loki ingest quota:
 *   - scanner 404s probing for credentials (/firebase-adminsdk.json, /.env, ...)
 *   - the PostHog proxy heartbeat, which batches every 30s around the clock
 * Anything that fails, and every 404 on a route we actually own, still logs.
 */
function isNoise(target: string, statusCode: number): boolean {
  if (statusCode === 404) {
    const path = target.split("?")[0] ?? "/";
    return !KNOWN_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }

  if (statusCode < 400 && target.startsWith("/ingest/")) return true;

  return false;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const target = requestTarget(req);
    if (isNoise(target, res.statusCode)) return;

    const durationMs = Date.now() - startedAt;
    console.log(`${req.method} ${target} -> ${res.statusCode} (${durationMs}ms)`);
  });

  next();
}
