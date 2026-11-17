import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { getEntry } from "@/lib/dictionary";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await getEntry(getDb(), (await params).slug);
  if (!entry) return { title: "Not found" };
  const meaning = entry.translations.filter((t) => t.lang !== "ar").map((t) => t.text).join(" · ");
  return { title: `${entry.latin}${entry.arabic ? ` (${entry.arabic})` : ""}`, description: `${entry.latin}: ${meaning}` };
}

const LANG = { fr: "French", en: "English", ar: "Standard Arabic" } as const;

export default async function WordPage({ params }: Props) {
  const { slug } = await params;
  const entry = await getEntry(getDb(), slug);
  if (!entry) notFound();

  const spellings = entry.spellings.filter((s) => s.kind === "spelling");
  const regional = entry.spellings.filter((s) => s.kind === "regional");
  const byLang = (["fr", "en", "ar"] as const)
    .map((lang) => ({ lang, items: entry.translations.filter((t) => t.lang === lang) }))
    .filter((g) => g.items.length);

  return (
    <main>
      <p className="meta"><Link href="/">← Search</Link></p>
      <h1>
        {entry.latin} {entry.arabic && <span className="ar">{entry.arabic}</span>}
      </h1>
      <p className="lede">{entry.pos}</p>

      <div className="grid2">
        {byLang.map((g) => (
          <div className="card" key={g.lang}>
            <div className="meta">{LANG[g.lang]}</div>
            {g.items.map((t) => (
              <div key={t.text} className={g.lang === "ar" ? "ar" : undefined}>{t.text}</div>
            ))}
          </div>
        ))}
      </div>

      {spellings.length > 0 && (
        <>
          <h2>Also written</h2>
          <ul className="chips">
            {spellings.map((s) => (
              <li key={s.text} className={s.script === "arabic" ? "ar" : undefined}>{s.text}</li>
            ))}
          </ul>
        </>
      )}

      {regional.length > 0 && (
        <>
          <h2>Regional words</h2>
          <ul className="chips">
            {regional.map((s) => (
              <li key={s.text}>
                <span className={s.script === "arabic" ? "ar" : undefined}>{s.text}</span>
                {s.regionName && <span className="meta"> · {s.regionName}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {entry.examples.length > 0 && (
        <>
          <h2>Examples</h2>
          {entry.examples.map((ex) => (
            <div className="card" key={ex.darija}>
              <div><strong>{ex.darija}</strong></div>
              {ex.fr && <div lang="fr">{ex.fr}</div>}
              {ex.en && <div className="meta">{ex.en}</div>}
            </div>
          ))}
        </>
      )}

      <p className="meta" style={{ marginTop: 28 }}>
        Something missing or wrong?{" "}
        <Link href={`/submit?entry=${entry.slug}`}>Suggest a spelling, an example or a correction</Link>.
      </p>
    </main>
  );
}
