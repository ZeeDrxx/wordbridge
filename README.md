# Wordbridge

**A community dictionary for Moroccan Darija.** Search a word the way people actually type it, in Latin
letters (`bzzaf`, `bezzaf`, `ch7al`), in Arabic script (`بزاف`), or by its French or English meaning,
and get spellings, regional words and example sentences. Anyone can suggest additions, and moderators
approve them before they go live.

| | |
|---|---|
| **App** | Next.js 16 (App Router, Server Components), TypeScript, Zod |
| **Dictionary** | PostgreSQL + **Drizzle ORM** (schema, migrations, typed queries), `pg_trgm` fuzzy search |
| **Submissions** | **MongoDB**: free-form proposals with an append-only moderation history |
| **Runs on** | Docker Compose locally; **Azure** Container Apps + PostgreSQL Flexible Server + Cosmos DB for MongoDB ([guide](docs/azure.md), [Bicep](infra/main.bicep)) |

## Why two databases

The **dictionary** is relational. An entry has spellings, translations and examples, with constraints:
a spelling is unique per entry, and an example belongs to exactly one entry. Search joins across all of
them. That is PostgreSQL, modelled with Drizzle in [`src/db/schema.ts`](src/db/schema.ts).

A **submission** is different. Its shape depends on its type (a new word, a spelling, an example, a
correction note), it is always read and written whole, and it carries its own history:

```json
{
  "payload": { "type": "new_spelling", "entrySlug": "bzzaf", "text": "yaser", "region": "oriental", "regionalWord": true },
  "status": "approved",
  "history": [
    { "action": "submitted", "by": "public",  "at": "…" },
    { "action": "approved",  "by": "amina",   "at": "…", "note": "used in Oujda" },
    { "action": "applied",   "by": "system",  "at": "…" }
  ],
  "appliedEntryId": 1
}
```

That is a document, so it goes in MongoDB. Keeping unreviewed public input out of the curated tables is a
safety property too: nothing reaches PostgreSQL until a moderator approves it.

**Approving writes to both stores, in a deliberate order** ([`src/lib/moderation.ts`](src/lib/moderation.ts)):

1. The change is applied to PostgreSQL in one transaction.
2. Only then is the MongoDB document marked `approved`.

If step 1 fails, the submission stays pending with an `apply_failed` event that says why. If step 2 fails,
re-approving is safe, because every insert is idempotent (unique constraints with `ON CONFLICT DO NOTHING`).

## Search that understands Arabizi

Darija has no standard spelling, so every spelling is stored with a **normalised key**
([`src/lib/normalize.ts`](src/lib/normalize.ts)):

| Input | Key | Rules |
|---|---|---|
| `bzzaf`, `bezzaf`, `BZAF`, `bezaf` | `bzaf` | drop the written schwa `e`, collapse double letters |
| `chhal`, `ch7al`, `shhal` | `chal` | `7`→`h`, `3`→`a`, `9`→`q`; `sh`→`ch` |
| `بزّاف`, `بـزاف` | `بزاف` | strip harakat, shadda, tatweel; fold `أ إ آ`→`ا`, `ى`→`ي`, `ة`→`ه` |

The query is ranked on these keys:
- exact key match
- prefix match
- trigram similarity (`pg_trgm` GIN index), so `kifesh` still finds *kifach*

French and English meanings are searched in the same query.

## Quick start

```bash
docker compose up --build
```

- http://localhost:3000: search; try `ch7al`, `بزاف`, `beaucoup`, `yaser`
- http://localhost:3000/submit: suggest a word
- http://localhost:3000/moderate: sign in with `local-demo-token-change-me` (set `MODERATOR_TOKENS` for real use)

For development with hot reload:

```bash
docker compose up -d postgres mongo
cp .env.example .env.local
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

## API

| Endpoint | |
|---|---|
| `GET /api/search?q=` | ranked matches across spellings (both scripts) and meanings |
| `GET /api/entries/:slug` | full entry: spellings, regional words, translations, examples |
| `POST /api/submissions` | public; validated with Zod, rate-limited, honeypot field |
| `GET /api/submissions?status=pending` | moderators (`Authorization: Bearer <token>` or session cookie) |
| `PATCH /api/submissions/:id` | moderators; `{ "action": "approve" \| "reject", "note"?: "…" }` |
| `GET /api/health` | checks both databases |

## Project layout

```
src/db/schema.ts        Drizzle schema: entries, spellings, translations, examples, regions
src/db/mongo.ts         MongoDB client + submission document types
src/lib/normalize.ts    Arabizi / Arabic search keys
src/lib/dictionary.ts   search and entry queries
src/lib/moderation.ts   submissions → moderation → apply to PostgreSQL
src/lib/submissions.ts  Zod schemas for every submission type
src/app/                pages (search, word, submit, moderate) and API route handlers
drizzle/                generated SQL migrations (+ pg_trgm)
scripts/                migrate.mjs, seed.ts (runs with Node's built-in TypeScript support)
data/seed.json          49 starter entries
infra/main.bicep        Azure infrastructure
```

## Tests

```bash
docker compose up -d postgres mongo && npm run db:migrate && npm run db:seed
DATABASE_URL=postgres://wordbridge:wordbridge@localhost:5432/wordbridge MONGODB_URI=mongodb://localhost:27017 npm test
```

The 30 tests cover two areas:
- **Unit:** spelling normalisation, validation, moderator tokens.
- **Integration**, against real PostgreSQL and MongoDB:
  - search across scripts, fuzzy matches and regional words
  - submit → approve → searchable
  - rejected submissions change nothing
  - a failed apply stays pending with a recorded reason
  - double moderation is refused

CI also checks that the Drizzle migrations match the schema, builds the image and smoke-tests the stack.

## Content

The 49 starter entries are common, everyday words, so a fresh install has something to search. Regional
attributions are deliberately few and conservative. Improving them is exactly what the submission
flow is for.

## License

MIT
