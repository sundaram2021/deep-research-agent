// Lazy Drizzle (node-postgres) client. Importing this module never throws when
// DATABASE_URL is unset; the connection is created on first getDb() call, so the
// synchronous plan phase and DB-less environments are unaffected.

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "";

let db: NodePgDatabase<typeof schema> | null = null;

export function isDbConfigured(): boolean {
  return connectionString.length > 0;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; the durable job store requires Postgres.");
  }
  if (!db) db = drizzle(connectionString, { schema });
  return db;
}

export { schema };
