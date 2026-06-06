// Shared A2A contract for the Collector -> Analyzer leg of synthesis.
//
// The Collector packages the structured subagent findings (plus the plan and
// report format) into a single A2A `Message` and ships it to the Analyzer over
// the A2A protocol. The Analyzer decodes it back into a SynthesisInput, runs the
// synthesis model, and streams the markdown report back as task artifacts.
//
// Keeping the wire shape in one place (a zod schema + encode/decode helpers)
// means both agents agree on the payload, and a malformed message degrades to a
// clear validation result (null) instead of a confusing runtime crash.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Message, MessageSendParams, Part } from "@a2a-js/sdk";
import {
  mainAgentPlanSchema,
  researchAgentOutputSchema,
} from "../schemas/agent-schemas";

export const REPORT_FORMATS = ["brief", "deep"] as const;

// The body the Collector sends to the Analyzer. `plan` + `results` are exactly
// the SynthesisInput the existing synthesis engine consumes; `format` selects
// the deep report vs. the executive brief.
export const a2aSynthesisRequestSchema = z.object({
  kind: z.literal("synthesis-request"),
  format: z.enum(REPORT_FORMATS).default("deep"),
  plan: mainAgentPlanSchema,
  results: z.array(researchAgentOutputSchema),
});

export type A2ASynthesisRequest = z.infer<typeof a2aSynthesisRequestSchema>;

// Artifact name the Analyzer attaches the streamed markdown to. The Collector
// reads chunks from artifacts carrying this name.
export const REPORT_ARTIFACT_NAME = "research-report";

// Pull the concatenated text out of a list of A2A parts (ignoring non-text parts).
function partsToText(parts: Part[] | undefined): string {
  return (parts ?? []).map((p) => (p.kind === "text" ? p.text : "")).join("");
}

// Encode a synthesis request as an A2A user Message with a single text part
// (JSON). Text parts are the most broadly supported A2A part type, so the
// payload survives any transport unchanged.
export function encodeSynthesisRequest(
  request: A2ASynthesisRequest
): MessageSendParams {
  const message: Message = {
    kind: "message",
    messageId: randomUUID(),
    role: "user",
    parts: [{ kind: "text", text: JSON.stringify(request) }],
  };
  return { message };
}

// Pull the JSON payload back out of an incoming A2A Message and validate it.
// Returns null if the message has no usable text part or fails validation, so
// the Analyzer can fail the task cleanly instead of throwing.
export function decodeSynthesisRequest(
  message: Message
): A2ASynthesisRequest | null {
  const text = partsToText(message.parts).trim();
  if (!text) return null;
  try {
    const parsed = a2aSynthesisRequestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export { partsToText };
