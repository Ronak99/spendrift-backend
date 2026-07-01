import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { addDiagnosticsBreadcrumb } from "../diagnostics.js";
import { parseVoiceTransaction } from "../services/openaiClient.js";
import {
  categoriesSchema,
  voiceParseJsonRequestSchema,
} from "../types/voice.js";
import { ApiError } from "../utils/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_AUDIO_BYTES },
});

export const voiceRouter = Router();

function parseCategoriesField(raw: unknown) {
  if (typeof raw === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "invalid_request", "categories must be valid JSON");
    }
    return categoriesSchema.parse(parsed);
  }
  return categoriesSchema.parse(raw);
}

voiceRouter.post(
  "/voice/parse-transaction",
  upload.single("audio"),
  async (req, res, next) => {
    try {
      addDiagnosticsBreadcrumb("voice_parse_request", {
        feature: "voice",
        stage: "parse",
        route: "/v1/voice/parse-transaction",
      });
      const contentType = req.headers["content-type"] ?? "";

      if (contentType.includes("application/json")) {
        const body = voiceParseJsonRequestSchema.parse(req.body);
        if (body.audioFormat !== "wav") {
          throw new ApiError(400, "invalid_request", 'audioFormat must be "wav"');
        }

        const audioBuffer = Buffer.from(body.audioBase64, "base64");
        if (audioBuffer.length === 0) {
          throw new ApiError(400, "invalid_request", "audio is required");
        }
        if (audioBuffer.length > env.MAX_AUDIO_BYTES) {
          throw new ApiError(
            413,
            "payload_too_large",
            "Audio exceeds maximum allowed size",
          );
        }

        const result = await parseVoiceTransaction(
          audioBuffer,
          body.categories,
          {
            clientTodayIso: body.clientTodayIso,
            timezone: body.timezone,
          },
        );
        return res.json(result);
      }

      if (!req.file?.buffer?.length) {
        throw new ApiError(400, "invalid_request", "audio is required");
      }

      const categories = parseCategoriesField(req.body.categories);
      const clientTodayIso =
        typeof req.body.clientTodayIso === "string"
          ? req.body.clientTodayIso
          : undefined;
      const timezone =
        typeof req.body.timezone === "string" ? req.body.timezone : undefined;

      const result = await parseVoiceTransaction(
        req.file.buffer,
        categories,
        { clientTodayIso, timezone },
      );
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
