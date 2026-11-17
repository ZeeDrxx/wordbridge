"use client";

import Link from "next/link";
import { useState } from "react";

type Kind = "new_entry" | "new_spelling" | "new_example" | "correction";
type Props = { entry: { slug: string; latin: string } | null; initialLatin: string };

const POS = ["noun", "verb", "adjective", "adverb", "pronoun", "interjection", "preposition", "conjunction", "phrase"];

export default function SubmitForm({ entry, initialLatin }: Props) {
  const [kind, setKind] = useState<Kind>(entry ? "new_spelling" : "new_entry");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload: Record<string, unknown> = { type: kind };
    if (kind === "new_entry") {
      Object.assign(payload, {
        latin: f.latin, arabic: f.arabic, pos: f.pos, fr: f.fr, en: f.en,
        exampleDarija: f.exampleDarija, exampleFr: f.exampleFr, exampleEn: f.exampleEn,
      });
    } else {
      payload.entrySlug = entry?.slug;
      if (kind === "new_spelling") Object.assign(payload, { text: f.text, region: f.region, regionalWord: f.regionalWord === "on" });
      if (kind === "new_example") Object.assign(payload, { darija: f.darija, fr: f.fr, en: f.en });
      if (kind === "correction") payload.message = f.message;
    }
    setState("sending");
    setErrors({});
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, submitterName: f.submitterName, website: f.website }),
    });
    if (res.ok) return setState("sent");
    const body = await res.json().catch(() => ({}));
    setErrors(body.fields ?? { _: body.error ?? "Something went wrong" });
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div className="ok">
        Thank you! Your suggestion is waiting for a moderator. {entry ? <Link href={`/word/${entry.slug}`}>Back to {entry.latin}</Link> : <Link href="/">Back to search</Link>}
      </div>
    );
  }

  const err = (field: string) => errors[`payload.${field}`] && <div className="error">{errors[`payload.${field}`]}</div>;

  return (
    <form onSubmit={onSubmit} noValidate>
      {entry && (
        <div className="row" role="radiogroup" aria-label="What are you suggesting?">
          {(["new_spelling", "new_example", "correction"] as Kind[]).map((k) => (
            <button key={k} type="button" className={kind === k ? undefined : "secondary"} onClick={() => setKind(k)} aria-pressed={kind === k}>
              {{ new_spelling: "Spelling or regional word", new_example: "Example sentence", correction: "Correction", new_entry: "" }[k]}
            </button>
          ))}
        </div>
      )}

      {kind === "new_entry" && (
        <>
          <div className="grid2">
            <div>
              <label htmlFor="latin">Word in Latin letters <span className="hint">e.g. bzzaf, 3afak</span></label>
              <input id="latin" name="latin" defaultValue={initialLatin} required />
              {err("latin")}
            </div>
            <div>
              <label htmlFor="arabic">In Arabic script <span className="hint">optional</span></label>
              <input id="arabic" name="arabic" dir="rtl" className="ar" />
              {err("arabic")}
            </div>
          </div>
          <label htmlFor="pos">Type of word</label>
          <select id="pos" name="pos" defaultValue="noun">{POS.map((p) => <option key={p}>{p}</option>)}</select>
          <div className="grid2">
            <div><label htmlFor="fr">French meaning</label><input id="fr" name="fr" lang="fr" />{err("fr")}</div>
            <div><label htmlFor="en">English meaning</label><input id="en" name="en" />{err("en")}</div>
          </div>
          <label htmlFor="exampleDarija">Example sentence in Darija <span className="hint">optional</span></label>
          <input id="exampleDarija" name="exampleDarija" />
          <div className="grid2">
            <div><label htmlFor="exampleFr">…in French</label><input id="exampleFr" name="exampleFr" lang="fr" /></div>
            <div><label htmlFor="exampleEn">…in English</label><input id="exampleEn" name="exampleEn" /></div>
          </div>
        </>
      )}

      {kind === "new_spelling" && (
        <>
          <label htmlFor="text">Spelling or word <span className="hint">Latin letters or Arabic script</span></label>
          <input id="text" name="text" required />
          {err("text")}
          <label htmlFor="region">Where is it used?</label>
          <select id="region" name="region" defaultValue="general">
            <option value="general">Everywhere / not sure</option>
            <option value="north">North (Tangier, Tetouan)</option>
            <option value="oriental">Oriental (Oujda)</option>
            <option value="centre">Centre (Casablanca, Rabat, Fes)</option>
            <option value="south">South (Marrakech, Agadir)</option>
          </select>
          <label><input type="checkbox" name="regionalWord" /> It is a different word with the same meaning, not just another spelling</label>
        </>
      )}

      {kind === "new_example" && (
        <>
          <label htmlFor="darija">Sentence in Darija</label>
          <input id="darija" name="darija" required />
          {err("darija")}
          <div className="grid2">
            <div><label htmlFor="fr">In French</label><input id="fr" name="fr" lang="fr" />{err("fr")}</div>
            <div><label htmlFor="en">In English</label><input id="en" name="en" /></div>
          </div>
        </>
      )}

      {kind === "correction" && (
        <>
          <label htmlFor="message">What should change?</label>
          <textarea id="message" name="message" rows={4} required />
          {err("message")}
        </>
      )}

      <label htmlFor="submitterName">Your name <span className="hint">optional, shown to moderators only</span></label>
      <input id="submitterName" name="submitterName" autoComplete="nickname" />
      <div className="hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>

      {errors._ && <div className="error">{errors._}</div>}
      {errors["payload.entrySlug"] && <div className="error">{errors["payload.entrySlug"]}</div>}
      <p><button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send for review"}</button></p>
    </form>
  );
}
