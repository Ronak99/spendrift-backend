import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { captureServerException, captureUpstreamFailure } from "../diagnostics.js";
import { ApiError } from "../utils/errors.js";

function requestRoute(req: Request): string {
  return req.originalUrl.split("?")[0] ?? req.path;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    const apiErr = new ApiError(
      400,
      "invalid_request",
      err.errors[0]?.message ?? "Invalid request",
    );
    return res.status(apiErr.statusCode).json(apiErr.toJSON());
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      captureUpstreamFailure(
        featureForRoute(requestRoute(req)),
        err.code,
        requestRoute(req),
        err.details,
      );
    }
    return res.status(err.statusCode).json(err.toJSON());
  }

  if (err && typeof err === "object" && "code" in err) {
    const multerErr = err as { code?: string; message?: string };
    if (multerErr.code === "LIMIT_FILE_SIZE") {
      const apiErr = new ApiError(
        413,
        "payload_too_large",
        multerErr.message ?? "Payload too large",
      );
      return res.status(apiErr.statusCode).json(apiErr.toJSON());
    }
  }

  console.error("Unhandled error:", err);
  captureServerException(err, { route: requestRoute(req) });
  const apiErr = new ApiError(502, "upstream_failed", "Internal server error");
  return res.status(apiErr.statusCode).json(apiErr.toJSON());
}

function featureForRoute(route: string): "voice" | "pdf" | "receipt" {
  if (route.includes("/voice/")) return "voice";
  if (route.includes("/statements/")) return "pdf";
  if (route.includes("/receipts/")) return "receipt";
  return "voice";
}
