import * as Sentry from "@sentry/node";
import type { ApiErrorCode } from "./utils/errors.js";
import { env } from "./config/env.js";

export type DiagnosticsFeature = "voice" | "pdf" | "receipt";

export function initDiagnostics(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.Authorization;
      }
      return event;
    },
  });
}

export function isDiagnosticsEnabled(): boolean {
  return Boolean(env.SENTRY_DSN);
}

export function addDiagnosticsBreadcrumb(
  message: string,
  data?: Record<string, string>,
): void {
  if (!isDiagnosticsEnabled()) return;
  Sentry.addBreadcrumb({ message, data, level: "info", category: "feature" });
}

export function logDiagnosticsWarning(
  message: string,
  tags?: Record<string, string>,
): void {
  if (!isDiagnosticsEnabled()) return;
  Sentry.captureMessage(message, { level: "warning", tags });
}

export function captureServerException(
  err: unknown,
  tags?: Record<string, string>,
): void {
  if (!isDiagnosticsEnabled()) return;
  Sentry.captureException(err, { tags });
}

export function captureUpstreamFailure(
  feature: DiagnosticsFeature,
  code: ApiErrorCode,
  route: string,
  details?: string,
): void {
  if (!isDiagnosticsEnabled()) return;

  Sentry.withScope((scope) => {
    scope.setTag("feature", feature);
    scope.setTag("code", code);
    scope.setTag("route", route);
    if (details) {
      scope.setExtra("details", details.slice(0, 200));
    }
    scope.setFingerprint([feature, code]);
    Sentry.captureMessage(`upstream failure: ${code}`, "error");
  });
}

export { Sentry };
