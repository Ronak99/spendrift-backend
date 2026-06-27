import { z } from "zod";
import { categoryTypeSchema } from "./voice.js";

export const receiptKnownFields = [
  "notes",
  "amount",
  "date",
  "transactionType",
  "category",
] as const;

export const receiptMissingFieldSchema = z.enum(receiptKnownFields);

export const receiptTransactionSchema = z.object({
  notes: z.string(),
  amount: z.number().positive().nullable(),
  date: z.string().nullable(),
  transactionType: categoryTypeSchema,
  category: z.string().nullable(),
});

export const receiptParseSuccessSchema = z.object({
  status: z.literal("success"),
  transaction: receiptTransactionSchema,
  missingFields: z.array(receiptMissingFieldSchema).optional(),
});

export const receiptParseErrorSchema = z.object({
  status: z.literal("error"),
  reason: z.string(),
  transaction: z.null().optional(),
});

export const receiptParseResponseSchema = z.discriminatedUnion("status", [
  receiptParseSuccessSchema,
  receiptParseErrorSchema,
]);

export type ReceiptTransaction = z.infer<typeof receiptTransactionSchema>;
export type ReceiptParseResponse = z.infer<typeof receiptParseResponseSchema>;
