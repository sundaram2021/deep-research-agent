import type { ChatOpenAI } from "@langchain/openai";
import { createResearcherAgent } from "../agents/researcher-agent";
import { extractResearchOutput } from "../agents/researcher-output";
import type { ResearchAgentOutput } from "../schemas/agent-schemas";
import type { Emit, SubagentTask, SubagentRun } from "./pipeline-types";
import { extractText, extractToolContent, errMessage } from "./stream-extract";

type ResearcherHandle = ReturnType<typeof createResearcherAgent>;
type Limit = <T>(fn: () => Promise<T>) => Promise<T>;

// Run a set of subagent tasks with bounded concurrency.
export async function runWave(
  handle: ResearcherHandle,
  repairModel: ChatOpenAI,
  emit: Emit,
  limit: Limit,
  tasks: SubagentTask[],
  onUsage: (tokens: number) => void
): Promise<SubagentRun[]> {
  return Promise.all(tasks.map((task) => limit(() => runSubagent(handle, repairModel, emit, task, onUsage))));
}

async function runSubagent(
  handle: ResearcherHandle,
  repairModel: ChatOpenAI,
  emit: Emit,
  task: SubagentTask,
  onUsage: (tokens: number) => void
): Promise<SubagentRun> {
  const { runId, prompt, bullet, bulletIndex, bulletTitle } = task;
  emit({ type: "subagent.start", id: runId, name: handle.name, data: { bullet }, ts: Date.now() });
  try {
    const events = handle.agent.streamEvents(
      { messages: [{ role: "user", content: prompt }] },
      { version: "v2", recursionLimit: 40, configurable: { thread_id: runId } }
    );
    let lastText = "";
    for await (const ev of events) {
      if (ev.event === "on_chat_model_stream") {
        const text = extractText(ev.data?.chunk);
        if (text) {
          lastText += text;
          emit({ type: "model.token", id: runId, parent: handle.name, data: { text }, ts: Date.now() });
        }
      } else if (ev.event === "on_chat_model_end") {
        const out = ev.data?.output as { usage_metadata?: { total_tokens?: number } } | undefined;
        if (typeof out?.usage_metadata?.total_tokens === "number") onUsage(out.usage_metadata.total_tokens);
        const finalText = extractText(ev.data?.output);
        if (finalText) lastText = finalText;
      } else if (ev.event === "on_tool_start") {
        emit({
          type: "tool.start",
          id: String(ev.run_id ?? `${runId}-${String(ev.name ?? "tool")}`),
          name: String(ev.name ?? "tool"),
          parent: runId,
          data: { args: ev.data?.input },
          ts: Date.now(),
        });
      } else if (ev.event === "on_tool_end") {
        emit({
          type: "tool.end",
          id: String(ev.run_id ?? `${runId}-${String(ev.name ?? "tool")}`),
          name: String(ev.name ?? "tool"),
          parent: runId,
          data: { output: extractToolContent(ev.data?.output) },
          ts: Date.now(),
        });
      }
    }

    const parsed = await extractResearchOutput(repairModel, lastText, bulletIndex, bulletTitle);
    if (!parsed) {
      emit({ type: "subagent.error", id: runId, data: { message: "Failed to parse researcher output" }, ts: Date.now() });
      return { bulletIndex, bulletTitle, output: null, error: "parse failed" };
    }
    const output: ResearchAgentOutput = { ...parsed, bulletIndex, bulletTitle };
    emit({ type: "subagent.end", id: runId, name: handle.name, data: { output }, ts: Date.now() });
    return { bulletIndex, bulletTitle, output };
  } catch (err) {
    emit({ type: "subagent.error", id: runId, data: { message: errMessage(err) }, ts: Date.now() });
    return { bulletIndex, bulletTitle, output: null, error: errMessage(err) };
  }
}
