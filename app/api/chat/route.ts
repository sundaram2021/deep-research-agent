import { NextRequest } from "next/server";
import { deepResearchAgent } from "@/lib/deep-research-agent";
import { ObservabilityLogger } from "@/lib/utils/observability-logger";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          ObservabilityLogger.info("agent", "deep-research-agent", `Starting run: "${prompt}"`);
          const eventStream = await deepResearchAgent.stream({
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of eventStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          ObservabilityLogger.info("agent", "deep-research-agent", "Finished run successfully");
        } catch (e: any) {
          ObservabilityLogger.error("agent", "deep-research-agent", `Run failed: ${e.message}`, e);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
