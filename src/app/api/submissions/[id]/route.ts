import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { fail, json, moderatorOf, problem } from "@/lib/http";
import { moderate } from "@/lib/moderation";
import { issuesToFields, moderationSchema } from "@/lib/submissions";

/** Moderators: { "action": "approve" | "reject", "note"?: string } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const moderator = moderatorOf(req);
  if (!moderator) return problem(401, "moderator sign-in required");
  const parsed = moderationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "invalid request", issuesToFields(parsed.error));
  try {
    const { id } = await params;
    const doc = await moderate(getDb(), id, parsed.data.action, moderator, parsed.data.note);
    return json({ ...doc, _id: doc._id.toHexString() });
  } catch (err) {
    return fail(err);
  }
}
