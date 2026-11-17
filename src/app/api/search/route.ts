import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { search } from "@/lib/dictionary";
import { fail, json } from "@/lib/http";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const results = await search(getDb(), q);
    return json({ query: q, results }, 200, { "Cache-Control": "public, max-age=60" });
  } catch (err) {
    return fail(err);
  }
}
