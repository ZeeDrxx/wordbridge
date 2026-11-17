/**
 * Submissions flow: public form → MongoDB (pending) → moderator approves → applied to PostgreSQL.
 *
 * Approval writes to two databases, so the order matters:
 *   1. apply the change to PostgreSQL inside a transaction (all or nothing);
 *   2. only then mark the MongoDB document approved and append to its history.
 * If step 1 fails, the submission stays pending with an `apply_failed` event explaining why.
 * If step 2 fails after step 1 committed, approving again is safe: every insert in `apply`
 * is idempotent (unique constraints + ON CONFLICT DO NOTHING).
 */
import { eq, sql } from "drizzle-orm";
import { ObjectId, type WithId } from "mongodb";

import type { DB } from "@/db/client";
import { submissions, type ModerationEvent, type SubmissionDoc, type SubmissionStatus } from "@/db/mongo";
import { entries, examples, spellings, translations } from "@/db/schema";

import { entryIdBySlug, spellingRow } from "./dictionary";
import { slugify } from "./normalize";
import type { SubmissionPayload, SubmissionRequest } from "./submissions";

export class ModerationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function createSubmission(req: SubmissionRequest, now = new Date()): Promise<string> {
  const col = await submissions();
  const doc: SubmissionDoc = {
    payload: req.payload,
    status: "pending",
    submitterName: req.submitterName,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, action: "submitted", by: "public" }],
  };
  const { insertedId } = await col.insertOne(doc);
  return insertedId.toHexString();
}

export async function listSubmissions(status: SubmissionStatus, limit = 50): Promise<WithId<SubmissionDoc>[]> {
  const col = await submissions();
  return col.find({ status }).sort({ createdAt: status === "pending" ? 1 : -1 }).limit(limit).toArray();
}

/** Apply an approved payload to the dictionary. Returns the entry it created or changed. */
export async function apply(db: DB, payload: SubmissionPayload, submissionId?: string): Promise<number> {
  return db.transaction(async (tx) => {
    const touch = (id: number) => tx.update(entries).set({ updatedAt: sql`now()` }).where(eq(entries.id, id));
    const existing = async (slug: string) => {
      const id = await entryIdBySlug(tx as unknown as DB, slug);
      if (id === null) throw new ModerationError(`entry "${slug}" no longer exists`, 422);
      return id;
    };

    switch (payload.type) {
      case "new_entry": {
        const slug = slugify(payload.latin);
        const [created] = await tx.insert(entries)
          .values({ slug, latin: payload.latin, arabic: payload.arabic ?? null, pos: payload.pos })
          .onConflictDoNothing({ target: entries.slug })
          .returning({ id: entries.id });
        // If the word already exists, only add what is missing; curated data is never overwritten.
        const id = created?.id ?? (await existing(slug));
        const rows = [spellingRow(id, payload.latin, "headword")];
        if (payload.arabic) rows.push(spellingRow(id, payload.arabic, "headword"));
        await tx.insert(spellings).values(rows).onConflictDoNothing();
        const meanings = [
          payload.fr && { entryId: id, lang: "fr" as const, text: payload.fr },
          payload.en && { entryId: id, lang: "en" as const, text: payload.en },
        ].filter((m): m is { entryId: number; lang: "fr" | "en"; text: string } => Boolean(m));
        if (meanings.length) await tx.insert(translations).values(meanings).onConflictDoNothing();
        if (payload.exampleDarija) {
          await tx.insert(examples).values({
            entryId: id, darija: payload.exampleDarija, fr: payload.exampleFr ?? null,
            en: payload.exampleEn ?? null, submissionId: submissionId ?? null,
          }).onConflictDoNothing();
        }
        return id;
      }
      case "new_spelling": {
        const id = await existing(payload.entrySlug);
        const region = payload.region && payload.region !== "general" ? payload.region : null;
        await tx.insert(spellings)
          .values(spellingRow(id, payload.text, payload.regionalWord ? "regional" : "spelling", region))
          .onConflictDoNothing();
        await touch(id);
        return id;
      }
      case "new_example": {
        const id = await existing(payload.entrySlug);
        await tx.insert(examples).values({
          entryId: id, darija: payload.darija, fr: payload.fr ?? null, en: payload.en ?? null,
          submissionId: submissionId ?? null,
        }).onConflictDoNothing();
        await touch(id);
        return id;
      }
      case "correction":
        // A correction is a note for the moderator, who edits the entry by hand; approving marks it handled.
        return existing(payload.entrySlug);
    }
  });
}

export async function moderate(
  db: DB, id: string, action: "approve" | "reject", moderator: string, note?: string, now = new Date(),
): Promise<WithId<SubmissionDoc>> {
  if (!ObjectId.isValid(id)) throw new ModerationError("unknown submission", 404);
  const _id = new ObjectId(id);
  const col = await submissions();
  const doc = await col.findOne({ _id });
  if (!doc) throw new ModerationError("unknown submission", 404);
  if (doc.status !== "pending") throw new ModerationError(`submission is already ${doc.status}`, 409);

  const events: ModerationEvent[] = [];
  let appliedEntryId: number | undefined;
  if (action === "approve") {
    try {
      appliedEntryId = await apply(db, doc.payload, id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await col.updateOne({ _id }, {
        $push: { history: { at: now, action: "apply_failed", by: moderator, note: reason } },
        $set: { updatedAt: now },
      });
      throw err instanceof ModerationError ? err : new ModerationError(`could not apply: ${reason}`, 422);
    }
    events.push({ at: now, action: "approved", by: moderator, note }, { at: now, action: "applied", by: "system" });
  } else {
    events.push({ at: now, action: "rejected", by: moderator, note });
  }

  const updated = await col.findOneAndUpdate(
    { _id, status: "pending" },
    {
      $set: { status: action === "approve" ? "approved" : "rejected", updatedAt: now, ...(appliedEntryId ? { appliedEntryId } : {}) },
      $push: { history: { $each: events } },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new ModerationError("submission was moderated by someone else meanwhile", 409);
  return updated;
}
