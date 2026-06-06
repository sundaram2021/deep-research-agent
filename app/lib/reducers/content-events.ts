import type { AgentEvent } from "@/app/lib/event-types";
import { getData, strField, isParentScope, finalizeRunning, type UpdateTurn } from "./shared";

type ScratchRef = { current: string };

// Handles streamed content + run-lifecycle events. Returns true if handled.
export function applyContentEvent(ev: AgentEvent, updateTurn: UpdateTurn, scratchRef: ScratchRef): boolean {
  switch (ev.type) {
    case "model.token": {
      if (!isParentScope(ev.parent)) return true;
      const text = strField(ev, "text") ?? "";
      if (!text) return true;
      scratchRef.current += text;
      updateTurn((t) => {
        t.content = scratchRef.current;
      });
      return true;
    }

    case "synthesis.token": {
      const text = strField(ev, "text") ?? "";
      if (!text) return true;
      scratchRef.current += text;
      updateTurn((t) => {
        t.content = scratchRef.current;
        t.phase = "researching";
      });
      return true;
    }

    case "synthesis.start": {
      updateTurn((t) => {
        t.phase = "researching";
        t.content = "";
        scratchRef.current = "";
      });
      return true;
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
      return true;
    }

    case "run.error": {
      const message = strField(ev, "message") ?? "Unknown error";
      updateTurn((t) => {
        t.done = true;
        t.phase = "error";
        t.error = message;
        finalizeRunning(t, ev.ts, "error", "error");
      });
      return true;
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
      return true;
    }

    default:
      return false;
  }
}
