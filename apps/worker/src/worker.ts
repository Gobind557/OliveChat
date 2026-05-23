import { Worker } from "bullmq";
import { createInferenceDlq, createRedisConnection, INFERENCE_QUEUE } from "@olivechat/queue";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";
import { processInferenceEvent } from "./ingestion-processor.js";

const dlq = createInferenceDlq(env.REDIS_URL);
const connection = createRedisConnection(env.REDIS_URL);

const worker = new Worker(
  INFERENCE_QUEUE,
  async (job) => {
    await processInferenceEvent(job, dlq);
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "ingestion job completed"));
worker.on("failed", (job, error) => logger.error({ jobId: job?.id, err: error }, "ingestion job failed"));
worker.on("error", (error) => logger.error({ err: error }, "worker error"));

logger.info({ queue: INFERENCE_QUEUE, concurrency: env.WORKER_CONCURRENCY }, "worker started");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  await Promise.allSettled([worker.close(), dlq.close(), connection.quit(), prisma.$disconnect()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
