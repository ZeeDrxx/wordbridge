/**
 * Community submissions live in MongoDB.
 *
 * Why a second database: a submission is a free-form proposal whose shape depends on its type
 * (a new word, a new spelling, an example, a correction note), and it carries an append-only
 * moderation history. That is one self-contained document per submission, read and written
 * whole, with no joins: a natural fit for a document store. It also keeps unreviewed,
 * user-supplied content out of the curated relational dictionary until a moderator approves it.
 */
import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";

import type { SubmissionPayload } from "@/lib/submissions";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface ModerationEvent {
  at: Date;
  action: "submitted" | "approved" | "rejected" | "applied" | "apply_failed";
  by: string; // "public" or a moderator name
  note?: string;
}

export interface SubmissionDoc {
  _id?: ObjectId;
  payload: SubmissionPayload;
  status: SubmissionStatus;
  submitterName?: string;
  createdAt: Date;
  updatedAt: Date;
  history: ModerationEvent[];
  appliedEntryId?: number; // Postgres entry the submission created or changed
}

const globalForMongo = globalThis as unknown as { mongo?: MongoClient; mongoReady?: Promise<Db> };

export function getMongoDb(): Promise<Db> {
  if (!globalForMongo.mongoReady) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    const client = new MongoClient(uri, { maxPoolSize: 10, retryWrites: false }); // Cosmos DB RU accounts reject retryable writes
    globalForMongo.mongo = client;
    globalForMongo.mongoReady = client.connect().then(async () => {
      const db = client.db(process.env.MONGODB_DB ?? "wordbridge");
      await db.collection("submissions").createIndexes([
        { key: { status: 1, createdAt: -1 }, name: "status_created" },
        { key: { "payload.entrySlug": 1 }, name: "entry_slug" },
      ]);
      return db;
    });
  }
  return globalForMongo.mongoReady;
}

export async function submissions(): Promise<Collection<SubmissionDoc>> {
  return (await getMongoDb()).collection<SubmissionDoc>("submissions");
}

export async function closeMongo(): Promise<void> {
  await globalForMongo.mongo?.close();
  globalForMongo.mongo = undefined;
  globalForMongo.mongoReady = undefined;
}
