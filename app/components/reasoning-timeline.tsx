"use client";

import { useState } from "react";
import type { AssistantTurn, ReasoningEntry } from "@/app/lib/event-types";
import { IconBrain, IconChevronDown, IconChevronRight, IconLoader, IconPulse } from "./icons";
import ToolEvent from "./tool-event";
import SubagentEvent from "./subagent-event";

interface Props {
  turn: AssistantTurn;
  running: boolean;
}

export default function ReasoningTimeline({ turn, running }: Props) {
  const [open, setOpen] = useState(true);
  const entries = turn.entries;
  const toolCount = Object.keys(turn.toolCalls).length;
  const subCount = Object.keys(turn.subagents).length;

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-300 hover:bg-zinc-900/50"
      >
        <div className="flex items-center gap-2">
          {running ? (
            <IconLoader size={12} className="text-indigo-400" />
          ) : (
            <IconPulse size={12} className="text-emerald-400" />
          )}
          <span className="uppercase tracking-wider text-zinc-400">
            {running ? "Working" : "Trace"}
          </span>
          <span className="font-mono text-zinc-500">
            {subCount > 0 && `${subCount} subagent${subCount === 1 ? "" : "s"}`}
            {subCount > 0 && toolCount > 0 && " · "}
            {toolCount > 0 && `${toolCount} tool${toolCount === 1 ? "" : "s"}`}
            {subCount === 0 && toolCount === 0 && "initializing..."}
          </span>
        </div>
        {open ? (
          <IconChevronDown size={14} className="text-zinc-500" />
        ) : (
          <IconChevronRight size={14} className="text-zinc-500" />
        )}
      </button>

      {open && entries.length > 0 && (
        <div className="space-y-1.5 border-t border-zinc-800/80 px-2 py-2">
          {entries.map((entry, i) => (
            <Entry
              key={`${entry.kind}-${entry.id}-${i}`}
              entry={entry}
              subagents={turn.subagents}
              toolCalls={turn.toolCalls}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Entry({
  entry,
  subagents,
  toolCalls,
}: {
  entry: ReasoningEntry;
  subagents: AssistantTurn["subagents"];
  toolCalls: AssistantTurn["toolCalls"];
}) {
  if (entry.kind === "tool") {
    const tc = toolCalls[entry.id];
    if (!tc) return null;
    return <ToolEvent toolCall={tc} />;
  }
  if (entry.kind === "subagent") {
    const sa = subagents[entry.id];
    if (!sa) return null;
    return <SubagentEvent subagent={sa} />;
  }
  if (entry.kind === "thought") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-xs">
        <IconBrain size={14} className="mt-0.5 shrink-0 text-zinc-400" />
        <div className="leading-relaxed text-zinc-300">{entry.text}</div>
      </div>
    );
  }
  return null;
}
