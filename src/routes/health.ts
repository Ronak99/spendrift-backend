import { Router } from "express";
import { env } from "../config/env.js";
import { pingSupabase } from "../services/supabaseClient.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const supabase = await pingSupabase();

  res.json({
    status: "ok",
    version: env.version,
    models: {
      voice: env.VOICE_MODEL,
      statement: env.STATEMENT_MODEL,
      receipt: env.RECEIPT_MODEL,
    },
    supabase: supabase.ok
      ? { status: "ok" }
      : { status: "error", error: supabase.error },
  });
});
