// Drizzle schema for the durable research job system. Kept in sync with
// db/init.sql (which creates these tables in the Docker postgres on first boot).

import { pgTable, text, integer, serial, jsonb, bigint, timestamp } from "drizzle-orm/pg-core";

export const researchJobs = pgTable("research_jobs", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  status: text("status").notNull().default("queued"), // queued | running | complete | error
  bullets: jsonb("bullets").notNull(),
  report: text("report"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const jobEvents = pgTable("job_events", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  data: jsonb("data"),
  ts: bigint("ts", { mode: "number" }).notNull(),
});

export type ResearchJobRow = typeof researchJobs.$inferSelect;
export type JobEventRow = typeof jobEvents.$inferSelect;
