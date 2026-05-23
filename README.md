# OliveChat

Production-oriented AI chat and inference ingestion platform.

## Architecture

`React + Vite -> Express API -> LLM SDK Wrapper -> Groq -> BullMQ -> Worker -> PostgreSQL`

The API handles authenticated product traffic and streams chat tokens over SSE. The LLM wrapper instruments provider calls and publishes ingestion events to Redis/BullMQ without blocking user responses. The worker owns ingestion validation, retries, idempotency, and persistence of inference logs.

## Quick Start

```bash
cp .env.example .env
npm install
npm run prisma:generate
docker compose up
```

For local development without Auth0, keep `AUTH_DISABLED=true` and `VITE_AUTH_DISABLED=true`. For Auth0, set the API domain/audience and frontend client variables in `.env`.

## Services

- `apps/api`: Express API, Auth0 JWT middleware, chat streaming, dashboard aggregations.
- `apps/worker`: BullMQ consumer for inference ingestion with retry and DLQ handling.
- `apps/web`: React chat UI and observability dashboard.
- `packages/llm`: provider abstraction, Groq adapter, instrumentation wrapper.
- `packages/queue`: BullMQ producer and queue names.
- `packages/shared`: DTO schemas, shared types, redaction utilities.

## Data Model

The schema separates product records from observability records:

- conversations and messages keep the full chat history for resume/context.
- inference logs store normalized latency, token, provider, status, and error fields.
- inference metadata stores flexible JSONB payloads for provider-specific details.

Indexes prioritize tenant-scoped conversation listing, ordered message loading, and dashboard aggregations over time/provider/status.

## Failure Handling

Inference events use stable event IDs and a unique DB constraint for idempotency. BullMQ retries transient failures with exponential backoff. Exhausted jobs are copied to a DLQ queue with the failure reason and original payload.

## Scaling Notes

Run API and worker as independently scaled services. Increase worker concurrency for ingestion throughput, scale Redis/PostgreSQL according to queue depth and dashboard query volume, and partition/archive inference logs as data grows.
