import type { CategoryInput } from "../types/voice.js";
import type { MessageInput } from "../types/message.js";
import { resolveTodayIso } from "./voicePrompt.js";

const MESSAGE_USER_INSTRUCTION =
  "Parse each bank SMS below into a transaction result. Respond with ONLY the JSON object from your instructions. Accept any completed money movement with a determinable amount, even when the wording is terse or informal. Reject only promotions, OTPs, reminders, balance-only alerts, declined or failed transactions, and reversals.";

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
- "transactionType": use "expense" for debited/spent/withdrawn/paid/charged/transferred out, "income" for credited/received/deposited/refunded/transferred in, "none" only if direction is genuinely unclear after reading the full message.
- Prefer the capturedAtIso from the input as the transaction date when the SMS does not clearly state a different date. Today is {{TODAY_ISO}}.
- "notes" should be a short human-readable merchant or narration (not the full SMS).
- "category" must be from the allowed list or null.
- Be LENIENT for completed transactions. If the message states a specific amount and the money direction is reasonably clear, return status "success" even when the SMS is short, informal, or missing account numbers, merchants, or dates.
- Treat noun forms (debit, credit, refund, payment, withdrawal, charge) as valid when paired with a specific amount and clear direction. Do not require the exact verbs "debited" or "credited".
- Accept common Indian SMS variants: "Rs", "INR", "Rs.", missing spaces ("Rs20"), commas in amounts ("1,200"), and shorthand like "Dr" for debit.
- If a merchant, payer, or narration is present, use it in "notes". If not, use a short generic label such as "Bank debit", "UPI payment", "Salary credit", or "Dividend credit".
- REJECT (status "error") only when the message is clearly NOT a completed money transaction, including:
  - promotional offers, marketing, loan offers, or hypothetical future cashback ("Get Rs 500 cashback on your next purchase")
  - OTP / one-time passwords / verification codes
  - EMI or autopay reminders / upcoming payment notices with no completed movement
  - balance enquiry or available-balance-only alerts with no debit/credit amount
  - declined, failed, blocked, or unsuccessful transactions
  - reversal / chargeback notices that undo a prior transaction rather than reporting a new spend or deposit
  - messages with no determinable amount
- When in doubt between a genuine terse transaction alert and a marketing message: if there is a specific numeric amount and wording that describes money already moved (not an offer or reminder), ACCEPT it.
- Never invent merchants or amounts that are not present in the SMS.

## ACCEPT examples (status "success")

These are valid completed transactions even though wording is loose:

Expense:
- "Debit of 20 rs" -> expense, amount 20, notes "Bank debit"
- "Rs 1500 spent on Amazon" -> expense, amount 1500, notes "Amazon"
- "Payment of Rs 500 done" -> expense, amount 500, notes "Payment"
- "Withdrawal of Rs 2000" -> expense, amount 2000, notes "Withdrawal"
- "Card charge Rs 799" -> expense, amount 799, notes "Card charge"
- "UPI payment Rs 45 to SWIGGY" -> expense, amount 45, notes "SWIGGY"
- "Paid Rs 250" -> expense, amount 250, notes "Payment"
- "Rs 500 debited" -> expense, amount 500, notes "Bank debit"
- "INR 250.00 debited from A/c XX1234 at TEST MERCHANT" -> expense, amount 250, notes "TEST MERCHANT"
- "Debited Rs20" -> expense, amount 20, notes "Bank debit"
- "INR 1,234.56 Dr" -> expense, amount 1234.56, notes "Bank debit"

Income:
- "Dividend credit worth 1200rs" -> income, amount 1200, notes "Dividend credit"
- "Dividend of 2500rs credited to your bank account" -> income, amount 2500, notes "Dividend"
- "Interest credit of Rs 450" -> income, amount 450, notes "Interest credit"
- "Salary credit Rs 85000" -> income, amount 85000, notes "Salary credit"
- "Refund of Rs 299 processed" -> income, amount 299, notes "Refund"
- "NEFT credit Rs 5000" -> income, amount 5000, notes "NEFT credit"
- "Received Rs 1000" -> income, amount 1000, notes "Payment received"
- "Credited Rs 3200" -> income, amount 3200, notes "Bank credit"
- "UPI received Rs 200 from RAHUL" -> income, amount 200, notes "RAHUL"
- "A/c credited by Rs.1200" -> income, amount 1200, notes "Bank credit"
- "Cashback Rs 50 credited" -> income, amount 50, notes "Cashback" (completed credit, not a promo offer)
- "FD maturity proceeds Rs 1,00,000" -> income, amount 100000, notes "FD maturity"

## REJECT examples (status "error")

These are NOT completed transactions:

- "Get Rs 500 cashback on your next purchase!" -> promotional offer
- "Earn up to Rs 2000 cashback this weekend" -> marketing
- "Your EMI of Rs 5000 is due on 28-Aug" -> upcoming payment reminder
- "OTP 482910 for Rs 2000 transaction" -> verification code
- "Transaction declined for Rs 500 at MERCHANT" -> failed transaction
- "Available balance: Rs 12,345.67" -> balance enquiry only
- "Reversal of Rs 100 for txn at STORE" -> chargeback / reversal notice
- "Pre-approved personal loan up to Rs 5 lakh" -> loan marketing`;

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
