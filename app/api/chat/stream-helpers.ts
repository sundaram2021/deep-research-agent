export function extractText(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const o = obj as { content?: unknown; text?: unknown };
  if (typeof o.content === "string") return o.content;
  if (typeof o.text === "string") return o.text;
  if (Array.isArray(o.content)) {
    return o.content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : ""
      )
      .join("");
  }
  return "";
}

export interface ExtractedToolCall {
  id: string;
  name: string;
  args: unknown;
}

export function extractToolCalls(obj: unknown): ExtractedToolCall[] {
  if (!obj || typeof obj !== "object") return [];
  const calls = (obj as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.map((c) => {
    const tc = c as { id?: string; name?: string; args?: unknown };
    return { id: tc.id ?? "", name: tc.name ?? "", args: tc.args ?? {} };
  });
}

export function extractToolContent(obj: unknown): string {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object") {
    const o = obj as { content?: unknown };
    if (typeof o.content === "string") return o.content;
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }
  return String(obj);
}
