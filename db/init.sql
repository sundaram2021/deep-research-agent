-- Schema for the durable research job system (Phase 3).
-- Loaded automatically by the postgres container on first boot
-- (mounted into /docker-entrypoint-initdb.d). Kept in sync with lib/db/schema.ts.

CREATE TABLE IF NOT EXISTS research_jobs (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | running | complete | error
  bullets     JSONB NOT NULL,
  report      TEXT,
  error       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- Append-only event log: lets a client replay everything that happened before it
-- connected (or reconnected), then follow live updates via Redis pub/sub.
CREATE TABLE IF NOT EXISTS job_events (
  id      SERIAL PRIMARY KEY,
  job_id  TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  type    TEXT NOT NULL,
  data    JSONB,
  ts      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS job_events_job_id_seq_idx ON job_events (job_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS job_events_job_id_seq_uniq ON job_events (job_id, seq);
