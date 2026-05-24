import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, CheckCircle2, LogOut, MessageSquare, Play, Plus, Send, Shield, Square } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts";
import { AuthProvider, auth0Configured, authDisabled, useAppAuth } from "./lib/auth";
import { createApiClient, type Conversation } from "./lib/api";
import "./index.css";

function App() {
  const auth = useAppAuth();
  const [view, setView] = useState<"chat" | "dashboard">("chat");
  const api = useMemo(() => createApiClient(auth.getAccessTokenSilently), [auth.getAccessTokenSilently]);

  if (auth.isLoading) {
    return <div className="grid h-full place-items-center text-sm text-moss">Loading...</div>;
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="grid h-full place-items-center bg-mint">
        <button className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white" onClick={() => auth.loginWithRedirect()}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#f7faf8]">
      <aside className="flex w-20 flex-col items-center gap-3 border-r border-mint bg-white py-4">
        <button title="Chat" className={navClass(view === "chat")} onClick={() => setView("chat")}>
          <MessageSquare size={20} />
        </button>
        <button title="Dashboard" className={navClass(view === "dashboard")} onClick={() => setView("dashboard")}>
          <BarChart3 size={20} />
        </button>
        <button title="Logout" className="mt-auto rounded-md p-3 text-moss hover:bg-mint" onClick={() => auth.logout()}>
          <LogOut size={20} />
        </button>
      </aside>
      {view === "chat" ? <ChatView api={api} user={auth.user} /> : <DashboardView api={api} />}
    </div>
  );
}

const providerOptions = [
  {
    id: "groq",
    label: "Groq",
    enabled: true,
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"]
  },
  {
    id: "anthropic",
    label: "Anthropic",
    enabled: true,
    models: ["claude-3-5-sonnet-latest"]
  },
  {
    id: "gemini",
    label: "Gemini",
    enabled: true,
    models: ["gemini-1.5-pro"]
  }
];

function ChatView({ api, user }: { api: ReturnType<typeof createApiClient>; user?: { name?: string; email?: string } }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState(providerOptions[0].id);
  const [model, setModel] = useState(providerOptions[0].models[0]);
  const selectedProvider = providerOptions.find((option) => option.id === provider) ?? providerOptions[0];

  async function refreshConversations() {
    const data = await api.get<{ items: Conversation[] }>("/conversations");
    setConversations(data.items);
  }

  async function openConversation(id: string) {
    setError("");
    const data = await api.get<{ conversation: Conversation }>(`/conversations/${id}`);
    setActive(data.conversation);
  }

  function newChat() {
    setError("");
    setInput("");
    setActive({
      id: "",
      title: "New chat",
      status: "ACTIVE",
      updatedAt: new Date().toISOString(),
      messages: []
    });
  }

  async function send() {
    if (!input.trim() || streaming) return;
    setError("");
    setStreaming(true);
    const userText = input;
    setInput("");
    setActive((current) => ({
      ...(current ?? { id: "", title: "New conversation", status: "ACTIVE", updatedAt: new Date().toISOString() }),
      messages: [...(current?.messages ?? []), tempMessage("USER", userText), tempMessage("ASSISTANT", "")]
    }));

    try {
      await api.streamChat({ conversationId: active?.id || undefined, message: userText, provider, model }, (event) => {
        if (event.type === "conversation.created") {
          setActive((current) =>
            current
              ? {
                  ...current,
                  id: String(event.conversationId),
                  title: typeof event.title === "string" ? event.title : current.title
                }
              : current
          );
        }
        if (event.type === "message.delta") {
          setActive((current) => appendAssistantDelta(current, String(event.delta)));
        }
        if (event.type === "message.done") {
          setActive((current) => finalizeAssistant(current, String(event.messageId), String(event.content)));
        }
        if (event.type === "error") {
          setError(String(event.message));
        }
        if (event.type === "cancelled") {
          setActive((current) => (current ? { ...current, status: "CANCELLED" } : current));
        }
      });
      await refreshConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setStreaming(false);
    }
  }

  async function cancel() {
    if (!active?.id) return;
    await api.post(`/conversations/${active.id}/cancel`);
    setActive((current) => (current ? { ...current, status: "CANCELLED" } : current));
    await refreshConversations();
  }

  useEffect(() => {
    refreshConversations().catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <section className="flex w-80 flex-col border-r border-mint bg-white p-4">
        <button className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white" onClick={newChat}>
          <Plus size={16} /> New chat
        </button>
        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-moss">
          <span>Chats</span>
          <button className="rounded-md px-2 py-1 normal-case hover:bg-mint" onClick={refreshConversations}>Refresh</button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`rounded-md border px-3 py-2 text-sm ${active?.id === conversation.id ? "border-moss bg-mint" : "border-transparent hover:bg-mint"}`}
            >
              <button className="block w-full text-left" onClick={() => openConversation(conversation.id)}>
                <span className="block truncate font-medium">{conversation.title}</span>
                <span className="text-xs text-moss">{conversation.status}</span>
              </button>
              <button className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-moss hover:text-ink" onClick={() => openConversation(conversation.id)}>
                <Play size={12} /> Resume
              </button>
            </div>
          ))}
        </div>
        <AuthStatus user={user} />
      </section>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-mint bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">{active?.title ?? "OliveChat"}</h1>
            <p className="text-sm text-moss">{selectedProvider.label} / {model}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-moss" htmlFor="provider">Provider</label>
            <select
              id="provider"
              className="rounded-md border border-mint bg-white px-3 py-2 text-sm"
              value={provider}
              onChange={(event) => {
                const next = providerOptions.find((option) => option.id === event.target.value) ?? providerOptions[0];
                setProvider(next.id);
                setModel(next.models[0]);
              }}
            >
              {providerOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.enabled}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="text-sm text-moss" htmlFor="model">Model</label>
            <select id="model" className="rounded-md border border-mint bg-white px-3 py-2 text-sm" value={model} onChange={(event) => setModel(event.target.value)}>
              {selectedProvider.models.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <button title="Cancel conversation" className="rounded-md p-3 text-coral hover:bg-mint disabled:opacity-40" onClick={cancel} disabled={!active?.id || active.status === "CANCELLED"}>
            <Square size={18} />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-auto px-8 py-6">
          {(active?.messages ?? []).map((message) => (
            <div key={message.id} className={`max-w-3xl rounded-md px-4 py-3 text-sm ${message.role === "USER" ? "ml-auto bg-ink text-white" : "bg-white"}`}>
              {message.content}
            </div>
          ))}
          {error && <div className="rounded-md border border-coral/40 bg-white px-4 py-3 text-sm text-coral">{error}</div>}
        </div>
        <form className="flex gap-3 border-t border-mint bg-white p-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <input className="min-w-0 flex-1 rounded-md border border-mint px-4 py-3 text-sm outline-none focus:border-moss" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask something..." />
          <button className="rounded-md bg-ink px-4 py-3 text-white disabled:opacity-50" disabled={streaming || !input.trim() || active?.status === "CANCELLED"} title="Send">
            <Send size={18} />
          </button>
        </form>
      </main>
    </>
  );
}

function AuthStatus({ user }: { user?: { name?: string; email?: string } }) {
  return (
    <div className="mt-4 rounded-md border border-mint bg-[#f7faf8] p-3 text-xs text-moss">
      <div className="mb-2 flex items-center gap-2 font-semibold text-ink">
        <Shield size={14} /> Auth
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle2 size={13} className="text-moss" />
        <span>{authDisabled ? "Dev mode" : auth0Configured ? "Auth0 active" : "Auth0 needs env"}</span>
      </div>
      <div className="mt-2 truncate">{user?.email ?? user?.name ?? "Local workspace"}</div>
    </div>
  );
}

function DashboardView({ api }: { api: ReturnType<typeof createApiClient> }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/dashboard/summary").then(setData).catch((err) => setError(err.message));
  }, [api]);

  const recent = data?.recent ?? [];
  const provider = data?.byProvider ?? [];
  const status = data?.byStatus ?? [];

  return (
    <main className="flex-1 overflow-auto p-8">
      <h1 className="text-2xl font-semibold">Inference Dashboard</h1>
      <p className="mt-1 text-sm text-moss">Latency, throughput, errors, providers, and token usage.</p>
      {error && <div className="mt-4 rounded-md border border-coral/40 bg-white px-4 py-3 text-sm text-coral">{error}</div>}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <Metric label="Requests" value={data?.totals?._count ?? 0} />
        <Metric label="Avg latency" value={`${Math.round(data?.totals?._avg?.latencyMs ?? 0)} ms`} />
        <Metric label="Tokens" value={data?.totals?._sum?.totalTokens ?? 0} />
        <Metric label="Errors" value={status.find((item: any) => item.status === "ERROR")?._count ?? 0} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6">
        <Chart title="Latency">
          <LineChart data={recent.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="createdAt" hide />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="latencyMs" stroke="#4f83cc" strokeWidth={2} dot={false} />
          </LineChart>
        </Chart>
        <Chart title="Provider distribution">
          <BarChart data={provider}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="provider" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="_count" fill="#47624f" />
          </BarChart>
        </Chart>
        <Chart title="Token usage">
          <LineChart data={recent.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="createdAt" hide />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="totalTokens" stroke="#da6b5a" strokeWidth={2} dot={false} />
          </LineChart>
        </Chart>
        <Chart title="Statuses">
          <PieChart>
            <Pie data={status} dataKey="_count" nameKey="status" outerRadius={100}>
              {status.map((_entry: unknown, index: number) => <Cell key={index} fill={["#47624f", "#da6b5a", "#4f83cc"][index % 3]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </Chart>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-white p-4">
      <div className="text-sm text-moss">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <section className="rounded-md bg-white p-4">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </section>
  );
}

function navClass(active: boolean) {
  return `rounded-md p-3 ${active ? "bg-ink text-white" : "text-moss hover:bg-mint"}`;
}

function tempMessage(role: "USER" | "ASSISTANT", content: string) {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
}

function appendAssistantDelta(conversation: Conversation | null, delta: string) {
  if (!conversation) return conversation;
  const messages = [...(conversation.messages ?? [])];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  if (lastAssistant) lastAssistant.content += delta;
  return { ...conversation, messages };
}

function finalizeAssistant(conversation: Conversation | null, id: string, content: string) {
  if (!conversation) return conversation;
  const messages = [...(conversation.messages ?? [])];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  if (lastAssistant) {
    lastAssistant.id = id;
    lastAssistant.content = content;
  }
  return { ...conversation, messages };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
