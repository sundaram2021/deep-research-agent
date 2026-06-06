// The Analyzer agent, exposed as a real A2A server over loopback HTTP.
//
// It runs in-process (one lazy singleton per process) so the Collector can reach
// it without any external infrastructure, yet the communication is genuine A2A
// protocol traffic: JSON-RPC messages, an Agent Card, a Task lifecycle, and SSE
// streaming. The executor reuses the existing synthesis engine (streamSynthesis)
// on a lighter model tier and streams the markdown report back as task artifacts.

import express from "express";
import {
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import type {
  AgentCard,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import { getModelPair } from "../models";
import { streamSynthesis, type ReportFormat, type SynthesisInput } from "../agents/synthesis";
import { buildAnalyzerCard } from "./analyzer-card";
import { decodeSynthesisRequest, REPORT_ARTIFACT_NAME } from "./types";
import { logger, withSpan } from "../utils/observability-logger";

// The subset of A2A task states the Analyzer emits (all valid TaskStatus states).
type AnalyzerTaskState = "submitted" | "working" | "completed" | "failed" | "canceled";

const HOST = "127.0.0.1";

function analyzerPort(): number {
  return Math.max(1, Number(process.env.A2A_ANALYZER_PORT) || 41241);
}

// A2AExpressApp.setupRoutes mounts the JSON-RPC handler at the router root, so
// the service endpoint is the base URL itself.
export function analyzerBaseUrl(): string {
  return process.env.A2A_ANALYZER_URL || `http://${HOST}:${analyzerPort()}/`;
}

export function analyzerCard(): AgentCard {
  return buildAnalyzerCard(analyzerBaseUrl());
}

// The synthesis step is injectable so tests can drive a full A2A round trip
// without a real model call; production uses the lighter `analyzer` model tier.
export type Synthesizer = (
  input: SynthesisInput,
  format: ReportFormat,
  signal: AbortSignal
) => AsyncIterable<string>;

const defaultSynthesizer: Synthesizer = (input, format, signal) =>
  streamSynthesis(getModelPair().analyzer, input, signal, format);

function statusUpdate(
  taskId: string,
  contextId: string,
  state: AnalyzerTaskState,
  final: boolean
): TaskStatusUpdateEvent {
  return {
    kind: "status-update",
    taskId,
    contextId,
    status: { state, timestamp: new Date().toISOString() },
    final,
  };
}

export class AnalyzerExecutor implements AgentExecutor {
  constructor(private readonly synthesize: Synthesizer = defaultSynthesizer) {}

  public execute = async (
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> => {
    const { taskId, contextId } = requestContext;
    const request = decodeSynthesisRequest(requestContext.userMessage);

    // Always create the task first so the client has something to track.
    const initialTask: Task = {
      kind: "task",
      id: taskId,
      contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [requestContext.userMessage],
    };
    eventBus.publish(initialTask);

    if (!request) {
      logger.warn("a2a.analyzer.bad_request", { taskId });
      eventBus.publish(statusUpdate(taskId, contextId, "failed", true));
      eventBus.finished();
      return;
    }

    const input: SynthesisInput = { plan: request.plan, results: request.results };
    const aborted = new AbortController();

    try {
      await withSpan(
        "a2a.analyzer.execute",
        async () => {
          eventBus.publish(statusUpdate(taskId, contextId, "working", false));
          let index = 0;
          for await (const chunk of this.synthesize(input, request.format, aborted.signal)) {
            if (!chunk) continue;
            const artifactUpdate: TaskArtifactUpdateEvent = {
              kind: "artifact-update",
              taskId,
              contextId,
              artifact: {
                artifactId: REPORT_ARTIFACT_NAME,
                name: REPORT_ARTIFACT_NAME,
                parts: [{ kind: "text", text: chunk }],
              },
              append: index > 0,
              lastChunk: false,
            };
            eventBus.publish(artifactUpdate);
            index++;
          }
          eventBus.publish(statusUpdate(taskId, contextId, "completed", true));
        },
        { taskId, format: request.format, bullets: request.results.length }
      );
    } catch (err) {
      logger.error("a2a.analyzer.failed", {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      eventBus.publish(statusUpdate(taskId, contextId, "failed", true));
    } finally {
      eventBus.finished();
    }
  };

  // Synthesis is short-lived; on cancel just mark the task canceled.
  public cancelTask = async (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    eventBus.publish(statusUpdate(taskId, taskId, "canceled", true));
    eventBus.finished();
  };
}

let serverPromise: Promise<AgentCard> | null = null;

/**
 * Boot (or reuse) the in-process Analyzer A2A server and resolve with its Agent
 * Card. Idempotent: the first call starts an Express server bound to loopback;
 * later calls reuse it. On a listen error the cached promise is cleared so a
 * subsequent run can retry (and the Collector can fall back to direct synthesis).
 */
export function startAnalyzerServer(synthesizer?: Synthesizer): Promise<AgentCard> {
  if (serverPromise) return serverPromise;
  serverPromise = new Promise<AgentCard>((resolve, reject) => {
    try {
      const card = analyzerCard();
      const requestHandler = new DefaultRequestHandler(
        card,
        new InMemoryTaskStore(),
        new AnalyzerExecutor(synthesizer)
      );
      const app = new A2AExpressApp(requestHandler).setupRoutes(express());
      const server = app.listen(analyzerPort(), HOST, () => {
        logger.info("a2a.analyzer.listening", { url: analyzerBaseUrl() });
        resolve(card);
      });
      server.on("error", (err: Error) => {
        logger.error("a2a.analyzer.listen_error", { error: err.message });
        serverPromise = null;
        reject(err);
      });
    } catch (err) {
      serverPromise = null;
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
  return serverPromise;
}
