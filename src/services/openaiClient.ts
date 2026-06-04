import { z } from "zod";
import { env } from "../config/env.js";
import { ApiError, truncateDetails } from "../utils/errors.js";
import { stripMarkdownCodeFence } from "../utils/markdown.js";
import {
  STATEMENT_SYSTEM_PROMPT,
  STATEMENT_USER_INSTRUCTION,
} from "./statementPrompt.js";
import {
  buildVoiceSystemPrompt,
  getVoiceUserInstruction,
} from "./voicePrompt.js";
import type { CategoryInput } from "../types/voice.js";
import {
  statementParseResponseSchema,
  type StatementParseResponse,
} from "../types/statement.js";
import { voiceParseResponseSchema, type VoiceParseResponse } from "../types/voice.js";
import { sanitizeStatementFilename } from "../utils/filename.js";

async function openaiFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = env.UPSTREAM_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${env.OPENAI_BASE_URL.replace(/\/$/, "")}${path}`;
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        ...rest.headers,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(504, "upstream_timeout", "Upstream request timed out");
    }
    throw new ApiError(
      502,
      "upstream_failed",
      "Failed to reach upstream AI provider",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readUpstreamError(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  throw new ApiError(
    502,
    "upstream_failed",
    "OpenAI request failed",
    truncateDetails(`status ${res.status}: ${body}`),
  );
}

function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ApiError(502, "missing_model_output", "Model returned empty content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ApiError(
      502,
      "invalid_model_json",
      "Model returned non-JSON text",
      truncateDetails(trimmed),
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(
      502,
      "invalid_model_json",
      "Model JSON does not match expected schema",
      truncateDetails(trimmed),
    );
  }

  return result.data;
}

export async function parseVoiceTransaction(
  audioBuffer: Buffer,
  categories: CategoryInput[],
  options: { clientTodayIso?: string; timezone?: string },
): Promise<VoiceParseResponse> {
  const systemPrompt = buildVoiceSystemPrompt(categories, options);
  const audioBase64 = audioBuffer.toString("base64");

  const res = await openaiFetch("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.VOICE_MODEL,
      modalities: ["text"],
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: getVoiceUserInstruction() },
            {
              type: "input_audio",
              input_audio: { data: audioBase64, format: "wav" },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    await readUpstreamError(res);
  }

  const completion = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ApiError(502, "missing_model_output", "Model returned empty content");
  }

  return parseModelJson(content, voiceParseResponseSchema);
}

function extractResponsesOutputText(data: Record<string, unknown>): string {
  const topLevel = data.output_text;
  if (typeof topLevel === "string" && topLevel.trim()) {
    return topLevel.trim();
  }

  const output = data.output;
  if (!Array.isArray(output)) {
    return "";
  }

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const typed = block as { type?: string; text?: string };
      if (typed.type === "output_text" && typed.text?.trim()) {
        return typed.text.trim();
      }
    }
  }

  return "";
}

export async function parseBankStatement(
  pdfBuffer: Buffer,
  filename?: string,
): Promise<StatementParseResponse> {
  const uploadName = sanitizeStatementFilename(filename);
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append(
    "file",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    uploadName,
  );

  const uploadRes = await openaiFetch("/files", {
    method: "POST",
    body: form,
  });

  if (!uploadRes.ok) {
    await readUpstreamError(uploadRes);
  }

  const uploadJson = (await uploadRes.json()) as { id?: string };
  const fileId = uploadJson.id;
  if (!fileId) {
    throw new ApiError(
      502,
      "upstream_failed",
      "OpenAI Files API did not return a file id",
    );
  }

  try {
    const responsesRes = await openaiFetch("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.STATEMENT_MODEL,
        instructions: STATEMENT_SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: fileId },
              { type: "input_text", text: STATEMENT_USER_INSTRUCTION },
            ],
          },
        ],
      }),
    });

    if (!responsesRes.ok) {
      await readUpstreamError(responsesRes);
    }

    const responsesData = (await responsesRes.json()) as Record<string, unknown>;
    const outputText = extractResponsesOutputText(responsesData);
    if (!outputText) {
      throw new ApiError(502, "missing_model_output", "Model returned empty content");
    }

    const stripped = stripMarkdownCodeFence(outputText);
    const payload = parseModelJson(stripped, statementParseResponseSchema);

    return {
      transactions: payload.transactions.filter((t) => t.amount > 0),
    };
  } finally {
    try {
      const deleteRes = await openaiFetch(`/files/${fileId}`, {
        method: "DELETE",
      });
      if (!deleteRes.ok) {
        console.warn(
          `Failed to delete OpenAI file ${fileId}: status ${deleteRes.status}`,
        );
      }
    } catch (err) {
      console.warn(`Failed to delete OpenAI file ${fileId}:`, err);
    }
  }
}
