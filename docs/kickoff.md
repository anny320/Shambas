# Shamba Score — Claude Code Kickoff Kit

Everything you need to start building Phase 1. Work through it top to bottom.

---

## How to use this

1. Create an empty folder / git repo for the project.
2. Put **`CLAUDE.md`** and **`PRD-ShambaScore-v0.1.md`** (rename to `PRD.md`) in the repo root.
3. Create a free **Supabase** project — you'll need its URL and keys.
4. Open Claude Code in the repo and paste **Build Prompt 1** below. Let it work, review, commit.
5. Then move through Build Prompts 2–5 (summarised at the end) one at a time — one phase per session, commit between them.

**Prerequisites:** Node 18+, a Supabase project, a code editor. No external API keys needed yet — Phase 1 and the mock build run without them.

---

## Build Prompt 1 — Scaffold, auth, multi-tenant, data model, farmer intake

> Copy everything in this block into Claude Code.

```
Read CLAUDE.md and PRD.md first, and follow every scope guardrail in CLAUDE.md.

Goal of this session: build the foundation of Shamba Score — project scaffold, authentication, multi-tenant institution accounts, the core data model, and the farmer/application intake flow. Do NOT build data adapters, the scoring engine, explainability, or any lending/disbursement features in this session — those come in later phases.

Stack (already decided, don't change): Next.js App Router + TypeScript (strict) + Tailwind; Supabase for Postgres, Auth, and Row Level Security; react-leaflet + OpenStreetMap for the map. Deploy target is Vercel + Supabase but we're running locally for now.

Please do the following:

1. SCAFFOLD
   - Initialise a Next.js (App Router) + TypeScript + Tailwind project.
   - Add the Supabase client, environment config (.env.local), and a .env.example listing the vars needed (Supabase URL, anon key, service role key).
   - Set up a clean folder structure and a README with local setup steps.

2. DATA MODEL (Supabase migrations, SQL)
   Create these tables, each with an institution_id for multi-tenancy where relevant:
   - institutions: id, name, created_at
   - users: id (links to Supabase auth user), institution_id, email, role (enum: officer | head_of_credit | admin), created_at
   - farmers: id, institution_id, name, phone, location_lat, location_lng, farm_size_ha, primary_crop, created_by, created_at
     (DATA MINIMISATION: do NOT add national ID, government ID, or financial-account number columns.)
   - applications: id, institution_id, farmer_id, status (enum: draft | submitted | scored | approved | declined), consent_given (bool), consent_at (timestamp), created_by, created_at
   - decisions: id, institution_id, application_id, decision (enum: approve | decline), loan_amount, loan_term, officer_notes, input_snapshot (jsonb), decided_by, decided_at
   Design the schema so that `scores` and `repayment_outcomes` tables can be added later without refactoring, but do NOT create them now.

3. MULTI-TENANCY (critical)
   - Enable Row Level Security on every domain table.
   - Write RLS policies so a signed-in user can only read/write rows belonging to their own institution_id. Verify no cross-institution access is possible.

4. AUTH
   - Supabase email auth (magic link or email+password — pick the simpler).
   - On first login, a user is associated with an institution and a role.
   - Protect all app routes; unauthenticated users are redirected to login.

5. FARMER / APPLICATION INTAKE
   - A loan officer can create a new application: capture farmer name, phone, farm location via a map pin (react-leaflet, storing lat/lng), farm size (ha), primary crop.
   - Include an explicit consent checkbox with clear text that the farmer consents to their farm and (later) mobile-money data being used for a credit assessment. Store consent_given and consent_at. Block submission if consent is not given.
   - On submit: create the farmer and an application with status "submitted", scoped to the user's institution.
   - Validate inputs; show clear errors.

6. APPLICATIONS LIST
   - A simple dashboard page listing the institution's applications with farmer name, crop, status, and created date. Clean and functional — no scoring UI yet.

7. QUALITY
   - TypeScript strict, no `any` where avoidable.
   - Add a couple of tests where they're cheap and meaningful (e.g., an RLS/isolation check or intake validation).
   - Update the README with how to run migrations and start the app.

Definition of done for this session:
- App runs locally.
- A user can log in, is tied to an institution, and sees ONLY their institution's data.
- A loan officer can create a farmer + application through the intake form with a map pin and explicit consent.
- The applications list shows submitted applications with status.
- Migrations are committed; adapters and scoring are NOT built.

When done, summarise what you built, list the env vars I need to set, and tell me exactly how to run it. Then stop — do not start the next phase.
```

---

## The remaining sequence (one session each, after Prompt 1)

Give Claude Code a short prompt like these when you're ready for each — it already has the PRD and CLAUDE.md for detail.

- **Build Prompt 2 — Data adapters (mock).** "Define a `DataAdapter` interface and `MockAdapter` implementations for satellite/vegetation, weather, and mobile-money that return realistic normalised features, selected by env var. No live APIs. Per CLAUDE.md."
- **Build Prompt 3 — Scoring engine.** "Build the pure, I/O-free `score(features) => { score, pd, terms, confidence, factors }` using documented, tunable expert weights across farm-productivity, climate-risk, and financial-behaviour signals. Handle missing/low-confidence data by lowering confidence and surfacing it. Unit-test it thoroughly. Wire it to applications (status → scored). No ML."
- **Build Prompt 4 — Explainability, decision, portfolio.** "Add the factor-breakdown panel (top positive/negative factors, plain language), the approve/decline decision flow that records the input snapshot for audit, and a portfolio view (scored / issued / status)."
- **Build Prompt 5 — First live adapter.** "Replace the weather `MockAdapter` with a live implementation against a real weather API behind the same interface. Keep the others mocked."
- **Then P1 items** as the pilot needs them: repayment-outcome capture, parametric insurance recommendation, CSV batch scoring, SMS notifications.

---

## Tips for working with Claude Code on this

- **One phase per session, commit between them.** Small, reviewable chunks beat one giant build.
- **Hold the scope line.** If Claude Code starts adding lending, disbursement, ML, or a farmer app, point it back to the guardrails in CLAUDE.md.
- **Keep the score function pure.** It's the crown-jewel IP and the thing you'll later swap for ML — protect its isolation and its tests.
- **Update CLAUDE.md** whenever a decision changes, so future sessions inherit it.
- **Demo on mocks.** You'll have a fully demoable product (bootcamp-showable, pilot-pitchable) after Prompt 4 — before any external partnership or API key exists.
