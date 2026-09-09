-- ===========================================================================
-- Row Level Security isolation test.
--
-- Two institutions, three users. Everything here is an assertion about what
-- one tenant CANNOT do to another. If any assertion fails the script aborts
-- with a non-zero exit status.
--
-- Run with supabase/tests/run.sh (see supabase/tests/README.md).
-- ===========================================================================

\set ON_ERROR_STOP on

-- --------------------------- fixtures (superuser) --------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@bank-a.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'officer@bank-a.test'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'admin@sacco-b.test');

create or replace function public.test_login(u uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, false);
end;
$$;

create or replace function public.test_logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
end;
$$;

grant execute on function public.test_login(uuid), public.test_logout() to authenticated, anon;

do $$
declare
  inst_a       uuid;
  inst_b       uuid;
  farmer_a     uuid;
  farmer_b     uuid;
  app_a        uuid;
  app_b        uuid;
  n            integer;
  blocked      boolean;
  admin_a      uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  officer_a    uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  admin_b      uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
begin
  ------------------------------------------------------------------------
  raise notice '--- onboarding ---';
  ------------------------------------------------------------------------
  execute 'set local role authenticated';

  perform public.test_login(admin_a);
  inst_a := public.create_institution('Bank A Microfinance');
  assert inst_a is not null, 'institution A should be created';
  assert public.current_institution_id() = inst_a, 'creator should be a member of A';
  assert public.current_user_role() = 'admin', 'creator should administer A';

  perform public.test_login(admin_b);
  inst_b := public.create_institution('SACCO B');
  assert inst_b is not null, 'institution B should be created';
  assert inst_a <> inst_b, 'institutions must be distinct';

  -- A user who already belongs somewhere cannot stand up a second tenant.
  perform public.test_login(admin_a);
  blocked := false;
  begin
    perform public.create_institution('Bank A Second Attempt');
  exception when others then
    blocked := true;
  end;
  assert blocked, 'a user with a membership must not create another institution';

  -- Invite + claim is the only route into an existing institution.
  insert into public.institution_invites (institution_id, email, role, created_by)
  values (inst_a, 'officer@bank-a.test', 'officer', admin_a);

  perform public.test_login(officer_a);
  assert public.claim_invite() = inst_a, 'invited officer should join institution A';
  assert public.current_user_role() = 'officer', 'invited officer keeps the invited role';

  ------------------------------------------------------------------------
  raise notice '--- each tenant creates its own data ---';
  ------------------------------------------------------------------------
  perform public.test_login(officer_a);
  insert into public.farmers
    (institution_id, name, phone, location_lat, location_lng,
     farm_size_ha, primary_crop, created_by)
  values (inst_a, 'Wanjiku Kamau', '+254712345678', -0.4237, 36.9476,
          1.20, 'maize', officer_a)
  returning id into farmer_a;

  insert into public.applications
    (institution_id, farmer_id, status, consent_given, consent_at, created_by)
  values (inst_a, farmer_a, 'submitted', true, now(), officer_a)
  returning id into app_a;

  perform public.test_login(admin_b);
  insert into public.farmers
    (institution_id, name, phone, location_lat, location_lng,
     farm_size_ha, primary_crop, created_by)
  values (inst_b, 'Otieno Omondi', '+254798765432', -0.0917, 34.7680,
          2.50, 'sorghum', admin_b)
  returning id into farmer_b;

  insert into public.applications
    (institution_id, farmer_id, status, consent_given, consent_at, created_by)
  values (inst_b, farmer_b, 'submitted', true, now(), admin_b)
  returning id into app_b;

  ------------------------------------------------------------------------
  raise notice '--- reads are confined to the caller''s own institution ---';
  ------------------------------------------------------------------------
  perform public.test_login(officer_a);

  select count(*) into n from public.farmers;
  assert n = 1, format('A should see exactly its own 1 farmer, saw %s', n);

  select count(*) into n from public.farmers where id = farmer_b;
  assert n = 0, 'A must not see B''s farmer even by direct id';

  select count(*) into n from public.applications where id = app_b;
  assert n = 0, 'A must not see B''s application even by direct id';

  select count(*) into n from public.institutions;
  assert n = 1, format('A should see only its own institution, saw %s', n);

  select count(*) into n from public.users;
  assert n = 2, format('A should see only its own 2 members, saw %s', n);

  ------------------------------------------------------------------------
  raise notice '--- writes cannot cross the tenant boundary ---';
  ------------------------------------------------------------------------

  -- Planting a row directly into another tenant.
  blocked := false;
  begin
    insert into public.farmers
      (institution_id, name, phone, location_lat, location_lng,
       farm_size_ha, primary_crop, created_by)
    values (inst_b, 'Injected Farmer', '+254700000001', -0.09, 34.76,
            1.0, 'maize', officer_a);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'A must not insert a farmer into institution B';

  -- Attaching one's own application to another tenant's farmer.
  blocked := false;
  begin
    insert into public.applications
      (institution_id, farmer_id, status, consent_given, consent_at, created_by)
    values (inst_a, farmer_b, 'submitted', true, now(), officer_a);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'A must not attach an application to B''s farmer';

  -- Forging created_by to look like someone else.
  blocked := false;
  begin
    insert into public.farmers
      (institution_id, name, phone, location_lat, location_lng,
       farm_size_ha, primary_crop, created_by)
    values (inst_a, 'Forged Author', '+254700000002', -0.42, 36.94,
            1.0, 'maize', admin_b);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'created_by must be the caller';

  -- Updates and deletes silently match nothing rather than reaching across.
  update public.farmers set name = 'Hijacked' where id = farmer_b;
  get diagnostics n = row_count;
  assert n = 0, 'A must not update B''s farmer';

  update public.applications set status = 'approved' where id = app_b;
  get diagnostics n = row_count;
  assert n = 0, 'A must not update B''s application';

  -- Moving one's own row into another tenant. Unlike the cases above this
  -- one raises rather than matching nothing: the USING clause admits the row
  -- (A owns it) and the WITH CHECK clause then rejects the new tenant.
  blocked := false;
  begin
    update public.farmers set institution_id = inst_b where id = farmer_a;
  exception when others then
    blocked := true;
  end;
  assert blocked, 'A must not move its own farmer into institution B';

  ------------------------------------------------------------------------
  raise notice '--- decisions are an append-only audit trail ---';
  ------------------------------------------------------------------------
  insert into public.decisions
    (institution_id, application_id, decision, loan_amount, loan_term,
     officer_notes, input_snapshot, decided_by)
  values (inst_a, app_a, 'approve', 25000.00, 6, 'Strong vegetation trend.',
          '{"score": 712}'::jsonb, officer_a);

  update public.decisions set loan_amount = 999999 where application_id = app_a;
  get diagnostics n = row_count;
  assert n = 0, 'a recorded decision must not be editable';

  delete from public.decisions where application_id = app_a;
  get diagnostics n = row_count;
  assert n = 0, 'a recorded decision must not be deletable';

  ------------------------------------------------------------------------
  raise notice '--- consent and terms constraints ---';
  ------------------------------------------------------------------------
  blocked := false;
  begin
    insert into public.applications
      (institution_id, farmer_id, status, consent_given, created_by)
    values (inst_a, farmer_a, 'submitted', false, officer_a);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'an application must not leave draft without consent';

  blocked := false;
  begin
    insert into public.applications
      (institution_id, farmer_id, status, consent_given, consent_at, created_by)
    values (inst_a, farmer_a, 'draft', true, null, officer_a);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'consent must carry a timestamp';

  blocked := false;
  begin
    insert into public.decisions
      (institution_id, application_id, decision, decided_by)
    values (inst_a, app_a, 'approve', officer_a);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'an approval must state an amount and a term';

  ------------------------------------------------------------------------
  raise notice '--- role gates ---';
  ------------------------------------------------------------------------
  -- An officer is not an admin and cannot mint invites.
  blocked := false;
  begin
    insert into public.institution_invites (institution_id, email, role, created_by)
    values (inst_a, 'someone@bank-a.test', 'officer', officer_a);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'an officer must not create invites';

  ------------------------------------------------------------------------
  raise notice '--- an unauthenticated caller sees nothing ---';
  ------------------------------------------------------------------------
  perform public.test_logout();
  select count(*) into n from public.farmers;
  assert n = 0, 'a caller with no identity must see no farmers';
  select count(*) into n from public.applications;
  assert n = 0, 'a caller with no identity must see no applications';

  raise notice 'ALL RLS ISOLATION ASSERTIONS PASSED';
end;
$$;

-- The anon role has no table privileges at all, so it fails earlier than RLS.
set role anon;
do $$
declare denied boolean := false;
begin
  begin
    perform 1 from public.farmers limit 1;
  exception when insufficient_privilege then
    denied := true;
  end;
  assert denied, 'the anon role must not reach domain tables';
  raise notice 'ANON PRIVILEGE ASSERTION PASSED';
end;
$$;
reset role;
