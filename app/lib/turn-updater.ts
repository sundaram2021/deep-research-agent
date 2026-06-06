import type React from "react";
import type { AssistantTurn, Message, ResearchState } from "@/app/lib/event-types";

export function emptyTurn(id: string): AssistantTurn {
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

export function emptyResearchState(): ResearchState {
  return {
    phase: "idle",
    originalTopic: "",
    bulletPoints: [],
  };
}

// Returns a setter that immutably applies `mut` to the assistant turn with the
// given id, cloning the collections React renders so updates are detected.
export function buildTurnUpdater(
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
