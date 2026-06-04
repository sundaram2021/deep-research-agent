"use client";

import { useState } from "react";
import type { ToolCallRecord } from "@/app/lib/event-types";
import {
  IconBrain,
  IconChevronDown,
  IconChevronRight,
  IconDatabase,
  IconFile,
  IconLoader,
  IconCheck,
  IconSearch,
  IconText,
  IconWrench,
  IconX,
  getToolIcon,
} from "./icons";

const TOOL_ICONS: Record<string, typeof IconSearch> = {
  search: IconSearch,
  brain: IconBrain,
  file: IconFile,
  database: IconDatabase,
  text: IconText,
  wrench: IconWrench,
};

export default function ToolEvent({ toolCall }: { toolCall: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const ToolIcon = TOOL_ICONS[getToolIcon(toolCall.name)] ?? IconWrench;
  const running = toolCall.status === "running";
  const success = toolCall.status === "success";
  const failed = toolCall.status === "error";
  const ms = toolCall.endedAt && toolCall.startedAt ? toolCall.endedAt - toolCall.startedAt : 0;

  const StatusIcon = running ? IconLoader : failed ? IconX : IconCheck;
  const statusColor = running ? "text-indigo-400" : failed ? "text-red-400" : "text-emerald-400";

  const argsString = stringify(toolCall.args);
  const outputString = toolCall.output ?? "";

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-900/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs hover:bg-zinc-900/60"
      >
        <ToolIcon size={14} className="shrink-0 text-zinc-400" />
        <span className="font-mono text-zinc-200">{toolCall.name}</span>
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          {!running && ms > 0 && <span className="font-mono text-zinc-500">{ms}ms</span>}
          <StatusIcon size={12} className={statusColor} />
          {open ? (
            <IconChevronDown size={12} className="text-zinc-500" />
          ) : (
            <IconChevronRight size={12} className="text-zinc-500" />
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-zinc-800/60 bg-black/30 px-3 py-2 font-mono text-[11px]">
          <Section label="Input">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-300">{argsString}</pre>
          </Section>
          {success && outputString && (
            <Section label="Output">
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all text-emerald-300/90">
                {truncate(outputString, 4000)}
              </pre>
            </Section>
          )}
          {failed && (
            <Section label="Error">
              <pre className="whitespace-pre-wrap text-red-300">{outputString || "Tool failed"}</pre>
            </Section>
          )}
          {running && (
            <div className="flex items-center gap-2 text-zinc-500">
              <IconLoader size={12} className="text-indigo-400" />
              <span>Running...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      {children}
    </div>
  );
}

function stringify(value: unknown): string {
  if (value == null) return "{}";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (+${text.length - max} chars truncated)`;
}
