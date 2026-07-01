import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { addDiagnosticsBreadcrumb } from "../diagnostics.js";
import { parseBankStatement } from "../services/openaiClient.js";
import { ApiError } from "../utils/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_PDF_BYTES },
});

export const statementsRouter = Router();

statementsRouter.post(
  "/statements/parse",
  upload.single("pdf"),
  async (req, res, next) => {
    try {
      addDiagnosticsBreadcrumb("statement_parse_request", {
        feature: "pdf",
        stage: "parse",
        route: "/v1/statements/parse",
      });
      if (!req.file?.buffer?.length) {
        throw new ApiError(400, "invalid_request", "pdf file is required");
      }

      if (req.file.size > env.MAX_PDF_BYTES) {
        throw new ApiError(
          413,
          "payload_too_large",
          `PDF exceeds maximum allowed size of ${env.MAX_PDF_BYTES} bytes`,
        );
      }

      const mime = req.file.mimetype;
      if (mime && mime !== "application/pdf") {
        throw new ApiError(400, "invalid_request", "file must be a PDF");
      }

      const filename =
        typeof req.body.filename === "string" ? req.body.filename : undefined;

      const result = await parseBankStatement(req.file.buffer, filename);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
