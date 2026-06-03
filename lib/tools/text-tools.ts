import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const text_summarize = tool(async ({ text, maxLength = 200 }) => {
  return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
}, { name: "text_summarize", description: "Summarize a text block", schema: z.object({ text: z.string(), maxLength: z.number().optional() }) });

export const keyword_extract = tool(async ({ text }) => {
  const common = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "is", "are", "of"]);
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const freq: Record<string, number> = {};
  words.forEach(w => { if (!common.has(w)) freq[w] = (freq[w] || 0) + 1; });
  return JSON.stringify(Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]));
}, { name: "keyword_extract", description: "Extract keywords", schema: z.object({ text: z.string() }) });

export const sentiment_analyze = tool(async ({ text }) => {
  const pos = ["good", "great", "excellent", "best", "love", "amazing", "awesome"];
  const neg = ["bad", "worst", "poor", "hate", "terrible", "worst", "fail"];
  let score = 0;
  text.toLowerCase().split(/\s+/).forEach(w => {
    if (pos.includes(w)) score++;
    if (neg.includes(w)) score--;
  });
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
}, { name: "sentiment_analyze", description: "Analyze basic sentiment", schema: z.object({ text: z.string() }) });

export const extract_emails = tool(async ({ text }) => {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return JSON.stringify([...new Set(matches)]);
}, { name: "extract_emails", description: "Extract email addresses", schema: z.object({ text: z.string() }) });

export const extract_urls = tool(async ({ text }) => {
  const matches = text.match(/https?:\/\/[^\s]+/g) || [];
  return JSON.stringify([...new Set(matches)]);
}, { name: "extract_urls", description: "Extract urls", schema: z.object({ text: z.string() }) });

export const clean_whitespace = tool(async ({ text }) => {
  return text.trim().replace(/\s+/g, " ");
}, { name: "clean_whitespace", description: "Clean whitespace", schema: z.object({ text: z.string() }) });

export const word_count = tool(async ({ text }) => {
  return String((text.match(/\b\w+\b/g) || []).length);
}, { name: "word_count", description: "Count words in text", schema: z.object({ text: z.string() }) });

export const char_count = tool(async ({ text }) => {
  return String(text.length);
}, { name: "char_count", description: "Count characters in text", schema: z.object({ text: z.string() }) });

export const line_count = tool(async ({ text }) => {
  return String(text.split("\n").length);
}, { name: "line_count", description: "Count lines in text", schema: z.object({ text: z.string() }) });

export const to_lowercase = tool(async ({ text }) => {
  return text.toLowerCase();
}, { name: "to_lowercase", description: "Convert to lowercase", schema: z.object({ text: z.string() }) });

export const to_uppercase = tool(async ({ text }) => {
  return text.toUpperCase();
}, { name: "to_uppercase", description: "Convert to uppercase", schema: z.object({ text: z.string() }) });

export const base64_encode = tool(async ({ text }) => {
  return Buffer.from(text).toString("base64");
}, { name: "base64_encode", description: "Encode text in base64", schema: z.object({ text: z.string() }) });

export const base64_decode = tool(async ({ encoded }) => {
  return Buffer.from(encoded, "base64").toString("utf8");
}, { name: "base64_decode", description: "Decode base64 to text", schema: z.object({ encoded: z.string() }) });

export const textTools = [
  text_summarize, keyword_extract, sentiment_analyze, extract_emails, extract_urls,
  clean_whitespace, word_count, char_count, line_count, to_lowercase, to_uppercase,
  base64_encode, base64_decode
];
