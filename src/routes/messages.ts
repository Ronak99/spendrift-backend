import { Router } from "express";
import { addDiagnosticsBreadcrumb } from "../diagnostics.js";
import { env } from "../config/env.js";
import { parseTransactionMessages } from "../services/openaiClient.js";
import { messageParseRequestSchema } from "../types/message.js";
import { ApiError, truncateDetails } from "../utils/errors.js";

export const messagesRouter = Router();

messagesRouter.post("/messages/parse-transactions", async (req, res, next) => {
  try {
    addDiagnosticsBreadcrumb("message_parse_request", {
      feature: "message",
      stage: "parse",
      route: "/v1/messages/parse-transactions",
    });

    const parsed = messageParseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_request",
        "Invalid message parse request",
        truncateDetails(JSON.stringify(parsed.error.flatten())),
      );
    }

    const { messages, categories, clientTodayIso, timezone } = parsed.data;

    if (messages.length > env.MAX_MESSAGES_PER_REQUEST) {
      throw new ApiError(
        400,
        "invalid_request",
        `At most ${env.MAX_MESSAGES_PER_REQUEST} messages are allowed per request`,
      );
    }

    for (const message of messages) {
      if (message.body.length > env.MAX_MESSAGE_CHARS) {
        throw new ApiError(
          400,
          "invalid_request",
          `Message body exceeds maximum of ${env.MAX_MESSAGE_CHARS} characters`,
        );
      }
    }

    const result = await parseTransactionMessages(messages, categories, {
      clientTodayIso,
      timezone,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});
