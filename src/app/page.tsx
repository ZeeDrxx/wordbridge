import Link from "next/link";

import { getDb } from "@/db/client";
import { randomEntries, search, stats } from "@/lib/dictionary";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const db = getDb();
  const [results, counts, sample] = await Promise.all([
    q ? search(db, q) : Promise.resolve([]),
    stats(db),
    q ? Promise.resolve([]) : randomEntries(db),
  ]);

  return (
    <main>
      <h1>Darija, in every spelling</h1>
      <p className="lede">
        Search in Latin letters (<em>bzzaf</em>, <em>ch7al</em>), Arabic script (<span className="ar">بزاف</span>), or
        by French or English meaning (<em>beaucoup</em>, <em>how much</em>).
      </p>
      <form className="search" action="/" role="search">
        <input name="q" defaultValue={q} placeholder="bezzaf, شحال, merci…" aria-label="Search" autoFocus />
        <button type="submit">Search</button>
      </form>

      {q && (
        <>
          <ul className="results" aria-live="polite">
            {results.map((r) => (
              <li key={r.slug}>
                <div className="head">
                  <Link className="word" href={`/word/${r.slug}`}>{r.latin}</Link>
                  {r.arabic && <span className="ar">{r.arabic}</span>}
                  <span className="meta">{r.pos}</span>
                  {r.matched !== r.latin && <span className="meta">matched “{r.matched}”</span>}
                </div>
                <div>{[r.fr, r.en].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className="card">
              No match for “{q}”. Know this word? <Link href={`/submit?latin=${encodeURIComponent(q)}`}>Add it</Link>.
            </p>
          )}
        </>
      )}

      {!q && (
        <>
          <h2>Try</h2>
          <ul className="chips">
            {sample.map((e) => (
              <li key={e.slug}>
                <Link href={`/word/${e.slug}`}>{e.latin}</Link>
                {e.arabic && <> · <span className="ar">{e.arabic}</span></>}
              </li>
            ))}
          </ul>
          <div className="stats">
            <span>{counts.entries} entries</span>
            <span>{counts.spellings} spellings</span>
            <span>{counts.examples} examples</span>
          </div>
        </>
      )}
    </main>
  );
}
