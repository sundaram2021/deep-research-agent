import type { AgentEvent } from "@/app/lib/event-types";
import type { UpdateTurn } from "./reducers/shared";
import { applyToolEvent } from "./reducers/tool-events";
import { applyThoughtEvent } from "./reducers/thought-events";
import { applyContentEvent } from "./reducers/content-events";

// Reduces a streamed agent event into the assistant turn. Each reducer owns a
// disjoint set of event types and returns true once it handles one; unknown
// types (e.g. plan.ready, research.start) are intentionally ignored.
export function applyEvent(
  ev: AgentEvent,
  updateTurn: UpdateTurn,
  scratchRef: { current: string }
): void {
  if (applyToolEvent(ev, updateTurn)) return;
  if (applyThoughtEvent(ev, updateTurn)) return;
  applyContentEvent(ev, updateTurn, scratchRef);
}
