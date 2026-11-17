import type { Metadata } from "next";
import { cookies } from "next/headers";

import { MODERATOR_COOKIE, moderatorFor } from "@/lib/auth";
import { listSubmissions } from "@/lib/moderation";
import { describe } from "@/lib/submissions";

import Queue from "./queue";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ModeratePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const moderator = moderatorFor((await cookies()).get(MODERATOR_COOKIE)?.value);
  const { error } = await searchParams;

  if (!moderator) {
    return (
      <main>
        <h1>Moderation</h1>
        <p className="lede">Sign in with your moderator token.</p>
        <form method="post" action="/api/moderator/session" className="search">
          <input name="token" type="password" aria-label="Moderator token" autoComplete="current-password" required />
          <button type="submit">Sign in</button>
        </form>
        {error && <p className="error">That token is not valid.</p>}
      </main>
    );
  }

  const pending = await listSubmissions("pending");
  const items = pending.map((d) => ({
    id: d._id.toHexString(),
    type: d.payload.type,
    summary: describe(d.payload),
    entrySlug: "entrySlug" in d.payload ? d.payload.entrySlug : null,
    submitterName: d.submitterName ?? null,
    createdAt: d.createdAt.toISOString(),
    history: d.history.map((h) => ({ at: h.at.toISOString(), action: h.action, by: h.by, note: h.note ?? null })),
  }));

  return (
    <main>
      <h1>Moderation</h1>
      <p className="lede">Signed in as {moderator}. {items.length} pending, oldest first.</p>
      <Queue items={items} />
    </main>
  );
}
