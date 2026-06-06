// The Collector agent: it gathers the structured findings produced by the
// researcher subagents and hands them to the Analyzer agent over the A2A
// protocol, then relays the Analyzer's streamed markdown report back to the
// caller (and ultimately the user). This is the agent-to-agent boundary that
// replaces the old in-process synthesis call.
//
// `streamSynthesisViaA2A` yields markdown chunks with the exact same shape as
// the in-process `streamSynthesis`, so the pipeline can swap one for the other
// without changing its streaming loop. It throws on any A2A failure so the
// caller can fall back to direct synthesis and never lose a report.

import { A2AClient } from "@a2a-js/sdk/client";
import type { ReportFormat, SynthesisInput } from "../agents/synthesis";
import { encodeSynthesisRequest, partsToText, REPORT_ARTIFACT_NAME } from "./types";
import { logger } from "../utils/observability-logger";

export async function* streamSynthesisViaA2A(
  input: SynthesisInput,
  format: ReportFormat = "deep"
): AsyncIterable<string> {
  const started = Date.now();

  // Boot (or reuse) the in-process Analyzer A2A server and get its Agent Card.
  // Dynamically imported so the Express/server dependency stays out of the
  // static module graph of callers that never synthesize.
  const { startAnalyzerServer } = await import("./analyzer-server");
  const card = await startAnalyzerServer();

  // Construct the A2A client directly from the Agent Card (no network card-fetch
  // needed since we share the process); it posts to the card's loopback URL.
  const client = new A2AClient(card);
  const params = encodeSynthesisRequest({
    kind: "synthesis-request",
    format,
    plan: input.plan,
    results: input.results,
  });

  logger.debug("a2a.collector.delegate.start", {
    bullets: input.results.length,
    format,
  });

  let sawText = false;
  for await (const event of client.sendMessageStream(params)) {
    if (event.kind === "artifact-update") {
      const name = event.artifact.name;
      if (name && name !== REPORT_ARTIFACT_NAME) continue;
      const text = partsToText(event.artifact.parts);
      if (text) {
        sawText = true;
        yield text;
      }
    } else if (event.kind === "status-update") {
      if (event.final && (event.status.state === "failed" || event.status.state === "canceled")) {
        throw new Error(`Analyzer task ended with state "${event.status.state}"`);
      }
    }
  }

  if (!sawText) throw new Error("Analyzer returned no report content");
  logger.info("a2a.collector.delegate.end", {
    durationMs: Date.now() - started,
    bullets: input.results.length,
  });
}
