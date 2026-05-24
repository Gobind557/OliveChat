import { Prisma, type ConversationStatus, type MessageRole } from "@prisma/client";
import { toTitle } from "@olivechat/shared";
import { prisma } from "../../prisma/client.js";
import { HttpError } from "../../http/middleware/error-handler.js";

export class ConversationService {
  async create(userId: string, title?: string) {
    return prisma.conversation.create({
      data: {
        userId,
        title: title ?? "New chat"
      }
    });
  }

  async list(userId: string, limit: number, cursor?: string) {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    return {
      items: conversations.slice(0, limit),
      nextCursor: conversations.length > limit ? conversations[limit]?.id : null
    };
  }

  async get(userId: string, id: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!conversation) {
      throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
    }
    return conversation;
  }

  async ensure(userId: string, conversationId: string | undefined, firstMessage: string) {
    if (!conversationId) {
      return this.create(userId, toTitle(firstMessage));
    }

    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
    if (!conversation) {
      throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
    }
    if (conversation.status === "CANCELLED") {
      throw new HttpError(409, "Conversation is cancelled", "CONVERSATION_CANCELLED");
    }
    return conversation;
  }

  async addMessage(conversationId: string, role: MessageRole, content: string, provider?: string, model?: string) {
    const messageCount = await prisma.chatMessage.count({ where: { conversationId } });
    const message = await prisma.chatMessage.create({
      data: { conversationId, role, content, provider, model }
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        ...(role === "USER" && messageCount === 0 ? { title: toTitle(content) } : {})
      }
    });
    return message;
  }

  async recentMessages(conversationId: string, limit = 12) {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return messages.reverse().map((message) => ({
      role: message.role.toLowerCase() as "system" | "user" | "assistant" | "tool",
      content: message.content
    }));
  }

  async cancel(userId: string, conversationId: string) {
    try {
      return await prisma.conversation.update({
        where: { id: conversationId, userId },
        data: { status: "CANCELLED" satisfies ConversationStatus }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
      }
      throw error;
    }
  }
}

export const conversationService = new ConversationService();
