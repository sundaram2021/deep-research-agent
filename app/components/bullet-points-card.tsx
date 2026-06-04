"use client";

import type { BulletPoint } from "@/lib/schemas/agent-schemas";
import { IconPlay, IconSearch } from "./icons";
import CopyButton from "./copy-button";

interface Props {
  bullets: BulletPoint[];
  topic: string;
  onStartResearch: (bullets: BulletPoint[]) => void;
  disabled: boolean;
}

export default function BulletPointsCard({
  bullets,
  topic,
  onStartResearch,
  disabled,
}: Props) {
  const planText = formatPlanAsMarkdown(topic, bullets);

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <IconSearch size={14} className="text-indigo-400" />
        <span>Research Plan</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="rounded-md border border-indigo-900/50 bg-indigo-950/40 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
            {bullets.length} bullet points
          </span>
          <CopyButton text={planText} label="Copy Plan" />
        </span>
      </div>

      <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">
        <span className="font-semibold text-zinc-200">Topic:</span> {topic}
      </p>

      <ol className="space-y-3">
        {bullets.map((b) => (
          <li
            key={b.index}
            className="flex gap-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-indigo-900/50 bg-indigo-950/40 font-mono text-xs font-bold text-indigo-300">
              {b.index}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-100">
                {b.title}
              </div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
                {b.description}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button
        onClick={() => onStartResearch(bullets)}
        disabled={disabled}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        <IconPlay size={16} />
        <span>Start Research</span>
      </button>
    </div>
  );
}

function formatPlanAsMarkdown(topic: string, bullets: BulletPoint[]): string {
  const lines = [`# ${topic}`, "", "## Research Plan", ""];
  bullets.forEach((b) => {
    lines.push(`${b.index}. **${b.title}** — ${b.description}`);
  });
  return lines.join("\n");
}
