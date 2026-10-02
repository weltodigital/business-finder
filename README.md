# Off-Market Acquisition Finder

Finds UK businesses worth buying **before** they are listed for sale.

The application builds a structured database of UK companies — Companies House
records, extracted financial histories, ownership structures, acquisition
signals and a transparent acquisition score — and gives one acquirer a workflow
for turning that into a target pipeline.

The core asset is the data pipeline. The UI is the interface to it.

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Companies House

Register at
<https://developer.company-information.service.gov.uk/> and create an
application key. The same key works for both the Public Data API and the
Document API. Put it in `COMPANIES_HOUSE_API_KEY`.

### 3. Supabase

Create a project, then run the migrations in order against it:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_seed_scoring.sql
```

Either paste them into the Supabase SQL editor, or with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

Copy the project URL, anon key and service-role key into `.env.local`.

### 4. Optional keys

| Variable | Effect when missing |
| --- | --- |
| `ANTHROPIC_API_KEY` | AI target analysis is unavailable, and accounts extraction falls back to XBRL and text heuristics only. Everything else works. |
| `GOOGLE_MAPS_API_KEY` | Enrichment skips the Google business listing (rating, review count, website discovery). |
| `FIRECRAWL_API_KEY` | Unused — the built-in crawler handles website enrichment. |

### 5. Run

```bash
npm run dev
```

Create an account on `/login`, then start at **Company Lookup** to verify the
pipeline end to end against a company number you know.

---

## Development without the live API

Set `USE_FIXTURES=true` in `.env.local` and `POST /api/dev/seed` (from the
browser console while signed in):

```js
await fetch('/api/dev/seed', { method: 'POST' }).then((r) => r.json());
```

That loads seven fixture companies covering the cases the scoring model has to
handle: an excellent target, an average company, a distressed company, a
company with no extractable accounts, a micro company, a multi-director company
with dispersed ownership, and a long-standing owner-controlled business. The
endpoint refuses to run unless `USE_FIXTURES=true`.

---

## How the pipeline works

```
Acquisition thesis
      ↓  advanced search (cheap, wide)
Company universe
      ↓  filter on data already held (free)
Candidates
      ↓  Companies House ingestion + accounts extraction
Financial history
      ↓  signal detection
Signals
      ↓  deterministic scoring
Acquisition score
      ↓  human review
Target pipeline
```

Cost control is deliberate: expensive stages only ever run on a shortlist.
A search pulls up to 500 companies, filters to 200 candidates using data it
already has, and fully researches around 40 of them.

### Accounts extraction

Order of preference, cheapest and most reliable first:

1. **iXBRL / XBRL tagged facts** (`src/lib/accounts/ixbrl.ts`) — exact, free,
   and covers most modern filings. Dimensioned (segmental) contexts are
   ignored so only entity-level figures are stored.
2. **PDF text heuristics** (`src/lib/accounts/text-extract.ts`) — label
   matching with `£'000` scale detection and note-reference handling.
3. **LLM extraction** (`src/lib/accounts/llm.ts`) — only when the first two
   yield too little, and explicitly forbidden from estimating.

Every fact stores its source document, accounting period, extraction method and
confidence, so any number on screen is traceable back to a filing.

Extracted facts are validated (`src/lib/accounts/validate.ts`) against
accounting identities — gross profit ≤ revenue, operating profit ≤ gross
profit, assets − liabilities = net assets, plus thousands-vs-pounds detection.
Anything that fails is marked `needs_review` rather than silently accepted.

### Financial visibility

Every company carries a visibility level of `HIGH`, `MEDIUM` or `LOW`. This is
separate from performance on purpose: a company that does not disclose turnover
is a company we know less about, not a bad business. Low visibility gives a
neutral financial-quality score, never a penalty.

### Scoring

100 points, fully deterministic, no LLM involved:

| Component | Points |
| --- | ---: |
| Financial quality | 30 |
| Acquisition fit | 20 |
| Ownership | 15 |
| Succession signal | 15 |
| Company quality | 10 |
| Risk adjustment | up to −10 |

Every point awarded records the reason it was awarded, and the UI shows them.
Weights live in the `scoring_configs` table, so the model can be retuned
without re-extracting any company data.

The signal is called **succession signal**, never "retirement probability" — it
measures structure (tenure, concentration, company age), not intent.

### AI analysis

`src/lib/ai/analyse-target.ts` runs only on shortlisted companies. It is given
the stored facts and is instructed to separate verified facts from
interpretation from unknowns, and never to invent a figure, an owner's
intention or a business characteristic. Output is schema-validated before it is
stored.

The provider sits behind `LlmProvider` (`src/lib/ai/provider.ts`), so a second
model can be added without touching any call site.

---

## Layout

```
src/lib/companies-house/   API client: auth, throttling, retries, caching, pagination
src/lib/accounts/          Document retrieval, XBRL/text/LLM extraction, validation, normalisation
src/lib/financials/        CAGR, margins, consistency, financial visibility
src/lib/signals/           Signal detection shared by scoring, the UI and the AI
src/lib/scoring/           Deterministic, explainable acquisition score
src/lib/enrichment/        Website crawler and Google Places lookup
src/lib/ai/                Provider abstraction and target analysis
src/lib/pipeline/          Ingestion, scoring and the staged thesis run
src/lib/jobs/              Simple database-backed job queue
src/lib/repository/        Persistence and dossier assembly
supabase/migrations/       Schema and row-level security
```

---

## Background jobs

Searches run as jobs in the `jobs` table (`PENDING → PROCESSING → COMPLETE /
FAILED`), drained by `POST /api/jobs/run`. The results page calls it while
polling, which keeps the MVP free of any external scheduler. Moving to a cron
trigger or worker later means pointing a scheduler at the same endpoint.

---

## Rate limits and caching

Companies House allows 600 requests per rolling five minutes. The client
throttles below that, retries `429` and `5xx` with exponential backoff and
jitter, and caches responses in `companies_house_cache`. Stored data is reused
unless a refresh is explicitly requested, and accounts documents already
extracted are never re-downloaded.

---

## Testing

```bash
npm test          # vitest
npm run typecheck
npm run build
```

Tests cover the logic that has to be right: XBRL parsing, PDF text extraction,
financial validation, normalisation, CAGR and margin maths, signal detection,
AI JSON parsing, and the scoring engine — including that an excellent target
scores far above a distressed one, and that a company with no accounts is not
penalised for it.

---

## Data use

The application uses the official Companies House developer APIs. It does not
scrape Companies House web pages.

Raw Companies House data is not a resellable database on its own. The
commercial value here is the analysis layer — extraction, normalisation,
signals, scoring, AI interpretation and workflow. Confirm the current licensing
position before distributing any derived dataset.

---

## Not built yet

Deliberately out of scope for this MVP: billing, subscriptions, teams,
permissions beyond a single owner, automated outreach, CRM integrations, a
public API, streaming updates and a valuation model. The financial schema is
shaped so a valuation engine can be added later without re-extraction.
