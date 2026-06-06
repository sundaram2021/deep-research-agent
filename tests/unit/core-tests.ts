import assert from "node:assert";
import { cosineSimilarity } from "../../lib/agents/embeddings";
import { findDuplicateIndices } from "../../lib/research/vector-store";
import { SourcePool } from "../../lib/agents/source-pool";
import { eventToRow, rowToEvent } from "../../lib/jobs/job-store";
import { getModelPair } from "../../lib/models";

export function testModelPairCaches() {
  const a = getModelPair();
  const b = getModelPair();
  assert.strictEqual(a, b, "getModelPair should return the same cached instance");
  assert.ok(a.main, "main model should be defined");
  assert.ok(a.researcher, "researcher model should be defined");
  assert.notStrictEqual(a.main, a.researcher, "main and researcher should be distinct");
  console.log("[PASS] testModelPairCaches");
}

export function testSourcePoolDedup() {
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

export function testJobEventRoundTrip() {
  // Regression: replayed events must keep id/name/parent so the client can pair
  // tool/subagent starts+ends and preserve parent scope on reconnect.
  const ev = {
    type: "tool.start",
    id: "run-123",
    name: "web_search",
    parent: "subagent-2-1",
    data: { args: { query: "x" } },
    ts: 1717,
  };
  const back = rowToEvent(eventToRow("job-1", 5, ev));
  assert.strictEqual(back.id, "run-123", "tool id preserved through persist + replay");
  assert.strictEqual(back.name, "web_search", "tool name preserved");
  assert.strictEqual(back.parent, "subagent-2-1", "parent scope preserved");
  assert.strictEqual(back.type, "tool.start");
  assert.strictEqual(back.seq, 5);

  const minimal = rowToEvent(eventToRow("job-1", 6, { type: "synthesis.start", ts: 1 }));
  assert.strictEqual(minimal.id, undefined, "absent id stays undefined (matches live publish)");
  assert.strictEqual(minimal.parent, undefined, "absent parent stays undefined");
  console.log("[PASS] testJobEventRoundTrip");
}

export function testVectorMath() {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-9, "identical vectors -> 1");
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9, "orthogonal vectors -> 0");
  assert.strictEqual(cosineSimilarity([1, 2, 3], []), 0, "length mismatch -> 0");
  const dups = findDuplicateIndices([[1, 0, 0], [1, 0, 0], [0, 1, 0]], 0.95);
  assert.deepStrictEqual(dups, [1], "second identical vector flagged as duplicate");
  console.log("[PASS] testVectorMath");
}
