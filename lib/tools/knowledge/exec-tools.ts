import { tool } from "@langchain/core/tools";
import { z } from "zod";
import vm from "node:vm";

// Sandboxed JS for quantitative analysis on provided data. No I/O, no require,
// 1s timeout. NOTE: node:vm is not a hardened security boundary — intended for
// computing over the provided `data`, not running untrusted arbitrary code.
export const code_exec = tool(async ({ code, dataJson = "" }) => {
  let data: unknown;
  if (dataJson) {
    try {
      data = JSON.parse(dataJson);
    } catch {
      return "Error: dataJson is not valid JSON";
    }
  }
  const sandbox: Record<string, unknown> = { data, Math, JSON, result: undefined, console: { log: () => {} } };
  try {
    const script = new vm.Script(`"use strict"; result = (function () { ${code}\n })();`);
    script.runInContext(vm.createContext(sandbox), { timeout: 1000 });
    const out = sandbox.result;
    return typeof out === "string" ? out : JSON.stringify(out ?? null);
  } catch (err) {
    return `Error: code_exec failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "code_exec", description: "Run a short JS snippet for data analysis on `data` (parsed from dataJson). Sandboxed: no I/O or require, 1s timeout. Return your output from the snippet.", schema: z.object({ code: z.string(), dataJson: z.string().default("") }) });

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Fetch a YouTube video's English captions (no dependency; public timedtext API).
export const youtube_transcript = tool(async ({ url }) => {
  const idMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (!idMatch) return "Error: could not parse a YouTube video id from the URL";
  const videoId = idMatch[1];
  try {
    const res = await fetch(`https://video.google.com/timedtext?lang=en&v=${videoId}`);
    const xml = await res.text();
    const segs = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1]));
    if (segs.length === 0) {
      return JSON.stringify({ videoId, transcript: "", note: "No English transcript available (captions may be disabled)." });
    }
    return JSON.stringify({ videoId, transcript: segs.join(" ").replace(/\s+/g, " ").trim() });
  } catch (err) {
    return `Error: youtube_transcript failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "youtube_transcript", description: "Fetch the English transcript/captions of a YouTube video by URL. Returns {videoId, transcript}.", schema: z.object({ url: z.string() }) });
