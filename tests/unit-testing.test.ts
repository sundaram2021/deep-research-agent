// Unit test runner. Individual suites live in ./unit/*; this entry keeps the
// `pnpm test` command and run order stable.
import { testToolRegistry, testToolSchemasStrict, testOrchestrationTool } from "./unit/tool-tests";
import { testSchemasValid, testSchemasRejectInvalid, testReflectionSchema } from "./unit/schema-tests";
import { testModelPairCaches, testSourcePoolDedup, testJobEventRoundTrip, testVectorMath } from "./unit/core-tests";
import { testSearchRouterFallback, testRateLimiterSpacing } from "./unit/async-tests";
import { testCollectorOutputSchema, testBuildAnalyzerMessages } from "./unit/synthesis-tests";

async function runAllTests() {
  console.log("=== RUNNING UNIT TESTS ===");
  try {
    testToolRegistry();
    testSchemasValid();
    testSchemasRejectInvalid();
    testToolSchemasStrict();
    testModelPairCaches();
    testSourcePoolDedup();
    testReflectionSchema();
    await testSearchRouterFallback();
    testJobEventRoundTrip();
    testVectorMath();
    testOrchestrationTool();
    await testRateLimiterSpacing();
    testCollectorOutputSchema();
    testBuildAnalyzerMessages();
    console.log("=== ALL UNIT TESTS PASSED ===");
  } catch (err) {
    console.error("Unit Tests Failed:", err);
    process.exit(1);
  }
}

runAllTests();
