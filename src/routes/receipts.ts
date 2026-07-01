import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { addDiagnosticsBreadcrumb } from "../diagnostics.js";
import { parseReceiptImage } from "../services/openaiClient.js";
import { categoriesSchema } from "../types/voice.js";
import { ApiError } from "../utils/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_IMAGE_BYTES },
});

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export const receiptsRouter = Router();

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

receiptsRouter.post(
  "/receipts/parse",
  upload.single("image"),
  async (req, res, next) => {
    try {
      addDiagnosticsBreadcrumb("receipt_parse_request", {
        feature: "receipt",
        stage: "parse",
        route: "/v1/receipts/parse",
      });
      if (!req.file?.buffer?.length) {
        throw new ApiError(400, "invalid_request", "image file is required");
      }

      if (req.file.size > env.MAX_IMAGE_BYTES) {
        throw new ApiError(
          413,
          "payload_too_large",
          `Image exceeds maximum allowed size of ${env.MAX_IMAGE_BYTES} bytes`,
        );
      }

      const mime = req.file.mimetype;
      if (!mime || !ALLOWED_IMAGE_MIME.has(mime)) {
        throw new ApiError(
          400,
          "invalid_request",
          "file must be a JPEG, PNG, HEIC, or WebP image",
        );
      }

      const categories = parseCategoriesField(req.body.categories);
      const clientTodayIso =
        typeof req.body.clientTodayIso === "string"
          ? req.body.clientTodayIso
          : undefined;
      const timezone =
        typeof req.body.timezone === "string" ? req.body.timezone : undefined;

      const result = await parseReceiptImage(req.file.buffer, mime, categories, {
        clientTodayIso,
        timezone,
      });
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
