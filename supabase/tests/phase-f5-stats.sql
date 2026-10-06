-- Phase F5: dashboard figures computed in Postgres, owner-only money, salon-time days. Run in the SQL Editor after
-- 20261007000600_admin_stats.sql. One DO block ending in a deliberate exception: everything is rolled back.
-- It inserts its own orders at known times (salon time), so the expected numbers are exact even on a live database:
-- each figure is compared with the same figure measured before the test orders were added.

do $t$
declare
  r text := '';
  st text;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Hebron')::date;
  before_day jsonb; after_day jsonb; before_month jsonb; after_month jsonb; s jsonb;
  daily_before int; daily_after int; n int;
  o uuid;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1, 'authenticated', 'authenticated', 'f5-owner@test.invalid', now(), now()),
    (staff,  'authenticated', 'authenticated', 'f5-staff@test.invalid', now(), now()),
    (cust,   'authenticated', 'authenticated', 'f5-cust@test.invalid',  now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');

  -- who may call what
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.admin_staff_summary(); r := r || 'FAIL anon read the summary' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_staff_summary refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_staff_summary(); r := r || 'FAIL customer read the summary' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_staff_summary refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_owner_dashboard('month'); r := r || 'FAIL staff saw the money' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_owner_dashboard refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform * from public.admin_sales_daily(30); r := r || 'FAIL staff saw daily sales' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_sales_daily refused (' || sqlstate || ')' || E'\n'; end;
  s := public.admin_staff_summary();
  r := r || 'staff summary keys: ' || (select string_agg(k, ', ' order by k) from jsonb_object_keys(s) k) || ' (no money)' || E'\n';
  reset role;

  -- owner: measure, add known orders, measure again
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  before_day := public.admin_owner_dashboard('day');
  before_month := public.admin_owner_dashboard('month');
  select sales into daily_before from public.admin_sales_daily(30) where day = today - 1;
  reset role;

  -- today, a few minutes ago: confirmed 100 (area رفيديا) and done 50 (no area); new 999 and cancelled 777 don't count
  insert into public.orders (idempotency_key, customer_name, area, total_ils, status, created_at) values
    (gen_random_uuid(), 'f5 a', 'رفيديا', 100, 'confirmed', now() - interval '2 minutes'),
    (gen_random_uuid(), 'f5 b', null,     50,  'done',      now() - interval '1 minute'),
    (gen_random_uuid(), 'f5 c', 'رفيديا', 999, 'new',       now() - interval '1 minute'),
    (gen_random_uuid(), 'f5 d', 'رفيديا', 777, 'cancelled', now() - interval '1 minute');
  -- yesterday 23:30 salon time: counts for yesterday, not today (the day boundary is salon midnight, not UTC)
  insert into public.orders (idempotency_key, customer_name, area, total_ils, status, created_at)
  values (gen_random_uuid(), 'f5 e', 'نابلس', 40, 'done', (today::timestamp - interval '30 minutes') at time zone 'Asia/Hebron');
  -- a line for the top products
  select id into o from public.orders where customer_name = 'f5 a';
  insert into public.order_items (order_id, name_ar, unit_price_ils, qty) values (o, 'منتج اختبار f5', 50, 2);

  set local role authenticated;
  after_day := public.admin_owner_dashboard('day');
  after_month := public.admin_owner_dashboard('month');
  select sales into daily_after from public.admin_sales_daily(30) where day = today - 1;
  select count(*) into n from public.admin_sales_daily(30);
  reset role;

  r := r || format('today: sales +%s (expect +150), orders +%s (expect +2)',
    (after_day ->> 'sales')::int - (before_day ->> 'sales')::int,
    (after_day ->> 'orders')::int - (before_day ->> 'orders')::int) || E'\n';
  r := r || 'today avg (only test orders if none before): ' || (after_day ->> 'avg') || E'\n';
  r := r || format('yesterday 23:30 order: daily[yesterday] +%s (expect +40); today unaffected by it',
    daily_after - daily_before) || E'\n';
  r := r || format('month: sales +%s (expect +190 if yesterday is this month, else +150)',
    (after_month ->> 'sales')::int - (before_month ->> 'sales')::int) || E'\n';
  r := r || 'daily rows: ' || n || ' (expect 30, zero days included)' || E'\n';
  r := r || 'top contains test product: ' ||
    (after_month -> 'top' @> '[{"name_ar": "منتج اختبار f5"}]'::jsonb)::text || E'\n';
  r := r || 'areas: ' || (after_day -> 'areas')::text || E'\n';
  r := r || 'period keys: ' || (select string_agg(k, ', ' order by k) from jsonb_object_keys(after_day) k) || E'\n';
  set local role authenticated;
  begin
    perform public.admin_owner_dashboard('year'); r := r || 'FAIL unknown period accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'unknown period: ' || st || ' (expect 22023)' || E'\n'; end;
  reset role;

  raise exception E'F5 TESTS (rolled back)\n%', r;
end $t$;
