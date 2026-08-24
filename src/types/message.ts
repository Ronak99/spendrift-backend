import { z } from "zod";
import { categoriesSchema } from "./voice.js";

export const messageInputSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1).max(1000),
  capturedAtIso: z.string().optional(),
});

export const messageParseRequestSchema = z.object({
  messages: z.array(messageInputSchema).min(1).max(40),
  categories: categoriesSchema,
  clientTodayIso: z.string().optional(),
  timezone: z.string().optional(),
});

export const messageTransactionSchema = z.object({
  notes: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  transactionType: z.enum(["expense", "income", "none"]),
  category: z.string().nullable(),
});

export const messageParseSuccessItemSchema = z.object({
  id: z.string().min(1),
  status: z.literal("success"),
  transaction: messageTransactionSchema,
});

export const messageParseErrorItemSchema = z.object({
  id: z.string().min(1),
  status: z.literal("error"),
  reason: z.string(),
});

export const messageParseResultItemSchema = z.discriminatedUnion("status", [
  messageParseSuccessItemSchema,
  messageParseErrorItemSchema,
]);

export const messageParseResponseSchema = z.object({
  results: z.array(messageParseResultItemSchema),
});

export type MessageParseRequest = z.infer<typeof messageParseRequestSchema>;
export type MessageParseResponse = z.infer<typeof messageParseResponseSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
