"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AgentEvent,
  AssistantTurn,
  Message,
  ResearchState,
} from "@/app/lib/event-types";
import type { BulletPoint, MainAgentPlan } from "@/lib/schemas/agent-schemas";
import { applyEvent } from "./apply-event";
import { processSSEStream } from "./sse-reader";

function emptyTurn(id: string): AssistantTurn {
  return {
    id,
    content: "",
    reasoningTokens: "",
    toolCalls: {},
    subagents: {},
    entries: [],
    phase: "planning",
    done: false,
  };
}

function emptyResearchState(): ResearchState {
  return {
    phase: "idle",
    originalTopic: "",
    bulletPoints: [],
  };
}

export function useResearchAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchState, setResearchState] = useState<ResearchState>(
    emptyResearchState()
  );
  const abortRef = useRef<AbortController | null>(null);
  const scratchRef = useRef<string>("");

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(async (prompt: string) => {
    setError(null);
    setLoading(true);
    scratchRef.current = "";

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: prompt },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        turn: emptyTurn(assistantId),
      },
    ]);

    setResearchState({
      phase: "planning",
      originalTopic: prompt,
      bulletPoints: [],
    });

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
          const message =
            typeof (ev.data as { message?: unknown } | undefined)?.message === "string"
              ? ((ev.data as { message: string }).message)
              : "Unknown error";
          setError(message);
          setResearchState((prev) => ({ ...prev, phase: "error" }));
          // Let applyEvent set the turn error AND finalize any running tools/subagents.
          applyEvent(ev, updateTurn, scratchRef);
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
  }, []);

  const startResearch = useCallback(
    async (bullets: BulletPoint[]) => {
      setError(null);
      setLoading(true);
      scratchRef.current = "";

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          turn: { ...emptyTurn(assistantId), phase: "researching" },
        },
      ]);

      setResearchState((prev) => ({ ...prev, phase: "researching" }));

      const updateTurn = buildTurnUpdater(assistantId, setMessages);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: researchState.originalTopic,
            action: "research",
            bulletPoints: bullets,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body)
          throw new Error(`Request failed (${res.status})`);

        await processSSEStream(res.body, (ev: AgentEvent) => {
          if (ev.type === "run.error") {
            const message =
              typeof (ev.data as { message?: unknown } | undefined)?.message === "string"
                ? ((ev.data as { message: string }).message)
                : "Unknown error";
            setError(message);
            setResearchState((prev) => ({ ...prev, phase: "error" }));
            // Let applyEvent set the turn error AND finalize any running tools/subagents.
            applyEvent(ev, updateTurn, scratchRef);
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
    },
    [researchState.originalTopic]
  );

  return {
    messages,
    loading,
    error,
    researchState,
    send,
    cancel,
    startResearch,
  };
}

function buildTurnUpdater(
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) {
  return (mut: (t: AssistantTurn) => void) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantId || !m.turn) return m;
        const next: AssistantTurn = {
          ...m.turn,
          toolCalls: { ...m.turn.toolCalls },
          subagents: { ...m.turn.subagents },
          entries: [...m.turn.entries],
        };
        mut(next);
        return { ...m, turn: next, content: next.content };
      })
    );
  };
}
