import type { CategoryInput } from "../types/voice.js";
import { resolveTodayIso } from "./voicePrompt.js";

const RECEIPT_USER_INSTRUCTION =
  "Read this receipt or transaction screenshot and extract the single expense (or income) it represents. Respond with only the JSON from your instructions. If a field cannot be determined from the image, set it to null and list it in missingFields. Never guess.";

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
    income.length > 0 ? income.map((n) => `- ${n}`).join("\n") : "- (none)";
  const expenseLines =
    expense.length > 0 ? expense.map((n) => `- ${n}`).join("\n") : "- (none)";

  return `---

## ALLOWED CATEGORIES (DYNAMIC - CURRENT USER DATA)

### Income
${incomeLines}

### Expense
${expenseLines}

---

IMPORTANT:
- Choose category only from the dynamic list above.
- If no match exists in the dynamic categories, use null and add "category" to missingFields.`;
}

const RECEIPT_BASE_PROMPT = `You are a financial transaction parser for receipt and payment screenshots. You receive a single image (a receipt, bill, invoice, or payment confirmation screenshot) and must extract one money transaction from it. Respond with a single valid JSON object — nothing else. No explanations, no markdown, no code blocks. Just raw JSON.

---

## OUTPUT FORMAT

If the image contains a usable transaction, respond with:

{
  "status": "success",
  "transaction": {
    "notes": "<brief description, e.g. merchant name or what was bought>",
    "amount": <positive number with no currency symbols, or null if not legible>,
    "date": "<ISO 8601 format: YYYY-MM-DDTHH:MM:SS, or null if not present on the receipt>",
    "transactionType": "<'expense' or 'income'>",
    "category": "<best matching category name from the list below, or null if unclear>"
  },
  "missingFields": ["<names of any fields above that could not be determined from the image>"]
}

If the image is not a receipt/transaction or contains nothing usable, respond with:

{
  "status": "error",
  "reason": "<brief reason why parsing failed>"
}

---

## RULES

- You have ONE attempt. Do not ask follow-up questions.
- Always return raw JSON. Never wrap it in markdown or add any surrounding text.
- **Do not fabricate.** Use only what is visible in the image. If a field cannot be read or inferred, set it to null and include its name in "missingFields". Allowed field names: "notes", "amount", "date", "transactionType", "category".
- "amount" must be the grand total actually paid, as a positive number with no currency symbols. If multiple totals appear, prefer the final total/amount paid. If illegible, set null and add "amount" to missingFields.
- "transactionType" must be exactly "expense" or "income" (lowercase). Receipts and bills are almost always "expense"; treat refunds or money received as "income". If genuinely unclear, default to "expense" and add "transactionType" to missingFields.
- For "date", use the transaction date printed on the receipt in ISO 8601 format. If no date is visible, set null, add "date" to missingFields, and the client will default to today ({{TODAY_ISO}}).
- For "category", pick the single best match from the allowed list below. If nothing fits, use null and add "category" to missingFields.
- "notes" should be a short human-readable description (merchant name preferred). If no name is legible, set null and add "notes" to missingFields.
- Preserve the spelling of any proper nouns (merchant names) exactly as they appear in the image.
- If the image is blank, not a receipt, or has no legible transaction, return the error JSON.`;

export function buildReceiptSystemPrompt(
  categories: CategoryInput[],
  options: { clientTodayIso?: string; timezone?: string },
): string {
  const todayIso = resolveTodayIso(options);
  const base = RECEIPT_BASE_PROMPT.replaceAll("{{TODAY_ISO}}", todayIso);

  const dateBlock = `## CURRENT DATE CONTEXT
- Today is ${todayIso}. If the receipt does not show a date, set "date" to null.`;

  return [base, dateBlock, buildCategoryBlock(categories)].join("\n\n");
}

export function getReceiptUserInstruction(): string {
  return RECEIPT_USER_INSTRUCTION;
}
