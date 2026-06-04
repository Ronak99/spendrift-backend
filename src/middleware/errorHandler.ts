import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
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
  const apiErr = new ApiError(502, "upstream_failed", "Internal server error");
  return res.status(apiErr.statusCode).json(apiErr.toJSON());
}
