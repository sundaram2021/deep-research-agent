import type {
  AgentEvent,
  AssistantTurn,
  SubagentRecord,
  ToolCallRecord,
} from "@/app/lib/event-types";

export type UpdateTurn = (mut: (t: AssistantTurn) => void) => void;

export const isParentScope = (parent: string | null | undefined) =>
  !parent || parent === "agent" || parent === "researcher";

export function getData(ev: AgentEvent): Record<string, unknown> {
  return (ev.data ?? {}) as Record<string, unknown>;
}

export function strField(ev: AgentEvent, key: string): string | undefined {
  const v = getData(ev)[key];
  return typeof v === "string" ? v : undefined;
}

// Move any still-"running" tools (and subagents) to a terminal state. Used when
// a subagent ends/errors or the whole run finishes, so the UI never shows a
// spinner that never resolves (e.g. a dropped tool.end, or a subagent that
// throws mid-tool). When `toolIds` is provided only those tools are touched.
export function finalizeRunning(
  t: AssistantTurn,
  ts: number,
  toolStatus: ToolCallRecord["status"],
  subStatus: SubagentRecord["status"],
  toolIds?: string[]
): void {
  const ids = toolIds ?? Object.keys(t.toolCalls);
  for (const id of ids) {
    const tc = t.toolCalls[id];
    if (tc && tc.status === "running") {
      tc.status = toolStatus;
      tc.endedAt = tc.endedAt ?? ts;
    }
  }
  if (!toolIds) {
    for (const id in t.subagents) {
      const sa = t.subagents[id];
      if (sa.status === "running") {
        sa.status = subStatus;
        sa.endedAt = sa.endedAt ?? ts;
      }
    }
  }
}
