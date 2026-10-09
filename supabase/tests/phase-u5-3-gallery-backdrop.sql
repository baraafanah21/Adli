-- «خلفية» (20261011000000_gallery_backdrop.sql): only the owner marks a photo as the section's background; a video
-- can't be one; anon and a plain customer read the flag of published rows only and can't set it.
-- Run in the SQL Editor after the migration. One DO block ending in a deliberate exception: everything is rolled
-- back. Each line is one check; a line starting with FAIL is a failure.

do $t$
declare
  r text := '';
  n int;
  b boolean;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  img uuid := gen_random_uuid();
  draft uuid := gen_random_uuid();
  vid uuid := gen_random_uuid();
  f uuid := gen_random_uuid();
  as_owner text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1,   'authenticated', 'authenticated', 'bd-owner@test.invalid', now(), now()),
    (staff,    'authenticated', 'authenticated', 'bd-staff@test.invalid', now(), now()),
    (customer, 'authenticated', 'authenticated', 'bd-customer@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');
  as_owner := json_build_object('sub', owner1, 'role', 'authenticated')::text;

  -- The owner: a published photo, a hidden photo, a published video --------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  perform public.admin_gallery_add(img, 'image', '9:16', img || '/' || f || '.webp', null, img || '/' || f || '.sm.webp', 1200, 1600, null, 300000);
  perform public.admin_gallery_add(draft, 'image', '4:5', draft || '/' || f || '.webp', null, draft || '/' || f || '.sm.webp', 1280, 1600, null, 300000);
  perform public.admin_gallery_add(vid, 'video', '9:16', vid || '/' || f || '.mp4', vid || '/' || f || '.webp', vid || '/' || f || '.sm.webp', 720, 1280, 8000, 900000);
  perform public.admin_gallery_set_published(img, true);
  perform public.admin_gallery_set_published(vid, true);

  select g.is_backdrop into b from public.admin_gallery_items() g where g.id = img;
  r := r || 'a new item is not a backdrop: ' || (b = false) || ' (expect true)' || E'\n';
  perform public.admin_gallery_set_backdrop(img, true);
  perform public.admin_gallery_set_backdrop(draft, true);
  select g.is_backdrop into b from public.admin_gallery_items() g where g.id = img;
  r := r || 'owner marks a photo: ' || b || ' (expect true)' || E'\n';
  begin
    perform public.admin_gallery_set_backdrop(vid, true);
    r := r || 'FAIL a video became a backdrop' || E'\n';
  exception when sqlstate 'P0037' then r := r || 'video as backdrop refused (P0037)' || E'\n'; end;
  perform public.admin_gallery_set_backdrop(vid, false);
  r := r || 'unmarking a video (no-op) allowed' || E'\n';
  begin
    perform public.admin_gallery_set_backdrop(gen_random_uuid(), true);
    r := r || 'FAIL an unknown id was marked' || E'\n';
  exception when sqlstate 'P0006' then r := r || 'unknown id refused (P0006)' || E'\n'; end;
  reset role;

  -- The table itself refuses a video backdrop (even from the SQL Editor) ---------------------------------------------
  begin
    update public.gallery_items set is_backdrop = true where id = vid;
    r := r || 'FAIL table took a video backdrop' || E'\n';
  exception when check_violation then r := r || 'table: video backdrop refused (23514)' || E'\n'; end;

  -- Staff and a plain customer can't set it ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_gallery_set_backdrop(img, false);
    r := r || 'FAIL staff changed a backdrop' || E'\n';
  exception when others then r := r || 'staff refused (' || sqlstate || ')' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', customer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_gallery_set_backdrop(img, false);
    r := r || 'FAIL a customer changed a backdrop' || E'\n';
  exception when others then r := r || 'customer refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.gallery_items set is_backdrop = false where id = img;
    get diagnostics n = row_count;
    r := r || case when n = 0 then 'customer direct update: no rows' else 'FAIL customer updated the table' end || E'\n';
  exception when insufficient_privilege then r := r || 'customer direct update refused (42501)' || E'\n'; end;
  select count(*) into n from public.gallery_items where is_backdrop;
  r := r || 'customer reads published backdrops: ' || n || ' (expect 1, the hidden one not seen)' || E'\n';
  reset role;

  -- anon: reads the flag of published rows ----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.gallery_items where is_backdrop;
  r := r || 'anon reads published backdrops: ' || n || ' (expect 1)' || E'\n';
  begin
    perform public.admin_gallery_set_backdrop(img, false);
    r := r || 'FAIL anon changed a backdrop' || E'\n';
  exception when insufficient_privilege then r := r || 'anon refused (42501)' || E'\n'; end;
  reset role;

  raise exception E'GALLERY BACKDROP TESTS (rolled back)\n%', r;
end $t$;
