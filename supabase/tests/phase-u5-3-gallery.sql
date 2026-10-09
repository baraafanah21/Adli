-- U5.3 gallery (owner only): who reads what, who writes nothing, the featured rules, order, delete, the limits.
-- Run in the SQL Editor after 20261009000000_gallery.sql. One DO block ending in a deliberate exception: everything is
-- rolled back. Each line is one check; a line starting with FAIL is a failure.
--
-- Roles: anon, a customer (signed in, no role), staff (a role, not the owner), the owner.

do $t$
declare
  r text := '';
  n int;
  res jsonb;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  img uuid := gen_random_uuid();
  vid1 uuid := gen_random_uuid();
  vid2 uuid := gen_random_uuid();
  vid3 uuid := gen_random_uuid();
  draft uuid := gen_random_uuid();
  as_owner text;
  who uuid;
  ids uuid[];
  f uuid := gen_random_uuid(); -- a file name
  p_img text;
  p_vid text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1,   'authenticated', 'authenticated', 'u53-owner@test.invalid', now(), now()),
    (staff,    'authenticated', 'authenticated', 'u53-staff@test.invalid', now(), now()),
    (customer, 'authenticated', 'authenticated', 'u53-customer@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');
  as_owner := json_build_object('sub', owner1, 'role', 'authenticated')::text;

  -- The owner adds a photo, three videos and a draft ---------------------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  perform public.admin_gallery_add(img, 'image', '4:5', img || '/' || f || '.webp', null, img || '/' || f || '.sm.webp', 1600, 2000, null, 300000);
  perform public.admin_gallery_add(vid1, 'video', '9:16', vid1 || '/' || f || '.mp4', vid1 || '/' || f || '.webp', vid1 || '/' || f || '.sm.webp', 720, 1280, 8400, 650000);
  perform public.admin_gallery_add(vid2, 'video', '9:16', vid2 || '/' || f || '.mp4', vid2 || '/' || f || '.webp', vid2 || '/' || f || '.sm.webp', 720, 1280, 15000, 2000000);
  perform public.admin_gallery_add(vid3, 'video', '1:1', vid3 || '/' || f || '.mp4', vid3 || '/' || f || '.webp', vid3 || '/' || f || '.sm.webp', 720, 720, 20000, 5 * 1024 * 1024);
  perform public.admin_gallery_add(draft, 'image', '1:1', draft || '/' || f || '.webp', null, draft || '/' || f || '.sm.webp', 1600, 1600, null, 1000);
  perform public.admin_gallery_set_published(img, true);
  perform public.admin_gallery_set_published(vid1, true);
  perform public.admin_gallery_set_published(vid2, true);
  perform public.admin_gallery_set_published(vid3, true);
  select count(*) into n from public.admin_gallery_items(); r := r || 'owner sees every item: ' || n || ' (expect 5)' || E'\n';
  select string_agg(g.id::text, ',' order by g.sort_order) into p_img from public.admin_gallery_items() g;
  r := r || 'new items go last: ' || (p_img = concat_ws(',', img, vid1, vid2, vid3, draft)) || ' (expect true)' || E'\n';
  reset role;
  select created_by into who from public.gallery_items where id = img;
  r := r || 'created_by is the owner: ' || (who = owner1) || ' (expect true)' || E'\n';

  -- The limits (owner, through the function) -----------------------------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  begin
    perform public.admin_gallery_add(gen_random_uuid(), 'video', '9:16', 'x', 'y', 'z', 720, 1280, 20001, 1000);
    r := r || 'FAIL a 20.001 s video was added' || E'\n';
  exception when sqlstate 'P0035' then r := r || 'video over 20 s refused (P0035)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(gen_random_uuid(), 'video', '9:16', 'x', 'y', 'z', 720, 1280, null, 1000);
    r := r || 'FAIL a video without a duration was added' || E'\n';
  exception when sqlstate 'P0035' then r := r || 'video without a duration refused (P0035)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(gen_random_uuid(), 'image', '4:5', 'x', null, 'z', 1600, 2000, null, 5 * 1024 * 1024 + 1);
    r := r || 'FAIL a file over 5 MB was added' || E'\n';
  exception when sqlstate 'P0036' then r := r || 'file over 5 MB refused (P0036)' || E'\n'; end;
  p_vid := gen_random_uuid()::text;
  begin
    perform public.admin_gallery_add(p_vid::uuid, 'image', '4:5', img || '/' || f || '.webp', null, p_vid || '/' || f || '.sm.webp', 1600, 2000, null, 1000);
    r := r || 'FAIL a file under another item''s folder was recorded' || E'\n';
  exception when sqlstate 'P0034' then r := r || 'path outside the item''s folder refused (P0034)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(p_vid::uuid, 'image', '4:5', p_vid || '/' || f || '.mp4', null, p_vid || '/' || f || '.sm.webp', 1600, 2000, null, 1000);
    r := r || 'FAIL a photo recorded as an .mp4' || E'\n';
  exception when sqlstate 'P0034' then r := r || 'photo with a video file refused (P0034)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(p_vid::uuid, 'video', '9:16', p_vid || '/' || f || '.mp4', null, p_vid || '/' || f || '.sm.webp', 720, 1280, 5000, 1000);
    r := r || 'FAIL a video without a poster was added' || E'\n';
  exception when sqlstate 'P0034' then r := r || 'video without a poster refused (P0034)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(p_vid::uuid, 'image', '16:9', p_vid || '/' || f || '.webp', null, p_vid || '/' || f || '.sm.webp', 1600, 900, null, 1000);
    r := r || 'FAIL an aspect outside 9:16 / 4:5 / 1:1' || E'\n';
  exception when sqlstate '22023' then r := r || 'aspect 16:9 refused (22023)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(p_vid::uuid, 'image', '4:5', p_vid || '/' || f || '.webp', null, p_vid || '/' || f || '.sm.webp', 0, 2000, null, 1000);
    r := r || 'FAIL a zero width was accepted' || E'\n';
  exception when check_violation then r := r || 'zero width refused (23514)' || E'\n'; end;

  -- Featured: one video, published; moved in one call; unpublishing takes it away --------------------------------
  perform public.admin_gallery_set_featured(vid1);
  select count(*) into n from public.gallery_items where is_featured; r := r || 'featured after set: ' || n || ' (expect 1)' || E'\n';
  perform public.admin_gallery_set_featured(vid2);
  select string_agg(id::text, ',') into p_img from public.gallery_items where is_featured;
  r := r || 'featuring moved to the second video: ' || (p_img = vid2::text) || ' (expect true)' || E'\n';
  begin
    perform public.admin_gallery_set_featured(img); r := r || 'FAIL a photo was featured' || E'\n';
  exception when sqlstate 'P0031' then r := r || 'photo featured refused (P0031)' || E'\n'; end;
  begin
    perform public.admin_gallery_set_featured(draft); r := r || 'FAIL a draft was featured' || E'\n';
  exception when sqlstate 'P0031' then r := r || 'draft photo featured refused (P0031)' || E'\n'; end;
  perform public.admin_gallery_set_published(vid3, false);
  begin
    perform public.admin_gallery_set_featured(vid3); r := r || 'FAIL an unpublished video was featured' || E'\n';
  exception when sqlstate 'P0032' then r := r || 'unpublished video featured refused (P0032)' || E'\n'; end;
  perform public.admin_gallery_set_published(vid3, true);
  begin
    perform public.admin_gallery_set_featured(gen_random_uuid()); r := r || 'FAIL an unknown id was featured' || E'\n';
  exception when sqlstate 'P0006' then r := r || 'unknown id featured refused (P0006)' || E'\n'; end;
  perform public.admin_gallery_set_published(vid2, false);
  select count(*) into n from public.gallery_items where is_featured; r := r || 'featured after unpublishing it: ' || n || ' (expect 0)' || E'\n';
  perform public.admin_gallery_set_published(vid2, true);
  perform public.admin_gallery_set_featured(vid2);
  perform public.admin_gallery_set_featured(null);
  select count(*) into n from public.gallery_items where is_featured; r := r || 'featured after set_featured(null): ' || n || ' (expect 0)' || E'\n';
  perform public.admin_gallery_set_featured(vid1);
  reset role;

  -- The same rules hold underneath the functions (as the table owner, no API role) ----------------------------------
  begin
    update public.gallery_items set is_featured = true where id = vid2;
    r := r || 'FAIL two featured at once' || E'\n';
  exception when unique_violation then r := r || 'two featured at once refused (23505)' || E'\n'; end;
  begin
    update public.gallery_items set is_featured = true where id = img;
    r := r || 'FAIL a featured photo' || E'\n';
  exception when unique_violation or check_violation then r := r || 'featured photo refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.gallery_items set is_featured = false where id = vid1;
    update public.gallery_items set is_featured = true where id = img;
    r := r || 'FAIL a featured photo (alone)' || E'\n';
  exception when check_violation then r := r || 'featured photo alone refused (23514)' || E'\n'; end;
  begin
    update public.gallery_items set duration_ms = 25000 where id = vid3;
    r := r || 'FAIL a 25 s video in the table' || E'\n';
  exception when check_violation then r := r || 'table: video over 20 s refused (23514)' || E'\n'; end;
  begin
    update public.gallery_items set bytes = 6 * 1024 * 1024 where id = vid3;
    r := r || 'FAIL a 6 MB file in the table' || E'\n';
  exception when check_violation then r := r || 'table: file over 5 MB refused (23514)' || E'\n'; end;
  update public.gallery_items set is_published = false where id = vid1;
  select is_featured::int into n from public.gallery_items where id = vid1;
  r := r || 'table: unpublishing the featured video unfeatures it (trigger): ' || (n = 0) || ' (expect true)' || E'\n';
  update public.gallery_items set is_published = true where id = vid1;

  -- Order ----------------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  perform public.admin_gallery_set_featured(vid1);
  ids := array[vid3, vid2, vid1, img, draft];
  perform public.admin_gallery_reorder(ids);
  select array_agg(g.id order by g.sort_order) into ids from public.admin_gallery_items() g;
  r := r || 'reordered: ' || (ids = array[vid3, vid2, vid1, img, draft]) || ' (expect true)' || E'\n';
  begin
    perform public.admin_gallery_reorder(array[vid3, vid2, vid1, img]); r := r || 'FAIL an order missing an item' || E'\n';
  exception when sqlstate 'P0033' then r := r || 'order missing an item refused (P0033)' || E'\n'; end;
  begin
    perform public.admin_gallery_reorder(array[vid3, vid2, vid1, img, img]); r := r || 'FAIL an order with a repeat' || E'\n';
  exception when sqlstate 'P0033' then r := r || 'order with a repeat refused (P0033)' || E'\n'; end;
  begin
    perform public.admin_gallery_reorder(array[vid3, vid2, vid1, img, gen_random_uuid()]); r := r || 'FAIL an order with an unknown id' || E'\n';
  exception when sqlstate 'P0033' then r := r || 'order with an unknown id refused (P0033)' || E'\n'; end;
  reset role;

  -- Anon: published rows only, named columns, never created_by, no write -------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.gallery_items; r := r || 'anon sees: ' || n || ' (expect 4, the draft hidden)' || E'\n';
  select count(*) into n from public.gallery_items where id = draft; r := r || 'anon sees the draft: ' || n || ' (expect 0)' || E'\n';
  select count(*) into n from public.gallery_items where is_featured; r := r || 'anon sees the featured video: ' || n || ' (expect 1)' || E'\n';
  begin
    perform created_by from public.gallery_items limit 1; r := r || 'FAIL anon read created_by' || E'\n';
  exception when insufficient_privilege then r := r || 'anon created_by refused (42501)' || E'\n'; end;
  begin
    insert into public.gallery_items (kind, aspect, storage_path, sm_path, width, height, bytes) values ('image', '1:1', 'a', 'b', 1, 1, 1);
    r := r || 'FAIL anon inserted' || E'\n';
  exception when insufficient_privilege then r := r || 'anon insert refused (42501)' || E'\n'; end;
  begin
    update public.gallery_items set is_published = false; r := r || 'FAIL anon updated' || E'\n';
  exception when insufficient_privilege then r := r || 'anon update refused (42501)' || E'\n'; end;
  begin
    delete from public.gallery_items; r := r || 'FAIL anon deleted' || E'\n';
  exception when insufficient_privilege then r := r || 'anon delete refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_items(); r := r || 'FAIL anon listed every item' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_gallery_items refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_set_published(draft, true); r := r || 'FAIL anon published' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_gallery_set_published refused (42501)' || E'\n'; end;
  reset role;

  -- A customer (signed in, no role): the same reads, every admin function refused ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', customer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.gallery_items; r := r || 'customer sees: ' || n || ' (expect 4)' || E'\n';
  begin
    update public.gallery_items set is_featured = false; r := r || 'FAIL customer updated' || E'\n';
  exception when insufficient_privilege then r := r || 'customer update refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_items(); r := r || 'FAIL customer listed every item' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_gallery_items refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_add(gen_random_uuid(), 'image', '1:1', 'a', null, 'b', 1, 1, null, 1); r := r || 'FAIL customer added' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_gallery_add refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_set_featured(vid2); r := r || 'FAIL customer featured' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_gallery_set_featured refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_reorder(array[img]); r := r || 'FAIL customer reordered' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_gallery_reorder refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_delete(img); r := r || 'FAIL customer deleted' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_gallery_delete refused (42501)' || E'\n'; end;
  reset role;

  -- Staff (a role, not the owner): refused too ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_gallery_set_published(draft, true); r := r || 'FAIL staff published' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_gallery_set_published refused (42501)' || E'\n'; end;
  begin
    perform public.admin_gallery_delete(img); r := r || 'FAIL staff deleted' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_gallery_delete refused (42501)' || E'\n'; end;
  reset role;

  -- Storage: owner-only writes on the gallery bucket --------------------------------------------------------------
  select count(*) into n from storage.buckets
  where id = 'gallery' and public and file_size_limit = 5 * 1024 * 1024
    and allowed_mime_types @> array['image/webp', 'video/mp4'] and cardinality(allowed_mime_types) = 2;
  r := r || 'bucket gallery: public, 5 MB, webp + mp4: ' || n || ' (expect 1)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', customer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('gallery', 'x/customer.webp', customer);
    r := r || 'FAIL customer uploaded to gallery' || E'\n';
  exception when insufficient_privilege then r := r || 'customer upload to gallery refused (42501)' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('gallery', 'x/staff.webp', staff);
    r := r || 'FAIL staff uploaded to gallery' || E'\n';
  exception when insufficient_privilege then r := r || 'staff upload to gallery refused (42501)' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner) values ('gallery', img || '/owner.webp', owner1);
  r := r || 'owner upload to gallery: ok' || E'\n';

  -- Delete: the row goes, the paths come back for the server to remove the files ------------------------------------
  res := public.admin_gallery_delete(vid3);
  r := r || 'delete returns the files: ' || (res->>'storage_path' = vid3 || '/' || f || '.mp4' and res->>'poster_path' = vid3 || '/' || f || '.webp' and res->>'sm_path' = vid3 || '/' || f || '.sm.webp') || ' (expect true)' || E'\n';
  begin
    perform public.admin_gallery_delete(vid3); r := r || 'FAIL deleted twice' || E'\n';
  exception when sqlstate 'P0006' then r := r || 'deleting it again refused (P0006)' || E'\n'; end;
  reset role;
  select count(*) into n from public.gallery_items where id = vid3; r := r || 'rows left for the deleted item: ' || n || ' (expect 0)' || E'\n';

  raise exception E'U5.3 GALLERY TESTS (rolled back)\n%', r;
end $t$;
