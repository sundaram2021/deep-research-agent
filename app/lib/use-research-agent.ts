"use client";

import { useCallback, useRef, useState } from "react";
import type { Message, ResearchState } from "@/app/lib/event-types";
import type { BulletPoint } from "@/lib/schemas/agent-schemas";
import { emptyResearchState } from "./turn-updater";
import { runPlan, runResearch, type AgentActionCtx } from "./agent-stream-actions";

export function useResearchAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchState, setResearchState] = useState<ResearchState>(emptyResearchState());
  const abortRef = useRef<AbortController | null>(null);
  const scratchRef = useRef<string>("");

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback((prompt: string) => {
    const ctx: AgentActionCtx = { setMessages, setError, setLoading, setResearchState, abortRef, scratchRef };
    return runPlan(prompt, ctx);
  }, []);

  const startResearch = useCallback(
    (bullets: BulletPoint[]) => {
      const ctx: AgentActionCtx = { setMessages, setError, setLoading, setResearchState, abortRef, scratchRef };
      return runResearch(bullets, researchState.originalTopic, ctx);
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
