/**
 * Matches iOS OpenAIBankStatementService.stripMarkdownCodeFence
 */
export function stripMarkdownCodeFence(text: string): string {
  let s = text.trim();
  if (s.startsWith("```json")) {
    s = s.slice(7);
  } else if (s.startsWith("```")) {
    s = s.slice(3);
  }
  if (s.endsWith("```")) {
    s = s.slice(0, -3);
  }
  return s.trim();
}
