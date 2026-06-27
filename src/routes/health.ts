import { Router } from "express";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: env.version,
    models: {
      voice: env.VOICE_MODEL,
      statement: env.STATEMENT_MODEL,
      receipt: env.RECEIPT_MODEL,
    },
  });
});
