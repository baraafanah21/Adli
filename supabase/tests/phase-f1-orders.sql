-- Phase F1: order status, stock taken and returned, ledgers, and who may call what. Run in the SQL Editor
-- after 20261007000000_admin_orders.sql. One DO block ending in a deliberate exception: everything (fake users,
-- orders, movements, the temporary gateway secret) is rolled back. Each line of the message is one check;
-- a line starting with FAIL is a failure. Only order_code_seq moves on (sequences don't roll back).

do $t$
declare
  r text := '';
  st text;
  d text;
  n int;
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  secret text := 'phase-f1-test-secret';
  v_oud uuid; v_anbar uuid; v_beard uuid; v_box uuid;
  o1 uuid; o2 uuid; o3 uuid; c1 text;
  q_oud int; q_anbar int; q_beard int;
  res record;
begin
  select id into v_oud   from public.product_variants where sku = 'oud-malaki';
  select id into v_anbar from public.product_variants where sku = 'anbar-al-layl';
  select id into v_beard from public.product_variants where sku = 'beard-cream';
  select id into v_box   from public.product_variants where sku = 'demo-gift-box';
  select stock_quantity into q_oud from public.product_variants where id = v_oud;
  select stock_quantity into q_anbar from public.product_variants where id = v_anbar;
  select stock_quantity into q_beard from public.product_variants where id = v_beard;
  r := r || format('start stock: oud=%s anbar=%s beard=%s', q_oud, q_anbar, q_beard) || E'\n';

  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (staff, 'authenticated', 'authenticated', 'f1-staff@test.invalid', now(), now()),
         (cust,  'authenticated', 'authenticated', 'f1-cust@test.invalid',  now(), now());
  insert into public.user_roles (user_id, role) values (staff, 'staff');
  update private.app_secrets set secret_hash = extensions.digest(convert_to(secret, 'UTF8'), 'sha256') where name = 'order_gateway';
  update public.products set is_active = true where slug = 'demo-gift-box';

  -- Three guest orders (as anon, like the site).
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select o.code into c1 from public.place_order(gen_random_uuid(), 'سامي اختبار', 'رفيديا', '0599123456',
    jsonb_build_array(jsonb_build_object('variant_id', v_oud, 'qty', 2), jsonb_build_object('variant_id', v_anbar, 'qty', 1)),
    'f1-ip-1', secret) o;
  perform public.place_order(gen_random_uuid(), 'رامي اختبار', null, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_anbar, 'qty', 2)), 'f1-ip-2', secret);
  perform public.place_order(gen_random_uuid(), 'هادي اختبار', null, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_box, 'qty', 1)), 'f1-ip-3', secret);

  -- anon: no admin function at all
  begin
    perform public.admin_new_orders_count(); r := r || 'FAIL anon ran admin_new_orders_count' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_new_orders_count refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_set_order_status(gen_random_uuid(), 'confirmed'); r := r || 'FAIL anon ran admin_set_order_status' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_set_order_status refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  select o.id into o1 from public.orders o where o.code = c1;
  select o.id into o2 from public.orders o where o.customer_name = 'رامي اختبار';
  select o.id into o3 from public.orders o where o.customer_name = 'هادي اختبار';
  select count(*) into n from public.order_events where order_id = o1;
  r := r || 'O1 events after placing: ' || n || ' (expect 1)' || E'\n';

  -- customer: refused by the role check; no direct writes
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_order_status(o1, 'confirmed'); r := r || 'FAIL customer confirmed an order' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_set_order_status refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform * from public.admin_orders(); r := r || 'FAIL customer listed orders' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_orders refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_order(c1); r := r || 'FAIL customer read an order' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_order refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.orders set total_ils = 1 where id = o1; r := r || 'FAIL customer updated orders' || E'\n';
  exception when insufficient_privilege then r := r || 'customer update orders refused (' || sqlstate || ')' || E'\n'; end;
  select count(*) into n from public.stock_movements; r := r || 'customer sees stock movements: ' || n || ' (expect 0)' || E'\n';
  reset role;

  -- staff
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || 'staff new orders: ' || public.admin_new_orders_count() || ' (expect 3)' || E'\n';
  select count(*) into n from public.admin_orders(p_q => 'سامي'); r := r || 'staff search by name: ' || n || ' (expect 1)' || E'\n';
  select count(*) into n from public.admin_orders(p_q => '599123'); r := r || 'staff search by phone: ' || n || ' (expect 1)' || E'\n';
  select count(*) into n from public.admin_orders(p_q => c1); r := r || 'staff search by code: ' || n || ' (expect 1)' || E'\n';
  select count(*) into n from public.admin_orders(p_status => 'new', p_from => (now() at time zone 'Asia/Hebron')::date, p_to => (now() at time zone 'Asia/Hebron')::date);
  r := r || 'staff today''s new orders: ' || n || ' (expect 3)' || E'\n';
  begin
    update public.orders set status = 'done' where id = o1; r := r || 'FAIL staff updated orders directly' || E'\n';
  exception when insufficient_privilege then r := r || 'staff direct update orders refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.product_variants set stock_quantity = 99 where id = v_oud; r := r || 'FAIL staff set stock directly' || E'\n';
  exception when insufficient_privilege then r := r || 'staff direct stock change refused (' || sqlerrm || ')' || E'\n'; end;

  -- confirm O1: oud -2, anbar -1
  select * into res from public.admin_set_order_status(o1, 'confirmed');
  r := r || format('confirm O1: %s changed=%s', res.status, res.changed) || E'\n';
  -- again: nothing taken twice
  select * into res from public.admin_set_order_status(o1, 'confirmed');
  r := r || format('confirm O1 again: changed=%s (expect false)', res.changed) || E'\n';
  reset role;
  r := r || format('after confirm: oud=%s (expect %s) anbar=%s (expect %s)',
    (select stock_quantity from public.product_variants where id = v_oud), q_oud - 2,
    (select stock_quantity from public.product_variants where id = v_anbar), q_anbar - 1) || E'\n';
  select count(*) into n from public.stock_movements where order_id = o1 and reason = 'sale';
  r := r || 'O1 sale movements: ' || n || ' (expect 2)' || E'\n';
  set local role authenticated;

  -- confirm O2: anbar needs 2, only 1 left → refused with the name, order stays new
  begin
    perform public.admin_set_order_status(o2, 'confirmed'); r := r || 'FAIL O2 confirmed without stock' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'confirm O2 short: ' || st || ' ' || coalesce(d, '') || E'\n'; end;
  select status into st from public.orders where id = o2; r := r || 'O2 status: ' || st || ' (expect new)' || E'\n';

  -- confirm O3 (bundle): its pieces are taken, not the bundle
  perform public.admin_set_order_status(o3, 'confirmed');
  reset role;
  r := r || format('after bundle confirm: oud=%s (expect %s) beard=%s (expect %s) bundle variant=%s (expect 0)',
    (select stock_quantity from public.product_variants where id = v_oud), q_oud - 3,
    (select stock_quantity from public.product_variants where id = v_beard), q_beard - 1,
    (select stock_quantity from public.product_variants where id = v_box)) || E'\n';
  set local role authenticated;

  -- cancel O1 after confirm: stock comes back; a second cancel does nothing
  perform public.admin_set_order_status(o1, 'cancelled', 'اختبار الإلغاء');
  select * into res from public.admin_set_order_status(o1, 'cancelled');
  r := r || format('cancel O1 again: changed=%s (expect false)', res.changed) || E'\n';
  reset role;
  r := r || format('after cancel O1: oud=%s (expect %s) anbar=%s (expect %s)',
    (select stock_quantity from public.product_variants where id = v_oud), q_oud - 1,
    (select stock_quantity from public.product_variants where id = v_anbar), q_anbar) || E'\n';
  select count(*) into n from public.stock_movements where order_id = o1 and reason = 'cancel';
  r := r || 'O1 cancel movements: ' || n || ' (expect 2)' || E'\n';
  select count(*) into n from public.order_events where order_id = o1;
  r := r || 'O1 events: ' || n || ' (expect 3: new, confirmed, cancelled)' || E'\n';
  set local role authenticated;

  -- transitions that aren't allowed
  begin
    perform public.admin_set_order_status(o1, 'confirmed'); r := r || 'FAIL cancelled -> confirmed allowed' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'cancelled -> confirmed: ' || st || ' ' || coalesce(d, '') || E'\n'; end;
  perform public.admin_set_order_status(o3, 'done');
  begin
    perform public.admin_set_order_status(o3, 'new'); r := r || 'FAIL done -> new allowed' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'done -> new: ' || st || ' ' || coalesce(d, '') || E'\n'; end;
  begin
    perform public.admin_set_order_status(o3, 'cancelled'); r := r || 'FAIL done -> cancelled allowed' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'done -> cancelled: ' || st || ' ' || coalesce(d, '') || E'\n'; end;

  -- cancel O2 from new: no stock movement
  perform public.admin_set_order_status(o2, 'cancelled');
  select count(*) into n from public.stock_movements where order_id = o2;
  r := r || 'O2 cancelled from new, movements: ' || n || ' (expect 0)' || E'\n';

  -- the detail view
  r := r || 'admin_order lines: ' || (select jsonb_array_length(public.admin_order(c1) -> 'items')) ||
    ', events: ' || (select jsonb_array_length(public.admin_order(c1) -> 'events')) || E'\n';
  select count(*) into n from public.stock_movements; r := r || 'staff sees stock movements: ' || n || E'\n';
  reset role;

  -- even the table owner can't change stock without a movement
  begin
    update public.product_variants set stock_quantity = 99 where id = v_oud; r := r || 'FAIL owner set stock directly' || E'\n';
  exception when insufficient_privilege then r := r || 'direct stock change as table owner refused' || E'\n'; end;

  raise exception E'F1 TESTS (rolled back)\n%', r;
end $t$;
