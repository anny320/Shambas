-- ===========================================================================
-- Local-only stand-in for the parts of Supabase that the migrations depend
-- on: the auth schema, auth.uid(), and the anon / authenticated roles.
--
-- This file is NEVER applied to a Supabase project — Supabase provides all of
-- it already. It exists so the Row Level Security policies can be exercised
-- against a real Postgres locally. See supabase/tests/README.md.
-- ===========================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the authenticated user id out of the request's JWT claims,
-- which arrive as a GUC. Impersonating a user in a test is therefore just a
-- matter of setting that GUC.
-- The empty string is nullified BEFORE the jsonb cast, so a request with no
-- claims yields NULL rather than a parse error.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated;

-- Supabase grants table privileges to these roles by default; RLS is what
-- actually constrains them. Mirror that so the policies are what we test.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
