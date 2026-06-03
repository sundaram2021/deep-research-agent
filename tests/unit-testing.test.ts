import { ToolValidationError } from "../lib/utils/typed-errors";
import { SimpleRateLimiter, withRetry } from "../lib/utils/network-helpers";
import { searchTools } from "../lib/tools/search-tools";
import { textTools } from "../lib/tools/text-tools";
import { dataTools } from "../lib/tools/data-tools";
import { agentTools } from "../lib/tools/agent-tools";
import assert from "node:assert";

function testErrors() {
  const err = new ToolValidationError("Validation failed", "test_tool");
  assert.strictEqual(err.code, "TOOL_VALIDATION_ERROR");
  assert.strictEqual(err.toolName, "test_tool");
  assert.strictEqual(err.status, 400);
  console.log("✓ testErrors passed");
}

async function testRateLimiter() {
  const limiter = new SimpleRateLimiter(2, 50);
  let active = 0;
  let maxActive = 0;
  
  const tasks = Array.from({ length: 4 }, async () => {
    return limiter.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 20));
      active--;
    });
  });

  await Promise.all(tasks);
  assert.ok(maxActive <= 2, `Expected max concurrency 2, got ${maxActive}`);
  console.log("✓ testRateLimiter passed");
}

async function testRetryHelper() {
  let count = 0;
  const result = await withRetry(async () => {
    count++;
    if (count < 3) throw new Error("Retry error");
    return "success";
  }, 3, 10, 1.5);

  assert.strictEqual(result, "success");
  assert.strictEqual(count, 3);
  console.log("✓ testRetryHelper passed");
}

function testToolRegistry() {
  const totalTools = searchTools.length + textTools.length + dataTools.length + agentTools.length;
  assert.ok(totalTools >= 50, `Expected at least 50 tools, got ${totalTools}`);
  console.log("✓ testToolRegistry passed");
}

async function runAllTests() {
  console.log("=== RUNNING UNIT TESTS ===");
  try {
    testErrors();
    await testRateLimiter();
    await testRetryHelper();
    testToolRegistry();
    console.log("=== ALL UNIT TESTS PASSED ===");
  } catch (err) {
    console.error("Unit Tests Failed:", err);
    process.exit(1);
  }
}

runAllTests();
