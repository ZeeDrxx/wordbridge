import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { getMongoDb } from "@/db/mongo";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await Promise.allSettled([
    getDb().execute(sql`select 1`),
    getMongoDb().then((db) => db.command({ ping: 1 })),
  ]);
  const [postgres, mongodb] = checks.map((c) => (c.status === "fulfilled" ? "ok" : "down"));
  const ok = postgres === "ok" && mongodb === "ok";
  return json({ status: ok ? "ok" : "degraded", postgres, mongodb }, ok ? 200 : 503);
}
