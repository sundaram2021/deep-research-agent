import type { AgentEvent } from "@/app/lib/event-types";
import type { BulletPoint, ResearchAgentOutput } from "@/lib/schemas/agent-schemas";
import { getData, strField, finalizeRunning, type UpdateTurn } from "./shared";

// Handles tool.* and subagent.* events. Returns true if the event was handled.
export function applyToolEvent(ev: AgentEvent, updateTurn: UpdateTurn): boolean {
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
      return true;
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
      return true;
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
      return true;
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
      return true;
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
      return true;
    }

    default:
      return false;
  }
}
