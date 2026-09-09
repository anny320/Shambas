-- ===========================================================================
-- Shamba Score — initial schema
--
-- Design notes that matter:
--
--  * MULTI-TENANCY. Every domain row carries institution_id and every table
--    has Row Level Security enabled with FORCE, so isolation holds even for
--    the table owner. A signed-in user can only ever reach rows belonging to
--    their own institution.
--
--  * DATA MINIMISATION (Kenya DPA 2019). There is deliberately no column for
--    a national ID, government ID, or financial account number. Do not add
--    one. Only what scoring needs is stored: name, phone, farm location,
--    farm size, crop.
--
--  * FORWARD COMPATIBILITY. `scores` and `repayment_outcomes` will hang off
--    applications.id later. Nothing here needs to change when they land.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('officer', 'head_of_credit', 'admin');

create type public.application_status as enum (
  'draft', 'submitted', 'scored', 'approved', 'declined'
);

create type public.decision_type as enum ('approve', 'decline');

-- ---------------------------------------------------------------------------
-- institutions
-- ---------------------------------------------------------------------------

create table public.institutions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 2 and 200),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users — one row per authenticated user, binding them to an institution.
-- id is the Supabase auth user id.
-- ---------------------------------------------------------------------------

create table public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete restrict,
  email          text not null,
  role           public.user_role not null default 'officer',
  created_at     timestamptz not null default now()
);

create index users_institution_id_idx on public.users (institution_id);

-- ---------------------------------------------------------------------------
-- Tenant helper.
--
-- SECURITY DEFINER so it can read public.users without tripping the RLS
-- policy that is itself defined in terms of this function. Without this the
-- users policy would recurse. search_path is pinned so the function body
-- cannot be hijacked by a caller-controlled search_path.
-- ---------------------------------------------------------------------------

create or replace function public.current_institution_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select institution_id from public.users where id = auth.uid();
$$;

revoke all on function public.current_institution_id() from public;
grant execute on function public.current_institution_id() to authenticated;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.users where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- ---------------------------------------------------------------------------
-- farmers
-- ---------------------------------------------------------------------------

create table public.farmers (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name           text not null check (length(btrim(name)) between 2 and 200),
  -- Kenyan MSISDN in E.164, e.g. +254712345678.
  phone          text not null check (phone ~ '^\+254[17][0-9]{8}$'),
  location_lat   double precision not null check (location_lat between -90 and 90),
  location_lng   double precision not null check (location_lng between -180 and 180),
  farm_size_ha   numeric(8, 3) not null check (farm_size_ha > 0 and farm_size_ha <= 1000),
  primary_crop   text not null check (length(btrim(primary_crop)) between 2 and 60),
  created_by     uuid not null references auth.users (id) on delete restrict,
  created_at     timestamptz not null default now()
);

create index farmers_institution_id_idx on public.farmers (institution_id);
create index farmers_institution_created_idx
  on public.farmers (institution_id, created_at desc);

-- The same phone must not be enrolled twice inside one institution. Across
-- institutions it may repeat: tenants are isolated and must not be able to
-- probe each other's rosters.
create unique index farmers_institution_phone_key
  on public.farmers (institution_id, phone);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  farmer_id      uuid not null references public.farmers (id) on delete cascade,
  status         public.application_status not null default 'draft',
  consent_given  boolean not null default false,
  consent_at     timestamptz,
  created_by     uuid not null references auth.users (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Consent is not optional and not backdatable by omission: if consent is
  -- given it carries a timestamp, and if it is not, no timestamp may exist.
  constraint applications_consent_timestamped check (
    (consent_given and consent_at is not null)
    or (not consent_given and consent_at is null)
  ),

  -- Nothing may leave 'draft' without recorded consent. This is the database
  -- backstop for the rule the intake form also enforces.
  constraint applications_requires_consent check (
    status = 'draft' or consent_given
  )
);

create index applications_institution_id_idx on public.applications (institution_id);
create index applications_farmer_id_idx on public.applications (farmer_id);
create index applications_institution_created_idx
  on public.applications (institution_id, created_at desc);

-- ---------------------------------------------------------------------------
-- decisions — the audit trail. input_snapshot captures exactly what the
-- officer was looking at when they decided.
-- ---------------------------------------------------------------------------

create table public.decisions (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  decision       public.decision_type not null,
  loan_amount    numeric(14, 2) check (loan_amount is null or loan_amount > 0),
  loan_term      integer check (loan_term is null or (loan_term > 0 and loan_term <= 60)),
  officer_notes  text check (officer_notes is null or length(officer_notes) <= 4000),
  input_snapshot jsonb not null default '{}'::jsonb,
  decided_by     uuid not null references auth.users (id) on delete restrict,
  decided_at     timestamptz not null default now(),

  -- An approval has to say how much and for how long. A decline must not.
  constraint decisions_terms_match_outcome check (
    (decision = 'approve' and loan_amount is not null and loan_term is not null)
    or (decision = 'decline' and loan_amount is null and loan_term is null)
  )
);

create index decisions_institution_id_idx on public.decisions (institution_id);
create unique index decisions_application_id_key on public.decisions (application_id);

-- ---------------------------------------------------------------------------
-- institution_invites — how a second user joins an existing institution.
-- An invite is claimed on first login by matching the signed-in email.
-- ---------------------------------------------------------------------------

create table public.institution_invites (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  email          text not null check (position('@' in email) > 1),
  role           public.user_role not null default 'officer',
  created_by     uuid not null references auth.users (id) on delete restrict,
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz
);

create unique index institution_invites_pending_email_key
  on public.institution_invites (lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_touch_updated_at
  before update on public.applications
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Row Level Security
--
-- Every policy is written against public.current_institution_id(), which
-- returns NULL for a user with no membership row. Because `x = NULL` is NULL
-- and never TRUE, an unprovisioned or anonymous user matches nothing. The
-- default is denial, and access is the exception.
--
-- FORCE is set so that even the table owner is subject to these policies.
-- ===========================================================================

alter table public.institutions        enable row level security;
alter table public.users               enable row level security;
alter table public.farmers             enable row level security;
alter table public.applications        enable row level security;
alter table public.decisions           enable row level security;
alter table public.institution_invites enable row level security;

alter table public.institutions        force row level security;
alter table public.users               force row level security;
alter table public.farmers             force row level security;
alter table public.applications        force row level security;
alter table public.decisions           force row level security;
alter table public.institution_invites force row level security;

-- No implicit access for anonymous callers anywhere.
revoke all on all tables in schema public from anon;

-- --------------------------- institutions ---------------------------------
-- Readable only by its own members. Creation goes through
-- public.create_institution(); renaming is an admin action. Nobody deletes an
-- institution through the API.

create policy institutions_select_own on public.institutions
  for select to authenticated
  using (id = public.current_institution_id());

create policy institutions_update_admin on public.institutions
  for update to authenticated
  using (id = public.current_institution_id() and public.current_user_role() = 'admin')
  with check (id = public.current_institution_id());

-- ------------------------------- users ------------------------------------
-- A user sees their colleagues, not other tenants. Only an admin may change
-- a role, and only inside their own institution. Nobody — admin included —
-- writes institution_id directly; membership is created by the SECURITY
-- DEFINER onboarding functions below.

create policy users_select_own_institution on public.users
  for select to authenticated
  using (institution_id = public.current_institution_id());

create policy users_update_role_admin on public.users
  for update to authenticated
  using (
    institution_id = public.current_institution_id()
    and public.current_user_role() = 'admin'
  )
  with check (institution_id = public.current_institution_id());

-- ------------------------------ farmers -----------------------------------

create policy farmers_select_own_institution on public.farmers
  for select to authenticated
  using (institution_id = public.current_institution_id());

create policy farmers_insert_own_institution on public.farmers
  for insert to authenticated
  with check (
    institution_id = public.current_institution_id()
    and created_by = auth.uid()
  );

create policy farmers_update_own_institution on public.farmers
  for update to authenticated
  using (institution_id = public.current_institution_id())
  with check (institution_id = public.current_institution_id());

-- ---------------------------- applications --------------------------------
-- Note the WITH CHECK on the farmer: it stops an officer from attaching an
-- application to a farmer id belonging to another tenant, which the
-- institution_id column alone would not catch.

create policy applications_select_own_institution on public.applications
  for select to authenticated
  using (institution_id = public.current_institution_id());

create policy applications_insert_own_institution on public.applications
  for insert to authenticated
  with check (
    institution_id = public.current_institution_id()
    and created_by = auth.uid()
    and exists (
      select 1 from public.farmers f
      where f.id = farmer_id
        and f.institution_id = public.current_institution_id()
    )
  );

create policy applications_update_own_institution on public.applications
  for update to authenticated
  using (institution_id = public.current_institution_id())
  with check (institution_id = public.current_institution_id());

-- ----------------------------- decisions ----------------------------------
-- Decisions are the audit trail, so they are insert-and-read only. There is
-- deliberately no update or delete policy: a recorded decision cannot be
-- edited or erased through the API by anyone, including an admin.

create policy decisions_select_own_institution on public.decisions
  for select to authenticated
  using (institution_id = public.current_institution_id());

create policy decisions_insert_own_institution on public.decisions
  for insert to authenticated
  with check (
    institution_id = public.current_institution_id()
    and decided_by = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.institution_id = public.current_institution_id()
    )
  );

-- ------------------------- institution_invites ----------------------------
-- Only admins and heads of credit manage invites, and only for their own
-- institution. Invitees do not read this table; the claim path below runs
-- with definer rights.

create policy invites_select_own_institution on public.institution_invites
  for select to authenticated
  using (institution_id = public.current_institution_id());

create policy invites_insert_admin on public.institution_invites
  for insert to authenticated
  with check (
    institution_id = public.current_institution_id()
    and created_by = auth.uid()
    and public.current_user_role() in ('admin', 'head_of_credit')
  );

create policy invites_delete_admin on public.institution_invites
  for delete to authenticated
  using (
    institution_id = public.current_institution_id()
    and public.current_user_role() in ('admin', 'head_of_credit')
    and accepted_at is null
  );

-- ===========================================================================
-- Onboarding
--
-- A freshly signed-up user has an auth identity but no membership row, so
-- current_institution_id() is NULL and they can see nothing at all. These two
-- SECURITY DEFINER functions are the only way a membership row is created.
-- Both refuse to act if the caller already belongs somewhere, so neither can
-- be used to move between tenants.
-- ===========================================================================

create or replace function public.create_institution(institution_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id    uuid := auth.uid();
  caller_email text;
  new_id       uuid;
begin
  if caller_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.users where id = caller_id) then
    raise exception 'user already belongs to an institution' using errcode = '23505';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  insert into public.institutions (name)
  values (btrim(institution_name))
  returning id into new_id;

  -- Whoever stands the institution up administers it.
  insert into public.users (id, institution_id, email, role)
  values (caller_id, new_id, caller_email, 'admin');

  return new_id;
end;
$$;

revoke all on function public.create_institution(text) from public;
grant execute on function public.create_institution(text) to authenticated;

-- Claims a pending invite matching the caller's verified email address.
-- Returns the institution joined, or NULL when there is no invite waiting.
create or replace function public.claim_invite()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id    uuid := auth.uid();
  caller_email text;
  invite       public.institution_invites%rowtype;
begin
  if caller_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.users where id = caller_id) then
    return public.current_institution_id();
  end if;

  select email into caller_email from auth.users where id = caller_id;
  if caller_email is null then
    return null;
  end if;

  select * into invite
  from public.institution_invites
  where lower(email) = lower(caller_email)
    and accepted_at is null
  order by created_at
  limit 1
  for update;

  if not found then
    return null;
  end if;

  insert into public.users (id, institution_id, email, role)
  values (caller_id, invite.institution_id, caller_email, invite.role);

  update public.institution_invites
  set accepted_at = now()
  where id = invite.id;

  return invite.institution_id;
end;
$$;

revoke all on function public.claim_invite() from public;
grant execute on function public.claim_invite() to authenticated;
