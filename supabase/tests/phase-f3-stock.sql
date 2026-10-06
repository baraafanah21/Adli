-- Phase F3: stock levels, adjustments with a reason, history. Run in the SQL Editor after
-- 20261007000400_admin_stock.sql. One DO block ending in a deliberate exception: everything is rolled back.
-- Each line is one check; a line starting with FAIL is a failure.

do $t$
declare
  r text := '';
  st text;
  d text;
  n int;
  q int;
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  v_oud uuid; v_box uuid;
  q0 int;
  rec record;
begin
  select id, stock_quantity into v_oud, q0 from public.product_variants where sku = 'oud-malaki';
  select id into v_box from public.product_variants where sku = 'demo-gift-box';
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (staff, 'authenticated', 'authenticated', 'f3-staff@test.invalid', now(), now()),
         (cust,  'authenticated', 'authenticated', 'f3-cust@test.invalid',  now(), now());
  insert into public.user_roles (user_id, role) values (staff, 'staff');

  -- anon and customer: nothing
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform * from public.admin_stock_levels(); r := r || 'FAIL anon read stock levels' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_stock_levels refused (' || sqlstate || ')' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.admin_stock_levels(); r := r || 'FAIL customer read stock levels' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_stock_levels refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_adjust_stock(v_oud, 'receive', 5); r := r || 'FAIL customer adjusted stock' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_adjust_stock refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform * from public.admin_stock_movements(v_oud); r := r || 'FAIL customer read movements' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_stock_movements refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- staff
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.admin_stock_levels(); r := r || 'levels rows: ' || n || ' (every variant, hidden ones too)' || E'\n';
  select * into rec from public.admin_stock_levels() limit 1;
  r := r || 'first row: ' || rec.product_name || ' ' || rec.stock_state || ' (expect a shown product, low or out)' || E'\n';
  select string_agg(sku || '=' || stock_quantity, ', ' order by sku) into st from public.admin_stock_levels('low') where product_active;
  r := r || 'low (shown products): ' || coalesce(st, '-') || E'\n';
  select string_agg(sku, ', ' order by sku) into st from public.admin_stock_levels('out') where product_active;
  r := r || 'out (shown products): ' || coalesce(st, '-') || ' (expect ward-taifi)' || E'\n';
  select stock_quantity into n from public.admin_stock_levels(p_q => 'demo-gift-box');
  r := r || 'bundle row quantity: ' || n || ' (min of its pieces)' || E'\n';
  select count(*) into n from public.admin_stock_levels(p_q => 'عود'); r := r || 'search «عود»: ' || n || ' (expect 1)' || E'\n';

  q := public.admin_adjust_stock(v_oud, 'receive', 5, 'شحنة اختبار');
  r := r || 'receive 5: ' || q || ' (expect ' || (q0 + 5) || ')' || E'\n';
  q := public.admin_adjust_stock(v_oud, 'damage', 2, 'زجاجتان مكسورتان');
  r := r || 'damage 2: ' || q || ' (expect ' || (q0 + 3) || ')' || E'\n';
  q := public.admin_adjust_stock(v_oud, 'adjust', q0 + 3, 'جرد مطابق');
  r := r || 'count matches: ' || q || ', movements so far: ' ||
    (select count(*) from public.admin_stock_movements(v_oud)) || ' (expect opening + 2)' || E'\n';
  q := public.admin_adjust_stock(v_oud, 'adjust', 9, 'جرد');
  r := r || 'count to 9: ' || q || E'\n';

  begin
    perform public.admin_adjust_stock(v_oud, 'damage', 100); r := r || 'FAIL stock went below 0' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, d = pg_exception_detail;
    r := r || 'damage 100: ' || st || ' current=' || coalesce(d, '') || ' (expect 23514, 9)' || E'\n'; end;
  begin
    perform public.admin_adjust_stock(v_oud, 'receive', 0); r := r || 'FAIL receive 0 accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'receive 0: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_adjust_stock(v_oud, 'sale', 1); r := r || 'FAIL reason sale accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'reason sale by hand: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_adjust_stock(v_box, 'receive', 3); r := r || 'FAIL bundle stock adjusted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'bundle adjust: ' || st || ' (expect 22023)' || E'\n'; end;

  select * into rec from public.admin_stock_movements(v_oud) limit 1;
  r := r || format('newest movement: %s %s «%s» by %s, balance %s (expect adjust -%s, balance 9)',
    rec.reason, rec.delta, rec.note, rec.actor_name, rec.balance, q0 + 3 - 9) || E'\n';
  select count(*) into n from public.admin_stock_movements(v_oud) where reason = 'receive';
  r := r || 'receive movements: ' || n || ' (expect 1)' || E'\n';
  begin
    select sum(stock_quantity) into n from public.product_variants; r := r || 'FAIL staff read stock_quantity directly' || E'\n';
  exception when insufficient_privilege then r := r || 'staff direct read of stock_quantity still refused' || E'\n'; end;
  reset role;

  -- the ledger and the quantity agree
  select (select sum(delta) from public.stock_movements where variant_id = v_oud) = (select stock_quantity from public.product_variants where id = v_oud)
  into st;
  r := r || 'sum(movements) = stock_quantity: ' || st || E'\n';

  raise exception E'F3 TESTS (rolled back)\n%', r;
end $t$;
