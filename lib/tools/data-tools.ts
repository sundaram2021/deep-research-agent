import { tool } from "@langchain/core/tools";
import { z } from "zod";
import crypto from "node:crypto";

export const json_parse = tool(async ({ json }) => {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const preview = json.slice(0, 80) + (json.length > 80 ? "..." : "");
    return `Error: json_parse expected valid JSON but got: "${preview}" (${msg})`;
  }
}, { name: "json_parse", description: "Parse and validate a JSON string. Returns the parsed object or an error message.", schema: z.object({ json: z.string() }) });

export const json_stringify = tool(async ({ json }) => {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
}, { name: "json_stringify", description: "Convert a JSON string to a normalized JSON string. Pass the value as a JSON string.", schema: z.object({ json: z.string() }) });

export const csv_to_json = tool(async ({ csv }) => {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return "[]";
  const headers = lines[0].split(",");
  const result = lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] || "").trim();
    });
    return obj;
  });
  return JSON.stringify(result);
}, { name: "csv_to_json", description: "Convert CSV text to a JSON array of objects", schema: z.object({ csv: z.string() }) });

export const json_to_csv = tool(async ({ data }) => {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map((obj) => headers.map((h) => JSON.stringify(obj[h] ?? "")).join(","));
  return [headers.join(","), ...rows].join("\n");
}, { name: "json_to_csv", description: "Convert an array of record objects to a CSV string. Pass data as a real array, not JSON.", schema: z.object({ data: z.array(z.any()) }) });

export const calculate_stats = tool(async ({ numbers }) => {
  if (numbers.length === 0) return "No numbers provided";
  const sum = numbers.reduce((a, b) => a + b, 0);
  const mean = sum / numbers.length;
  return JSON.stringify({ count: numbers.length, sum, mean, min: Math.min(...numbers), max: Math.max(...numbers) });
}, { name: "calculate_stats", description: "Calculate count, sum, mean, min, max from a number array. Pass numbers as a real array, not JSON.", schema: z.object({ numbers: z.array(z.number()) }) });

export const math_eval = tool(async ({ expr }) => {
  return String(new Function(`return (${expr})`)());
}, { name: "math_eval", description: "Safely evaluate basic math expression", schema: z.object({ expr: z.string() }) });

export const date_format = tool(async ({ dateStr, format }) => {
  const d = new Date(dateStr);
  return format === "iso" ? d.toISOString() : d.toDateString();
}, { name: "date_format", description: "Format date string", schema: z.object({ dateStr: z.string(), format: z.enum(["iso", "text"]) }) });

export const date_diff = tool(async ({ date1, date2 }) => {
  const diffTime = Math.abs(new Date(date2).getTime() - new Date(date1).getTime());
  return String(Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}, { name: "date_diff", description: "Get date difference in days", schema: z.object({ date1: z.string(), date2: z.string() }) });

export const generate_uuid = tool(async () => {
  return crypto.randomUUID();
}, { name: "generate_uuid", description: "Generate a unique UUID", schema: z.object({}) });

export const generate_hash = tool(async ({ text, algo = "sha256" }) => {
  return crypto.createHash(algo).update(text).digest("hex");
}, { name: "generate_hash", description: "Hash a string with the given algorithm (default sha256). Returns hex digest.", schema: z.object({ text: z.string(), algo: z.string().default("sha256") }) });

export const url_encode = tool(async ({ text }) => {
  return encodeURIComponent(text);
}, { name: "url_encode", description: "Encode URL component", schema: z.object({ text: z.string() }) });

export const url_decode = tool(async ({ text }) => {
  return decodeURIComponent(text);
}, { name: "url_decode", description: "Decode URL component", schema: z.object({ text: z.string() }) });

export const random_number = tool(async ({ min = 0, max = 100 }) => {
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}, { name: "random_number", description: "Generate a random integer in [min, max] (defaults 0..100).", schema: z.object({ min: z.number().default(0), max: z.number().default(100) }) });

export const dataTools = [
  json_parse, json_stringify, csv_to_json, json_to_csv, calculate_stats,
  math_eval, date_format, date_diff, generate_uuid, generate_hash,
  url_encode, url_decode, random_number
];
