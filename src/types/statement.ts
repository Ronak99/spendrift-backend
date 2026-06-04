import { z } from "zod";

export const statementTransactionTypeSchema = z.enum([
  "expense",
  "income",
  "none",
]);

export const statementTransactionSchema = z.object({
  notes: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  transactionType: statementTransactionTypeSchema,
});

export const statementParseResponseSchema = z.object({
  transactions: z.array(statementTransactionSchema),
});

export type StatementTransaction = z.infer<typeof statementTransactionSchema>;
export type StatementParseResponse = z.infer<
  typeof statementParseResponseSchema
>;
