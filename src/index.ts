import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { voiceRouter } from "./routes/voice.js";
import { statementsRouter } from "./routes/statements.js";

const app = express();

app.use(
  express.json({
    limit: Math.max(env.MAX_AUDIO_BYTES * 2, 5_000_000),
  }),
);

app.use("/v1", healthRouter);

app.use("/v1", requireAuth, voiceRouter);
app.use("/v1", requireAuth, statementsRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(
    `Spendrift AI backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
});
