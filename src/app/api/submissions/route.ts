import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { entryIdBySlug } from "@/lib/dictionary";
import { clientIp, fail, json, moderatorOf, problem, rateLimited } from "@/lib/http";
import { createSubmission, listSubmissions } from "@/lib/moderation";
import { issuesToFields, submissionRequestSchema } from "@/lib/submissions";

/** Public: propose a word, spelling, example or correction. */
export async function POST(req: NextRequest) {
  if (rateLimited(`submit:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return problem(429, "too many submissions from this address, try again later");
  }
  const body = await req.json().catch(() => null);
  const parsed = submissionRequestSchema.safeParse(body);
  if (!parsed.success) return problem(400, "invalid submission", issuesToFields(parsed.error));
  if (parsed.data.website) return json({ id: null }, 202); // honeypot filled: quietly drop

  try {
    const p = parsed.data.payload;
    if (p.type !== "new_entry" && (await entryIdBySlug(getDb(), p.entrySlug)) === null) {
      return problem(400, "invalid submission", { "payload.entrySlug": "no such entry" });
    }
    const id = await createSubmission(parsed.data);
    return json({ id, status: "pending" }, 201);
  } catch (err) {
    return fail(err);
  }
}

/** Moderators: list submissions by status (default pending). */
export async function GET(req: NextRequest) {
  if (!moderatorOf(req)) return problem(401, "moderator sign-in required");
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  if (!["pending", "approved", "rejected"].includes(status)) return problem(400, "invalid status");
  try {
    const docs = await listSubmissions(status as "pending" | "approved" | "rejected");
    return json(docs.map((d) => ({ ...d, _id: d._id.toHexString() })));
  } catch (err) {
    return fail(err);
  }
}
