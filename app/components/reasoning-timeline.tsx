"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AssistantTurn, ReasoningEntry } from "@/app/lib/event-types";
import { IconBrain, IconChevronDown, IconChevronRight, IconLoader, IconPulse } from "./icons";
import ToolEvent from "./tool-event";
import SubagentEvent from "./subagent-event";

interface Props {
  turn: AssistantTurn;
  running: boolean;
}

export default function ReasoningTimeline({ turn, running }: Props) {
  // Open while the run is active; auto-collapse once results are in.
  const [open, setOpen] = useState(running);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) setOpen(false);
    wasRunning.current = running;
  }, [running]);

  const entries = turn.entries;
  const toolCount = Object.keys(turn.toolCalls).length;
  const subCount = Object.keys(turn.subagents).length;

  // Earliest timestamp across the trace — used as the start of the elapsed timer.
  // (Entries are appended in order, but tools/subagents carry their own starts.)
  const startTs = useMemo(() => {
    let min = Infinity;
    for (const e of entries) if (typeof e.ts === "number") min = Math.min(min, e.ts);
    for (const id in turn.toolCalls) {
      const s = turn.toolCalls[id].startedAt;
      if (typeof s === "number") min = Math.min(min, s);
    }
    for (const id in turn.subagents) {
      const s = turn.subagents[id].startedAt;
      if (typeof s === "number") min = Math.min(min, s);
    }
    return Number.isFinite(min) ? min : null;
  }, [entries, turn.toolCalls, turn.subagents]);

  // Tick once a second while running so the live elapsed time advances; once the
  // run completes we show the authoritative final duration (turn.durationMs).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsedMs =
    turn.durationMs != null
      ? turn.durationMs
      : startTs != null
        ? Math.max(0, now - startTs)
        : null;
  const elapsedLabel = elapsedMs != null ? `${(elapsedMs / 1000).toFixed(1)}s` : null;

  // Tools owned by a subagent are rendered nested under it, so skip them in the
  // top-level pass to avoid showing them twice.
  const nestedToolIds = new Set<string>();
  for (const sid in turn.subagents) {
    for (const tid of turn.subagents[sid].toolCallIds) nestedToolIds.add(tid);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-300 hover:bg-zinc-900/50"
      >
        <div className="flex min-w-0 items-center gap-2">
          {running ? (
            <IconLoader size={12} className="shrink-0 text-indigo-400" />
          ) : (
            <IconPulse size={12} className="shrink-0 text-emerald-400" />
          )}
          <span className="shrink-0 uppercase tracking-wider text-zinc-400">
            {running ? "Working" : "Trace"}
          </span>
          <span className="truncate font-mono text-zinc-500">
            {subCount > 0 && `${subCount} subagent${subCount === 1 ? "" : "s"}`}
            {subCount > 0 && toolCount > 0 && " · "}
            {toolCount > 0 && `${toolCount} tool${toolCount === 1 ? "" : "s"}`}
            {subCount === 0 && toolCount === 0 && "initializing..."}
          </span>
          {elapsedLabel && (
            <span
              className="shrink-0 font-mono text-zinc-400"
              title={running ? "Elapsed research time" : "Total research time"}
            >
              · {elapsedLabel}
            </span>
          )}
        </div>
        {open ? (
          <IconChevronDown size={14} className="shrink-0 text-zinc-500" />
        ) : (
          <IconChevronRight size={14} className="shrink-0 text-zinc-500" />
        )}
      </button>

      {open && entries.length > 0 && (
        <div className="space-y-1.5 border-t border-zinc-800/80 px-2 py-2">
          {entries.map((entry, i) => {
            // Nested tools are rendered by their parent subagent.
            if (entry.kind === "tool" && nestedToolIds.has(entry.id)) return null;
            return (
              <Entry
                key={`${entry.kind}-${entry.id}-${i}`}
                entry={entry}
                subagents={turn.subagents}
                toolCalls={turn.toolCalls}
              />
            );
          })}
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
    return <SubagentEvent subagent={sa} toolCalls={toolCalls} />;
  }
  if (entry.kind === "thought") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-xs">
        <IconBrain size={14} className="mt-0.5 shrink-0 text-zinc-400" />
        <div className="min-w-0 break-words leading-relaxed text-zinc-300">{entry.text}</div>
      </div>
    );
  }
  return null;
}
