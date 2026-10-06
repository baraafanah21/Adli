-- Phase F4: categories and staff, owner only; the last owner is protected. Run in the SQL Editor after
-- 20261007000500_admin_categories_staff.sql. One DO block ending in a deliberate exception: everything is rolled back.
-- Each line is one check; a line starting with FAIL is a failure.

do $t$
declare
  r text := '';
  st text;
  n int;
  owner1 uuid := gen_random_uuid();
  owner2 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  newbie uuid := gen_random_uuid();
  c_new uuid;
  v_owners int;
begin
  -- Real owners (if any) count towards «the last owner»; the test makes its own and checks relative to them.
  select count(*) into v_owners from public.user_roles where role = 'owner';

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1, 'authenticated', 'authenticated', 'f4-owner1@test.invalid', now(), now()),
    (owner2, 'authenticated', 'authenticated', 'f4-owner2@test.invalid', now(), now()),
    (staff,  'authenticated', 'authenticated', 'f4-staff@test.invalid',  now(), now()),
    (cust,   'authenticated', 'authenticated', 'f4-cust@test.invalid',   now(), now()),
    (newbie, 'authenticated', 'authenticated', 'F4-Newbie@Test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');

  -- anon, customer, staff: no owner function
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform * from public.admin_staff(); r := r || 'FAIL anon listed staff' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_staff refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_add_staff('f4-cust@test.invalid', 'owner'); r := r || 'FAIL customer made themselves owner' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_add_staff refused (' || sqlstate || ')' || E'\n'; end;
  begin
    insert into public.user_roles (user_id, role) values (cust, 'owner'); r := r || 'FAIL customer inserted a role directly' || E'\n';
  exception when insufficient_privilege then r := r || 'customer direct role insert refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.admin_staff(); r := r || 'FAIL staff listed staff' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_staff refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_add_staff('f4-cust@test.invalid', 'staff'); r := r || 'FAIL staff added staff' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_add_staff refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_update_staff(staff, 'owner', false); r := r || 'FAIL staff promoted themselves' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_update_staff (self → owner) refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_save_category(null, 'f4-staff-cat', 'فئة', 'gift', null, null, true); r := r || 'FAIL staff saved a category' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_save_category refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.categories set name_ar = 'x' where slug = 'caps'; r := r || 'FAIL staff updated a category directly' || E'\n';
  exception when insufficient_privilege then r := r || 'staff direct category update refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- owner
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- categories
  c_new := public.admin_save_category(null, 'f4-test-cat', 'فئة اختبار', 'gift', 'وصف قصير', null, false);
  r := r || 'new category sort: ' || (select sort from public.categories where id = c_new) || ' (after the last)' || E'\n';
  begin
    perform public.admin_save_category(null, 'f4-test-cat', 'مكرر', 'gift', null, null, true); r := r || 'FAIL duplicate category slug' || E'\n';
  exception when unique_violation then r := r || 'duplicate category slug refused (23505)' || E'\n'; end;
  begin
    perform public.admin_save_category(c_new, 'f4-test-cat', 'فئة', 'rocket', null, null, true); r := r || 'FAIL unknown icon accepted' || E'\n';
  exception when check_violation then r := r || 'unknown icon refused (23514)' || E'\n'; end;
  perform public.admin_save_category(c_new, 'f4-test-cat', 'فئة اختبار ٢', 'beard', null, 3, false);
  r := r || 'category after edit: ' || (select name_ar || ' ' || icon || ' ' || is_active::text from public.categories where id = c_new) || E'\n';

  -- staff (read through admin_staff(): RLS on user_roles shows each user only their own row)
  r := r || 'staff list: ' || (select count(*) from public.admin_staff()) || ' rows (' || (v_owners + 2) || ' expected)' || E'\n';
  begin
    perform public.admin_add_staff('nobody@test.invalid', 'staff'); r := r || 'FAIL unknown email added' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'unknown email: ' || st || ' (expect P0005)' || E'\n'; end;
  begin
    perform public.admin_add_staff('f4-staff@test.invalid', 'staff'); r := r || 'FAIL existing staff added twice' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'already staff: ' || st || ' (expect P0012)' || E'\n'; end;
  r := r || 'add by email (any case): ' || (public.admin_add_staff('  f4-newbie@test.INVALID ', 'staff', true) = newbie)::text || E'\n';
  r := r || 'newbie: ' || (select role::text || ' barber=' || is_barber::text || ' granted by ' || coalesce(granted_by_name, '?') from public.admin_staff() where user_id = newbie) || E'\n';
  perform public.admin_update_staff(newbie, 'staff', false);
  r := r || 'newbie barber after update: ' || (select is_barber::text from public.admin_staff() where user_id = newbie) || ' (expect false)' || E'\n';
  perform public.admin_remove_staff(newbie);
  r := r || 'newbie removed: ' || (not exists (select 1 from public.admin_staff() where user_id = newbie))::text || E'\n';
  reset role;

  -- the last owner (only checkable when the test's owner1 is the only owner)
  if v_owners = 0 then
    set local role authenticated;
    begin
      perform public.admin_update_staff(owner1, 'staff', false); r := r || 'FAIL last owner demoted' || E'\n';
    exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'demote last owner: ' || st || ' (expect P0003)' || E'\n'; end;
    begin
      perform public.admin_remove_staff(owner1); r := r || 'FAIL last owner removed' || E'\n';
    exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'remove last owner: ' || st || ' (expect P0003)' || E'\n'; end;
    perform public.admin_add_staff('f4-owner2@test.invalid', 'owner');
    perform public.admin_remove_staff(owner1);
    reset role;
    r := r || 'with a second owner, owner1 removed itself: ' || (not exists (select 1 from public.user_roles where user_id = owner1))::text || E'\n';
  else
    r := r || 'last-owner checks skipped: ' || v_owners || ' real owner(s) exist' || E'\n';
  end if;

  -- anon doesn't see the hidden category
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.categories where id = c_new; r := r || 'anon sees hidden category: ' || n || ' (expect 0)' || E'\n';
  reset role;

  raise exception E'F4 TESTS (rolled back)\n%', r;
end $t$;
