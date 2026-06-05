# Deep Research Agent

An iterative, multi-agent research system. Give it a topic; it plans the angles,
runs parallel researcher subagents, reflects on coverage gaps and spawns targeted
follow-up waves, then synthesizes a cited markdown report. Runs interactively in
the browser, or as durable background jobs that survive disconnects.

Built with Next.js 16, TypeScript, `deepagents`/LangChain, and OpenAI models.

---

## How it works

```
topic
  │
  ▼
plan ──────────────► 3–8 focused bullet points (dynamic by complexity)
  │
  ▼
wave 1 ────────────► one researcher subagent per bullet (bounded concurrency,
  │                   shared + deduplicated source pool, structured output + repair)
  ▼
reflection ────────► find low-confidence bullets, coverage gaps, contradictions
  │                   → spawn targeted follow-up waves (budget-bounded)
  ▼
synthesis ─────────► cited markdown report (Exec summary, per-bullet findings with
                      confidence, Gaps & Open Questions, Sources, Conclusion)
```

- **Providers**: web search/extract routes Tavily → Exa with automatic fallback.
- **Model tiers**: a strong model plans/reflects/synthesizes; a medium model runs the
  researchers; a cheap model handles structured extraction.
- **Knowledge tools**: citation verification, LLM summarization, embeddings-based
  relevance/dedup, a sandboxed code-exec tool, and YouTube transcripts.

## Two ways to run research

1. **Interactive (in-request streaming)** — `POST /api/chat`. Streams events over SSE
   for the lifetime of the request (subject to serverless limits).
2. **Durable jobs** — `POST /api/research` returns a `jobId` immediately; a background
   worker runs the pipeline and persists every event. Clients stream/replay via
   `GET /api/research/[jobId]/stream` and can disconnect/reconnect without losing events.

## Setup

```bash
pnpm install
cp .env.example .env.local      # add OPENAI_API_KEY (+ TAVILY_API_KEY / EXA_API_KEY)
pnpm dev                        # http://localhost:3000
```

### Durable jobs (Postgres + Redis + BullMQ)

```bash
docker compose up -d            # postgres:16 + redis:7 (schema loaded from db/init.sql)
# ensure DATABASE_URL and REDIS_URL are set in .env.local
pnpm worker                     # background worker (separate terminal)
```

## Environment

See `.env.example`. Highlights:

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | LLM + embeddings (required) |
| `TAVILY_API_KEY` / `EXA_API_KEY` | search providers (configure at least one) |
| `OPENAI_MODEL` / `RESEARCHER_MODEL` / `EXTRACTOR_MODEL` | model tiers |
| `RESEARCH_CONCURRENCY` / `RESEARCH_MAX_WAVES` / `RESEARCH_MAX_FOLLOWUPS` | engine tuning |
| `RESEARCH_TOKEN_BUDGET` | stop follow-up waves past N tokens (0 = unlimited) |
| `DATABASE_URL` / `REDIS_URL` | durable jobs |
| `CACHE_TTL_SECONDS` | Redis L2 cache TTL |

## API

| Method & path | Description |
|---------------|-------------|
| `POST /api/chat` | `{ prompt, action: "plan" \| "research", bulletPoints?, reportFormat? }` — SSE |
| `POST /api/research` | `{ prompt, bulletPoints, reportFormat? }` → `{ jobId }` (durable) |
| `GET /api/research/[jobId]` | job status + report; `?download=md` exports markdown |
| `GET /api/research/[jobId]/stream?after=<seq>` | resumable SSE event stream |
| `POST /api/research/[jobId]/cancel` | cooperatively cancel a running job |

`reportFormat` is `deep` (default, full report) or `brief` (executive brief).

## Scripts

```bash
pnpm dev        # Next dev server
pnpm worker     # durable-jobs background worker
pnpm test       # unit + integration tests
pnpm eval       # LLM-as-judge quality evaluation (needs API keys)
pnpm lint       # eslint
pnpm build      # production build
```

## Project layout

```
app/api/chat            in-request streaming endpoint
app/api/research        durable job endpoints (submit / status / stream / cancel)
lib/agents              planning, researcher, reflection, synthesis, embeddings, checkpointer
lib/research            pipeline (the iterative engine), vector store, token budget
lib/search              provider abstraction (Tavily, Exa) + router
lib/tools               search / text / data / agent / knowledge tool namespaces
lib/db, lib/queue       Drizzle (Postgres) + ioredis/BullMQ
lib/jobs                durable job store + event log
worker                  BullMQ worker process
```

## Testing

`pnpm test` runs unit + integration tests (tool registry, schemas, source-pool dedup,
reflection schema, search-router fallback, vector math, durable event round-trip).
CI should additionally run `pnpm exec tsc --noEmit` and `pnpm lint`.
