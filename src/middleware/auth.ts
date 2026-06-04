import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(
      new ApiError(401, "unauthorized", "Invalid or missing bearer token"),
    );
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token || !env.clientTokens.includes(token)) {
    return next(
      new ApiError(401, "unauthorized", "Invalid or missing bearer token"),
    );
  }

  next();
}
