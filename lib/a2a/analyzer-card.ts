import type { AgentCard } from "@a2a-js/sdk";

// The Analyzer's public identity in the A2A network. `capabilities.streaming`
// MUST be true so the Collector can consume the report as a live token stream
// (A2AClient.sendMessageStream rejects agents that don't advertise streaming).
export function buildAnalyzerCard(url: string): AgentCard {
  return {
    name: "Analyzer Agent",
    description:
      "Analyzes the collected research findings from the subagents and formats them into a single cited markdown report.",
    protocolVersion: "0.3.0",
    version: "1.0.0",
    url,
    capabilities: { streaming: true },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: [
      {
        id: "analyze-and-format",
        name: "Analyze & Format Research",
        description:
          "Takes structured subagent findings (plan + results) and produces the final cited markdown report (deep or brief).",
        tags: ["research", "synthesis", "report", "citations"],
      },
    ],
  };
}
