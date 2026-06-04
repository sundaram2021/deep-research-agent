"use client";

import type { Message } from "@/app/lib/event-types";
import ReasoningTimeline from "./reasoning-timeline";
import MarkdownView from "./markdown-view";
import CopyButton from "./copy-button";
import { IconBot, IconBrain, IconLoader, IconUser } from "./icons";

interface Props {
  message: Message;
  loading: boolean;
}

export default function MessageItem({ message, loading }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex w-full gap-3">
        <div className="mt-1 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800">
            <IconUser size={16} className="text-zinc-300" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <span>You</span>
          </div>
          <div className="max-w-[88%] rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-[15px] leading-relaxed text-zinc-100">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  const turn = message.turn;
  const isStillRunning = loading && !turn?.done;
  const hasContent = !!turn?.content;
  const hasTimeline = !!(turn && turn.entries.length > 0);
  const hasError = !!turn?.error;
  const showRunning = !!(isStillRunning && turn);

  // If there's nothing to show for the assistant message, do not render it.
  if (!hasContent && !hasTimeline && !hasError && !showRunning) {
    return null;
  }

  return (
    <div className="flex w-full gap-3">
      <div className="mt-1 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-900/50 bg-indigo-950/40">
          <IconBot size={16} className="text-indigo-300" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <>
            <span>Research Agent</span>
            {turn?.durationMs != null && (
              <span className="font-mono text-zinc-600">
                {(turn.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 md:p-5">
          {hasTimeline && (
            <ReasoningTimeline turn={turn} running={isStillRunning} />
          )}

          {hasContent ? (
            <div className="mt-4 border-t border-zinc-800/60 pt-4">
              <div className="mb-2 flex justify-end">
                <CopyButton text={turn.content} label="Copy Results" />
              </div>
              <div className="text-[15px]">
                <MarkdownView content={turn.content} />
              </div>
            </div>
          ) : showRunning ? (
            <RunningIndicator turn={turn} />
          ) : null}

          {hasError && (
            <div className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {turn.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RunningIndicator({ turn }: { turn: NonNullable<Message["turn"]> }) {
  const subCount = Object.keys(turn.subagents).length;
  const toolCount = Object.keys(turn.toolCalls).length;
  const label =
    subCount > 0
      ? `Researching with ${subCount} subagent${subCount === 1 ? "" : "s"}...`
      : toolCount > 0
        ? "Running tools..."
        : turn.phase === "researching"
          ? "Synthesizing report..."
          : "Planning approach...";
  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
      <IconLoader size={14} className="text-indigo-400" />
      <IconBrain size={14} className="text-zinc-500" />
      <span>{label}</span>
    </div>
  );
}
