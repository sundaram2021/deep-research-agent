import { tool } from "@langchain/core/tools";
import { z } from "zod";

const sectionsSchema = z.array(z.object({ heading: z.string(), content: z.string() }));
const stringArray = z.array(z.string());
const sourceSchema = z.array(z.object({ title: z.string(), url: z.string() }));
const tableSchema = z.array(z.array(z.string()));

export const compile_markdown_report = tool(async ({ title, sections }) => {
  const parts = [`# ${title}`];
  for (const s of sections) parts.push(`## ${s.heading}\n${s.content}`);
  return parts.join("\n\n");
}, { name: "compile_markdown_report", description: "Compile a list of {heading, content} sections into a markdown report. Pass sections as a real array, not JSON.", schema: z.object({ title: z.string(), sections: sectionsSchema }) });

export const create_markdown_table = tool(async ({ headers, rows }) => {
  const sep = headers.map(() => "---").join(" | ");
  const lines = [headers.join(" | "), sep, ...rows.map((r) => r.join(" | "))];
  return lines.join("\n");
}, { name: "create_markdown_table", description: "Build a markdown table from a headers array and a 2D rows array. Pass real arrays, not JSON strings.", schema: z.object({ headers: stringArray, rows: tableSchema }) });

export const verify_checklist = tool(async ({ items, checked }) => {
  const set = new Set(checked);
  return items.map((it) => `[${set.has(it) ? "x" : " "}] ${it}`).join("\n");
}, { name: "verify_checklist", description: "Render a markdown checklist. Pass items (string[]) and checked (string[]) as real arrays.", schema: z.object({ items: stringArray, checked: stringArray }) });

export const format_citations = tool(async ({ sources }) => {
  return sources.map((s, i) => `[${i + 1}] "${s.title}" - ${s.url}`).join("\n");
}, { name: "format_citations", description: "Format article citations. Pass sources as a real array of {title, url} objects.", schema: z.object({ sources: sourceSchema }) });

export const generate_bullet_points = tool(async ({ items }) => {
  return items.map((it) => `* ${it}`).join("\n");
}, { name: "generate_bullet_points", description: "Convert a list of strings to markdown bullets. Pass a real array, not a JSON string.", schema: z.object({ items: stringArray }) });

export const summarize_key_findings = tool(async ({ findings }) => {
  return `KEY FINDINGS:\n` + findings.map((f, i) => `${i + 1}. ${f}`).join("\n");
}, { name: "summarize_key_findings", description: "Number a list of findings. Pass a real string array, not JSON.", schema: z.object({ findings: stringArray }) });

export const validate_research_goal = tool(async ({ goal }) => {
  return goal.length > 10 ? "valid" : "invalid: Goal is too short";
}, { name: "validate_research_goal", description: "Validate research goals", schema: z.object({ goal: z.string() }) });

export const append_to_file = tool(async ({ text, fileContent }) => {
  return `${fileContent}\n${text}`;
}, { name: "append_to_file", description: "Append text block to file content", schema: z.object({ text: z.string(), fileContent: z.string() }) });

export const create_draft_outline = tool(async ({ topic, sections }) => {
  return `OUTLINE FOR: ${topic}\n` + sections.map((s, i) => `${i + 1}. ${s}`).join("\n");
}, { name: "create_draft_outline", description: "Create outline draft. Pass sections as a real string array, not JSON.", schema: z.object({ topic: z.string(), sections: stringArray }) });

export const assess_relevance = tool(async ({ text, keywords }) => {
  const lowerText = text.toLowerCase();
  const hits = keywords.filter((k) => lowerText.includes(k.toLowerCase()));
  return JSON.stringify({ score: hits.length / keywords.length, matched: hits });
}, { name: "assess_relevance", description: "Assess text relevance to keywords. Pass keywords as a real string array, not JSON.", schema: z.object({ text: z.string(), keywords: stringArray }) });

export const compare_texts = tool(async ({ textA, textB }) => {
  return textA === textB ? "identical" : "different";
}, { name: "compare_texts", description: "Compare two text contents", schema: z.object({ textA: z.string(), textB: z.string() }) });

export const find_pattern = tool(async ({ text, regex }) => {
  const match = text.match(new RegExp(regex, "g"));
  return JSON.stringify(match || []);
}, { name: "find_pattern", description: "Search regex pattern in text", schema: z.object({ text: z.string(), regex: z.string() }) });

export const extract_metadata = tool(async ({ text }) => {
  return JSON.stringify({ length: text.length, lines: text.split("\n").length, words: text.split(/\s+/).length });
}, { name: "extract_metadata", description: "Extract metadata from text block", schema: z.object({ text: z.string() }) });

export const agentTools = [
  compile_markdown_report, create_markdown_table, verify_checklist, format_citations,
  generate_bullet_points, summarize_key_findings, validate_research_goal, append_to_file,
  create_draft_outline, assess_relevance, compare_texts, find_pattern, extract_metadata
];
