import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import type { InferenceEvent } from "@olivechat/shared";

export const INFERENCE_QUEUE = "inference-ingestion";
export const INFERENCE_DLQ = "inference-ingestion-dlq";

export function createRedisConnection(redisUrl: string) {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000
  },
  removeOnComplete: 1000,
  removeOnFail: false
};

export function createInferenceQueue(redisUrl: string) {
  return new Queue<InferenceEvent>(INFERENCE_QUEUE, {
    connection: createRedisConnection(redisUrl),
    defaultJobOptions
  });
}

export function createInferenceDlq(redisUrl: string) {
  return new Queue(INFERENCE_DLQ, {
    connection: createRedisConnection(redisUrl),
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false
    }
  });
}

export async function publishInferenceEvent(queue: Queue<InferenceEvent>, event: InferenceEvent) {
  await queue.add("inference.event", event, {
    jobId: event.eventId
  });
}
