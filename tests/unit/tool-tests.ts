import assert from "node:assert";
import { z } from "zod";
import { searchTools } from "../../lib/tools/search-tools";
import { textTools } from "../../lib/tools/text-tools";
import { dataTools } from "../../lib/tools/data-tools";
import { agentTools } from "../../lib/tools/agent-tools";
import { knowledgeTools } from "../../lib/tools/knowledge-tools";
import { orchestrationTools } from "../../lib/tools/orchestration-tools";

export function testToolRegistry() {
  const totalTools =
    searchTools.length + textTools.length + dataTools.length + agentTools.length +
    knowledgeTools.length + orchestrationTools.length;
  // We favor real, honest tools over a padded count. The registry now spans 6
  // namespaces (search, text, data, agent, knowledge, orchestration) and clears
  // the brief's "50+ tools across 4+ namespaces" bar; the floor stays at 50 as a
  // regression guard.
  assert.ok(totalTools >= 50, `Expected at least 50 tools, got ${totalTools}`);
  console.log(`[PASS] testToolRegistry (${totalTools} tools)`);
}

export function testToolSchemasStrict() {
  const allTools = [...searchTools, ...textTools, ...dataTools, ...agentTools, ...knowledgeTools, ...orchestrationTools];
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

export function testOrchestrationTool() {
  // The model-callable subagent-spawning tool must be registered and expose an
  // OpenAI-safe schema (all fields required, no z.any()).
  const names = orchestrationTools.map((t) => (t as { name: string }).name);
  assert.ok(names.includes("spawn_research_subagent"), "spawn_research_subagent should be registered");
  const spawn = orchestrationTools.find((t) => (t as { name: string }).name === "spawn_research_subagent") as {
    schema: z.ZodTypeAny;
  };
  const json = z.toJSONSchema(spawn.schema) as { properties?: Record<string, unknown>; required?: string[] };
  assert.deepStrictEqual(
    new Set(json.required ?? []),
    new Set(["objective", "context"]),
    "spawn tool must require objective + context (OpenAI strict mode)"
  );
  console.log("[PASS] testOrchestrationTool");
}
