import { deepResearchAgent } from "../lib/deep-research-agent";
import { ObservabilityLogger } from "../lib/utils/observability-logger";

async function runEvaluation() {
  console.log("=== STARTING AGENT EVALUATION ===");
  const start = Date.now();
  
  const testPrompt = "Compile a markdown table of key statistics (min, max, mean) for the dataset: 10, 20, 30, 40, 50. Use text tools to summarize the findings.";
  
  try {
    const result = await deepResearchAgent.invoke({
      messages: [{ role: "user", content: testPrompt }],
    });

    const duration = Date.now() - start;
    const messages = result.messages || [];
    const toolMessages = messages.filter((m: any) => m.type === "tool" || m.role === "tool");
    const agentMessages = messages.filter((m: any) => m.type === "ai" || m.role === "assistant");
    
    console.log("\n=== EVALUATION REPORT ===");
    console.log(`Prompt: "${testPrompt}"`);
    console.log(`Status: SUCCESS`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Total Messages: ${messages.length}`);
    console.log(`Total Tool Calls: ${toolMessages.length}`);
    console.log(`Total Agent Responses: ${agentMessages.length}`);
    
    if (toolMessages.length === 0) {
      console.warn("WARNING: No tools were executed. Model-driven tool selection might have bypassed tools.");
    } else {
      console.log("Tool Calls Executed:");
      toolMessages.forEach((m: any, i: number) => {
        console.log(`  ${i + 1}. [${m.name}] -> output length: ${m.content?.length || 0}`);
      });
    }

    console.log("\nFinal Agent Message:");
    const finalMsg = agentMessages[agentMessages.length - 1];
    console.log(finalMsg?.content || "(empty)");
  } catch (err: any) {
    console.error("Evaluation Failed:", err);
    process.exit(1);
  }
}

runEvaluation();
