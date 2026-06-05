import { searchTools } from "../lib/tools/search-tools";
import { textTools } from "../lib/tools/text-tools";
import { dataTools } from "../lib/tools/data-tools";
import { agentTools } from "../lib/tools/agent-tools";
import {
  mainAgentPlanSchema,
  researchAgentOutputSchema,
  reflectionSchema,
} from "../lib/schemas/agent-schemas";
import { SourcePool } from "../lib/agents/source-pool";
import { SearchRouter } from "../lib/search/router";
import type { SearchProvider } from "../lib/search/types";
import { getModelPair } from "../lib/models";
import { z } from "zod";
import assert from "node:assert";

function testToolRegistry() {
  const totalTools = searchTools.length + textTools.length + dataTools.length + agentTools.length;
  // Phase 0 removed mock/noise tools (get_domain_rank, list_search_engines) and
  // replaced others with real implementations. We favor real, honest tools over a
  // padded count, so the floor is 40 rather than the original 50.
  assert.ok(totalTools >= 40, `Expected at least 40 tools, got ${totalTools}`);
  console.log(`[PASS] testToolRegistry (${totalTools} tools)`);
}

function testSchemasValid() {
  const ok1 = mainAgentPlanSchema.safeParse({
    originalTopic: "Topic",
    summary: "Summary",
    bulletPoints: [
      { index: 1, title: "T1", description: "D1" },
      { index: 2, title: "T2", description: "D2" },
      { index: 3, title: "T3", description: "D3" },
    ],
  });
  assert.ok(ok1.success, "mainAgentPlanSchema should accept 3 bullets");

  const ok2 = researchAgentOutputSchema.safeParse({
    bulletIndex: 1,
    bulletTitle: "T",
    findings: [{ title: "f", description: "d", evidence: "e", sourceUrl: "https://x.com" }],
    summary: "s",
    confidenceScore: 0.8,
  });
  assert.ok(ok2.success, "researchAgentOutputSchema should accept a finding");
  console.log("[PASS] testSchemasValid");
}

function testSchemasRejectInvalid() {
  const bad = mainAgentPlanSchema.safeParse({ originalTopic: "x", bulletPoints: [] });
  assert.ok(!bad.success, "empty bulletPoints should be rejected");

  const bad2 = researchAgentOutputSchema.safeParse({
    bulletIndex: "not a number",
    bulletTitle: "T",
    findings: [],
    summary: "s",
    confidenceScore: 2,
  });
  assert.ok(!bad2.success, "out-of-range confidenceScore should be rejected");
  console.log("[PASS] testSchemasRejectInvalid");
}

function testToolSchemasStrict() {
  const allTools = [...searchTools, ...textTools, ...dataTools, ...agentTools];
  const broken: string[] = [];

  for (const t of allTools) {
    const tool = t as { name: string; schema: z.ZodTypeAny };
    broken.push(...validateOpenAISchema(tool.name, tool.schema));
  }

  assert.strictEqual(broken.length, 0, `OpenAI strict-mode incompatible schemas: ${broken.join("; ")}`);
  console.log(`[PASS] testToolSchemasStrict (${allTools.length} tools)`);
}

function validateOpenAISchema(label: string, schema: z.ZodTypeAny, path = ""): string[] {
  const broken: string[] = [];
  const json = z.toJSONSchema(schema) as Record<string, unknown> & {
    properties?: Record<string, { _def?: unknown } & Record<string, unknown>>;
    required?: string[];
    items?: z.ZodTypeAny;
  };
  const required = new Set(json.required ?? []);

  for (const [key, sub] of Object.entries(json.properties ?? {})) {
    const subPath = `${path}.${key}`;
    if (!required.has(key)) broken.push(`${label}${subPath}: missing required=[${key}]`);
    if (!hasType(sub)) broken.push(`${label}${subPath}: missing 'type' (OpenAI strict mode rejects z.any()/z.unknown())`);
    if (sub && typeof sub === "object" && "_def" in sub) {
      broken.push(...validateOpenAISchema(label, sub as unknown as z.ZodTypeAny, subPath));
    }
  }
  if (json.items && typeof json.items === "object" && "_def" in (json.items as object)) {
    broken.push(...validateOpenAISchema(label, json.items as z.ZodTypeAny, `${path}[]`));
  }

  return broken;
}

function hasType(node: unknown): boolean {
  if (!node || typeof node !== "object") return true;
  const n = node as Record<string, unknown>;
  if (typeof n.type === "string") return true;
  if (Array.isArray(n.anyOf) || Array.isArray(n.oneOf) || Array.isArray(n.allOf)) return true;
  if (typeof n.$ref === "string") return true;
  if (Array.isArray(n.enum)) return true;
  return false;
}

function testModelPairCaches() {
  const a = getModelPair();
  const b = getModelPair();
  assert.strictEqual(a, b, "getModelPair should return the same cached instance");
  assert.ok(a.main, "main model should be defined");
  assert.ok(a.researcher, "researcher model should be defined");
  assert.notStrictEqual(a.main, a.researcher, "main and researcher should be distinct");
  console.log("[PASS] testModelPairCaches");
}

function testSourcePoolDedup() {
  const pool = new SourcePool();
  pool.setContent("https://a.com", JSON.stringify({ url: "https://a.com", text: "A" }));
  assert.ok(pool.getContent("https://a.com"), "cached content should be returned");
  assert.strictEqual(pool.getContent("https://missing.com"), undefined, "uncached content is undefined");
  pool.setSearch("k", "[1]");
  assert.strictEqual(pool.getSearch("k"), "[1]", "cached search should be returned");
  const stats = pool.stats();
  assert.strictEqual(stats.uniqueUrls, 1);
  assert.ok(stats.contentCacheHits >= 1, "content hit counter should increment");
  console.log("[PASS] testSourcePoolDedup");
}

function testReflectionSchema() {
  const ok = reflectionSchema.safeParse({
    sufficient: false,
    gaps: [{ bulletIndex: 0, directive: "Investigate X", reason: "coverage_gap" }],
    notes: "needs more",
  });
  assert.ok(ok.success, "valid reflection should parse");
  const bad = reflectionSchema.safeParse({
    sufficient: false,
    gaps: [{ bulletIndex: 1, directive: "x", reason: "not_a_reason" }],
    notes: "",
  });
  assert.ok(!bad.success, "invalid reason should be rejected");
  console.log("[PASS] testReflectionSchema");
}

async function testSearchRouterFallback() {
  const failing: SearchProvider = {
    name: "failing",
    isConfigured: () => true,
    search: async () => { throw new Error("provider down"); },
  };
  const working: SearchProvider = {
    name: "working",
    isConfigured: () => true,
    search: async () => [{ title: "T", url: "https://x.com", content: "c", score: 0.9 }],
  };
  const empty: SearchProvider = {
    name: "empty",
    isConfigured: () => true,
    search: async () => [],
  };
  const unconfigured: SearchProvider = {
    name: "off",
    isConfigured: () => false,
    search: async () => { throw new Error("should not be called"); },
  };

  const r1 = await new SearchRouter([failing, working]).search("q");
  assert.strictEqual(r1.provider, "working", "should fall back past a failing provider");
  assert.strictEqual(r1.results.length, 1);

  const r2 = await new SearchRouter([empty, working]).search("q");
  assert.strictEqual(r2.provider, "working", "should skip empty results and try the next provider");

  const r3 = await new SearchRouter([unconfigured, working]).search("q");
  assert.strictEqual(r3.provider, "working", "should ignore unconfigured providers");

  assert.strictEqual(new SearchRouter([unconfigured]).hasConfiguredProvider(), false);
  assert.strictEqual(new SearchRouter([working]).hasConfiguredProvider(), true);
  console.log("[PASS] testSearchRouterFallback");
}

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
    console.log("=== ALL UNIT TESTS PASSED ===");
  } catch (err) {
    console.error("Unit Tests Failed:", err);
    process.exit(1);
  }
}

runAllTests();
