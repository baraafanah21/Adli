-- Storage SELECT policies (20261010000000_storage_select_policies.sql): who may see (and so remove) which files.
-- Run in the SQL Editor after the migration. One DO block ending in a deliberate exception: everything is rolled back
-- (the storage.objects rows below are metadata only; no file is touched). A line starting with FAIL is a failure.
--
-- Roles: anon, a customer (signed in, no role), staff, the owner.
--
-- Note: on Supabase a trigger (storage.protect_delete) refuses a direct DELETE on storage.objects, so that files are
-- removed through the Storage API (which also removes the file itself). The delete checks below set
-- storage.allow_delete_query for this transaction only; the policies (RLS) are still what decides.

do $t$
declare
  r text := '';
  n int;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  tag text := 'u53-select-' || substr(md5(random()::text), 1, 8); -- this run's own folder in each bucket
  as_role text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1,   'authenticated', 'authenticated', tag || '-owner@test.invalid', now(), now()),
    (staff,    'authenticated', 'authenticated', tag || '-staff@test.invalid', now(), now()),
    (customer, 'authenticated', 'authenticated', tag || '-customer@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');

  -- Two files in each bucket, under this run's folder (as the table owner: metadata rows only).
  insert into storage.objects (bucket_id, name) values
    ('gallery', tag || '/a.webp'), ('gallery', tag || '/a.sm.webp'),
    ('products', tag || '/b.webp'), ('products', tag || '/b.sm.webp');

  -- The owner: both buckets.
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'gallery' and name like tag || '/%';
  r := r || case when n = 2 then '' else 'FAIL ' end || 'owner sees gallery files: ' || n || ' (expect 2)' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'products' and name like tag || '/%';
  r := r || case when n = 2 then '' else 'FAIL ' end || 'owner sees product files: ' || n || ' (expect 2)' || E'\n';
  reset role;

  -- Staff: product files yes (an admin), gallery files no (owner only).
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'products' and name like tag || '/%';
  r := r || case when n = 2 then '' else 'FAIL ' end || 'staff sees product files: ' || n || ' (expect 2)' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'gallery' and name like tag || '/%';
  r := r || case when n = 0 then '' else 'FAIL ' end || 'staff sees gallery files: ' || n || ' (expect 0)' || E'\n';
  reset role;

  -- A customer: neither.
  perform set_config('request.jwt.claims', json_build_object('sub', customer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'gallery' and name like tag || '/%';
  r := r || case when n = 0 then '' else 'FAIL ' end || 'customer sees gallery files: ' || n || ' (expect 0)' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'products' and name like tag || '/%';
  r := r || case when n = 0 then '' else 'FAIL ' end || 'customer sees product files: ' || n || ' (expect 0)' || E'\n';
  reset role;

  -- anon: neither (the public URL still serves the files; it doesn't go through these rows).
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into n from storage.objects where name like tag || '/%';
    r := r || case when n = 0 then '' else 'FAIL ' end || 'anon sees files: ' || n || ' (expect 0)' || E'\n';
  exception when insufficient_privilege then
    r := r || 'anon sees files: refused (42501) (expect 0 or refused)' || E'\n';
  end;
  reset role;

  -- The delete policies are unchanged: staff still can't delete gallery files; the owner can.
  -- Supabase's storage.protect_delete trigger refuses a direct DELETE on storage.objects unless this is set (local to
  -- the transaction; RLS still decides which rows each role may delete).
  perform set_config('storage.allow_delete_query', 'true', true);
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from storage.objects where bucket_id = 'gallery' and name like tag || '/%';
  get diagnostics n = row_count;
  r := r || case when n = 0 then '' else 'FAIL ' end || 'staff deletes gallery files: ' || n || ' (expect 0)' || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from storage.objects where bucket_id = 'gallery' and name like tag || '/%';
  get diagnostics n = row_count;
  r := r || case when n = 2 then '' else 'FAIL ' end || 'owner deletes gallery files: ' || n || ' (expect 2)' || E'\n';
  reset role;

  raise exception E'STORAGE SELECT TESTS (rolled back)\n%', r;
end $t$;
