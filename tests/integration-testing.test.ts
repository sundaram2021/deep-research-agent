import { csv_to_json, calculate_stats } from "../lib/tools/data-tools";
import { getModelPair } from "../lib/models";
import { buildResearcherPrompt } from "../lib/agents/researcher-agent";
import { buildSynthesisMessages } from "../lib/agents/synthesis";
import {
  mainAgentPlanSchema,
  researchAgentOutputSchema,
} from "../lib/schemas/agent-schemas";
import assert from "node:assert";

async function testToolComposition() {
  console.log("Testing Tool Composition Chain...");
  const csvData = "value\n10\n20\n30\n40\n50";

  const jsonResult = await csv_to_json.invoke({ csv: csvData });
  assert.ok(jsonResult, "CSV conversion returned no output");
  const parsed = JSON.parse(jsonResult);
  assert.strictEqual(parsed.length, 5);
  assert.strictEqual(parsed[0].value, "10");

  const numbersArray = parsed.map((item: { value: string }) => Number(item.value));
  const statsResult = await calculate_stats.invoke({ numbers: numbersArray });

  assert.ok(statsResult, "Stats calculation returned no output");
  const stats = JSON.parse(statsResult);
  assert.strictEqual(stats.count, 5);
  assert.strictEqual(stats.mean, 30);
  assert.strictEqual(stats.min, 10);
  assert.strictEqual(stats.max, 50);
  console.log("[PASS] Tool Composition Chain (csv_to_json -> calculate_stats)");
}

function testResearcherPrompt() {
  const prompt = buildResearcherPrompt("Compare GPT-4o vs Claude", {
    index: 2,
    title: "Pricing",
    description: "Compare pricing tiers",
  });
  assert.ok(prompt.includes("Compare GPT-4o vs Claude"));
  assert.ok(prompt.includes("(2) Pricing"));
  assert.ok(prompt.includes("Compare pricing tiers"));
  console.log("[PASS] Researcher Prompt Builder");
}

function testSynthesisMessages() {
  const plan = mainAgentPlanSchema.parse({
    originalTopic: "Two Pointers",
    summary: "basics",
    bulletPoints: [
      { index: 1, title: "Analyze technique", description: "patterns" },
      { index: 2, title: "Opposite ends", description: "palindromes" },
      { index: 3, title: "Sliding window", description: "subarrays" },
    ],
  });
  const result = researchAgentOutputSchema.parse({
    bulletIndex: 1,
    bulletTitle: "Analyze technique",
    findings: [
      { title: "Opposite ends", description: "palindrome check", evidence: "LeetCode", sourceUrl: "https://leetcode.com" },
    ],
    summary: "two pointers are common",
    confidenceScore: 0.9,
  });
  const messages = buildSynthesisMessages({ plan, results: [result] });
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].role, "system");
  assert.strictEqual(messages[1].role, "user");
  assert.ok(messages[1].content.includes("Two Pointers"));
  assert.ok(messages[1].content.includes("https://leetcode.com"));
  console.log("[PASS] Synthesis Message Builder");
}

function testModelPairInitialized() {
  const { main, researcher } = getModelPair();
  assert.ok(main);
  assert.ok(researcher);
  console.log("[PASS] Model Pair Initialization");
}

async function runIntegrationTests() {
  console.log("=== RUNNING INTEGRATION TESTS ===");
  try {
    await testToolComposition();
    testResearcherPrompt();
    testSynthesisMessages();
    testModelPairInitialized();
    console.log("=== ALL INTEGRATION TESTS PASSED ===");
  } catch (err) {
    console.error("Integration Tests Failed:", err);
    process.exit(1);
  }
}

runIntegrationTests();
