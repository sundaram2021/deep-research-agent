"use client";

import { IconBrain, IconSearch, IconSparkles } from "./icons";

const SUGGESTIONS = [
  {
    title: "Compare LLM models",
    prompt:
      "Compare Claude 3.5 Sonnet vs GPT-4o for code review tasks. Cover accuracy, latency, pricing, and developer ergonomics with citations.",
  },
  {
    title: "Market research",
    prompt:
      "Investigate the current state of agentic AI startups in 2025. Identify top players, funding levels, and emerging architectural patterns.",
  },
  {
    title: "Technical deep dive",
    prompt:
      "Explain LangGraph subagent orchestration, including state isolation, message passing, and structured response formats. Cite the official docs.",
  },
  {
    title: "Data analysis",
    prompt:
      "Compute statistics (min, max, mean, median) for the dataset [10, 25, 47, 62, 80, 95] and produce a markdown report with interpretation.",
  },
];

interface Props {
  onPick: (q: string) => void;
  disabled: boolean;
}

export default function EmptyState({ onPick, disabled }: Props) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-8 py-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-900/40 bg-indigo-950/30 text-indigo-300">
          <IconSparkles size={22} />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Deep Research Agent</h2>
        <p className="max-w-md text-sm text-zinc-400">
          Autonomous multi-step research powered by LangGraph deepagents. 52 tools, isolated subagents, full reasoning trace.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            disabled={disabled}
            onClick={() => onPick(s.prompt)}
            className="group flex flex-col gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 text-left transition hover:border-indigo-700/60 hover:bg-zinc-900/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 group-hover:text-indigo-300">
              <IconSearch size={12} />
              <span>{s.title}</span>
            </div>
            <div className="text-[13px] leading-relaxed text-zinc-300">{s.prompt}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-600">
        <IconBrain size={12} />
        <span>LangGraph deepagents · Exa Search · OpenAI</span>
      </div>
    </div>
  );
}
