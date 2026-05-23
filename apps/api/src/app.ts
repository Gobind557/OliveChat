import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler } from "./http/middleware/error-handler.js";
import { chatRouter } from "./http/routes/chat.js";
import { conversationsRouter } from "./http/routes/conversations.js";
import { dashboardRouter } from "./http/routes/dashboard.js";
import { meRouter } from "./http/routes/me.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/me", meRouter);
  app.use("/conversations", conversationsRouter);
  app.use("/chat", chatRouter);
  app.use("/dashboard", dashboardRouter);
  app.use(errorHandler);

  return app;
}
