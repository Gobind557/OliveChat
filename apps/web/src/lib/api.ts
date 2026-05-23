const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface Conversation {
  id: string;
  title: string;
  status: "ACTIVE" | "CANCELLED" | "ARCHIVED";
  updatedAt: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT" | "TOOL";
  content: string;
  createdAt: string;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  streamChat(body: unknown, onEvent: (event: { type: string; [key: string]: unknown }) => void): Promise<void>;
}

export function createApiClient(getToken: () => Promise<string>): ApiClient {
  async function headers() {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, { ...init, headers: await headers() });
    if (!response.ok) {
      throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<T>;
  }

  return {
    get: (path) => request(path, { method: "GET" }),
    post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    async streamChat(body, onEvent) {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(body)
      });
      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || "Unable to stream chat");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) onEvent(JSON.parse(dataLine.slice(6)));
        }
      }
    }
  };
}
