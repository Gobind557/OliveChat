import { createDefaultProviders, InstrumentedLLM } from "@olivechat/llm";
import { createInferenceQueue, publishInferenceEvent } from "@olivechat/queue";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const queue = createInferenceQueue(env.REDIS_URL);

export const llm = new InstrumentedLLM({
  providers: createDefaultProviders({ groqApiKey: env.GROQ_API_KEY }),
  timeoutMs: env.LLM_TIMEOUT_MS,
  retries: 1,
  publisher: {
    async publish(event) {
      try {
        await publishInferenceEvent(queue, event);
      } catch (error) {
        logger.warn({ err: error, eventId: event.eventId }, "failed to enqueue inference event");
      }
    }
  }
});

export async function closeLlmQueue() {
  await queue.close();
}
