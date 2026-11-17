import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Wordbridge: Darija dictionary", template: "%s · Wordbridge" },
  description:
    "Community dictionary for Moroccan Darija: spellings in Latin and Arabic script, French and English meanings, regional variants.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <nav>
            <Link href="/" className="brand">Wordbridge</Link>
            <Link href="/">Search</Link>
            <Link href="/submit">Add a word</Link>
            <Link href="/moderate">Moderate</Link>
          </nav>
        </header>
        {children}
        <footer className="site">
          Open-source Darija ↔ Arabic ↔ French/English dictionary. Entries are community-submitted and reviewed by
          moderators.
        </footer>
      </body>
    </html>
  );
}
