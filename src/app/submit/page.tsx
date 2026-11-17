import type { Metadata } from "next";

import { getDb } from "@/db/client";
import { getEntry } from "@/lib/dictionary";

import SubmitForm from "./submit-form";

export const metadata: Metadata = { title: "Add a word" };
export const dynamic = "force-dynamic";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ entry?: string; latin?: string }> }) {
  const { entry: slug, latin } = await searchParams;
  const entry = slug ? await getEntry(getDb(), slug) : null;
  return (
    <main>
      <h1>{entry ? `Improve “${entry.latin}”` : "Add to the dictionary"}</h1>
      <p className="lede">
        Every suggestion goes to a moderator before it appears. Write Darija the way you would text it; spelling
        variants are welcome.
      </p>
      <SubmitForm entry={entry ? { slug: entry.slug, latin: entry.latin } : null} initialLatin={latin ?? ""} />
    </main>
  );
}
