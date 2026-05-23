import { Prisma } from "@prisma/client";
import type { Job, Queue } from "bullmq";
import { inferenceEventSchema, type InferenceEvent } from "@olivechat/shared";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

export async function processInferenceEvent(job: Job<InferenceEvent>, dlq: Queue) {
  const parsed = inferenceEventSchema.safeParse(job.data);
  if (!parsed.success) {
    await sendToDlq(dlq, job, "validation_error", parsed.error.flatten());
    return;
  }

  const event = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.inferenceLog.findUnique({ where: { eventId: event.eventId } });
      if (existing) {
        logger.info({ eventId: event.eventId }, "duplicate inference event ignored");
        return;
      }

      const provider = await tx.provider.upsert({
        where: { name: event.provider },
        create: { name: event.provider },
        update: {}
      });
      await tx.model.upsert({
        where: { providerId_name: { providerId: provider.id, name: event.model } },
        create: { providerId: provider.id, name: event.model },
        update: {}
      });

      await tx.inferenceLog.create({
        data: {
          eventId: event.eventId,
          userId: event.userId,
          conversationId: event.conversationId,
          sessionId: event.sessionId,
          provider: event.provider,
          model: event.model,
          status: event.status,
          startedAt: new Date(event.startedAt),
          completedAt: event.completedAt ? new Date(event.completedAt) : undefined,
          latencyMs: event.latencyMs,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.totalTokens,
          inputPreview: event.inputPreview,
          outputPreview: event.outputPreview,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
          requestMetadata: event.requestMetadata as Prisma.InputJsonValue,
          metadata: {
            create: {
              payload: event.metadata as Prisma.InputJsonValue
            }
          }
        }
      });
    });
  } catch (error) {
    logger.error({ err: error, eventId: event.eventId, attemptsMade: job.attemptsMade }, "failed to process inference event");
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await sendToDlq(dlq, job, "processing_exhausted", error instanceof Error ? error.message : "unknown");
    }
    throw error;
  }
}

async function sendToDlq(dlq: Queue, job: Job, reason: string, details: unknown) {
  await dlq.add("inference.event.failed", {
    failedJobId: job.id,
    reason,
    details,
    payload: job.data,
    failedAt: new Date().toISOString()
  });
  logger.warn({ jobId: job.id, reason }, "inference event sent to dlq");
}
