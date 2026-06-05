// Optional LangGraph Postgres checkpointer for the researcher subagents.
//
// Opt-in (RESEARCH_CHECKPOINTER=1 + DATABASE_URL) so default behavior is
// unchanged. NOTE: durability of a whole research job comes from the job/event
// store (lib/jobs/job-store.ts). This checkpointer adds per-subagent graph
// checkpointing; full checkpoint-based mid-run resume is a follow-up and the
// exact deepagents wiring should be validated against the installed versions.

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let saver: PostgresSaver | null = null;
let setupDone = false;

export function checkpointerEnabled(): boolean {
  return process.env.RESEARCH_CHECKPOINTER === "1" && Boolean(process.env.DATABASE_URL);
}

export async function getCheckpointer(): Promise<PostgresSaver | null> {
  if (!checkpointerEnabled()) return null;
  if (!saver) saver = PostgresSaver.fromConnString(process.env.DATABASE_URL as string);
  if (!setupDone) {
    await saver.setup();
    setupDone = true;
  }
  return saver;
}
