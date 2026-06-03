import { tool } from "@langchain/core/tools";
import { z } from "zod";
import crypto from "node:crypto";

export const json_parse = tool(async ({ json }) => {
  return JSON.stringify(JSON.parse(json));
}, { name: "json_parse", description: "Parse and validate JSON", schema: z.object({ json: z.string() }) });

export const json_stringify = tool(async ({ obj }) => {
  return JSON.stringify(obj);
}, { name: "json_stringify", description: "Convert object to JSON string", schema: z.object({ obj: z.any() }) });

export const csv_to_json = tool(async ({ csv }) => {
  const lines = csv.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return "[]";
  const headers = lines[0].split(",");
  const result = lines.slice(1).map(line => {
    const values = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || "").trim(); });
    return obj;
  });
  return JSON.stringify(result);
}, { name: "csv_to_json", description: "Convert CSV to JSON string", schema: z.object({ csv: z.string() }) });

export const json_to_csv = tool(async ({ jsonArray }) => {
  const arr = JSON.parse(jsonArray);
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const headers = Object.keys(arr[0]);
  const rows = arr.map(obj => headers.map(h => JSON.stringify(obj[h] || "")).join(","));
  return [headers.join(","), ...rows].join("\n");
}, { name: "json_to_csv", description: "Convert JSON array to CSV", schema: z.object({ jsonArray: z.string() }) });

export const calculate_stats = tool(async ({ numbersJson }) => {
  const nums = JSON.parse(numbersJson);
  if (!Array.isArray(nums) || nums.length === 0) return "No numbers provided";
  const parsedNums = nums.map(n => Number(n)).filter(n => !isNaN(n));
  const sum = parsedNums.reduce((a, b) => a + b, 0);
  const mean = sum / parsedNums.length;
  const min = Math.min(...parsedNums);
  const max = Math.max(...parsedNums);
  return JSON.stringify({ count: parsedNums.length, sum, mean, min, max });
}, { name: "calculate_stats", description: "Calculate statistics from a JSON array of numbers", schema: z.object({ numbersJson: z.string() }) });

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
}, { name: "generate_hash", description: "Hash string", schema: z.object({ text: z.string(), algo: z.string().optional() }) });

export const url_encode = tool(async ({ text }) => {
  return encodeURIComponent(text);
}, { name: "url_encode", description: "Encode URL component", schema: z.object({ text: z.string() }) });

export const url_decode = tool(async ({ text }) => {
  return decodeURIComponent(text);
}, { name: "url_decode", description: "Decode URL component", schema: z.object({ text: z.string() }) });

export const random_number = tool(async ({ min = 0, max = 100 }) => {
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}, { name: "random_number", description: "Generate random number", schema: z.object({ min: z.number().optional(), max: z.number().optional() }) });

export const dataTools = [
  json_parse, json_stringify, csv_to_json, json_to_csv, calculate_stats,
  math_eval, date_format, date_diff, generate_uuid, generate_hash,
  url_encode, url_decode, random_number
];
