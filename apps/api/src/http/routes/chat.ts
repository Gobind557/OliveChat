import { Router } from "express";
import { chatRequestSchema, type SseEvent } from "@olivechat/shared";
import { env } from "../../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { cancellationRegistry } from "../../modules/chat/cancellation-registry.js";
import { llm } from "../../modules/chat/llm.js";
import { conversationService } from "../../modules/conversations/conversation-service.js";

export const chatRouter = Router();

chatRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = chatRequestSchema.parse(req.body);
    const provider = body.provider ?? env.DEFAULT_LLM_PROVIDER;
    const model = body.model ?? env.DEFAULT_LLM_MODEL;
    const conversation = await conversationService.ensure(user.id, body.conversationId, body.message);
    const controller = cancellationRegistry.register(conversation.id);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const send = (event: SseEvent) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    req.on("close", () => controller.abort(new Error("Client disconnected")));
    send({ type: "conversation.created", conversationId: conversation.id, title: conversation.title });

    try {
      await conversationService.addMessage(conversation.id, "USER", body.message);
      const context = await conversationService.recentMessages(conversation.id);
      let assistantContent = "";

      for await (const chunk of llm.stream({
        provider,
        model,
        messages: context,
        userId: user.id,
        conversationId: conversation.id,
        sessionId: conversation.id,
        signal: controller.signal,
        metadata: { transport: "sse" }
      })) {
        if (!chunk.delta) {
          continue;
        }
        assistantContent += chunk.delta;
        send({ type: "message.delta", delta: chunk.delta });
      }

      const assistant = await conversationService.addMessage(conversation.id, "ASSISTANT", assistantContent, provider, model);
      send({ type: "message.done", messageId: assistant.id, content: assistant.content });
      res.end();
    } catch (error) {
      if (controller.signal.aborted) {
        send({ type: "cancelled", conversationId: conversation.id });
      } else {
        send({ type: "error", message: error instanceof Error ? error.message : "Chat failed" });
      }
      res.end();
    } finally {
      cancellationRegistry.release(conversation.id);
    }
  })
);
