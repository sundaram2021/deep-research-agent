// Durable job state + append-only event log in Postgres, with live fan-out over
// Redis pub/sub. The API writes jobs and reads events (for replay); the worker
// updates status and appends events.

import { and, asc, eq, gt } from "drizzle-orm";
import type Redis from "ioredis";
import { getDb, schema } from "../db/client";
import { createRedisClient } from "../queue/connection";
import type { AgentEvent } from "../research/pipeline";

export function jobChannel(jobId: string): string {
  return `job:${jobId}`;
}

let pub: Redis | null = null;
function publisher(): Redis {
  if (!pub) pub = createRedisClient();
  return pub;
}

export async function createJob(topic: string, bullets: unknown): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(schema.researchJobs).values({ id, topic, bullets, status: "queued" });
  return id;
}

export async function getJob(jobId: string) {
  const rows = await getDb()
    .select()
    .from(schema.researchJobs)
    .where(eq(schema.researchJobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setStatus(jobId: string, status: string): Promise<void> {
  await getDb()
    .update(schema.researchJobs)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.researchJobs.id, jobId));
}

export async function setResult(jobId: string, report: string): Promise<void> {
  await getDb()
    .update(schema.researchJobs)
    .set({ report, status: "complete", updatedAt: new Date() })
    .where(eq(schema.researchJobs.id, jobId));
}

export async function setError(jobId: string, error: string): Promise<void> {
  await getDb()
    .update(schema.researchJobs)
    .set({ error, status: "error", updatedAt: new Date() })
    .where(eq(schema.researchJobs.id, jobId));
}

export interface PersistedEvent extends AgentEvent {
  seq: number;
}

// Subset of the Drizzle select row needed to reconstruct an event.
interface EventRowLike {
  type: string;
  eventId: string | null;
  name: string | null;
  parent: string | null;
  data: unknown;
  ts: number;
  seq: number;
}

// Map an event to its persisted row, preserving the full envelope (id/name/parent)
// so replay is lossless and matches the live publish shape.
export function eventToRow(jobId: string, seq: number, event: AgentEvent) {
  return {
    jobId,
    seq,
    type: event.type,
    eventId: event.id ?? null,
    name: event.name ?? null,
    parent: event.parent ?? null,
    data: event.data ?? null,
    ts: event.ts ?? Date.now(),
  };
}

// Reconstruct an event from a persisted row. Absent envelope fields come back as
// undefined, exactly like the live publish ({ ...event, seq }).
export function rowToEvent(row: EventRowLike): PersistedEvent {
  return {
    type: row.type,
    id: row.eventId ?? undefined,
    name: row.name ?? undefined,
    parent: row.parent ?? undefined,
    data: row.data,
    ts: Number(row.ts),
    seq: row.seq,
  };
}

// Per-job monotonic sequence. A job is processed by exactly one worker run, and
// the read+write below is synchronous (no await between), so concurrent emits
// from parallel subagents still receive distinct, ordered seqs.
const seqByJob = new Map<string, number>();

export async function appendEvent(jobId: string, event: AgentEvent): Promise<void> {
  const seq = (seqByJob.get(jobId) ?? 0) + 1;
  seqByJob.set(jobId, seq);
  await getDb().insert(schema.jobEvents).values(eventToRow(jobId, seq, event));
  await publisher().publish(jobChannel(jobId), JSON.stringify({ ...event, seq }));
}

export async function getEvents(jobId: string, afterSeq = 0) {
  return getDb()
    .select()
    .from(schema.jobEvents)
    .where(and(eq(schema.jobEvents.jobId, jobId), gt(schema.jobEvents.seq, afterSeq)))
    .orderBy(asc(schema.jobEvents.seq));
}
