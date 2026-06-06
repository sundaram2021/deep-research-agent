// Helpers to pull plain text out of LangChain stream chunks / tool outputs.
// Kept in lib/ so the pipeline never has to import from app/.

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

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
