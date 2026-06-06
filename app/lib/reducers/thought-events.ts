import type { AgentEvent } from "@/app/lib/event-types";
import { getData, type UpdateTurn } from "./shared";

// Handles reflection / wave / budget events that surface as timeline "thoughts".
// Returns true if the event was handled.
export function applyThoughtEvent(ev: AgentEvent, updateTurn: UpdateTurn): boolean {
  switch (ev.type) {
    case "reflection.start": {
      updateTurn((t) => {
        t.entries.push({
          kind: "thought",
          id: crypto.randomUUID(),
          ts: ev.ts,
          text: "Reflecting on coverage and gaps…",
        });
      });
      return true;
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
      return true;
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
      return true;
    }

    case "budget.exceeded": {
      const used = typeof getData(ev).used === "number" ? (getData(ev).used as number) : 0;
      updateTurn((t) => {
        t.entries.push({
          kind: "thought",
          id: crypto.randomUUID(),
          ts: ev.ts,
          text: `Token budget reached (${used} tokens) — stopping further research waves.`,
        });
      });
      return true;
    }

    default:
      return false;
  }
}
