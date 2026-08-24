import type { CategoryInput } from "../types/voice.js";
import type { MessageInput } from "../types/message.js";
import { resolveTodayIso } from "./voicePrompt.js";

const MESSAGE_USER_INSTRUCTION =
  "Parse each bank SMS below into a transaction result. Respond with ONLY the JSON object from your instructions. Reject promotions, OTPs, reminders, balance enquiries, declined or failed transactions, and reversals.";

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
- If no match exists, set category to null (uncategorized).`;
}

const MESSAGE_BASE_PROMPT = `You are a bank SMS transaction parser for Spendrift. You receive one or more SMS message bodies that may describe money movements. For each message you must return either a structured transaction or an error rejection.

Respond with ONLY a JSON object in this schema — no commentary, no markdown fences:

{
  "results": [
    {
      "id": "<exact id from the input message>",
      "status": "success",
      "transaction": {
        "notes": "<short merchant/description>",
        "amount": <positive number>,
        "date": "<ISO 8601 date or datetime>",
        "transactionType": "<'expense' | 'income' | 'none'>",
        "category": "<category name from the allowed list, or null>"
      }
    },
    {
      "id": "<exact id from the input message>",
      "status": "error",
      "reason": "<brief rejection reason>"
    }
  ]
}

Rules:
- Return exactly one result object per input message, using the same "id".
- Every amount must be a positive number with no currency symbols.
- "transactionType": use "expense" for debited/spent/withdrawn/paid, "income" for credited/received/deposited, "none" only if direction is genuinely unclear.
- Prefer the capturedAtIso from the input as the transaction date when the SMS does not clearly state a different date. Today is {{TODAY_ISO}}.
- "notes" should be a short human-readable merchant or narration (not the full SMS).
- "category" must be from the allowed list or null.
- Aggressively REJECT (status "error") when the message is NOT a completed money transaction, including:
  - promotional offers, cashback ads, marketing, loan offers
  - OTP / one-time passwords / verification codes
  - EMI or autopay reminders / upcoming payment notices
  - balance enquiry or available-balance-only alerts with no debit/credit
  - declined, failed, blocked, or unsuccessful transactions
  - reversal / chargeback notices that are not a clear new spend
  - non-financial messages that merely contain the words credited or debited
- If amount cannot be determined, return status "error".
- Never invent merchants or amounts that are not present in the SMS.`;

export function buildMessageSystemPrompt(
  categories: CategoryInput[],
  options: { clientTodayIso?: string; timezone?: string },
): string {
  const todayIso = resolveTodayIso(options);
  const base = MESSAGE_BASE_PROMPT.replaceAll("{{TODAY_ISO}}", todayIso);
  const dateBlock = `## CURRENT DATE CONTEXT
- Today is ${todayIso}.`;
  return [base, dateBlock, buildCategoryBlock(categories)].join("\n\n");
}

export function getMessageUserInstruction(messages: MessageInput[]): string {
  const payload = messages.map((m) => ({
    id: m.id,
    body: m.body,
    capturedAtIso: m.capturedAtIso ?? null,
  }));
  return `${MESSAGE_USER_INSTRUCTION}

Messages JSON:
${JSON.stringify(payload)}`;
}
