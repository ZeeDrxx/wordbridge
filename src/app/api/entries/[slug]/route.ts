import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { getEntry } from "@/lib/dictionary";
import { fail, json, problem } from "@/lib/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const entry = await getEntry(getDb(), slug);
    return entry ? json(entry) : problem(404, `no entry "${slug}"`);
  } catch (err) {
    return fail(err);
  }
}
