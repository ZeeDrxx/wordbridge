-- Trigram matching for fuzzy search (on Azure: allow-list pg_trgm in the azure.extensions server parameter)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('fr', 'en', 'ar');--> statement-breakpoint
CREATE TYPE "public"."part_of_speech" AS ENUM('noun', 'verb', 'adjective', 'adverb', 'pronoun', 'interjection', 'preposition', 'conjunction', 'phrase');--> statement-breakpoint
CREATE TYPE "public"."script" AS ENUM('latin', 'arabic');--> statement-breakpoint
CREATE TYPE "public"."spelling_kind" AS ENUM('headword', 'spelling', 'regional');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"latin" text NOT NULL,
	"arabic" text,
	"pos" "part_of_speech" NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "examples" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"darija" text NOT NULL,
	"fr" text,
	"en" text,
	"submission_id" varchar(24)
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"slug" varchar(40) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "spellings" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"text" text NOT NULL,
	"key" text NOT NULL,
	"script" "script" NOT NULL,
	"kind" "spelling_kind" NOT NULL,
	"region" varchar(40)
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"lang" "language" NOT NULL,
	"text" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellings" ADD CONSTRAINT "spellings_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellings" ADD CONSTRAINT "spellings_region_regions_slug_fk" FOREIGN KEY ("region") REFERENCES "public"."regions"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_slug_key" ON "entries" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "examples_entry_darija_key" ON "examples" USING btree ("entry_id","darija");--> statement-breakpoint
CREATE UNIQUE INDEX "spellings_entry_text_key" ON "spellings" USING btree ("entry_id","text");--> statement-breakpoint
CREATE INDEX "spellings_key_trgm" ON "spellings" USING gin ("key" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "translations_entry_lang_text_key" ON "translations" USING btree ("entry_id","lang","text");--> statement-breakpoint
CREATE INDEX "translations_text_trgm" ON "translations" USING gin (lower("text") gin_trgm_ops);