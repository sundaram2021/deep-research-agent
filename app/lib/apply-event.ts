import type { AgentEvent, AssistantTurn } from "@/app/lib/event-types";
import type { BulletPoint, ResearchAgentOutput } from "@/lib/schemas/agent-schemas";

type UpdateTurn = (mut: (t: AssistantTurn) => void) => void;

const PARENT_KEYS = new Set(["researcher", "agent"]);
const isParentScope = (parent: string | null | undefined) =>
  !parent || parent === "agent" || parent === "researcher";

function getData(ev: AgentEvent): Record<string, unknown> {
  return (ev.data ?? {}) as Record<string, unknown>;
}

function strField(ev: AgentEvent, key: string): string | undefined {
  const v = getData(ev)[key];
  return typeof v === "string" ? v : undefined;
}

export function applyEvent(
  ev: AgentEvent,
  updateTurn: UpdateTurn,
  scratchRef: { current: string }
): void {
  switch (ev.type) {
    case "tool.start": {
      const id = ev.id ?? crypto.randomUUID();
      const args = getData(ev).args;
      updateTurn((t) => {
        t.toolCalls[id] = {
          id,
          name: ev.name ?? "tool",
          args: args ?? {},
          parent: ev.parent ?? null,
          status: "running",
          startedAt: ev.ts,
        };
        if (ev.parent && PARENT_KEYS.has(ev.parent)) {
          const subagent = findSubagentForTool(t, ev.parent);
          if (subagent) subagent.toolCallIds.push(id);
        }
        t.entries.push({ kind: "tool", id, ts: ev.ts });
      });
      return;
    }

    case "tool.end": {
      const id = ev.id ?? "";
      const output = getData(ev).output;
      updateTurn((t) => {
        const tc = t.toolCalls[id];
        if (!tc) return;
        tc.output = typeof output === "string" ? output : JSON.stringify(output ?? "");
        tc.status = "success";
        tc.endedAt = ev.ts;
      });
      return;
    }

    case "subagent.start": {
      const id = ev.id ?? crypto.randomUUID();
      const bullet = getData(ev).bullet as BulletPoint | undefined;
      updateTurn((t) => {
        t.subagents[id] = {
          id,
          name: ev.name ?? "subagent",
          bullet,
          startedAt: ev.ts,
          status: "running",
          toolCallIds: [],
        };
        t.entries.push({ kind: "subagent", id, ts: ev.ts });
      });
      return;
    }

    case "subagent.end": {
      const id = ev.id ?? "";
      const output = getData(ev).output as ResearchAgentOutput | undefined;
      updateTurn((t) => {
        const sa = t.subagents[id];
        if (!sa) return;
        sa.output = output;
        sa.status = "complete";
        sa.endedAt = ev.ts;
      });
      return;
    }

    case "subagent.error": {
      const id = ev.id ?? "";
      const message = strField(ev, "message") ?? "Subagent failed";
      updateTurn((t) => {
        const sa = t.subagents[id];
        if (sa) {
          sa.status = "error";
          sa.errorMessage = message;
          sa.endedAt = ev.ts;
        } else {
          t.entries.push({
            kind: "thought",
            id: crypto.randomUUID(),
            ts: ev.ts,
            text: `Subagent error: ${message}`,
          });
        }
      });
      return;
    }

    case "model.token": {
      if (!isParentScope(ev.parent)) return;
      const text = strField(ev, "text") ?? "";
      if (!text) return;
      scratchRef.current += text;
      updateTurn((t) => {
        t.content = scratchRef.current;
      });
      return;
    }

    case "synthesis.token": {
      const text = strField(ev, "text") ?? "";
      if (!text) return;
      scratchRef.current += text;
      updateTurn((t) => {
        t.content = scratchRef.current;
        t.phase = "researching";
      });
      return;
    }

    case "synthesis.start": {
      updateTurn((t) => {
        t.phase = "researching";
        t.content = "";
        scratchRef.current = "";
      });
      return;
    }

    case "synthesis.end":
    case "research.complete":
    case "run.end": {
      const duration = getData(ev).durationMs;
      updateTurn((t) => {
        t.done = true;
        if (t.phase !== "error") t.phase = "complete";
        if (ev.type === "run.end" && typeof duration === "number") {
          t.durationMs = duration;
        }
      });
      return;
    }

    case "run.error": {
      const message = strField(ev, "message") ?? "Unknown error";
      updateTurn((t) => {
        t.done = true;
        t.phase = "error";
        t.error = message;
      });
      return;
    }

    case "final.content": {
      const text = strField(ev, "text");
      updateTurn((t) => {
        if (text && (!t.content || t.content.length < text.length)) {
          t.content = text;
          scratchRef.current = text;
        }
        t.phase = "complete";
      });
      return;
    }

    case "plan.ready":
    case "research.start":
      return;
  }
}

function findSubagentForTool(turn: AssistantTurn, parentName: string) {
  let latest: AssistantTurn["subagents"][string] | null = null;
  for (const id in turn.subagents) {
    const sa = turn.subagents[id];
    if (sa.name === parentName && sa.status === "running") {
      if (!latest || sa.startedAt > latest.startedAt) latest = sa;
    }
  }
  return latest;
}
