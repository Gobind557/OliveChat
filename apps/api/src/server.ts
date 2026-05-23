import http from "node:http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { prisma } from "./prisma/client.js";
import { closeLlmQueue } from "./modules/chat/llm.js";

const app = createApp();
const server = http.createServer(app);

server.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, "api listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down api");
  server.close(async () => {
    await Promise.allSettled([closeLlmQueue(), prisma.$disconnect()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
