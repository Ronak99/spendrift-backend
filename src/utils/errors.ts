export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "payload_too_large"
  | "upstream_failed"
  | "upstream_timeout"
  | "missing_model_output"
  | "invalid_model_json";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export function truncateDetails(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
