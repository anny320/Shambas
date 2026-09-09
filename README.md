# Shamba Score

An AI credit and insurance scoring engine for smallholder farmers, sold B2B to
lenders, SACCOs, agri-input dealers and insurers. It produces a score, a
default-probability band, recommended loan terms and a plain-language
explanation from alternative data. Kenya first.

Shamba Score is **not a lender**. It is the decisioning layer that licensed
institutions use; they hold the risk. See `CLAUDE.md` for the scope guardrails
and `PRD.md` for the full product spec.

## What runs today

- Email and password auth, with each user bound to one institution and a role.
- Multi-tenant Postgres schema with Row Level Security on every table.
- Farmer and application intake: map pin, farm size, crop, and mandatory
  recorded consent.
- Applications list and detail views scoped to the signed-in institution.
- Pluggable data adapters with mock implementations for satellite, weather and
  mobile-money signals.
- A pure, unit-tested scoring engine with documented expert weights.

Everything runs end to end on mock adapters. No external API keys are needed.

## Local setup

You need Node 18 or newer and a free Supabase project.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` from your Supabase dashboard, under
**Project Settings → Data API**:

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | Safe in the browser; every request it makes is constrained by Row Level Security |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | **Optional.** Bypasses Row Level Security. Nothing in the app uses it; keep it out unless you add an admin script |
| `SATELLITE_ADAPTER` | `mock` or `live` | Defaults to `mock` |
| `WEATHER_ADAPTER` | `mock` or `live` | Defaults to `mock` |
| `MOBILE_MONEY_ADAPTER` | `mock` or `live` | Defaults to `mock` |
| `MOCK_ADAPTER_SEED` | any string | Same seed and same farm always give the same features, so demos repeat exactly |

### Running the migrations

The migrations in `supabase/migrations` are plain SQL, applied in filename
order. Either paste them into the Supabase SQL editor one at a time, or use the
Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Then turn **off** email confirmation while developing, under
**Authentication → Providers → Email**, so a new account can sign in straight
away.

### Starting the app

```bash
npm run dev
```

Open http://localhost:3000. Create an account, name your institution on the
onboarding screen, and you become its first administrator. Colleagues join by
invitation: an admin or head of credit adds a row to `institution_invites` with
their email, and the invite is claimed automatically on their first sign-in.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm run lint` | ESLint (flat config; `next lint` no longer exists in Next 16) |
| `npm test` | Unit tests for scoring, adapters and validation |
| `./supabase/tests/run.sh` | Row Level Security isolation test against a real Postgres |

## How it is put together

```
src/
  adapters/      DataAdapter interface, mock and live implementations
  scoring/       the pure score() function, its weights, and its types
  lib/           Supabase clients, auth helpers, env, validation
  components/    shared UI, including the Leaflet farm map
  app/           Next.js App Router pages and route handlers
supabase/
  migrations/    schema and Row Level Security, applied in filename order
  tests/         the isolation test and its local Postgres shim
```

Two rules shape most of this:

**`score()` is pure and does no I/O.** Adapters fetch and normalise; the
scoring function only ever sees a plain feature object. That is what makes it
trivially testable today and swappable for a trained model later.

**Isolation lives in the database, not the queries.** Application code does not
filter by `institution_id`. Row Level Security does it, so a forgotten filter
cannot leak one institution's farmers to another. `supabase/tests` proves it.

How the scoring model works, and how it handles missing data, is written up in
[`docs/scoring-model.md`](docs/scoring-model.md).

## Data protection

Built for Kenya's Data Protection Act 2019:

- **Consent is mandatory and recorded.** No application leaves draft without an
  explicit, timestamped consent flag. A database constraint enforces this, not
  just the form.
- **Data minimisation.** There are no columns for national ID numbers,
  government ID numbers, or financial account numbers, and none should be
  added. Only what scoring needs is stored.
- **Every decision is auditable.** Decisions record their input snapshot and
  who decided, and are append-only: there is no policy permitting a decision to
  be edited or deleted through the API.
