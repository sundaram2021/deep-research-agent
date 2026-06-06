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
synthesis ─────────► Collector agent ⇄ Analyzer agent over the A2A protocol: the
                      Collector hands the findings to the Analyzer, which formats the
                      cited markdown report (Exec summary, per-bullet findings with
                      numbered [n] citations, Gaps & Open Questions, References,
                      Conclusion) and streams it back for the Collector to deliver
```

- **Providers**: web search/extract routes Tavily → Exa with automatic fallback.
- **Model tiers**: a strong model plans/reflects (and is the synthesis fallback); a
  medium model runs the researchers and the A2A Analyzer; cheap models handle
  structured extraction and the A2A Collector.
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
| `ANALYZER_MODEL` / `COLLECTOR_MODEL` | lighter model tiers for the A2A Analyzer / Collector agents (default to the medium / cheap tiers) |
| `RESEARCH_USE_A2A` / `A2A_ANALYZER_PORT` | route synthesis through the A2A loop (default on; set `0` for direct synthesis) / loopback port for the in-process Analyzer server |
| `RESEARCH_CONCURRENCY` / `RESEARCH_MAX_WAVES` / `RESEARCH_MAX_FOLLOWUPS` | engine tuning |
| `RESEARCH_TOKEN_BUDGET` | stop follow-up waves past N tokens (0 = unlimited) |
| `SEARCH_MIN_INTERVAL_MS` | proactive rate limit: min ms between provider calls (default 250) |
| `LOG_LEVEL` / `LOG_PRETTY` | structured logger level (`debug`/`info`/`warn`/`error`) and pretty output |
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
lib/a2a                 agent-to-agent synthesis: Collector (A2A client) + Analyzer (A2A server) over @a2a-js/sdk
lib/research            pipeline (the iterative engine), vector store, token budget
lib/search              provider abstraction (Tavily, Exa) + router
lib/tools               search / text / data / agent / knowledge / orchestration tool namespaces
lib/utils               retries+backoff, rate limiters, typed errors, structured logger
lib/db, lib/queue       Drizzle (Postgres) + ioredis/BullMQ
lib/jobs                durable job store + event log
worker                  BullMQ worker process
.github/workflows       CI: type-check + lint + tests on every push/PR
```

## Subagent orchestration

Subagents run in real, isolated contexts (own message history, scoped tools,
structured return) two ways: (1) the pipeline fans out one researcher per planned
bullet; (2) the model can call the `spawn_research_subagent` tool to delegate a
self-contained sub-question to an isolated subagent and compose its structured
findings — bounded at depth 1 (a spawned subagent's scoped tool set excludes the
orchestration namespace). See `lib/agents/subagent-runner.ts`.

## Agent-to-agent synthesis (A2A)

The final report is produced by two agents that talk over the
[Agent2Agent (A2A) protocol](https://a2a-protocol.org) using the official
[`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js):

- The **Collector** (`lib/a2a/collector.ts`) gathers the structured findings from the
  researcher subagents and sends them to the Analyzer as an A2A message.
- The **Analyzer** (`lib/a2a/analyzer-server.ts`) is a real A2A server (Agent Card +
  JSON-RPC + SSE) bound to loopback and started once per process. Its executor reuses
  the existing synthesis engine (`lib/agents/synthesis.ts`) on the lighter
  `ANALYZER_MODEL` tier, streaming the cited markdown report back as task artifacts.
- The Collector relays those chunks to the user as the same `synthesis.token` events
  the UI already renders.

Deterministic citation numbering happens in the synthesis engine *before* the model,
so citations stay correct regardless of the (lighter) Analyzer model. The whole leg is
gated by `RESEARCH_USE_A2A` (default on) and **fails safe**: any A2A error falls back to
direct in-process synthesis on the strong `main` model, so a report is never lost.

## Reliability & observability

External provider calls are wrapped with retries (exponential backoff + jitter)
**and** a proactive per-provider rate limiter (`lib/utils/rate-limiters.ts`).
A dependency-free structured logger (`lib/utils/observability-logger.ts`) emits
JSON-line ops logs (retries, pipeline phases, subagent spawns, A2A collector/analyzer
spans, worker lifecycle) alongside the durable, replayable per-job event log.

## Testing

`pnpm test` runs unit + integration tests (tool registry, schemas, source-pool dedup,
reflection schema, search-router fallback, vector math, durable event round-trip,
orchestration-tool registration, rate-limiter spacing, the A2A synthesis-request
contract, and a `csv_to_json → calculate_stats` composition chain). CI
(`.github/workflows/ci.yml`) runs `pnpm install`, `pnpm exec tsc --noEmit`,
`pnpm lint`, and `pnpm test` on every push and pull request.
