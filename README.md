# OliveChat

OliveChat is a production-oriented AI chat platform with asynchronous inference logging. It combines a modern chat UI, an Express API, a provider-abstracted LLM wrapper, BullMQ-based ingestion, and PostgreSQL analytics storage.

The goal is not only to chat with an LLM, but to capture the operational data that matters in real systems: provider, model, latency, token usage, status, errors, timestamps, conversation IDs, redacted previews, and retry/failure behavior.

## Architecture

```text
React + Vite
  -> Express API
  -> LLM SDK Wrapper
  -> Provider Adapter
  -> Inference Event
  -> BullMQ / Redis
  -> Worker Service
  -> PostgreSQL
```

The API owns product traffic: authentication, conversations, messages, SSE streaming, cancellation, and dashboard reads. The LLM wrapper instruments provider calls and emits ingestion events asynchronously so chat latency is not blocked by observability writes. The worker validates, retries, deduplicates, and persists inference logs.

## Features

- Multi-turn chat with persisted conversations.
- Chat list, resume, cancel, and streaming responses over SSE.
- Groq provider adapter with real API support.
- Anthropic and Gemini provider placeholders behind the same abstraction.
- Auth0 JWT verification for production-style auth.
- Local dev auth mode for quick testing.
- BullMQ ingestion queue with exponential retries and DLQ strategy.
- PostgreSQL schema for conversations, messages, inference logs, provider/model metadata, token usage, latency, statuses, and errors.
- Dashboard views for latency, throughput, errors, provider distribution, and token usage.
- Docker Compose for Postgres, Redis, API, worker, and frontend.

## Repository Layout

```text
apps/
  api/       Express API, auth, chat streaming, conversations, dashboard routes
  web/       React/Vite/Tailwind frontend
  worker/    BullMQ ingestion worker

packages/
  llm/       Provider abstraction, Groq adapter, instrumentation wrapper
  queue/     BullMQ queue names, Redis connection, producer helpers
  shared/    DTO schemas, shared types, redaction utilities

prisma/
  schema.prisma
  migrations/
```

## Quick Start

Copy the example environment file:

```bash
cp .env.example .env
```

For first run, keep auth disabled:

```env
AUTH_DISABLED=true
VITE_AUTH_DISABLED=true
```

Add a Groq key if you want real model responses:

```env
GROQ_API_KEY=your_groq_key
```

Start the stack:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

The API runs on:

```text
http://localhost:4000
```

## Local Development Without Docker

Install dependencies and generate the Prisma client:

```bash
npm install
npm run prisma:generate
```

You still need Postgres and Redis running. Then start all workspaces:

```bash
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
npm test
```

## Environment Variables

Core backend:

```env
DATABASE_URL=postgresql://olivechat:olivechat@localhost:5432/olivechat?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4000
WEB_ORIGIN=http://localhost:5173
```

LLM:

```env
GROQ_API_KEY=
DEFAULT_LLM_PROVIDER=groq
DEFAULT_LLM_MODEL=llama-3.1-8b-instant
LLM_TIMEOUT_MS=30000
```

Worker:

```env
WORKER_CONCURRENCY=8
```

Auth disabled for local development:

```env
AUTH_DISABLED=true
VITE_AUTH_DISABLED=true
```

Auth0 mode:

```env
AUTH_DISABLED=false
VITE_AUTH_DISABLED=false

AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://olivechat-api

VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_auth0_spa_client_id
VITE_AUTH0_AUDIENCE=https://olivechat-api
```

## Auth0 Setup

Create an Auth0 Single Page Application for the frontend. Use its domain and client ID for:

```env
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
```

Create an Auth0 API for the backend. Set the API identifier to the same value used as the audience:

```env
AUTH0_AUDIENCE=https://olivechat-api
VITE_AUTH0_AUDIENCE=https://olivechat-api
```

In the Auth0 application settings, add:

```text
Allowed Callback URLs: http://localhost:5173
Allowed Logout URLs:   http://localhost:5173
Allowed Web Origins:   http://localhost:5173
```

Runtime flow:

1. The React app signs in through Auth0.
2. The frontend requests an access token.
3. API calls include `Authorization: Bearer <token>`.
4. Express verifies issuer and audience.
5. The Auth0 `sub` claim is mapped to an internal `User`.
6. Conversations and dashboard metrics are scoped to that user.

## Provider Support

The frontend sends provider and model with each chat request:

```json
{
  "provider": "groq",
  "model": "llama-3.1-8b-instant",
  "message": "Explain BullMQ retries",
  "conversationId": "optional-existing-conversation-id"
}
```

The API passes this to `packages/llm`, which resolves a provider adapter from the provider registry.

Current behavior:

- `groq`: real provider adapter. Uses `GROQ_API_KEY` when configured.
- `anthropic`: placeholder provider for abstraction/testing.
- `gemini`: placeholder provider for abstraction/testing.


## Chat Behavior

Each sidebar item is a saved chat conversation. Resume means opening an existing conversation and continuing from its recent message history. The API loads a short context window from persisted messages before calling the LLM provider.

Cancel marks a conversation as cancelled and aborts active streaming when possible. Cancelled conversations stay visible but cannot receive new messages.

Streaming uses Server-Sent Events. The chat endpoint emits typed events:

```text
conversation.created
message.delta
message.done
cancelled
error
```

## API Surface

Health:

```http
GET /health
```

Current user:

```http
GET /me
```

Conversations:

```http
POST /conversations
GET /conversations
GET /conversations/:id
POST /conversations/:id/cancel
```

Chat:

```http
POST /chat
```

Dashboard:

```http
GET /dashboard/summary
```

All routes except `/health` require auth unless `AUTH_DISABLED=true`.

## Ingestion Flow

The LLM wrapper measures and captures:

- provider and model
- conversation and session IDs
- start/completion timestamps
- latency
- token usage when available
- request status
- error code/message
- redacted input/output previews
- provider-specific metadata

It publishes an inference event to BullMQ. The worker validates the payload, checks idempotency by `eventId`, persists the log, and stores metadata as JSONB.

Failed jobs are retried with exponential backoff. Exhausted or invalid jobs are copied into the dead-letter queue with the original payload and failure reason.

## Database Design

Product tables:

- `User`: maps Auth0 subject to an internal user.
- `Conversation`: user-scoped chat thread with status and timestamps.
- `ChatMessage`: ordered conversation messages.

Provider metadata:

- `Provider`: normalized provider names.
- `Model`: provider-scoped model names.

Observability tables:

- `InferenceLog`: normalized analytics fields such as latency, status, provider/model, token usage, errors, and timestamps.
- `InferenceMetadata`: JSONB payload for provider-specific details.

Indexing prioritizes:

- user-scoped conversation listing
- ordered message loading
- dashboard time-window queries
- provider/model breakdowns
- status/error filtering
- idempotent ingestion by event ID

## PII Redaction

Full chat messages are stored so conversations can be resumed accurately. Inference log previews are redacted before ingestion. The shared redaction utility currently handles common emails, phone numbers, bearer tokens, and API-key-like strings.



## Testing Checklist

Basic local flow:

1. Start with `AUTH_DISABLED=true` and `VITE_AUTH_DISABLED=true`.
2. Run `docker compose up --build`.
3. Open `http://localhost:5173`.
4. Click `New chat`.
5. Send a message.
6. Confirm streaming response appears.
7. Refresh the page.
8. Resume the previous chat from the sidebar.
9. Send a follow-up and confirm it continues the conversation.
10. Open the dashboard and confirm inference metrics appear after the worker processes the event.

Provider flow:

1. Set `GROQ_API_KEY`.
2. Select Groq and send a message.
3. Select Anthropic or Gemini and send a message.
4. Confirm Groq uses the real adapter and the others use placeholder responses.
5. Confirm dashboard provider distribution changes.

Auth0 flow:

1. Configure Auth0 env vars.
2. Set auth disabled flags to `false`.
3. Rebuild/restart API and web.
4. Sign in through the frontend.
5. Create a chat.
6. Confirm API calls include bearer tokens and conversations are user-scoped.



## Current Limitations

- Anthropic and Gemini are placeholder providers.
- Auth0 roles/organizations are not modeled yet.
- Dashboard aggregation is intentionally simple and should be rolled up for large datasets.
- The frontend is a compact MVP UI, not a complete design system.
