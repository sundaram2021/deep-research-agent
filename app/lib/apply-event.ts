import type {
  AgentEvent,
  AssistantTurn,
  SubagentRecord,
  ToolCallRecord,
} from "@/app/lib/event-types";
import type { BulletPoint, ResearchAgentOutput } from "@/lib/schemas/agent-schemas";

type UpdateTurn = (mut: (t: AssistantTurn) => void) => void;

const isParentScope = (parent: string | null | undefined) =>
  !parent || parent === "agent" || parent === "researcher";

function getData(ev: AgentEvent): Record<string, unknown> {
  return (ev.data ?? {}) as Record<string, unknown>;
}

function strField(ev: AgentEvent, key: string): string | undefined {
  const v = getData(ev)[key];
  return typeof v === "string" ? v : undefined;
}

// Move any still-"running" tools (and subagents) to a terminal state. Used when
// a subagent ends/errors or the whole run finishes, so the UI never shows a
// spinner that never resolves (e.g. a dropped tool.end, or a subagent that
// throws mid-tool). When `toolIds` is provided only those tools are touched.
function finalizeRunning(
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

export function applyEvent(
  ev: AgentEvent,
  updateTurn: UpdateTurn,
  scratchRef: { current: string }
): void {
  switch (ev.type) {
    case "tool.start": {
      const id = ev.id ?? crypto.randomUUID();
      const args = getData(ev).args;
      const parent = ev.parent ?? null;
      updateTurn((t) => {
        t.toolCalls[id] = {
          id,
          name: ev.name ?? "tool",
          args: args ?? {},
          parent,
          status: "running",
          startedAt: ev.ts,
        };
        // Attribute the tool to its subagent by id so the timeline can nest it
        // under the correct (parallel) subagent.
        const sa = parent ? t.subagents[parent] : null;
        if (sa && !sa.toolCallIds.includes(id)) sa.toolCallIds.push(id);
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
        // A finished subagent means its tools are done too.
        finalizeRunning(t, ev.ts, "success", "complete", sa.toolCallIds);
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
          // A failed subagent interrupts its in-flight tools.
          finalizeRunning(t, ev.ts, "error", "error", sa.toolCallIds);
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

    case "reflection.start": {
      updateTurn((t) => {
        t.entries.push({
          kind: "thought",
          id: crypto.randomUUID(),
          ts: ev.ts,
          text: "Reflecting on coverage and gaps…",
        });
      });
      return;
    }

    case "reflection.end": {
      const data = getData(ev);
      const gaps = typeof data.gaps === "number" ? data.gaps : 0;
      const sufficient = data.sufficient === true;
      const text =
        sufficient || gaps === 0
          ? "Reflection: coverage looks sufficient."
          : `Reflection: ${gaps} follow-up gap${gaps === 1 ? "" : "s"} to investigate.`;
      updateTurn((t) => {
        t.entries.push({ kind: "thought", id: crypto.randomUUID(), ts: ev.ts, text });
      });
      return;
    }

    case "wave.start": {
      const data = getData(ev);
      const wave = typeof data.wave === "number" ? data.wave : 2;
      const count = typeof data.count === "number" ? data.count : 0;
      updateTurn((t) => {
        t.entries.push({
          kind: "thought",
          id: crypto.randomUUID(),
          ts: ev.ts,
          text: `Starting follow-up wave ${wave} (${count} subagent${count === 1 ? "" : "s"})…`,
        });
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
        // Run finished: nothing should still be spinning.
        finalizeRunning(t, ev.ts, "success", "complete");
      });
      return;
    }

    case "run.error": {
      const message = strField(ev, "message") ?? "Unknown error";
      updateTurn((t) => {
        t.done = true;
        t.phase = "error";
        t.error = message;
        finalizeRunning(t, ev.ts, "error", "error");
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
