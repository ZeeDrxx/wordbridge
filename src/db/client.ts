import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

// One pool per server process (Next.js dev hot-reload would otherwise open a new pool per edit).
const globalForDb = globalThis as unknown as { pgPool?: Pool; db?: DB };

export function getDb(): DB {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.pgPool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
    });
    globalForDb.db = drizzle(globalForDb.pgPool, { schema });
  }
  return globalForDb.db;
}

export async function closeDb(): Promise<void> {
  await globalForDb.pgPool?.end();
  globalForDb.pgPool = undefined;
  globalForDb.db = undefined;
}
