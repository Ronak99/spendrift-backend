import { env } from "../config/env.js";
import type { CategoryInput } from "../types/voice.js";

const VOICE_USER_INSTRUCTION =
  "Listen to this recording. If there is no clear spoken description of a real money transaction (for example silence, only noise, or no usable details), respond with only the error JSON from your instructions. Otherwise respond with only the success transaction JSON. No other text.";

export function resolveTodayIso(options: {
  clientTodayIso?: string;
  timezone?: string;
}): string {
  if (options.clientTodayIso?.trim()) {
    return options.clientTodayIso.trim();
  }

  const tz = options.timezone?.trim();
  if (tz) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? "00";

      return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
    } catch {
      // fall through to UTC
    }
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

function replaceTodayPlaceholders(text: string, todayIso: string): string {
  return text.replaceAll("{{TODAY_ISO}}", todayIso);
}

function buildCategoryBlock(categories: CategoryInput[]): string {
  const income = categories
    .filter((c) => c.type === "income")
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
  const expense = categories
    .filter((c) => c.type === "expense")
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  const incomeLines =
    income.length > 0
      ? income.map((n) => `- ${n}`).join("\n")
      : "- (none)";
  const expenseLines =
    expense.length > 0
      ? expense.map((n) => `- ${n}`).join("\n")
      : "- (none)";

  return `---

## ALLOWED CATEGORIES (DYNAMIC - CURRENT USER DATA)

### Income
${incomeLines}

### Expense
${expenseLines}

---

IMPORTANT:
- Choose category only from the dynamic list above.
- If no match exists in dynamic categories, use null.`;
}

export function buildVoiceSystemPrompt(
  categories: CategoryInput[],
  options: { clientTodayIso?: string; timezone?: string },
): string {
  const todayIso = resolveTodayIso(options);
  const base = replaceTodayPlaceholders(env.basePromptTemplate, todayIso);

  const dateBlock = `## CURRENT DATE CONTEXT
- Today is ${todayIso}. If the user does not mention a date explicitly, use this exact value.`;

  return [base, dateBlock, buildCategoryBlock(categories)].join("\n\n");
}

export function getVoiceUserInstruction(): string {
  return VOICE_USER_INSTRUCTION;
}
