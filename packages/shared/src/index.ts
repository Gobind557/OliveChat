import { z } from "zod";

export const messageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const chatMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1).max(20000)
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(160).optional()
});

export const listConversationsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(20000),
  provider: z.string().trim().min(1).default("groq"),
  model: z.string().trim().min(1).optional()
});

export const dashboardQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const inferenceEventSchema = z.object({
  eventId: z.string().min(12),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  status: z.enum(["SUCCESS", "ERROR", "CANCELLED"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  inputPreview: z.string().optional(),
  outputPreview: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  requestMetadata: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).default({})
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type InferenceEvent = z.infer<typeof inferenceEventSchema>;

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const API_KEY = /\b(?:sk|gsk|pk|rk)_[A-Za-z0-9_-]{12,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function redactPii(value: string): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(API_KEY, "[redacted-key]")
    .replace(BEARER, "Bearer [redacted-token]");
}

export function preview(value: string, max = 600): string {
  const redacted = redactPii(value).replace(/\s+/g, " ").trim();
  return redacted.length > max ? `${redacted.slice(0, max)}...` : redacted;
}

export function toTitle(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized || "New conversation";
}

export type SseEvent =
  | { type: "conversation.created"; conversationId: string; title: string }
  | { type: "message.delta"; delta: string }
  | { type: "message.done"; messageId: string; content: string }
  | { type: "cancelled"; conversationId: string }
  | { type: "error"; message: string };
