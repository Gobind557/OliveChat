import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { LLMInput, LLMProvider, LLMResponse, LLMStreamChunk } from "../index.js";

export class GroqProvider implements LLMProvider {
  name = "groq";
  private readonly client?: Groq;

  constructor(apiKey?: string) {
    this.client = apiKey ? new Groq({ apiKey }) : undefined;
  }

  async generate(input: LLMInput): Promise<LLMResponse> {
    if (!this.client) {
      return mockResponse(input);
    }

    const response = await this.client.chat.completions.create(
      {
        model: input.model,
        messages: input.messages as ChatCompletionMessageParam[],
        temperature: 0.3
      },
      { signal: input.signal }
    );

    return {
      content: response.choices[0]?.message?.content ?? "",
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens
      },
      raw: response
    };
  }

  async *stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    if (!this.client) {
      yield* mockStream(input);
      return;
    }

    const stream = await this.client.chat.completions.create(
      {
        model: input.model,
        messages: input.messages as ChatCompletionMessageParam[],
        temperature: 0.3,
        stream: true
      },
      { signal: input.signal }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        yield { delta, raw: chunk };
      }
      if (chunk.x_groq?.usage) {
        yield {
          delta: "",
          usage: {
            inputTokens: chunk.x_groq.usage.prompt_tokens,
            outputTokens: chunk.x_groq.usage.completion_tokens,
            totalTokens: chunk.x_groq.usage.total_tokens
          },
          raw: chunk
        };
      }
    }
  }
}

function mockResponse(input: LLMInput): LLMResponse {
  const last = input.messages.at(-1)?.content ?? "";
  return {
    content: `Mock Groq response: ${last}`,
    usage: {
      inputTokens: input.messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0),
      outputTokens: Math.ceil(last.length / 4) + 4
    }
  };
}

async function* mockStream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
  const response = mockResponse(input);
  for (const token of response.content.split(/(\s+)/)) {
    if (input.signal?.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    yield { delta: token };
  }
  yield { delta: "", usage: response.usage };
}
