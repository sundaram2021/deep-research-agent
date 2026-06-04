import { mainAgentPlanSchema } from "@/lib/schemas/agent-schemas";

export function parsePlanFromResponse(text: string) {
  return mainAgentPlanSchema.safeParse(text);
}

export function extractPlanFromText(
  text: string,
  fallbackTopic: string
): { originalTopic: string; bulletPoints: { index: number; title: string; description: string }[]; summary: string } | null {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.bulletPoints) &&
      parsed.bulletPoints.length >= 3
    ) {
      return {
        originalTopic: parsed.originalTopic ?? fallbackTopic,
        summary: parsed.summary ?? "",
        bulletPoints: parsed.bulletPoints.map(
          (b: { index?: number; title?: string; description?: string }, i: number) => ({
            index: b.index ?? i + 1,
            title: b.title ?? `Bullet ${i + 1}`,
            description: b.description ?? "",
          })
        ),
      };
    }
  } catch {
    // not JSON, fall through
  }

  const bullets = extractBulletsFromText(text);
  if (bullets.length >= 3) {
    return {
      originalTopic: fallbackTopic,
      summary: text.slice(0, 200),
      bulletPoints: bullets,
    };
  }

  return null;
}

function extractBulletsFromText(text: string) {
  const lines = text.split("\n");
  const bullets: { index: number; title: string; description: string }[] = [];
  let idx = 1;
  for (const line of lines) {
    const match = line.match(/^\s*(?:\(?\d+\)?[.)]\s*|[-*]\s+)(.+)/);
    if (match) {
      const content = match[1].trim();
      const colonIdx = content.indexOf(":");
      const title = colonIdx > 0 ? content.slice(0, colonIdx).trim() : content.slice(0, 60);
      const description = colonIdx > 0 ? content.slice(colonIdx + 1).trim() : content;
      bullets.push({ index: idx++, title, description });
    }
  }
  return bullets;
}
