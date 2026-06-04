import type { BulletPoint, ResearchAgentOutput } from "@/lib/schemas/agent-schemas";

export type AgentEventType =
  | "run.start"
  | "run.end"
  | "run.error"
  | "plan.ready"
  | "research.start"
  | "research.complete"
  | "synthesis.start"
  | "synthesis.token"
  | "synthesis.end"
  | "subagent.start"
  | "subagent.end"
  | "subagent.error"
  | "model.token"
  | "model.end"
  | "tool.start"
  | "tool.end"
  | "final.content";

export interface AgentEvent {
  type: AgentEventType;
  id?: string;
  name?: string;
  parent?: string | null;
  data?: unknown;
  ts: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  output?: string;
  parent: string | null;
  status: "running" | "success" | "error";
  startedAt: number;
  endedAt?: number;
}

export interface SubagentRecord {
  id: string;
  name: string;
  bullet?: BulletPoint;
  output?: ResearchAgentOutput;
  startedAt: number;
  endedAt?: number;
  status: "running" | "complete" | "error";
  errorMessage?: string;
  toolCallIds: string[];
}

export interface ReasoningEntry {
  kind: "thought" | "tool" | "subagent";
  id: string;
  ts: number;
  text?: string;
  tool?: ToolCallRecord;
  subagent?: SubagentRecord;
}

export type TurnPhase = "planning" | "plan-ready" | "researching" | "complete" | "error";

export interface AssistantTurn {
  id: string;
  content: string;
  reasoningTokens: string;
  toolCalls: Record<string, ToolCallRecord>;
  subagents: Record<string, SubagentRecord>;
  entries: ReasoningEntry[];
  phase: TurnPhase;
  durationMs?: number;
  done: boolean;
  error?: string;
}

export interface ResearchState {
  phase: "idle" | "planning" | "plan-ready" | "researching" | "complete" | "error";
  originalTopic: string;
  bulletPoints: BulletPoint[];
  error?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  turn?: AssistantTurn;
  researchState?: ResearchState;
}
