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

1. ~~Scaffold + auth + multi-tenant + data model + farmer intake~~ **done**
2. ~~`DataAdapter` interface + mock adapters~~ **done**
3. ~~Scoring engine (`score()`) + tests~~ **done**
4. Explainability panel + decision recording + portfolio view  ← **next**
   (a factor-breakdown panel already ships with phase 3; still to build are
   the approve/decline flow with its input snapshot, and the portfolio view)
5. First live adapter (weather, via Open-Meteo), then P1 items (repayment
   capture, insurance rec, batch import, SMS)

## Decisions taken during the build (don't re-litigate)

- **Next 16, React 19, Tailwind 4, Vitest.** The route-gate file is
  `src/proxy.ts`, not `middleware.ts`: Next 16 renamed the convention.
  `next lint` was removed, so linting is plain `eslint .` with a flat config.
- **Isolation lives in the database, not in queries.** Application code does
  not filter by `institution_id`; RLS does. A forgotten filter must not be
  able to leak a tenant. `supabase/tests/run.sh` proves this against a real
  Postgres and must keep passing.
- **Onboarding without the service role key.** Two SECURITY DEFINER functions,
  `create_institution()` and `claim_invite()`, are the only way a membership
  row is created. Nothing at runtime uses the service role key.
- **Decisions and scores are append-only.** Neither table has an update or
  delete policy. A recorded assessment cannot be edited through the API.
- **Scores are kept, not overwritten.** Re-scoring inserts a new row, so the
  audit trail shows what was known when.
- **Missing data is substituted conservatively, never skipped.** See
  `docs/scoring-model.md`. Withholding a signal can never improve the risk
  band or the recommended amount.
- **No prior credit is redistributed, not penalised.** It is the ordinary
  state of a smallholder, not a gap in observation.

## Open policy question for the product owner

When there is no income signal at all, an offer is still made, sized to what
the farm can absorb and halved. This keeps genuinely thin-file farmers
reachable, but it means an applicant with poor income could fare better by not
linking their account. `NO_INCOME_SIGNAL_MULTIPLIER = 0` refuses these
outright instead. Flagged in `docs/scoring-model.md`; the lender's risk
appetite should decide it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
