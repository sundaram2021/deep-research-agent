import type { BulletPoint, ResearchAgentOutput } from "../schemas/agent-schemas";

export interface AgentEvent {
  type: string;
  id?: string;
  name?: string;
  parent?: string | null;
  data?: unknown;
  ts: number;
}

export type Emit = (event: AgentEvent) => void;

export interface SubagentTask {
  runId: string;
  prompt: string;
  bullet: BulletPoint;
  bulletIndex: number;
  bulletTitle: string;
}

export interface SubagentRun {
  bulletIndex: number;
  bulletTitle: string;
  output: ResearchAgentOutput | null;
  error?: string;
}

export interface PipelineInput {
  topic: string;
  bullets: BulletPoint[];
  emit: Emit;
  // Cooperative cancellation, checked between waves and before synthesis.
  checkCancelled?: () => boolean | Promise<boolean>;
  // "deep" (default) full report, or "brief" executive summary.
  reportFormat?: "brief" | "deep";
}
