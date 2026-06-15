import type { Request } from "express";

/** Strip Node's IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4). */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  if (trimmed === "::1") {
    return "127.0.0.1";
  }
  return trimmed;
}

/** Leftmost entry in X-Forwarded-For is the original client (RFC 7239). */
function firstForwardedFor(
  header: string | string[] | undefined,
): string | undefined {
  if (!header) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

/**
 * Resolve the end-user IP for outbound proxy forwarding.
 *
 * Behind Caddy/LB, `socket.remoteAddress` is the reverse proxy (often
 * 127.0.0.1). `req.ip` and X-Forwarded-For carry the real client when
 * `trust proxy` is enabled.
 */
export function resolveClientIp(req: Request): string | undefined {
  for (const raw of [
    req.ip,
    firstForwardedFor(req.headers["x-forwarded-for"]),
    req.socket.remoteAddress,
  ]) {
    if (!raw) continue;
    const ip = normalizeIp(raw);
    if (ip) return ip;
  }
  return undefined;
}
