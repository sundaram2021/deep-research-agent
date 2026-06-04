"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantTurn, SubagentRecord } from "@/app/lib/event-types";
import {
  IconBot,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLoader,
  IconX,
} from "./icons";
import ToolEvent from "./tool-event";

interface Props {
  subagent: SubagentRecord;
  toolCalls: AssistantTurn["toolCalls"];
}

export default function SubagentEvent({ subagent, toolCalls }: Props) {
  const running = subagent.status === "running";
  const failed = subagent.status === "error";

  // Expand the tool list while the subagent works; collapse once it finishes.
  const [open, setOpen] = useState(running);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) setOpen(false);
    wasRunning.current = running;
  }, [running]);

  const ms =
    subagent.endedAt && subagent.startedAt
      ? subagent.endedAt - subagent.startedAt
      : 0;
  const title = subagent.bullet
    ? `Bullet ${subagent.bullet.index}: ${subagent.bullet.title}`
    : subagent.name;

  const tools = subagent.toolCallIds
    .map((id) => toolCalls[id])
    .filter((tc): tc is NonNullable<typeof tc> => Boolean(tc));
  const hasTools = tools.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-indigo-900/40 bg-indigo-950/20 text-xs">
      <button
        type="button"
        onClick={() => hasTools && setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
          hasTools ? "cursor-pointer hover:bg-indigo-950/30" : "cursor-default"
        }`}
      >
        <IconBot size={14} className="shrink-0 text-indigo-300" />
        <span className="min-w-0 truncate font-mono text-indigo-200">{title}</span>
        <span className="shrink-0 rounded border border-indigo-900/50 bg-indigo-950/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-indigo-300">
          subagent
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px]">
          {hasTools && (
            <span className="font-mono text-zinc-500">
              {tools.length} tool{tools.length === 1 ? "" : "s"}
            </span>
          )}
          {!running && ms > 0 && (
            <span className="font-mono text-zinc-500">{(ms / 1000).toFixed(1)}s</span>
          )}
          {running ? (
            <IconLoader size={12} className="text-indigo-300" />
          ) : failed ? (
            <IconX size={12} className="text-red-400" />
          ) : (
            <IconCheck size={12} className="text-emerald-400" />
          )}
          {hasTools &&
            (open ? (
              <IconChevronDown size={12} className="text-zinc-500" />
            ) : (
              <IconChevronRight size={12} className="text-zinc-500" />
            ))}
        </span>
      </button>

      {open && hasTools && (
        <div className="ml-[21px] flex flex-col gap-1.5 border-l border-zinc-800 pb-2 pl-2.5 pr-2">
          {tools.map((tc) => (
            <ToolEvent key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {failed && subagent.errorMessage && (
        <div className="mx-3 mb-2 break-words border-t border-indigo-900/30 pt-1.5 text-[11px] text-red-300">
          {subagent.errorMessage}
        </div>
      )}
    </div>
  );
}
