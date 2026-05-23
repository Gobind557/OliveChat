import crypto from "node:crypto";
import pRetry from "p-retry";
import { preview, type InferenceEvent } from "@olivechat/shared";
import { GroqProvider } from "./providers/groq.js";

export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMInput {
  provider: string;
  model: string;
  messages: LLMMessage[];
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface LLMUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  raw?: unknown;
}

export interface LLMStreamChunk {
  delta: string;
  usage?: LLMUsage;
  raw?: unknown;
}

export interface LLMProvider {
  name: string;
  generate(input: LLMInput): Promise<LLMResponse>;
  stream(input: LLMInput): AsyncIterable<LLMStreamChunk>;
}

export interface InferenceEventPublisher {
  publish(event: InferenceEvent): Promise<void>;
}

export interface InstrumentedLLMOptions {
  providers: Map<string, LLMProvider>;
  publisher: InferenceEventPublisher;
  timeoutMs: number;
  retries: number;
}

export class InstrumentedLLM {
  constructor(private readonly options: InstrumentedLLMOptions) {}

  async generate(input: LLMInput): Promise<LLMResponse> {
    const provider = this.getProvider(input.provider);
    const started = new Date();
    const startTime = performance.now();
    try {
      const response = await this.withTimeout(input.signal, (signal) =>
        pRetry(() => provider.generate({ ...input, signal }), { retries: this.options.retries })
      );
      await this.emit(input, response.content, "SUCCESS", started, startTime, response.usage);
      return response;
    } catch (error) {
      await this.emit(input, "", isAbort(error) ? "CANCELLED" : "ERROR", started, startTime, undefined, error);
      throw error;
    }
  }

  async *stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    const provider = this.getProvider(input.provider);
    const started = new Date();
    const startTime = performance.now();
    let output = "";
    let usage: LLMUsage | undefined;
    try {
      for await (const chunk of provider.stream(input)) {
        output += chunk.delta;
        usage = chunk.usage ?? usage;
        yield chunk;
      }
      await this.emit(input, output, "SUCCESS", started, startTime, usage);
    } catch (error) {
      await this.emit(input, output, isAbort(error) ? "CANCELLED" : "ERROR", started, startTime, usage, error);
      throw error;
    }
  }

  private getProvider(provider: string) {
    const resolved = this.options.providers.get(provider);
    if (!resolved) {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }
    return resolved;
  }

  private async withTimeout<T>(parentSignal: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("LLM request timed out")), this.options.timeoutMs);
    const onAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  }

  private async emit(
    input: LLMInput,
    output: string,
    status: InferenceEvent["status"],
    started: Date,
    startTime: number,
    usage?: LLMUsage,
    error?: unknown
  ) {
    const completed = new Date();
    const event: InferenceEvent = {
      eventId: crypto.randomUUID(),
      userId: input.userId,
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      provider: input.provider,
      model: input.model,
      status,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      latencyMs: Math.max(0, Math.round(performance.now() - startTime)),
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      inputPreview: preview(input.messages.map((message) => `${message.role}: ${message.content}`).join("\n")),
      outputPreview: preview(output),
      errorCode: error instanceof Error ? error.name : undefined,
      errorMessage: error instanceof Error ? preview(error.message, 300) : undefined,
      requestMetadata: input.metadata,
      metadata: {
        messageCount: input.messages.length
      }
    };

    this.options.publisher.publish(event).catch(() => undefined);
  }
}

export function createDefaultProviders(config: { groqApiKey?: string }) {
  return new Map<string, LLMProvider>([
    ["groq", new GroqProvider(config.groqApiKey)],
    ["anthropic", new PlaceholderProvider("anthropic")],
    ["gemini", new PlaceholderProvider("gemini")]
  ]);
}

function isAbort(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
}

export { GroqProvider } from "./providers/groq.js";

class PlaceholderProvider implements LLMProvider {
  constructor(readonly name: string) {}

  async generate(input: LLMInput): Promise<LLMResponse> {
    const last = input.messages.at(-1)?.content ?? "";
    const content = `${this.name} provider placeholder response: ${last}`;
    return {
      content,
      usage: estimateUsage(input.messages, content)
    };
  }

  async *stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    const response = await this.generate(input);
    for (const token of response.content.split(/(\s+)/)) {
      if (input.signal?.aborted) {
        throw new DOMException("Request aborted", "AbortError");
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield { delta: token };
    }
    yield { delta: "", usage: response.usage };
  }
}

function estimateUsage(messages: LLMMessage[], output: string): LLMUsage {
  const inputTokens = messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0);
  const outputTokens = Math.ceil(output.length / 4);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}
