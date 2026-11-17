/**
 * The dictionary itself lives in PostgreSQL: entries, how they are spelled, what they mean,
 * and how they are used. These are relational facts with real constraints (an example belongs to
 * exactly one entry; a spelling is unique per entry), so they get a relational schema.
 *
 * Community submissions and their moderation history live in MongoDB instead (see src/db/mongo.ts).
 */
import { sql } from "drizzle-orm";
import {
  boolean, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar,
} from "drizzle-orm/pg-core";

export const partOfSpeech = pgEnum("part_of_speech", [
  "noun", "verb", "adjective", "adverb", "pronoun", "interjection", "preposition", "conjunction", "phrase",
]);
export const script = pgEnum("script", ["latin", "arabic"]);
export const spellingKind = pgEnum("spelling_kind", ["headword", "spelling", "regional"]);
export const language = pgEnum("language", ["fr", "en", "ar"]);

export const regions = pgTable("regions", {
  slug: varchar("slug", { length: 40 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const entries = pgTable(
  "entries",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    latin: text("latin").notNull(), // headword in Latin script ("Arabizi"), e.g. bzzaf
    arabic: text("arabic"), // headword in Arabic script, e.g. بزاف
    pos: partOfSpeech("pos").notNull(),
    published: boolean("published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entries_slug_key").on(t.slug)],
);

/**
 * Every way an entry is written: the headword itself (both scripts), alternative spellings
 * (bezzaf, bzaf) and regional words (yaser in the Oriental). `key` is the search-normalised form
 * (see src/lib/normalize.ts) and carries a trigram index for fuzzy matching.
 */
export const spellings = pgTable(
  "spellings",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    key: text("key").notNull(),
    script: script("script").notNull(),
    kind: spellingKind("kind").notNull(),
    region: varchar("region", { length: 40 }).references(() => regions.slug),
  },
  (t) => [
    uniqueIndex("spellings_entry_text_key").on(t.entryId, t.text),
    index("spellings_key_trgm").using("gin", sql`${t.key} gin_trgm_ops`),
  ],
);

export const translations = pgTable(
  "translations",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
    lang: language("lang").notNull(),
    text: text("text").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("translations_entry_lang_text_key").on(t.entryId, t.lang, t.text),
    index("translations_text_trgm").using("gin", sql`lower(${t.text}) gin_trgm_ops`),
  ],
);

export const examples = pgTable(
  "examples",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
    darija: text("darija").notNull(),
    fr: text("fr"),
    en: text("en"),
    submissionId: varchar("submission_id", { length: 24 }), // MongoDB ObjectId it came from, if any
  },
  (t) => [uniqueIndex("examples_entry_darija_key").on(t.entryId, t.darija)],
);

export type Entry = typeof entries.$inferSelect;
export type Spelling = typeof spellings.$inferSelect;
export type Translation = typeof translations.$inferSelect;
export type Example = typeof examples.$inferSelect;
export type PartOfSpeech = (typeof partOfSpeech.enumValues)[number];
