import { z } from "zod";

import { isArabicScript } from "./normalize";

const POS = ["noun", "verb", "adjective", "adverb", "pronoun", "interjection", "preposition", "conjunction", "phrase"] as const;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const latinWord = shortText(60).refine((v) => !isArabicScript(v), "use Latin letters (Arabizi), e.g. bzzaf");
const arabicWord = z
  .string().trim().max(60).optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isArabicScript(v), "use Arabic script, e.g. بزاف");
const entrySlug = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "invalid entry");

export const newEntrySchema = z
  .object({
    type: z.literal("new_entry"),
    latin: latinWord,
    arabic: arabicWord,
    pos: z.enum(POS),
    fr: optionalText(200),
    en: optionalText(200),
    exampleDarija: optionalText(300),
    exampleFr: optionalText(300),
    exampleEn: optionalText(300),
  })
  .refine((v) => v.fr || v.en, { message: "give at least a French or an English meaning", path: ["fr"] });

export const newSpellingSchema = z.object({
  type: z.literal("new_spelling"),
  entrySlug,
  text: shortText(60),
  region: z.enum(["general", "north", "oriental", "south", "centre"]).optional(),
  regionalWord: z.boolean().default(false), // a different word used in a region, not just a spelling
});

export const newExampleSchema = z
  .object({
    type: z.literal("new_example"),
    entrySlug,
    darija: shortText(300),
    fr: optionalText(300),
    en: optionalText(300),
  })
  .refine((v) => v.fr || v.en, { message: "translate the example into French or English", path: ["fr"] });

export const correctionSchema = z.object({
  type: z.literal("correction"),
  entrySlug,
  message: shortText(1000),
});

export const submissionPayloadSchema = z.discriminatedUnion("type", [
  newEntrySchema, newSpellingSchema, newExampleSchema, correctionSchema,
]);

export const submissionRequestSchema = z.object({
  payload: submissionPayloadSchema,
  submitterName: optionalText(60),
  website: z.string().max(0).optional(), // honeypot: humans never see this field
});

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

export const moderationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: optionalText(500),
});

/** Flatten zod issues to { "payload.fr": "message" } for forms and API errors. */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export function describe(p: SubmissionPayload): string {
  switch (p.type) {
    case "new_entry":
      return `New word: ${p.latin}${p.arabic ? ` (${p.arabic})` : ""} = ${[p.fr, p.en].filter(Boolean).join(" / ")}`;
    case "new_spelling":
      return `${p.regionalWord ? "Regional word" : "Spelling"} "${p.text}" for ${p.entrySlug}${p.region ? ` (${p.region})` : ""}`;
    case "new_example":
      return `Example for ${p.entrySlug}: ${p.darija}`;
    case "correction":
      return `Correction for ${p.entrySlug}: ${p.message}`;
  }
}
