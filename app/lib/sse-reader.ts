import type { AgentEvent } from "./event-types";

export async function processSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: AgentEvent) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;

      try {
        const ev = JSON.parse(line.slice(6)) as AgentEvent;
        onEvent(ev);
      } catch {
        // skip unparseable lines
      }
    }
  }
}
