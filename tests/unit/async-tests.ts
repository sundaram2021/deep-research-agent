import assert from "node:assert";
import { RateLimiter } from "../../lib/utils/network-helpers";
import { SearchRouter } from "../../lib/search/router";
import type { SearchProvider } from "../../lib/search/types";

export async function testSearchRouterFallback() {
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

export async function testRateLimiterSpacing() {
  // The RateLimiter must serialize calls with a minimum interval between them.
  const minInterval = 40;
  const limiter = new RateLimiter(minInterval);
  const times: number[] = [];
  await Promise.all(
    [0, 1, 2].map(() =>
      limiter.schedule(async () => {
        times.push(Date.now());
      })
    )
  );
  times.sort((a, b) => a - b);
  assert.ok(times[1] - times[0] >= minInterval - 10, "2nd call spaced ~>= interval");
  assert.ok(times[2] - times[1] >= minInterval - 10, "3rd call spaced ~>= interval");
  console.log("[PASS] testRateLimiterSpacing");
}
