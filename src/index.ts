import express from "express";
import { env } from "./config/env.js";
import { initDiagnostics, Sentry } from "./diagnostics.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { requireAuth } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { voiceRouter } from "./routes/voice.js";
import { statementsRouter } from "./routes/statements.js";
import { receiptsRouter } from "./routes/receipts.js";
import { ingestRouter } from "./routes/ingest.js";
import { sentryRouter } from "./routes/sentry.js";

initDiagnostics();

const app = express();

// Trust one reverse-proxy hop (Caddy in production) so req.ip is the end-user
// address from X-Forwarded-For, not 127.0.0.1 from the local reverse_proxy.
app.set("trust proxy", 1);

app.use(requestLogger);

// Analytics ingestion proxy: raw passthrough to PostHog. Mounted before JSON
// body parsing and without bearer auth (PostHog authenticates via the public
// project key carried in the request body).
app.use("/ingest", ingestRouter);

// Sentry envelope tunnel for iOS diagnostics. SDK posts to /api/:projectId/envelope/
// when the DSN host is rewritten to the backend. Legacy POST /sentry also works.
app.use(sentryRouter);
app.use("/sentry", sentryRouter);

app.use(
  express.json({
    limit: Math.max(env.MAX_AUDIO_BYTES * 2, 5_000_000),
  }),
);

app.use("/v1", healthRouter);

app.use("/v1", requireAuth, voiceRouter);
app.use("/v1", requireAuth, statementsRouter);
app.use("/v1", requireAuth, receiptsRouter);

if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(
    `Spendrift AI backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
});
