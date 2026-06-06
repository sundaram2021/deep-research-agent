// Lightweight, dependency-free structured logger for operational observability.
// Emits one JSON object per line (ts, level, event, + fields) so logs are
// machine-parseable in any aggregator. Honors LOG_LEVEL (debug|info|warn|error;
// default "info") and LOG_PRETTY=1 for human-readable output in local dev.
//
// This is intentionally dependency-free (no pino/winston/OTel) so it adds zero
// install weight; the structured shape makes it trivial to forward to a real
// sink later. It complements the durable per-job event log (lib/jobs/job-store)
// which is the user-facing trace; this is the ops/server-side trace.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

export type Fields = Record<string, unknown>;

// Keep log records small and always serializable: drop functions, cap long
// strings, and reduce Errors to {name,message} so a logger call can never throw.
function sanitize(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "function") continue;
    if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else if (typeof v === "string" && v.length > 500) out[k] = `${v.slice(0, 500)}…`;
    else out[k] = v;
  }
  return out;
}

function safeStringify(record: Fields): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({ ts: record.ts, level: record.level, event: record.event, note: "unserializable fields" });
  }
}

function formatPretty(record: Fields): string {
  const rest = Object.entries(record).filter(([k]) => !["ts", "level", "event"].includes(k));
  return rest.length ? " " + rest.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ") : "";
}

function emit(level: LogLevel, event: string, fields: Fields = {}): void {
  if (LEVELS[level] < threshold()) return;
  const ts = new Date().toISOString();
  const record: Fields = { ts, level, event, ...sanitize(fields) };
  const line =
    process.env.LOG_PRETTY === "1"
      ? `${ts} ${level.toUpperCase().padEnd(5)} ${event}${formatPretty(record)}`
      : safeStringify(record);
  // warn/error to stderr, everything else to stdout — standard 12-factor split.
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};

/**
 * Time an async operation: logs `<event>.end` with durationMs on success, or
 * `<event>.error` with durationMs + error if it throws (then rethrows, so
 * control flow is unchanged). A cheap way to get span-style timing in logs.
 */
export async function withSpan<T>(event: string, fn: () => Promise<T>, fields: Fields = {}): Promise<T> {
  const started = Date.now();
  logger.debug(`${event}.start`, fields);
  try {
    const result = await fn();
    logger.info(`${event}.end`, { ...fields, durationMs: Date.now() - started });
    return result;
  } catch (err) {
    logger.error(`${event}.error`, { ...fields, durationMs: Date.now() - started, error: err instanceof Error ? err : String(err) });
    throw err;
  }
}
