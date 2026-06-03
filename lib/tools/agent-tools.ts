import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const compile_markdown_report = tool(async ({ title, sections }) => {
  const parts = [`# ${title}`];
  JSON.parse(sections).forEach((s: any) => { parts.push(`## ${s.heading}\n${s.content}`); });
  return parts.join("\n\n");
}, { name: "compile_markdown_report", description: "Compile sections to report", schema: z.object({ title: z.string(), sections: z.string() }) });

export const create_markdown_table = tool(async ({ headersJson, rowsJson }) => {
  const headers = JSON.parse(headersJson) as string[];
  const rows = JSON.parse(rowsJson) as string[][];
  const sep = headers.map(() => "---").join(" | ");
  const lines = [headers.join(" | "), sep, ...rows.map(r => r.join(" | "))];
  return lines.join("\n");
}, { name: "create_markdown_table", description: "Create markdown table", schema: z.object({ headersJson: z.string(), rowsJson: z.string() }) });

export const verify_checklist = tool(async ({ itemsJson, checkedJson }) => {
  const items = JSON.parse(itemsJson) as string[];
  const checked = new Set(JSON.parse(checkedJson) as string[]);
  return items.map(it => `[${checked.has(it) ? "x" : " "}] ${it}`).join("\n");
}, { name: "verify_checklist", description: "Render status checklist", schema: z.object({ itemsJson: z.string(), checkedJson: z.string() }) });

export const format_citations = tool(async ({ sourcesJson }) => {
  const sources = JSON.parse(sourcesJson) as { title: string; url: string }[];
  return sources.map((s, i) => `[${i + 1}] "${s.title}" - ${s.url}`).join("\n");
}, { name: "format_citations", description: "Format article citations", schema: z.object({ sourcesJson: z.string() }) });

export const generate_bullet_points = tool(async ({ itemsJson }) => {
  const items = JSON.parse(itemsJson) as string[];
  return items.map(it => `* ${it}`).join("\n");
}, { name: "generate_bullet_points", description: "Generate markdown bullets", schema: z.object({ itemsJson: z.string() }) });

export const summarize_key_findings = tool(async ({ findingsJson }) => {
  const findings = JSON.parse(findingsJson) as string[];
  return `KEY FINDINGS:\n` + findings.map((f, i) => `${i + 1}. ${f}`).join("\n");
}, { name: "summarize_key_findings", description: "Summarize findings", schema: z.object({ findingsJson: z.string() }) });

export const validate_research_goal = tool(async ({ goal }) => {
  return goal.length > 10 ? "valid" : "invalid: Goal is too short";
}, { name: "validate_research_goal", description: "Validate research goals", schema: z.object({ goal: z.string() }) });

export const append_to_file = tool(async ({ text, fileContent }) => {
  return `${fileContent}\n${text}`;
}, { name: "append_to_file", description: "Append text block to file content", schema: z.object({ text: z.string(), fileContent: z.string() }) });

export const create_draft_outline = tool(async ({ topic, sectionsJson }) => {
  const sections = JSON.parse(sectionsJson) as string[];
  return `OUTLINE FOR: ${topic}\n` + sections.map((s, i) => `${i + 1}. ${s}`).join("\n");
}, { name: "create_draft_outline", description: "Create outline draft", schema: z.object({ topic: z.string(), sectionsJson: z.string() }) });

export const assess_relevance = tool(async ({ text, keywordsJson }) => {
  const keywords = JSON.parse(keywordsJson) as string[];
  const lowerText = text.toLowerCase();
  const hits = keywords.filter(k => lowerText.includes(k.toLowerCase()));
  return JSON.stringify({ score: hits.length / keywords.length, matched: hits });
}, { name: "assess_relevance", description: "Assess text relevance to keywords", schema: z.object({ text: z.string(), keywordsJson: z.string() }) });

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
