import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

function loadBasePrompt(): string {
  const path = join(projectRoot, "prompts", "basePrompt.md");
  return readFileSync(path, "utf8");
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SPENDRIFT_CLIENT_TOKENS: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  VOICE_MODEL: z.string().min(1).default("gpt-audio-mini"),
  STATEMENT_MODEL: z.string().min(1).default("gpt-4o"),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  MAX_PDF_BYTES: z.coerce.number().int().positive().default(20_971_520),
  MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(3_000_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten());
  process.exit(1);
}

const basePromptTemplate = loadBasePrompt();

export const env = {
  ...parsed.data,
  clientTokens: parsed.data.SPENDRIFT_CLIENT_TOKENS.split(",")
    .map((t) => t.trim())
    .filter(Boolean),
  basePromptTemplate,
  version: "1.0.0" as const,
};
