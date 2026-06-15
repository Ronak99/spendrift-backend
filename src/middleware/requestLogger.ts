import type { NextFunction, Request, Response } from "express";

function requestTarget(req: Request): string {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return `${req.baseUrl}${req.path}${query}`;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `${req.method} ${requestTarget(req)} -> ${res.statusCode} (${durationMs}ms)`,
    );
  });

  next();
}
