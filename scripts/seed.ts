// Load data/seed.json into PostgreSQL. Idempotent: safe to run on every start.
// Run with Node >= 22.18 / 24 (native TypeScript): node scripts/seed.ts
import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "../src/db/schema.ts";
import { latinKey, searchKey, slugify } from "../src/lib/normalize.ts";

const { entries, examples, regions, spellings, translations } = schema;

type Seed = {
  regions: { slug: string; name: string; description?: string }[];
  entries: {
    latin: string; arabic?: string; pos: schema.PartOfSpeech; fr?: string[]; en?: string[];
    spellings?: string[]; regional?: { text: string; region: string }[];
    examples?: { darija: string; fr?: string; en?: string }[];
  }[];
};

const seed: Seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
});
const db = drizzle(pool, { schema });

const row = (entryId: number, text: string, kind: "headword" | "spelling" | "regional", region: string | null = null) => {
  const arabic = /[؀-ۿ]/.test(text);
  return { entryId, text, kind, region, script: arabic ? ("arabic" as const) : ("latin" as const), key: arabic ? searchKey(text) : latinKey(text) };
};

try {
  await db.transaction(async (tx) => {
    for (const r of seed.regions) {
      await tx.insert(regions).values(r).onConflictDoUpdate({ target: regions.slug, set: { name: r.name, description: r.description } });
    }
    for (const e of seed.entries) {
      const [{ id }] = await tx.insert(entries)
        .values({ slug: slugify(e.latin), latin: e.latin, arabic: e.arabic ?? null, pos: e.pos })
        .onConflictDoUpdate({ target: entries.slug, set: { updatedAt: sql`${entries.updatedAt}` } })
        .returning({ id: entries.id });
      const rows = [row(id, e.latin, "headword")];
      if (e.arabic) rows.push(row(id, e.arabic, "headword"));
      for (const s of e.spellings ?? []) rows.push(row(id, s, "spelling"));
      // A regional word can be used in several regions; one row per (text) keeps the first region.
      for (const r of e.regional ?? []) rows.push(row(id, r.text, "regional", r.region));
      await tx.insert(spellings).values(rows).onConflictDoNothing();
      const meanings = [
        ...(e.fr ?? []).map((text, position) => ({ entryId: id, lang: "fr" as const, text, position })),
        ...(e.en ?? []).map((text, position) => ({ entryId: id, lang: "en" as const, text, position })),
      ];
      if (meanings.length) await tx.insert(translations).values(meanings).onConflictDoNothing();
      for (const ex of e.examples ?? []) {
        await tx.insert(examples).values({ entryId: id, darija: ex.darija, fr: ex.fr ?? null, en: ex.en ?? null }).onConflictDoNothing();
      }
    }
  });
  console.log(`seeded ${seed.entries.length} entries`);
} finally {
  await pool.end();
}
