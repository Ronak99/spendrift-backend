import { z } from "zod";

export const categoryTypeSchema = z.enum(["expense", "income"]);

export const categoryInputSchema = z.object({
  name: z.string().min(1),
  type: categoryTypeSchema,
});

export const categoriesSchema = z.array(categoryInputSchema);

export const voiceParseJsonRequestSchema = z.object({
  audioBase64: z.string().min(1),
  audioFormat: z.literal("wav"),
  categories: categoriesSchema,
  clientTodayIso: z.string().optional(),
  timezone: z.string().optional(),
});

export const voiceTransactionSchema = z.object({
  notes: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  transactionType: categoryTypeSchema,
  category: z.string().nullable(),
});

export const voiceParseSuccessSchema = z.object({
  status: z.literal("success"),
  transaction: voiceTransactionSchema,
});

export const voiceParseErrorSchema = z.object({
  status: z.literal("error"),
  reason: z.string(),
  transaction: z.null().optional(),
});

export const voiceParseResponseSchema = z.discriminatedUnion("status", [
  voiceParseSuccessSchema,
  voiceParseErrorSchema,
]);

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type VoiceParseJsonRequest = z.infer<typeof voiceParseJsonRequestSchema>;
export type VoiceParseResponse = z.infer<typeof voiceParseResponseSchema>;
