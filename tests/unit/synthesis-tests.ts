import assert from "node:assert";
import { collectorOutputSchema, buildAnalyzerMessages } from "../../lib/agents/synthesis";

export function testCollectorOutputSchema() {
  const validPayload = {
    topic: "Native Collector-Analyzer Flow",
    summary: "Checking native agent interaction via system prompt and schemas",
    bulletPoints: [
      {
        index: 1,
        title: "Bullet 1",
        description: "Verify that the collector agent parses correctly.",
        summary: "Parsed successfully.",
        findings: [
          {
            title: "Finding 1",
            description: "Collector structures everything.",
            evidence: "Passed verification.",
            sourceUrl: "https://example.com/one",
          },
        ],
      },
    ],
  };

  const parsed = collectorOutputSchema.safeParse(validPayload);
  assert.ok(parsed.success, "collectorOutputSchema should parse a valid payload");
  assert.strictEqual(parsed.data.bulletPoints[0].findings[0].sourceUrl, "https://example.com/one");
  console.log("[PASS] testCollectorOutputSchema");
}

export function testBuildAnalyzerMessages() {
  const payload = {
    topic: "Native Collector-Analyzer Flow",
    summary: "Testing",
    bulletPoints: [
      {
        index: 1,
        title: "Bullet 1",
        description: "Verify analyzer formatting.",
        summary: "Formatting works.",
        findings: [
          {
            title: "Finding 1",
            description: "Analyzer reads references.",
            evidence: "Ref 1 present.",
            sourceUrl: "https://example.com/one",
          },
          {
            title: "Finding 2",
            description: "Analyzer maps duplicate URLs to the same citation.",
            evidence: "Ref 1 reused.",
            sourceUrl: "https://example.com/one",
          },
          {
            title: "Finding 3",
            description: "Analyzer maps new URLs to new citation numbers.",
            evidence: "Ref 2 present.",
            sourceUrl: "https://example.com/two",
          },
        ],
      },
    ],
  };

  const messages = buildAnalyzerMessages(payload, "deep");
  assert.strictEqual(messages.length, 2, "Should return system and user messages");
  assert.strictEqual(messages[0].role, "system");
  assert.strictEqual(messages[1].role, "user");

  const userContent = messages[1].content;
  // Verify citations are correctly numbered and deduplicated
  assert.ok(userContent.includes("[1]"), "Should contain citation [1]");
  assert.ok(userContent.includes("[2]"), "Should contain citation [2]");
  assert.ok(userContent.includes("1. Finding 1 — https://example.com/one"), "References list should contain source 1");
  assert.ok(userContent.includes("2. Finding 3 — https://example.com/two"), "References list should contain source 2");
  console.log("[PASS] testBuildAnalyzerMessages");
}
