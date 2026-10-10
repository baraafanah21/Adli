-- The home page's products: home_products and admin_set_home_products(). Run in the SQL Editor after
-- 20261014000000_home_products.sql. One DO block ending in a deliberate exception: everything is rolled back (the
-- slots the owner chose on the live site come back too).

do $t$
declare
  r text := '';
  st text;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  cat uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; hidden uuid; archived uuid;
  n int;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1, 'authenticated', 'authenticated', 'home-owner@test.invalid', now(), now()),
    (staff,  'authenticated', 'authenticated', 'home-staff@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');

  insert into public.categories (slug, name_ar, sort) values ('home-test', 'فئة اختبار', 990) returning id into cat;
  insert into public.products (category_id, slug, name_ar, price_ils, sort) values (cat, 'home-test-1', 'اختبار ١', 10, 991) returning id into p1;
  insert into public.products (category_id, slug, name_ar, price_ils, sort) values (cat, 'home-test-2', 'اختبار ٢', 10, 992) returning id into p2;
  insert into public.products (category_id, slug, name_ar, price_ils, sort) values (cat, 'home-test-3', 'اختبار ٣', 10, 993) returning id into p3;
  insert into public.products (category_id, slug, name_ar, price_ils, sort) values (cat, 'home-test-4', 'اختبار ٤', 10, 994) returning id into p4;
  insert into public.products (category_id, slug, name_ar, price_ils, sort) values (cat, 'home-test-5', 'اختبار ٥', 10, 995) returning id into p5;
  insert into public.products (category_id, slug, name_ar, price_ils, sort, is_active) values (cat, 'home-test-h', 'مخفي', 10, 996, false) returning id into hidden;
  insert into public.products (category_id, slug, name_ar, price_ils, sort, is_active, archived_at)
    values (cat, 'home-test-a', 'مؤرشف', 10, 997, false, now()) returning id into archived;

  -- staff and customers can't choose
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_home_products(array[p1]); r := r || 'FAIL staff chose the home products' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_set_home_products refused (' || sqlstate || ')' || E'\n'; end;
  begin
    insert into public.home_products (slot, product_id) values (1, p1); r := r || 'FAIL staff wrote home_products' || E'\n';
  exception when insufficient_privilege then r := r || 'staff INSERT home_products refused (' || sqlstate || ')' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.admin_set_home_products(array[p1]); r := r || 'FAIL anon chose the home products' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_set_home_products refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- owner
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.admin_set_home_products(array[p3, p1]);
  r := r || 'owner chose 2: returns ' || n || ', slots ' ||
    (select string_agg(slot || '=' || (select name_ar from public.products where id = product_id), ', ' order by slot) from public.home_products) ||
    ' (expect 2, 1=اختبار ٣, 2=اختبار ١)' || E'\n';
  perform public.admin_set_home_products(array[p4, p2, p1, p3]);
  r := r || 'owner chose 4: ' ||
    (select string_agg(slot || '=' || (select name_ar from public.products where id = product_id), ', ' order by slot) from public.home_products) ||
    ' (expect 1=٤, 2=٢, 3=١, 4=٣)' || E'\n';
  begin
    perform public.admin_set_home_products(array[p1, p2, p3, p4, p5]); r := r || 'FAIL 5 products accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || '5 products: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_home_products(array[p1, p1]); r := r || 'FAIL the same product twice' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'same product twice: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_home_products(array[p1, null]); r := r || 'FAIL a null slot' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'null in the list: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_home_products(array[hidden]); r := r || 'FAIL a hidden product chosen' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'hidden product: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_home_products(array[archived]); r := r || 'FAIL an archived product chosen' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'archived product: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_home_products(array[gen_random_uuid()]); r := r || 'FAIL an unknown product chosen' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'unknown product: ' || st || ' (expect 22023)' || E'\n'; end;
  r := r || 'after the refusals, slots unchanged: ' || (select count(*) from public.home_products) || ' (expect 4)' || E'\n';
  reset role;

  -- the public reads the slots of active products only
  update public.products set is_active = false where id = p2;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := r || 'anon reads: ' || (select string_agg(slot::text, ',' order by slot) from public.home_products) ||
    ' (expect 1,3,4: slot 2 was hidden after it was chosen)' || E'\n';
  begin
    perform updated_at from public.home_products limit 1; r := r || 'FAIL anon read updated_at' || E'\n';
  exception when insufficient_privilege then r := r || 'anon updated_at refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- deleting a product frees its slot; an empty list clears them all
  delete from public.products where id = p4;
  r := r || 'p4 deleted: slots ' || (select string_agg(slot::text, ',' order by slot) from public.home_products) || ' (expect 2,3,4)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.admin_set_home_products('{}');
  r := r || 'owner clears: returns ' || n || ', slots ' || (select count(*) from public.home_products) || ' (expect 0 0)' || E'\n';
  reset role;

  raise exception E'HOME PRODUCTS TESTS (rolled back)\n%', r;
end $t$;
