# CLAUDE.md — Shamba Score

Project memory for Claude Code. Read this at the start of every session. The full spec is in `PRD.md`; this file is the short, binding version.

## What we're building

An **AI credit & insurance scoring engine for smallholder farmers**, sold **B2B** to lenders, SACCOs, agri-input dealers and insurers. We build the decisioning *brain* — score + default-probability + recommended loan terms + a plain-language explanation from alternative data (satellite, weather, mobile-money, farm profile). Kenya first.

## Hard scope guardrails (do not cross without being asked)

- **We are NOT a lender.** No balance-sheet, wallet, disbursement, or loan-servicing features. We provide decisions to licensed institutions; they hold the risk.
- **B2B only.** The user is an institution's loan officer. **No farmer-facing consumer app** in v1.
- **Adapters stay pluggable and mock-first.** All external data (satellite, weather, mobile-money) sits behind a `DataAdapter` interface with a `MockAdapter` selected by env var. The whole app must run end-to-end on mocks with no live API keys.
- **v1 scoring is a transparent, expert-weighted model — NOT machine learning.** Do not add ML libraries or train models. Weights are documented and tunable. (ML is a future phase, once real repayment data exists.)
- **Never silently impute missing data as positive.** Missing/low-confidence inputs must lower confidence and be surfaced, never hidden.
- **Kenya, one market.** No multi-country data adapters yet.

## Data & compliance rules (Kenya DPA 2019)

- **Multi-tenant from the first commit.** Every domain row carries `institution_id`; enforce isolation with Supabase Row Level Security. A user only ever sees their own institution's data.
- **Consent is mandatory and recorded.** No farmer data is processed without an explicit, timestamped consent flag.
- **Data minimisation.** Do NOT store government ID numbers, raw national IDs, or full financial-account numbers. Collect only what scoring needs (name, phone, farm location, farm size, crop).
- **Every decision is auditable.** Store the input snapshot + timestamp + who decided.

## Tech stack (decided — don't re-litigate)

- **Frontend:** Next.js (App Router) + TypeScript (strict) + Tailwind.
- **Backend:** Next.js API routes (promote scoring to a separate service only if it clearly outgrows this).
- **DB / Auth:** Supabase (Postgres + Auth + Row Level Security).
- **Map:** react-leaflet + OpenStreetMap tiles (no API key) for the farm pin.
- **Scoring:** a pure, isolated, unit-tested function `score(features) => { score, pd, terms, confidence, factors }`. Keep it free of I/O so it's trivially testable and later swappable for ML.
- **Deploy (later):** Vercel + Supabase.

## Architecture principles

- Keep `score()` pure and I/O-free; adapters do the fetching and hand it normalised features.
- One `DataAdapter` interface, `MockAdapter` + `LiveAdapter` per source, chosen by env var.
- Design the schema forward-compatibly for later `scores` and `repayment_outcomes` tables, but don't build scoring/outcomes until their prompt.

## Working conventions

- Commit at the end of each build phase with a clear message.
- Write/keep tests for `score()` and any data normalisation.
- When a phase changes decisions or scope, update this file.
- If a request would cross a guardrail above, stop and flag it rather than building it.

## Build sequence (see the kickoff file for the detailed prompts)

1. Scaffold + auth + multi-tenant + data model + farmer intake  ← **current**
2. `DataAdapter` interface + mock adapters
3. Scoring engine (`score()`) + tests
4. Explainability panel + decision recording + portfolio view
5. First live adapter (weather), then P1 items (repayment capture, insurance rec, batch import, SMS)
