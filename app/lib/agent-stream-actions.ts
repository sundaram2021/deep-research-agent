import type React from "react";
import type { AgentEvent, Message, ResearchState } from "@/app/lib/event-types";
import type { BulletPoint, MainAgentPlan } from "@/lib/schemas/agent-schemas";
import { applyEvent } from "./apply-event";
import { processSSEStream } from "./sse-reader";
import { emptyTurn, buildTurnUpdater } from "./turn-updater";

// Shared setters/refs the hook owns; the stream actions mutate state through them.
export interface AgentActionCtx {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setError: (e: string | null) => void;
  setLoading: (b: boolean) => void;
  setResearchState: React.Dispatch<React.SetStateAction<ResearchState>>;
  abortRef: React.RefObject<AbortController | null>;
  scratchRef: React.RefObject<string>;
}

function readErrorMessage(data: unknown): string {
  return typeof (data as { message?: unknown } | undefined)?.message === "string"
    ? (data as { message: string }).message
    : "Unknown error";
}

// Plan phase: POST /api/chat {action:"plan"} and stream plan + lifecycle events.
export async function runPlan(prompt: string, ctx: AgentActionCtx): Promise<void> {
  const { setMessages, setError, setLoading, setResearchState, abortRef, scratchRef } = ctx;
  setError(null);
  setLoading(true);
  scratchRef.current = "";

  const userId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  setMessages((prev) => [
    ...prev,
    { id: userId, role: "user", content: prompt },
    { id: assistantId, role: "assistant", content: "", turn: emptyTurn(assistantId) },
  ]);

  setResearchState({ phase: "planning", originalTopic: prompt, bulletPoints: [] });

  const updateTurn = buildTurnUpdater(assistantId, setMessages);
  const ctrl = new AbortController();
  abortRef.current = ctrl;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, action: "plan" }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

    await processSSEStream(res.body, (ev: AgentEvent) => {
      if (ev.type === "plan.ready") {
        const data = (ev.data ?? {}) as { plan?: MainAgentPlan };
        if (!data.plan) return;
        const plan = data.plan;
        setResearchState({
          phase: "plan-ready",
          originalTopic: plan.originalTopic || prompt,
          bulletPoints: plan.bulletPoints,
        });
        updateTurn((t) => {
          t.phase = "plan-ready";
          t.done = true;
          t.content = "";
        });
        return;
      }
      if (ev.type === "run.error") {
        setError(readErrorMessage(ev.data));
        setResearchState((prev) => ({ ...prev, phase: "error" }));
        applyEvent(ev, updateTurn, scratchRef); // also finalizes running tools/subagents
        return;
      }
      applyEvent(ev, updateTurn, scratchRef);
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    const msg = err instanceof Error ? err.message : String(err);
    setError(msg);
    setResearchState((prev) => ({ ...prev, phase: "error", error: msg }));
    updateTurn((t) => {
      t.phase = "error";
      t.done = true;
      t.error = msg;
    });
  } finally {
    setLoading(false);
    abortRef.current = null;
  }
}

// Research phase: POST /api/chat {action:"research"} and stream the run events.
export async function runResearch(bullets: BulletPoint[], topic: string, ctx: AgentActionCtx): Promise<void> {
  const { setMessages, setError, setLoading, setResearchState, abortRef, scratchRef } = ctx;
  setError(null);
  setLoading(true);
  scratchRef.current = "";

  const assistantId = crypto.randomUUID();
  setMessages((prev) => [
    ...prev,
    { id: assistantId, role: "assistant", content: "", turn: { ...emptyTurn(assistantId), phase: "researching" } },
  ]);

  setResearchState((prev) => ({ ...prev, phase: "researching" }));

  const updateTurn = buildTurnUpdater(assistantId, setMessages);
  const ctrl = new AbortController();
  abortRef.current = ctrl;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: topic, action: "research", bulletPoints: bullets }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

    await processSSEStream(res.body, (ev: AgentEvent) => {
      if (ev.type === "run.error") {
        setError(readErrorMessage(ev.data));
        setResearchState((prev) => ({ ...prev, phase: "error" }));
        applyEvent(ev, updateTurn, scratchRef); // also finalizes running tools/subagents
        return;
      }
      applyEvent(ev, updateTurn, scratchRef);
    });

    setResearchState((prev) => ({ ...prev, phase: "complete" }));
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    const msg = err instanceof Error ? err.message : String(err);
    setError(msg);
    setResearchState((prev) => ({ ...prev, phase: "error", error: msg }));
    updateTurn((t) => {
      t.phase = "error";
      t.done = true;
      t.error = msg;
    });
  } finally {
    setLoading(false);
    abortRef.current = null;
  }
}
