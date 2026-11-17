/**
 * Against real PostgreSQL + MongoDB (docker compose up postgres mongo, or the CI services).
 * Skipped when DATABASE_URL / MONGODB_URI are not set. Expects migrations and seed to have run.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { closeMongo, submissions } from "@/db/mongo";
import { entries } from "@/db/schema";
import { getEntry, search } from "@/lib/dictionary";
import { createSubmission, moderate, ModerationError } from "@/lib/moderation";
import { submissionRequestSchema } from "@/lib/submissions";

const enabled = Boolean(process.env.DATABASE_URL && process.env.MONGODB_URI);
const run = Date.now().toString(36);

describe.skipIf(!enabled)("search", () => {
  afterAll(async () => closeDb());

  it("finds a word from any spelling, either script, or its meaning", async () => {
    const db = getDb();
    for (const q of ["bzzaf", "bezzaf", "BZAF", "بزاف", "بزّاف", "beaucoup", "a lot"]) {
      const [top] = await search(db, q);
      expect(top?.slug, q).toBe("bzzaf");
    }
  });

  it("is fuzzy for near misses and finds regional words", async () => {
    const db = getDb();
    expect((await search(db, "kifesh"))[0]?.slug).toBe("kifach");
    expect((await search(db, "yaser"))[0]).toMatchObject({ slug: "bzzaf", matched: "yaser" });
  });

  it("returns nothing for empty or junk queries", async () => {
    expect(await search(getDb(), "   ")).toEqual([]);
    expect(await search(getDb(), "!!!")).toEqual([]);
  });

  it("loads a full entry", async () => {
    const e = await getEntry(getDb(), "daba");
    expect(e?.arabic).toBe("دابا");
    expect(e?.spellings.find((s) => s.kind === "regional")).toMatchObject({ text: "druk", regionName: "Oriental" });
    expect(e?.examples[0].en).toBe("I'm coming now.");
  });
});

describe.skipIf(!enabled)("submission → moderation → dictionary", () => {
  const word = `tstword${run}`;
  const req = (payload: unknown) => submissionRequestSchema.parse({ payload });

  beforeAll(async () => {
    process.env.MONGODB_DB = "wordbridge_test";
  });

  afterAll(async () => {
    await getDb().delete(entries).where(like(entries.slug, `tstword${run}%`));
    await (await submissions()).deleteMany({});
    await closeMongo();
    await closeDb();
  });

  it("approving a new word creates it, with history in MongoDB", async () => {
    const id = await createSubmission(req({ type: "new_entry", latin: word, arabic: "تجربة", pos: "noun", fr: "essai", en: "trial", exampleDarija: `${word} mzyan`, exampleEn: "a good trial" }));
    expect(await search(getDb(), word)).toEqual([]); // nothing public before approval

    const doc = await moderate(getDb(), id, "approve", "amina", "looks right");
    expect(doc.status).toBe("approved");
    expect(doc.history.map((h) => h.action)).toEqual(["submitted", "approved", "applied"]);
    expect(doc.appliedEntryId).toBeTypeOf("number");

    const entry = await getEntry(getDb(), word);
    expect(entry?.translations.map((t) => t.text).sort()).toEqual(["essai", "trial"]);
    expect(entry?.examples).toHaveLength(1);
    expect((await search(getDb(), "تجربة"))[0]?.slug).toBe(word);
  });

  it("adds a regional word to an existing entry and cannot be moderated twice", async () => {
    const id = await createSubmission(req({ type: "new_spelling", entrySlug: word, text: `${word}x`, region: "north", regionalWord: true }));
    await moderate(getDb(), id, "approve", "youssef");
    const entry = await getEntry(getDb(), word);
    expect(entry?.spellings.find((s) => s.kind === "regional")).toMatchObject({ region: "north" });
    await expect(moderate(getDb(), id, "reject", "amina")).rejects.toMatchObject({ status: 409 });
  });

  it("rejecting changes nothing in PostgreSQL", async () => {
    const id = await createSubmission(req({ type: "new_example", entrySlug: word, darija: "spam spam", en: "spam" }));
    const doc = await moderate(getDb(), id, "reject", "amina", "not Darija");
    expect(doc.history.at(-1)).toMatchObject({ action: "rejected", note: "not Darija" });
    expect((await getEntry(getDb(), word))?.examples).toHaveLength(1);
  });

  it("a failed apply keeps the submission pending and records why", async () => {
    const id = await createSubmission(req({ type: "new_example", entrySlug: `${word}-gone`, darija: "x", en: "x" }));
    await expect(moderate(getDb(), id, "approve", "amina")).rejects.toBeInstanceOf(ModerationError);
    const doc = await (await submissions()).findOne({ status: "pending", "payload.entrySlug": `${word}-gone` });
    expect(doc?.history.at(-1)).toMatchObject({ action: "apply_failed" });
  });

  it("unknown ids are 404", async () => {
    await expect(moderate(getDb(), "not-an-id", "approve", "a")).rejects.toMatchObject({ status: 404 });
    await expect(moderate(getDb(), "65f000000000000000000000", "approve", "a")).rejects.toMatchObject({ status: 404 });
  });

  it("entries are unique by slug: re-submitting a word only fills gaps", async () => {
    const id = await createSubmission(req({ type: "new_entry", latin: word, pos: "verb", en: "another meaning" }));
    await moderate(getDb(), id, "approve", "amina");
    const rows = await getDb().select().from(entries).where(eq(entries.slug, word));
    expect(rows).toHaveLength(1);
    expect(rows[0].pos).toBe("noun"); // curated data is not overwritten
    expect((await getEntry(getDb(), word))?.translations.map((t) => t.text)).toContain("another meaning");
  });
});
