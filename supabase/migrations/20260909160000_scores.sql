-- ===========================================================================
-- Scores
--
-- One row per scoring run. Runs are kept rather than overwritten: an
-- application scored again after more evidence arrives keeps its earlier
-- assessment, so the audit trail shows what was known when.
--
-- The feature snapshot is stored alongside the result. Without it a score is
-- unauditable — you could see what the model concluded but never what it was
-- looking at, which is exactly what a regulator asks for.
-- ===========================================================================

create type public.risk_band as enum (
  'very-low', 'low', 'moderate', 'high', 'very-high'
);

create type public.confidence_level as enum ('high', 'medium', 'low');

create table public.scores (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,

  score          integer not null check (score between 300 and 850),
  band           public.risk_band not null,
  -- Probability of default over the recommended term, 0 to 1.
  pd             numeric(6, 5) not null check (pd >= 0 and pd <= 1),

  confidence       public.confidence_level not null,
  confidence_value numeric(4, 3) not null check (confidence_value between 0 and 1),

  -- Null when the evidence was too thin, or the risk too high, to recommend
  -- terms. Null means "decide by hand", not "decline".
  recommended_amount numeric(14, 2)
    check (recommended_amount is null or recommended_amount > 0),
  recommended_term_months integer
    check (recommended_term_months is null or recommended_term_months between 1 and 60),

  -- The explanation, exactly as shown to the officer.
  factors  jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,

  -- What the model was looking at, and which model it was.
  feature_snapshot jsonb not null,
  model_version    text not null,

  scored_by uuid not null references auth.users (id) on delete restrict,
  scored_at timestamptz not null default now(),

  -- An amount without a term, or the reverse, is not a usable recommendation.
  constraint scores_terms_complete check (
    (recommended_amount is null and recommended_term_months is null)
    or (recommended_amount is not null and recommended_term_months is not null)
  )
);

create index scores_institution_id_idx on public.scores (institution_id);
create index scores_application_id_idx
  on public.scores (application_id, scored_at desc);

alter table public.scores enable row level security;
alter table public.scores force row level security;

-- Same shape as every other domain table: readable and insertable only within
-- the caller's own institution. Like decisions, a score is a record of what
-- happened and carries no update or delete policy.
create policy scores_select_own_institution on public.scores
  for select to authenticated
  using (institution_id = public.current_institution_id());

create policy scores_insert_own_institution on public.scores
  for insert to authenticated
  with check (
    institution_id = public.current_institution_id()
    and scored_by = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.institution_id = public.current_institution_id()
    )
  );

revoke all on public.scores from anon;
