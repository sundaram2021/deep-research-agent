"use client";

import type { SubagentRecord } from "@/app/lib/event-types";
import { IconBot, IconCheck, IconLoader, IconX } from "./icons";

interface Props {
  subagent: SubagentRecord;
}

export default function SubagentEvent({ subagent }: Props) {
  const running = subagent.status === "running";
  const failed = subagent.status === "error";
  const ms =
    subagent.endedAt && subagent.startedAt
      ? subagent.endedAt - subagent.startedAt
      : 0;
  const title = subagent.bullet
    ? `Bullet ${subagent.bullet.index}: ${subagent.bullet.title}`
    : subagent.name;

  return (
    <div className="rounded-lg border border-indigo-900/40 bg-indigo-950/20 px-3 py-2 text-xs">
      <div className="flex items-center gap-2.5">
        <IconBot size={14} className="shrink-0 text-indigo-300" />
        <span className="font-mono text-indigo-200">{title}</span>
        <span className="rounded border border-indigo-900/50 bg-indigo-950/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-indigo-300">
          subagent
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px]">
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
        </span>
      </div>
      {failed && subagent.errorMessage && (
        <div className="mt-1.5 border-t border-indigo-900/30 pt-1.5 text-[11px] text-red-300">
          {subagent.errorMessage}
        </div>
      )}
    </div>
  );
}
