/**
 * Matches iOS OpenAIBankStatementService.uploadFilename sanitization.
 */
export function sanitizeStatementFilename(filename?: string): string {
  let name = filename?.trim() ?? "";
  if (!name) {
    return "statement.pdf";
  }

  const parts = name.split(/[/\\]/);
  name = parts[parts.length - 1] ?? "statement.pdf";
  if (!name) {
    return "statement.pdf";
  }

  name = name.replace(/[^a-zA-Z0-9._\- ]/g, "_");
  if (!name.toLowerCase().endsWith(".pdf")) {
    name = `${name}.pdf`;
  }

  return name;
}
