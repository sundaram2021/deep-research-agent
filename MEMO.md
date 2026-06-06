# MEMO

## What this is

A production-shaped **deep research agent**. Given a topic, it plans the angles,
fans out isolated researcher subagents, reflects on coverage gaps, spawns
targeted follow-up waves, and synthesizes a cited markdown report. It runs both
interactively (SSE) and as durable background jobs that survive disconnects.

Stack: Next.js 16 + TypeScript, `deepagents`/LangChain, OpenAI model tiers,
Postgres (Drizzle) + Redis + BullMQ for durable jobs, Tavily→Exa search routing.

## What I built

- **A coherent 50+ tool registry across 5 namespaces** (`lib/tools`): search,
  text, data, knowledge, agent/report, plus an **orchestration** tool. Every
  tool is a typed LangChain `tool()` with a Zod schema; selection is model-driven,
  and a unit test asserts all schemas are OpenAI strict-mode compatible.
- **Subagent orchestration with real context isolation.** Two paths: (1) the
  pipeline fans out one isolated researcher per planned bullet, each with its own
  `thread_id`, scoped tools, and a schema-validated structured return; (2) a
  model-callable `spawn_research_subagent` tool (`lib/agents/subagent-runner.ts`)
  that spins up a fresh deep-agent with a deliberately scoped tool set and returns
  only structured findings — so the agent can delegate via a tool call.
- **Long-horizon execution with explicit, in-code context management:** a
  per-request `SourcePool` (dedup/cache across subagents via `AsyncLocalStorage`),
  a cross-run Redis L2 cache, a `TokenBudget` that caps follow-up waves, a
  reflection→follow-up loop, and structured plan/return schemas that keep the run
  coherent across 20+ tool calls.
- **Production scaffolding:** retries with exponential backoff + jitter
  (`withRetry`) and reactive 429 handling, **proactive per-provider rate limiting**
  (`lib/utils/rate-limiters.ts`) on every external Exa/Tavily call, a typed error
  hierarchy, a structured ops logger (`lib/utils/observability-logger.ts`) plus a
  durable per-job event log, an LLM-as-judge eval harness (`pnpm eval`), unit +
  integration tests (`pnpm test`), and a CI workflow that type-checks, lints, and
  tests on every push/PR.
- **Composable tools:** one tool consumes another's structured output — proven by
  an integration test (`csv_to_json → calculate_stats`) and by the
  search→extract→verify/summarize and researcher→synthesis data flows.
- **Native Collector-Analyzer synthesis:** The final report synthesis is delegated
  to a native, schema-controlled collaboration between a Collector Agent (which
  structures and validates findings via `collectorOutputSchema` using LLM structured output)
  and an Analyzer Agent (which streams the cited markdown report using system prompts),
  providing full process control, lighter-model usage, and a fail-safe direct synthesis fallback.

## What I cut (and why)

- **Native `deepagents` subagent/`task` wiring.** I implemented isolation with my
  own `createDeepAgent`-backed runner instead of the framework's `subagents:`/`task`
  mechanism, to avoid coupling correctness to an API whose exact shape varies by
  version (the checkpointer note flags the same risk). Same guarantee, lower risk.
- **Metrics/tracing exporters (OTel/Prometheus).** The structured logger emits
  span-style timing and the job-event log is fully replayable; a metrics backend
  was out of scope for five days.
- **Mid-run checkpoint resume.** A LangGraph Postgres checkpointer is wired but
  opt-in; durable resume today comes from the job/event store, not graph replay.
- **A hardened `code_exec` sandbox.** It uses `node:vm` (not a security boundary)
  for computing over provided data only.

## What more time would add

- Promote `spawn_research_subagent` into a first-class top-level orchestrator loop
  (a parent agent that plans + delegates + synthesizes entirely through tools).
- Real metrics + distributed tracing, and per-tool/per-provider cost accounting.
- A larger labeled eval set with regression thresholds enforced in CI.
- Streaming partial synthesis and per-source caching with smarter invalidation.

## One design decision I'd defend

**A deterministic pipeline as the orchestration backbone, with model-driven
subagent spawning layered on top — rather than a single fully-autonomous parent
agent that plans, spawns, and synthesizes inside one tool-calling loop.**

The autonomous-parent approach is more elegant and more "agentic" on paper. I
chose the pipeline because the backbone (plan → bounded fan-out → reflect →
synthesize) is where reliability, cost control, observability, testability, and
**resumable durable jobs** come from: each stage has a typed contract, bounded
concurrency, a token budget, and an append-only event log, so a run is debuggable
and survives a worker restart. I still satisfy "a tool spawns a subagent" by
exposing `spawn_research_subagent`, so the model gets genuine tool-driven
delegation where it adds value — without putting the whole run at the mercy of an
unconstrained agent loop. The tradeoff I accept: less emergent autonomy in
exchange for a system I can actually operate in production.
