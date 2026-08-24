import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  messageParseRequestSchema,
  messageParseResponseSchema,
} from "./message.js";
import {
  buildMessageSystemPrompt,
  getMessageUserInstruction,
} from "../services/messagePrompt.js";

describe("messageParseRequestSchema", () => {
  it("accepts a valid batched request", () => {
    const parsed = messageParseRequestSchema.parse({
      messages: [
        {
          id: "m1",
          body: "INR 100 debited from ****1234 at STORE",
          capturedAtIso: "2026-08-24T10:00:00",
        },
      ],
      categories: [{ name: "Food", type: "expense" }],
      clientTodayIso: "2026-08-24T10:00:00",
      timezone: "Asia/Kolkata",
    });
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0]?.id, "m1");
  });

  it("rejects an empty messages array", () => {
    const result = messageParseRequestSchema.safeParse({
      messages: [],
      categories: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects more than 40 messages", () => {
    const messages = Array.from({ length: 41 }, (_, i) => ({
      id: `m${i}`,
      body: `debited amount ${i}`,
    }));
    const result = messageParseRequestSchema.safeParse({
      messages,
      categories: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects a body longer than 1000 characters", () => {
    const result = messageParseRequestSchema.safeParse({
      messages: [{ id: "m1", body: "x".repeat(1001) }],
      categories: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects a missing message id", () => {
    const result = messageParseRequestSchema.safeParse({
      messages: [{ body: "INR 50 debited" }],
      categories: [],
    });
    assert.equal(result.success, false);
  });
});

describe("messageParseResponseSchema", () => {
  it("accepts mixed success and error items", () => {
    const parsed = messageParseResponseSchema.parse({
      results: [
        {
          id: "m1",
          status: "success",
          transaction: {
            notes: "STORE",
            amount: 100,
            date: "2026-08-24T10:00:00",
            transactionType: "expense",
            category: "Food",
          },
        },
        {
          id: "m2",
          status: "error",
          reason: "Promotional offer",
        },
      ],
    });
    assert.equal(parsed.results.length, 2);
    assert.equal(parsed.results[0]?.status, "success");
    assert.equal(parsed.results[1]?.status, "error");
  });

  it("rejects success items without a transaction", () => {
    const result = messageParseResponseSchema.safeParse({
      results: [{ id: "m1", status: "success" }],
    });
    assert.equal(result.success, false);
  });

  it("rejects non-positive amounts", () => {
    const result = messageParseResponseSchema.safeParse({
      results: [
        {
          id: "m1",
          status: "success",
          transaction: {
            notes: "STORE",
            amount: 0,
            date: "2026-08-24",
            transactionType: "expense",
            category: null,
          },
        },
      ],
    });
    assert.equal(result.success, false);
  });
});

describe("messagePrompt", () => {
  it("includes rejection guidance, lenient acceptance, and category names", () => {
    const prompt = buildMessageSystemPrompt(
      [
        { name: "Food", type: "expense" },
        { name: "Salary", type: "income" },
      ],
      { clientTodayIso: "2026-08-24T09:00:00" },
    );
    assert.match(prompt, /OTP/);
    assert.match(prompt, /promotional/i);
    assert.match(prompt, /Be LENIENT/i);
    assert.match(prompt, /Dividend credit worth 1200rs/);
    assert.match(prompt, /Debit of 20 rs/);
    assert.match(prompt, /Food/);
    assert.match(prompt, /Salary/);
    assert.match(prompt, /2026-08-24T09:00:00/);
  });

  it("embeds message ids and bodies in the user instruction", () => {
    const instruction = getMessageUserInstruction([
      { id: "abc", body: "INR 20 credited", capturedAtIso: "2026-08-24T09:00:00" },
    ]);
    assert.match(instruction, /"id":"abc"/);
    assert.match(instruction, /INR 20 credited/);
  });
});
