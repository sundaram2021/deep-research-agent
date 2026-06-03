import { csv_to_json, calculate_stats } from "../lib/tools/data-tools";
import { researcherSubAgent } from "../lib/subagents/researcher-agent";
import assert from "node:assert";

async function testToolComposition() {
  console.log("Testing Tool Composition Chain...");
  const csvData = "value\n10\n20\n30\n40\n50";
  
  const jsonResult = await csv_to_json.invoke({ csv: csvData });
  assert.ok(jsonResult, "CSV conversion returned no output");
  const parsed = JSON.parse(jsonResult);
  assert.strictEqual(parsed.length, 5);
  assert.strictEqual(parsed[0].value, "10");

  const numbersArray = parsed.map((item: any) => item.value);
  const statsResult = await calculate_stats.invoke({ 
    numbersJson: JSON.stringify(numbersArray) 
  });
  
  assert.ok(statsResult, "Stats calculation returned no output");
  const stats = JSON.parse(statsResult);
  assert.strictEqual(stats.count, 5);
  assert.strictEqual(stats.mean, 30);
  assert.strictEqual(stats.min, 10);
  assert.strictEqual(stats.max, 50);
  console.log("✓ Tool Composition Chain passed (csv_to_json -> calculate_stats)");
}

function testSubagentSetup() {
  console.log("Testing Subagent Orchestration Setup...");
  assert.strictEqual(researcherSubAgent.name, "researcher");
  assert.ok(researcherSubAgent.tools && researcherSubAgent.tools.length > 0);
  assert.ok(researcherSubAgent.responseFormat);
  console.log("✓ Subagent Orchestration Setup passed");
}

async function runIntegrationTests() {
  console.log("=== RUNNING INTEGRATION TESTS ===");
  try {
    await testToolComposition();
    testSubagentSetup();
    console.log("=== ALL INTEGRATION TESTS PASSED ===");
  } catch (err) {
    console.error("Integration Tests Failed:", err);
    process.exit(1);
  }
}

runIntegrationTests();
