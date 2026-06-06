import assert from "node:assert";
import {
  a2aSynthesisRequestSchema,
  decodeSynthesisRequest,
  encodeSynthesisRequest,
  type A2ASynthesisRequest,
} from "../../lib/a2a/types";
import { buildAnalyzerCard } from "../../lib/a2a/analyzer-card";
import { mainAgentPlanSchema, researchAgentOutputSchema } from "../../lib/schemas/agent-schemas";

// These suites validate the Collector <-> Analyzer A2A *contract* (message
// encode/decode + agent card) without a network call or model invocation, so
// they run in CI without API keys. A full loopback round trip with a stubbed
// synthesizer is possible via startAnalyzerServer() but is gated on a live port.

function sampleRequest(): A2ASynthesisRequest {
  const plan = mainAgentPlanSchema.parse({
    originalTopic: "A2A round trip",
    summary: "contract test",
    bulletPoints: [
      { index: 1, title: "One", description: "first" },
      { index: 2, title: "Two", description: "second" },
      { index: 3, title: "Three", description: "third" },
    ],
  });
  const result = researchAgentOutputSchema.parse({
    bulletIndex: 1,
    bulletTitle: "One",
    findings: [
      { title: "F", description: "d", evidence: "e", sourceUrl: "https://example.com" },
    ],
    summary: "s",
    confidenceScore: 0.8,
  });
  return a2aSynthesisRequestSchema.parse({
    kind: "synthesis-request",
    format: "deep",
    plan,
    results: [result],
  });
}

export function testA2APayloadRoundTrip() {
  const req = sampleRequest();
  const params = encodeSynthesisRequest(req);

  // The Collector must emit a valid A2A user message carrying the payload.
  assert.strictEqual(params.message.role, "user");
  assert.strictEqual(params.message.kind, "message");
  assert.ok(params.message.parts.length >= 1, "message must carry at least one part");

  const decoded = decodeSynthesisRequest(params.message);
  assert.ok(decoded, "payload should decode back on the Analyzer side");
  assert.strictEqual(decoded!.plan.originalTopic, "A2A round trip");
  assert.strictEqual(decoded!.results.length, 1);
  assert.strictEqual(decoded!.results[0].findings[0].sourceUrl, "https://example.com");
  assert.strictEqual(decoded!.format, "deep");
  console.log("[PASS] testA2APayloadRoundTrip");
}

export function testA2ABadMessageRejected() {
  const decoded = decodeSynthesisRequest({
    kind: "message",
    messageId: "x",
    role: "user",
    parts: [{ kind: "text", text: "not json at all" }],
  });
  assert.strictEqual(decoded, null, "garbage payload should decode to null, not throw");
  console.log("[PASS] testA2ABadMessageRejected");
}

export function testAnalyzerCardStreaming() {
  const card = buildAnalyzerCard("http://127.0.0.1:41241/");
  assert.strictEqual(
    card.capabilities.streaming,
    true,
    "analyzer must advertise streaming so the collector can stream the report"
  );
  assert.ok(card.skills.length >= 1, "analyzer must expose at least one skill");
  assert.strictEqual(card.url, "http://127.0.0.1:41241/");
  console.log("[PASS] testAnalyzerCardStreaming");
}
