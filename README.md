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

A static marketing one-pager lives in [`site/`](site/) and publishes to GitHub
Pages. The app itself is not deployed there: Pages serves static files only,
and Shamba Score needs a server for auth, the database and scoring.

## Local setup

You need Node 18 or newer and a free Supabase account. The whole app runs on
mock data, so no other API keys are needed.

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Create a Supabase project

At [supabase.com](https://supabase.com), create a new project. Pick a region
near you and save the database password somewhere safe. It takes a minute or
two to provision.

### 3. Fill in `.env.local`

In the dashboard, go to **Project Settings → Data API** and copy:

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | Safe in the browser; every request it makes is constrained by Row Level Security |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | **Leave blank.** Nothing in the app uses it. Onboarding goes through SECURITY DEFINER functions instead, so the app never needs a key that bypasses Row Level Security |
| `SATELLITE_ADAPTER` | `mock` or `live` | Defaults to `mock` |
| `WEATHER_ADAPTER` | `mock` or `live` | Defaults to `mock` |
| `MOBILE_MONEY_ADAPTER` | `mock` or `live` | Defaults to `mock` |
| `MOCK_ADAPTER_SEED` | any string | Same seed and same farm always give the same features, so demos repeat exactly |

### 4. Run the migrations

Add your database connection string to `.env.local` as `SUPABASE_DB_URL`.
Dashboard: **Project Settings → Database → Connection string**. Take the
direct connection or the **session** pooler — the transaction pooler cannot
run the statements these migrations need. It contains your database password,
so it stays on your machine.

Then:

```bash
npm run db:migrate
```

That applies both files in order and records what it applied, so it is safe to
re-run. `npm run db:status` shows what is pending without changing anything.
Each file runs in its own transaction, so a failure rolls that file back
completely rather than leaving the schema half-built.

If you would rather not use the script, paste
`supabase/migrations/20260909150000_init.sql` into the dashboard SQL editor,
run it, then do the same with `20260909160000_scores.sql`. Order matters: the
second depends on the first.

Do **not** apply anything from `supabase/tests`. That directory contains a
local stand-in for parts of Supabase that your project already has, and
applying it would conflict.

### 5. Turn off email confirmation (development only)

Under **Authentication → Providers → Email**, switch **Confirm email** off.
Otherwise your first account cannot sign in until it confirms, and there is no
mail provider configured yet. Turn it back on before any real pilot.

### 6. Start the app

```bash
npm run dev
```

Open http://localhost:3000, create an account, and name your institution on
the onboarding screen. You become its first administrator, and everything you
create from then on belongs to that institution and is invisible to any other.

### Adding a colleague

There is no invite email yet, so add the row by hand. In the SQL editor:

```sql
insert into public.institution_invites (institution_id, email, role, created_by)
values (
  (select institution_id from public.users where email = 'you@example.com'),
  'colleague@example.com',
  'officer',              -- or 'head_of_credit' or 'admin'
  (select id from public.users where email = 'you@example.com')
);
```

They sign up with that email and the invite is claimed automatically on their
first sign-in.

### If something does not work

- **"Missing required environment variable"** — `.env.local` is missing or a
  value is blank. Restart `npm run dev` after editing it; environment variables
  are read at startup.
- **Signed in but the page keeps returning to onboarding** — your user has no
  row in `public.users`. Either the migrations did not run, or institution
  creation failed. Check for a `users` row for your email.
- **Every list is empty and inserts fail** — Row Level Security is doing its
  job and your user has no institution. Same fix as above.
- **"Email not confirmed"** — step 5.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm run lint` | ESLint (flat config; `next lint` no longer exists in Next 16) |
| `npm test` | Unit tests for scoring, adapters and validation |
| `npm run db:migrate` | Apply pending SQL migrations to the database in `SUPABASE_DB_URL` |
| `npm run db:status` | Show which migrations are applied and which are pending |
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
