import { and, asc, eq, sql } from "drizzle-orm";

import type { DB } from "@/db/client";
import { entries, examples, regions, spellings, translations, type Entry } from "@/db/schema";

import { latinKey, searchKey } from "./normalize";

export type SearchHit = {
  slug: string;
  latin: string;
  arabic: string | null;
  pos: string;
  matched: string; // the spelling or translation that matched
  score: number;
  fr: string | null;
  en: string | null;
};

/**
 * Search Darija spellings (both scripts, fuzzy) and French/English meanings at once.
 * Exact key matches score 1, prefix matches 0.9, otherwise trigram similarity.
 */
export async function search(db: DB, query: string, limit = 20): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];
  const key = searchKey(q);
  const lower = q.toLowerCase();

  const rows = await db.execute<SearchHit>(sql`
    WITH matches AS (
      SELECT s.entry_id, s.text AS matched,
             CASE WHEN s.key = ${key} THEN 1.0
                  WHEN ${key} <> '' AND s.key LIKE ${key} || '%' THEN 0.9
                  ELSE similarity(s.key, ${key}) END AS score
      FROM ${spellings} s
      WHERE ${key} <> '' AND (s.key = ${key} OR s.key LIKE ${key} || '%' OR s.key % ${key})
      UNION ALL
      SELECT t.entry_id, t.text AS matched,
             CASE WHEN lower(t.text) = ${lower} THEN 0.95
                  WHEN lower(t.text) LIKE ${lower} || '%' THEN 0.85
                  ELSE similarity(lower(t.text), ${lower}) * 0.9 END AS score
      FROM ${translations} t
      WHERE t.lang IN ('fr', 'en') AND (lower(t.text) LIKE '%' || ${lower} || '%' OR lower(t.text) % ${lower})
    ),
    best AS (
      SELECT DISTINCT ON (entry_id) entry_id, matched, score
      FROM matches ORDER BY entry_id, score DESC
    )
    SELECT e.slug, e.latin, e.arabic, e.pos::text AS pos, b.matched, round(b.score::numeric, 3)::float AS score,
           (SELECT text FROM ${translations} WHERE entry_id = e.id AND lang = 'fr' ORDER BY position LIMIT 1) AS fr,
           (SELECT text FROM ${translations} WHERE entry_id = e.id AND lang = 'en' ORDER BY position LIMIT 1) AS en
    FROM best b JOIN ${entries} e ON e.id = b.entry_id
    WHERE e.published
    ORDER BY b.score DESC, e.latin
    LIMIT ${limit}
  `);
  return rows.rows;
}

export interface EntryDetail extends Entry {
  spellings: { text: string; script: string; kind: string; region: string | null; regionName: string | null }[];
  translations: { lang: string; text: string }[];
  examples: { darija: string; fr: string | null; en: string | null }[];
}

export async function getEntry(db: DB, slug: string): Promise<EntryDetail | null> {
  const [entry] = await db.select().from(entries).where(and(eq(entries.slug, slug), eq(entries.published, true)));
  if (!entry) return null;
  const [sp, tr, ex] = await Promise.all([
    db.select({
      text: spellings.text, script: spellings.script, kind: spellings.kind,
      region: spellings.region, regionName: regions.name,
    }).from(spellings).leftJoin(regions, eq(regions.slug, spellings.region))
      .where(eq(spellings.entryId, entry.id)).orderBy(asc(spellings.kind), asc(spellings.id)),
    db.select({ lang: translations.lang, text: translations.text }).from(translations)
      .where(eq(translations.entryId, entry.id)).orderBy(asc(translations.lang), asc(translations.position)),
    db.select({ darija: examples.darija, fr: examples.fr, en: examples.en }).from(examples)
      .where(eq(examples.entryId, entry.id)).orderBy(asc(examples.id)),
  ]);
  return { ...entry, spellings: sp, translations: tr, examples: ex };
}

export async function entryIdBySlug(db: DB, slug: string): Promise<number | null> {
  const [row] = await db.select({ id: entries.id }).from(entries).where(eq(entries.slug, slug));
  return row?.id ?? null;
}

export async function stats(db: DB) {
  const [row] = (await db.execute<{ entries: number; spellings: number; examples: number }>(sql`
    SELECT (SELECT count(*) FROM ${entries} WHERE published)::int AS entries,
           (SELECT count(*) FROM ${spellings})::int AS spellings,
           (SELECT count(*) FROM ${examples})::int AS examples`)).rows;
  return row;
}

export async function randomEntries(db: DB, n = 8) {
  return db.select({ slug: entries.slug, latin: entries.latin, arabic: entries.arabic })
    .from(entries).where(eq(entries.published, true)).orderBy(sql`random()`).limit(n);
}

/** Spelling rows for a headword or variant, ready to insert. */
export function spellingRow(entryId: number, text: string, kind: "headword" | "spelling" | "regional", region?: string | null) {
  const arabic = /[؀-ۿ]/.test(text);
  return {
    entryId, text, kind, region: region ?? null,
    script: arabic ? ("arabic" as const) : ("latin" as const),
    key: arabic ? searchKey(text) : latinKey(text),
  };
}
