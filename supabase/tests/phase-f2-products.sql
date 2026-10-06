-- Phase F2: products, options, variants, images, bundles; and who may call what. Run in the SQL Editor after
-- 20261007000200_admin_products.sql. One DO block ending in a deliberate exception: everything is rolled back.
-- Each line of the message is one check; a line starting with FAIL is a failure.

do $t$
declare
  r text := '';
  st text;
  n int;
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  v_caps uuid; v_gifts uuid; v_oud uuid;
  p_cap uuid; p_box uuid;
  o_color uuid; o_size uuid; v_red uuid; v_s uuid;
  var1 uuid; var2 uuid;
begin
  select id into v_caps from public.categories where slug = 'caps';
  select id into v_gifts from public.categories where slug = 'gift-boxes';
  select id into v_oud from public.product_variants where sku = 'oud-malaki';

  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (staff, 'authenticated', 'authenticated', 'f2-staff@test.invalid', now(), now()),
         (cust,  'authenticated', 'authenticated', 'f2-cust@test.invalid',  now(), now());
  insert into public.user_roles (user_id, role) values (staff, 'staff');

  -- anon and customer: no admin function, no direct writes
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.admin_create_product('simple', v_caps, 'x', 'f2-anon', 1); r := r || 'FAIL anon created a product' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_create_product refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_create_product('simple', v_caps, 'x', 'f2-cust', 1); r := r || 'FAIL customer created a product' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_create_product refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform * from public.admin_variant_stock((select product_id from public.product_variants where id = v_oud));
    r := r || 'FAIL customer read stock' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_variant_stock refused (' || sqlstate || ')' || E'\n'; end;
  begin
    insert into public.products (category_id, slug, name_ar, price_ils) values (v_caps, 'f2-direct', 'x', 1);
    r := r || 'FAIL customer inserted a product directly' || E'\n';
  exception when insufficient_privilege then r := r || 'customer direct insert refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- staff
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.products set price_ils = 1 where slug = 'oud-malaki'; r := r || 'FAIL staff updated a product directly' || E'\n';
  exception when insufficient_privilege then r := r || 'staff direct update refused (' || sqlstate || ')' || E'\n'; end;

  p_cap := public.admin_create_product('simple', v_caps, 'طاقية اختبار', 'f2-cap', 30);
  select count(*) into n from public.product_variants where product_id = p_cap and sku = 'f2-cap' and option_value_ids = '{}';
  r := r || 'create: default variant ' || n || ' (expect 1), active=' ||
    (select is_active from public.products where id = p_cap) || ' (expect false)' || E'\n';
  begin
    perform public.admin_create_product('simple', v_caps, 'مكرر', 'f2-cap', 30); r := r || 'FAIL duplicate slug accepted' || E'\n';
  exception when unique_violation then r := r || 'duplicate slug refused (23505)' || E'\n'; end;
  begin
    perform public.admin_create_product('simple', v_caps, 'سيء', 'Bad Slug!', 30); r := r || 'FAIL bad slug accepted' || E'\n';
  exception when check_violation then r := r || 'bad slug refused (23514)' || E'\n'; end;

  o_color := public.admin_save_option(p_cap, null, 'اللون', 'color', 1);
  o_size := public.admin_save_option(p_cap, null, 'المقاس', 'size', 2);
  v_red := public.admin_save_option_value(o_color, null, 'أحمر', '#aa0000', null);
  perform public.admin_save_option_value(o_color, null, 'أزرق', '#0000AA', null);
  v_s := public.admin_save_option_value(o_size, null, 'S', null, null);
  perform public.admin_save_option_value(o_size, null, 'M', null, null);
  r := r || 'hex stored as: ' || (select hex from public.product_option_values where id = v_red) || ' (expect #AA0000)' || E'\n';
  begin
    perform public.admin_save_option_value(o_size, null, 'L', '#000000', null); r := r || 'FAIL hex on a size accepted' || E'\n';
  exception when check_violation then r := r || 'hex on a size refused (23514)' || E'\n'; end;
  begin
    perform public.admin_save_option_value(o_color, null, 'أخضر', null, null); r := r || 'FAIL colour without hex accepted' || E'\n';
  exception when check_violation then r := r || 'colour without hex refused (23514)' || E'\n'; end;

  r := r || 'generate: ' || public.admin_generate_variants(p_cap) || ' created (expect 4)' || E'\n';
  r := r || 'generate again: ' || public.admin_generate_variants(p_cap) || ' created (expect 0)' || E'\n';
  select count(*) into n from public.product_variants where product_id = p_cap and is_active;
  r := r || 'active variants: ' || n || ' (expect 4: the default one is hidden)' || E'\n';
  r := r || 'labels: ' || (select string_agg(a.label_ar, ' | ' order by v.sort) from public.variant_availability a
    join public.product_variants v on v.id = a.variant_id where v.product_id = p_cap and v.is_active) || E'\n';

  begin
    perform public.admin_delete_option_value(v_red); r := r || 'FAIL used value deleted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'delete used value: ' || st || ' (expect P0011)' || E'\n'; end;
  begin
    perform public.admin_delete_option(o_size); r := r || 'FAIL used option deleted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'delete used option: ' || st || ' (expect P0011)' || E'\n'; end;

  select id into var1 from public.product_variants where product_id = p_cap and is_active order by sort limit 1;
  select id into var2 from public.product_variants where product_id = p_cap and is_active order by sort offset 1 limit 1;
  perform public.admin_update_variant(var1, 'f2-cap-red-s', 'حمراء، مقاس S', 35, 2, true, 1);
  r := r || 'variant after update: ' || (select sku || ' ' || price_ils || ' ' || label_ar from public.product_variants where id = var1) || E'\n';
  begin
    perform public.admin_update_variant(var2, 'f2-cap-red-s', null, null, 3, true, 2); r := r || 'FAIL duplicate sku accepted' || E'\n';
  exception when unique_violation then r := r || 'duplicate sku refused (23505)' || E'\n'; end;

  begin
    perform public.admin_set_product_image(p_cap, 'elsewhere/x.webp'); r := r || 'FAIL bad image path accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'bad image path: ' || st || ' (expect 22023)' || E'\n'; end;
  perform public.admin_set_product_image(p_cap, p_cap || '/' || gen_random_uuid() || '.webp');
  r := r || 'image set: ' || ((select image_path from public.products where id = p_cap) like p_cap || '/%') || E'\n';

  perform public.admin_update_product(p_cap, 'طاقية اختبار', 'f2-cap', 'قطن', 'وصف', 30, null, v_caps, 5, true);

  -- bundle
  p_box := public.admin_create_product('bundle', v_gifts, 'بكجة اختبار', 'f2-box', 0);
  perform public.admin_set_bundle(p_box, 50, jsonb_build_array(
    jsonb_build_object('variant_id', v_oud, 'qty', 1), jsonb_build_object('variant_id', var1, 'qty', 2)));
  select count(*) into n from public.bundle_items where bundle_product_id = p_box;
  r := r || 'bundle pieces: ' || n || ' (expect 2), price: ' || (select price_ils from public.products where id = p_box) || ' (expect 50)' || E'\n';
  begin
    perform public.admin_set_bundle(p_box, 50, jsonb_build_array(jsonb_build_object('variant_id',
      (select id from public.product_variants where product_id = p_box limit 1), 'qty', 1)));
    r := r || 'FAIL bundle inside a bundle accepted' || E'\n';
  exception when check_violation then r := r || 'bundle inside a bundle refused (23514)' || E'\n'; end;
  begin
    perform public.admin_save_option(p_box, null, 'الحجم', 'size', 1); r := r || 'FAIL option on a bundle accepted' || E'\n';
  exception when check_violation then r := r || 'option on a bundle refused (23514)' || E'\n'; end;

  select count(*) into n from public.admin_variant_stock(p_cap); r := r || 'staff admin_variant_stock rows: ' || n || ' (expect 5)' || E'\n';
  reset role;

  -- the public sees the activated product (and its active variants only)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.product_variants where product_id = p_cap; r := r || 'anon sees variants: ' || n || ' (expect 4)' || E'\n';
  reset role;

  raise exception E'F2 TESTS (rolled back)\n%', r;
end $t$;
