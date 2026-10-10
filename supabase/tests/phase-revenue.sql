-- Booking revenue: bookings.paid_ils, admin_complete_booking(), admin_set_booking_paid(), admin_revenue(). Run in the SQL Editor after
-- 20261013000000_booking_revenue.sql. One DO block ending in a deliberate exception: everything is rolled back.
-- Its bookings sit on January 2020 days, with their own barbers and services, so every expected figure is exact even on
-- the live database.
--
--   D1 2020-01-14  b1 A · S1 (₪40)  «حضر», no amount        → 40
--   D2 2020-01-15  b2 A · S2 (₪60)  «حضر» with ₪70           → 70
--                  b3 B · S1 (₪40)  admin_set_booking_status → 40
--   D3 2020-01-16  b4 B · S2        no_show                  → not counted
--                  b5 A · S1        cancelled                → not counted
--                  b6 B · S1        walk-in, «حضر»           → 40
--   D4 2020-01-20  b7 A · S1        «حضر»                    → 40 (outside D1–D3)

do $t$
declare
  r text := '';
  st text;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  tz text := 'Asia/Hebron';
  d1 date := '2020-01-14'; d2 date := '2020-01-15'; d3 date := '2020-01-16'; d4 date := '2020-01-20';
  ba uuid; bb uuid; s1 uuid; s2 uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid; b7 uuid;
  v jsonb;
  n integer;
  c record;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1, 'authenticated', 'authenticated', 'rev-owner@test.invalid', now(), now()),
    (staff,  'authenticated', 'authenticated', 'rev-staff@test.invalid', now(), now()),
    (cust,   'authenticated', 'authenticated', 'rev-cust@test.invalid',  now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');

  insert into public.barbers (name_ar, sort) values ('حلاق اختبار أ', 990) returning id into ba;
  insert into public.barbers (name_ar, sort) values ('حلاق اختبار ب', 991) returning id into bb;
  insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort)
    values ('rev-test-1', 'خدمة اختبار ١', 40, 30, true, 990) returning id into s1;
  insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort)
    values ('rev-test-2', 'خدمة اختبار ٢', 60, 30, true, 991) returning id into s2;

  -- Every booking starts confirmed, in the past (so «حضر» is allowed).
  insert into public.bookings (idempotency_key, kind, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status)
  select gen_random_uuid(), x.kind, x.barber, x.service, 'اختبار', x.price, 30,
         'زبون اختبار', '+970599000001',
         tstzrange((x.day + x.at) at time zone tz, (x.day + x.at + interval '30 minutes') at time zone tz), 'confirmed'
  from (values
    (1, 'online', ba, s1, 40, d1, time '10:00'),
    (2, 'online', ba, s2, 60, d2, time '10:00'),
    (3, 'online', bb, s1, 40, d2, time '10:00'),
    (4, 'online', bb, s2, 60, d3, time '10:00'),
    (5, 'online', ba, s1, 40, d3, time '10:00'),
    (6, 'walk_in', bb, s1, 40, d3, time '11:00'),
    (7, 'online', ba, s1, 40, d4, time '10:00')
  ) as x(n, kind, barber, service, price, day, at)
  order by x.n;
  select id into b1 from public.bookings where barber_id = ba and salon_date = d1;
  select id into b2 from public.bookings where barber_id = ba and salon_date = d2;
  select id into b3 from public.bookings where barber_id = bb and salon_date = d2;
  select id into b4 from public.bookings where barber_id = bb and salon_date = d3 and kind = 'online';
  select id into b5 from public.bookings where barber_id = ba and salon_date = d3;
  select id into b6 from public.bookings where barber_id = bb and salon_date = d3 and kind = 'walk_in';
  select id into b7 from public.bookings where barber_id = ba and salon_date = d4;
  r := r || 'confirmed bookings have no amount: ' ||
    (select bool_and(paid_ils is null)::text from public.bookings where id in (b1, b2, b3, b4, b5, b6, b7)) || E'\n';

  -- staff: «حضر» with and without an amount, the other outcomes
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into c from public.admin_complete_booking(b1, null);
  r := r || format('b1 «حضر» no amount: %s changed=%s paid=%s (expect completed true 40)', c.status, c.changed,
    (select paid_ils from public.bookings where id = b1)) || E'\n';
  select * into c from public.admin_complete_booking(b2, 70);
  r := r || format('b2 «حضر» ₪70: paid=%s (expect 70)', (select paid_ils from public.bookings where id = b2)) || E'\n';
  perform public.admin_set_booking_status(b3, 'completed');
  r := r || format('b3 through admin_set_booking_status: paid=%s (expect 40)', (select paid_ils from public.bookings where id = b3)) || E'\n';
  perform public.admin_set_booking_status(b4, 'no_show');
  perform public.admin_set_booking_status(b5, 'cancelled', 'اختبار');
  perform public.admin_complete_booking(b6, null);
  r := r || format('b6 walk-in «حضر»: paid=%s (expect 40)', (select paid_ils from public.bookings where id = b6)) || E'\n';
  perform public.admin_complete_booking(b7, null);
  r := r || format('no_show / cancelled amounts: %s / %s (expect null / null)',
    coalesce((select paid_ils::text from public.bookings where id = b4), 'null'),
    coalesce((select paid_ils::text from public.bookings where id = b5), 'null')) || E'\n';
  select * into c from public.admin_complete_booking(b2, 99);
  r := r || format('b2 again with ₪99: changed=%s paid=%s (expect false 70)', c.changed,
    (select paid_ils from public.bookings where id = b2)) || E'\n';
  r := r || 'events for b1: ' ||
    (select string_agg(coalesce(from_status, '∅') || '→' || to_status, ', ') from public.booking_events where booking_id = b1) ||
    ' (expect confirmed→completed)' || E'\n';
  begin
    perform public.admin_complete_booking(b4, -1); r := r || 'FAIL negative amount accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'amount -1: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_complete_booking(b4, 10001); r := r || 'FAIL amount over 10000 accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'amount 10001: ' || st || ' (expect 22023)' || E'\n'; end;
  -- the amount changed after «حضر» (b6: a relative paid ₪25), then back
  n := public.admin_set_booking_paid(b6, 25);
  r := r || format('b6 amount → 25: returns %s, saved %s (expect 25 25)', n,
    (select paid_ils from public.bookings where id = b6)) || E'\n';
  r := r || 'its event: ' || (select from_status || '→' || to_status || ' «' || note || '»' from public.booking_events
    where booking_id = b6 order by id desc limit 1) || E'\n';
  perform public.admin_set_booking_paid(b6, 25);
  r := r || 'same amount again logs nothing: ' || (select count(*) from public.booking_events where booking_id = b6 and from_status = 'completed') ||
    ' amount event(s) (expect 1)' || E'\n';
  perform public.admin_set_booking_paid(b6, 40);
  begin
    perform public.admin_set_booking_paid(b4, 10); r := r || 'FAIL amount on a no_show booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'amount on no_show: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_booking_paid(b6, null); r := r || 'FAIL null amount accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'null amount: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_set_booking_paid(gen_random_uuid(), 10); r := r || 'FAIL unknown booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'unknown booking: ' || st || ' (expect P0006)' || E'\n'; end;
  r := r || 'calendar day D2 amounts: ' || (select string_agg(coalesce(e ->> 'paid_ils', 'null'), ', ' order by e ->> 'starts_at', e ->> 'barber_id')
    from jsonb_array_elements(public.admin_bookings_day(d2) -> 'bookings') e where e ->> 'barber_id' in (ba::text, bb::text)) ||
    ' (expect 70 and 40)' || E'\n';
  begin
    perform public.admin_revenue(d1, d3); r := r || 'FAIL staff read the revenue' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_revenue refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.bookings set paid_ils = 1 where id = b1; r := r || 'FAIL staff wrote paid_ils directly' || E'\n';
  exception when insufficient_privilege then r := r || 'staff UPDATE bookings refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- customer and anon
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_revenue(d1, d3); r := r || 'FAIL customer read the revenue' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_revenue refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_complete_booking(b4, 10); r := r || 'FAIL customer marked «حضر»' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_complete_booking refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_set_booking_paid(b6, 1); r := r || 'FAIL customer changed an amount' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_set_booking_paid refused (' || sqlstate || ')' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.admin_revenue(d1, d3); r := r || 'FAIL anon read the revenue' || E'\n';
  exception when insufficient_privilege then r := r || 'anon admin_revenue refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- owner: the figures
  perform set_config('request.jwt.claims', json_build_object('sub', owner1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.admin_revenue(d1, d3);
  r := r || format('D1–D3: total %s count %s (expect 190 4)', v ->> 'total_ils', v ->> 'count') || E'\n';
  r := r || 'by barber: ' || (select string_agg(e ->> 'name_ar' || ' ' || (e ->> 'total_ils') || '/' || (e ->> 'count'), ', ')
    from jsonb_array_elements(v -> 'by_barber') e) || ' (expect أ 110/2, ب 80/2)' || E'\n';
  r := r || 'by service: ' || (select string_agg(e ->> 'name_ar' || ' ' || (e ->> 'total_ils') || '/' || (e ->> 'count'), ', ')
    from jsonb_array_elements(v -> 'by_service') e) || ' (expect ١ 120/3, ٢ 70/1)' || E'\n';
  r := r || 'by day: ' || (select string_agg((e ->> 'day') || ' ' || (e ->> 'total_ils') || '/' || (e ->> 'count'), ', ')
    from jsonb_array_elements(v -> 'by_day') e) || ' (expect 14: 40/1, 15: 110/2, 16: 40/1)' || E'\n';
  v := public.admin_revenue(d1, d3, bb);
  r := r || format('barber ب: %s / %s (expect 80 / 2)', v ->> 'total_ils', v ->> 'count') || E'\n';
  v := public.admin_revenue(d1, d3, null, s2);
  r := r || format('service ٢: %s / %s (expect 70 / 1)', v ->> 'total_ils', v ->> 'count') || E'\n';
  v := public.admin_revenue(d1, d3, ba, s1);
  r := r || format('barber أ + service ١: %s / %s (expect 40 / 1, b5 cancelled not counted)', v ->> 'total_ils', v ->> 'count') || E'\n';
  v := public.admin_revenue(d2, d2);
  r := r || format('D2 only: %s / %s (expect 110 / 2)', v ->> 'total_ils', v ->> 'count') || E'\n';
  v := public.admin_revenue(d1, d4);
  r := r || format('D1–D4: %s / %s (expect 230 / 5)', v ->> 'total_ils', v ->> 'count') || E'\n';
  v := public.admin_revenue(d3, d3, null, s2);
  r := r || format('D3, service ٢ (only the no-show): %s / %s, by_barber %s (expect 0 / 0, [])',
    v ->> 'total_ils', v ->> 'count', v -> 'by_barber') || E'\n';
  begin
    perform public.admin_revenue(d3, d1); r := r || 'FAIL reversed range accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'to before from: ' || st || ' (expect 22023)' || E'\n'; end;
  begin
    perform public.admin_revenue(d1, d1 + 367); r := r || 'FAIL range over a year accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || '367 days: ' || st || ' (expect 22023)' || E'\n'; end;
  reset role;

  -- the trigger on its own (no RPC leaves completed today; this is the rule for any path that would)
  update public.bookings set status = 'no_show' where id = b1;
  r := r || 'b1 completed → no_show: paid ' || coalesce((select paid_ils::text from public.bookings where id = b1), 'null') || ' (expect null)' || E'\n';
  update public.bookings set paid_ils = 5 where id = b4;
  r := r || 'amount on a no_show booking: ' || coalesce((select paid_ils::text from public.bookings where id = b4), 'null') || ' (expect null)' || E'\n';
  update public.bookings set status = 'completed' where id = b1;
  r := r || 'b1 back to completed: paid ' || (select paid_ils from public.bookings where id = b1) || ' (expect 40)' || E'\n';

  raise exception E'REVENUE TESTS (rolled back)\n%', r;
end $t$;
