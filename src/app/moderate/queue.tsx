"use client";

import Link from "next/link";
import { useState } from "react";

type Item = {
  id: string;
  type: string;
  summary: string;
  entrySlug: string | null;
  submitterName: string | null;
  createdAt: string;
  history: { at: string; action: string; by: string; note: string | null }[];
};

export default function Queue({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function act(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Reason (optional, kept in the history)") ?? undefined : undefined;
    setBusy(id);
    const res = await fetch(`/api/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    setBusy(null);
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.id !== id));
    } else {
      const body = await res.json().catch(() => ({}));
      setErrors((e) => ({ ...e, [id]: body.error ?? `failed (${res.status})` }));
    }
  }

  if (!items.length) return <p className="card">Nothing waiting. 🎉</p>;

  return (
    <>
      {items.map((it) => (
        <div className="card" key={it.id}>
          <div className="meta">
            {it.type.replace("_", " ")} · {new Date(it.createdAt).toLocaleString()} {it.submitterName && `· by ${it.submitterName}`}
            {it.entrySlug && <> · <Link href={`/word/${it.entrySlug}`}>{it.entrySlug}</Link></>}
          </div>
          <p>{it.summary}</p>
          <div className="row">
            <button onClick={() => act(it.id, "approve")} disabled={busy === it.id}>Approve</button>
            <button className="danger" onClick={() => act(it.id, "reject")} disabled={busy === it.id}>Reject</button>
          </div>
          {errors[it.id] && <div className="error">{errors[it.id]}</div>}
          {it.history.length > 1 && (
            <ul className="history">
              {it.history.map((h, i) => (
                <li key={i}>{h.action} by {h.by} {h.note && `: ${h.note}`}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}
