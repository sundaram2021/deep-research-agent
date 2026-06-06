import assert from "node:assert";
import {
  mainAgentPlanSchema,
  researchAgentOutputSchema,
  reflectionSchema,
} from "../../lib/schemas/agent-schemas";

export function testSchemasValid() {
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

export function testSchemasRejectInvalid() {
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

export function testReflectionSchema() {
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
