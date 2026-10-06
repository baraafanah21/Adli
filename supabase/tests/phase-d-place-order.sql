-- Phase D: place_order() v3 against the live catalog. Run in the SQL Editor.
-- One DO block ending in a deliberate exception, so nothing stays: the temporary gateway secret, the demo products
-- switched on for the test, the orders, the rate-limit rows. (Only order_code_seq moves on: sequences don't roll back,
-- so the first real order may get a code a few numbers later.)
-- Calls run as anon, like the site's server route. Each line of the message is one check.

do $t$
declare
  r text := '';
  d text;
  st text;
  k uuid := gen_random_uuid();
  c1 text;
  c2 text;
  tot int;
  its jsonb;
  n int;
  v_ward uuid; v_anbar uuid; v_oud uuid; v_beard uuid; v_black_l uuid; v_navy_m uuid; v_box uuid;
  secret text := 'phase-d-test-secret';
begin
  select id into v_ward    from public.product_variants where sku = 'ward-taifi';
  select id into v_anbar   from public.product_variants where sku = 'anbar-al-layl';
  select id into v_oud     from public.product_variants where sku = 'oud-malaki';
  select id into v_beard   from public.product_variants where sku = 'beard-cream';
  select id into v_black_l from public.product_variants where sku = 'demo-cap-black-l';
  select id into v_navy_m  from public.product_variants where sku = 'demo-cap-navy-m';
  select id into v_box     from public.product_variants where sku = 'demo-gift-box';

  -- A secret only this block knows (the real one is restored by the rollback).
  update private.app_secrets set secret_hash = extensions.digest(convert_to(secret, 'UTF8'), 'sha256') where name = 'order_gateway';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  -- P0 a hidden (inactive) demo product is refused
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_navy_m, 'qty', 1)), 'test-ip-0', secret);
    r := r || 'P0 FAIL hidden product accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'P0 hidden product: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- P1 out of stock (ورد طائفي, stock 0)
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_ward, 'qty', 1)), 'test-ip-1', secret);
    r := r || 'P1 FAIL out of stock accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'P1 out of stock: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- P2 more than in stock (عنبر الليل has 2, asking 3)
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_anbar, 'qty', 3)), 'test-ip-2', secret);
    r := r || 'P2 FAIL qty above stock accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'P2 qty above stock: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- Switch the demo products on for the rest of the block.
  reset role;
  update public.products set is_active = true where slug in ('demo-cap', 'demo-gift-box');
  set local role anon;

  -- P3 an out-of-stock variant names product + variant
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_black_l, 'qty', 1)), 'test-ip-3', secret);
    r := r || 'P3 FAIL out-of-stock variant accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'P3 variant name in message: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- P4 bundle pieces count with the same piece ordered alone: 6 bundles + 5 عود ملكي = 11 عود > 10
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_box, 'qty', 6), jsonb_build_object('variant_id', v_oud, 'qty', 5)),
      'test-ip-4', secret);
    r := r || 'P4 FAIL bundle + piece over stock accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'P4 bundle + piece over stock: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- P5 a good order: 1 bundle (₪ 190) + 2 × كحلية M (₪ 45) = ₪ 280
  select o.code, o.total_ils, o.items into c1, tot, its
  from public.place_order(k, 'اختبار', 'رفيديا', null,
    jsonb_build_array(jsonb_build_object('variant_id', v_box, 'qty', 1), jsonb_build_object('variant_id', v_navy_m, 'qty', 2)),
    'test-ip-5', secret) o;
  r := r || 'P5 ok: ' || c1 || ' total=' || tot || ' lines=' ||
    (select string_agg((i ->> 'name_ar') || coalesce(' ' || (i ->> 'variant_name_ar'), '') || ' ×' || (i ->> 'qty') || ' = ' || (i ->> 'line_total_ils'), ' | ')
     from jsonb_array_elements(its) i) || E'\n';

  -- P6 same key again: same order, no second row
  select o.code into c2 from public.place_order(k, 'اختبار', 'رفيديا', null,
    jsonb_build_array(jsonb_build_object('variant_id', v_navy_m, 'qty', 9)), 'test-ip-6', secret) o;
  reset role;
  select count(*) into n from public.orders where idempotency_key = k;
  r := r || 'P6 same key: ' || c2 || ' (same as P5: ' || (c1 = c2) || ', rows=' || n || ')' || E'\n';

  -- P7 a hidden bundle piece makes the bundle unavailable (public view says out; place_order refuses)
  update public.products set is_active = false where slug = 'beard-cream';
  set local role anon;
  select stock_state into st from public.variant_availability where variant_id = v_box;
  r := r || 'P7a bundle state with a hidden piece: ' || st || E'\n';
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_box, 'qty', 1)), 'test-ip-7', secret);
    r := r || 'P7b FAIL bundle with hidden piece accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'P7b bundle with hidden piece: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- P8 wrong gateway secret
  begin
    perform public.place_order(gen_random_uuid(), 'اختبار', null, null,
      jsonb_build_array(jsonb_build_object('variant_id', v_oud, 'qty', 1)), 'test-ip-8', 'wrong');
    r := r || 'P8 FAIL wrong secret accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || 'P8 wrong secret: ' || st || E'\n'; end;
  reset role;

  raise exception E'PLACE_ORDER TESTS (rolled back)\n%', r;
end $t$;
