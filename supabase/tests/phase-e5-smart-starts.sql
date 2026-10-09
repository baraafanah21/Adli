-- Smart start times with a 25-minute minimum block. Run in the SQL Editor after 20261012000000_booking_smart_starts.sql.
-- One DO block ending in a deliberate exception: everything is rolled back (the temporary gateway secret, the test
-- accounts, barbers, services, hours, closures and bookings). Only booking_code_seq moves on.
-- Each line is one check; a line starting with FAIL is a failure. Nothing is deleted: the test services have known
-- durations (20, 15, 30, 45), and two open days 2–7 days ahead with no salon-wide closure get 12:00–22:00 and
-- 12:00–20:00 for the length of the test. Each scenario has its own test barber.

do $t$
declare
  r text := '';
  st text; msg text;
  ok boolean;
  n int;
  txt text;
  exp text;
  sl timestamptz[];
  tz constant text := 'Asia/Hebron';
  secret constant text := 'phase-e5-test-secret';
  today date := (now() at time zone 'Asia/Hebron')::date;
  days date[];
  dd date;   -- 12:00–22:00
  d2 date;   -- 12:00–20:00
  stf uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid(); c5 uuid := gen_random_uuid(); c6 uuid := gen_random_uuid();
  b_a uuid; b_b uuid; b_c uuid; b_d uuid; b_e uuid; b_f uuid;
  s20 uuid; s15 uuid; s30 uuid; s45 uuid;
  bk uuid;
  v_code text;
  v_ends timestamptz;
begin
  -- Setup (as postgres) ---------------------------------------------------------------------------------------
  update private.app_secrets set secret_hash = extensions.digest(convert_to(secret, 'UTF8'), 'sha256') where name = 'order_gateway';

  select array_agg(x.d order by x.d) into days
  from (select today + i as d from generate_series(2, 7) i) x
  where not exists (
    select 1 from public.closures c
    where c.barber_id is null
      and (c.during && tstzrange(x.d::timestamp at time zone tz, (x.d + 1)::timestamp at time zone tz)
           or (c.weekday = extract(dow from x.d) and x.d >= c.valid_from and (c.valid_until is null or x.d <= c.valid_until))));
  dd := days[1]; d2 := days[2];
  if d2 is null then
    raise exception 'setup: fewer than two days 2–7 days ahead without a salon-wide closure';
  end if;
  insert into public.salon_hours (weekday, open_time, close_time) values
    (extract(dow from dd)::smallint, '12:00', '22:00'), (extract(dow from d2)::smallint, '12:00', '20:00')
  on conflict (weekday) do update set open_time = excluded.open_time, close_time = excluded.close_time;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (stf, 'authenticated', 'authenticated', 'e5-staff@test.invalid', now(), now()),
    (c1, 'authenticated', 'authenticated', 'e5-c1@test.invalid', now(), now()),
    (c2, 'authenticated', 'authenticated', 'e5-c2@test.invalid', now(), now()),
    (c3, 'authenticated', 'authenticated', 'e5-c3@test.invalid', now(), now()),
    (c4, 'authenticated', 'authenticated', 'e5-c4@test.invalid', now(), now()),
    (c5, 'authenticated', 'authenticated', 'e5-c5@test.invalid', now(), now()),
    (c6, 'authenticated', 'authenticated', 'e5-c6@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (stf, 'staff');

  insert into public.barbers (name_ar, sort) values ('اختبار أ', 900) returning id into b_a;
  insert into public.barbers (name_ar, sort) values ('اختبار ب', 901) returning id into b_b;
  insert into public.barbers (name_ar, sort) values ('اختبار ج', 902) returning id into b_c;
  insert into public.barbers (name_ar, sort) values ('اختبار د', 903) returning id into b_d;
  insert into public.barbers (name_ar, sort) values ('اختبار هـ', 904) returning id into b_e;
  insert into public.barbers (name_ar, sort) values ('اختبار و', 905) returning id into b_f;

  insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort)
    values ('zz-e5-cut', 'حلاقة اختبار', 30, 20, true, 900) returning id into s20;
  insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort)
    values ('zz-e5-trim', 'تحديد اختبار', 15, 15, true, 901) returning id into s15;
  insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort)
    values ('zz-e5-mask', 'ماسكات اختبار', 25, 30, true, 902) returning id into s30;
  insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort)
    values ('zz-e5-steam', 'بخار اختبار', 50, 45, true, 903) returning id into s45;

  r := r || 'days: ' || dd || ' (12–22), ' || d2 || ' (12–20)' || E'\n';

  -- Rules ----------------------------------------------------------------------------------------------------
  txt := concat_ws(' ', private.booking_block_min(15), private.booking_block_min(20), private.booking_block_min(25),
                   private.booking_block_min(30), private.booking_block_min(45), private.booking_block_min(90));
  r := r || case when txt = '25 25 25 30 45 90' then '' else 'FAIL ' end || 'block 15/20/25/30/45/90: ' || txt || ' (expect 25 25 25 30 45 90)' || E'\n';
  r := r || case when private.booking_rule('grid_min') = 15 and private.booking_rule('lead_min') = 60 then '' else 'FAIL ' end
        || 'grid_min / lead_min unchanged: ' || private.booking_rule('grid_min') || ' / ' || private.booking_rule('lead_min') || ' (expect 15 / 60)' || E'\n';

  -- An empty day, as anon ---------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select a.slots into sl from public.booking_availability(s20, b_a) a where a.day = dd;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl) x), ' ');
  exp := array_to_string(array(select to_char(dd + time '12:00' + make_interval(mins => 25 * k), 'HH24:MI') from generate_series(0, 23) k), ' ');
  r := r || case when txt = exp then '' else 'FAIL ' end || 'empty 12–22, cut: ' || cardinality(sl) || ' starts, '
        || left(txt, 17) || ' … ' || right(txt, 5) || ' (expect 24, 12:00 12:25 12:50 … 21:35)' || E'\n';
  select a.slots into sl from public.booking_availability(s20, b_a) a where a.day = d2;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl) x), ' ');
  r := r || case when cardinality(sl) = 19 and right(txt, 5) = '19:30' then '' else 'FAIL ' end
        || 'empty 12–20, cut: ' || cardinality(sl) || ' starts, last ' || right(txt, 5) || ' (expect 19, 19:30)' || E'\n';
  reset role;

  -- Two cuts back to back on barber A ----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.ends_at into v_ends from public.create_booking(gen_random_uuid(), s20, b_a, (dd + time '12:00') at time zone tz, 'زبون أول', '+970599000001', secret) c;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), s20, b_a, (dd + time '12:25') at time zone tz, 'زبون ثان', '+970599000002', secret);
    r := r || 'cut at 12:25 after one at 12:00: booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'FAIL cut at 12:25 after one at 12:00: ' || st || ' ' || msg || E'\n'; end;
  reset role;
  select string_agg((upper(b.during) - lower(b.during))::text || ' / ' || b.duration_min, ', ' order by lower(b.during)) into txt
  from public.bookings b where b.barber_id = b_a;
  r := r || case when txt = '00:25:00 / 20, 00:25:00 / 20' then '' else 'FAIL ' end
        || 'A: during / duration_min: ' || coalesce(txt, '∅') || ' (expect 00:25:00 / 20 twice)' || E'\n';
  r := r || 'info: create_booking ends_at for the 12:00 cut: ' || to_char(v_ends at time zone tz, 'HH24:MI') || ' (upper(during); not shown to the customer)' || E'\n';
  select a.slots into sl from public.booking_availability(s20, b_a) a where a.day = dd;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl[1:2]) x), ' ');
  r := r || case when txt = '12:50 13:15' then '' else 'FAIL ' end || 'A after the two cuts: ' || txt || ' … (expect 12:50 13:15)' || E'\n';

  -- Off the list, and taken ---------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), s20, b_e, (dd + time '12:10') at time zone tz, 'زبون سادس', '+970599000006', secret);
    r := r || 'FAIL 12:10 (not offered) booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || case when st = '22023' and msg = 'start_off_grid' then '' else 'FAIL ' end || '12:10 on an empty day: ' || st || ' ' || msg || ' (expect 22023 start_off_grid)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), s20, b_a, (dd + time '12:25') at time zone tz, 'زبون سادس', '+970599000006', secret);
    r := r || 'FAIL a taken time booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || case when st = 'P0020' then '' else 'FAIL ' end || 'A 12:25 (taken): ' || st || ' (expect P0020)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), s20, b_a, (dd + time '12:40') at time zone tz, 'زبون سادس', '+970599000006', secret);
    r := r || 'FAIL an overlapping time booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || case when st = 'P0020' then '' else 'FAIL ' end || 'A 12:40 (overlaps 12:25–12:50): ' || st || ' (expect P0020)' || E'\n'; end;
  reset role;

  -- A mask at 12:25 on barber B (a walk-in: 12:25 is on its 5-minute grid) -----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_code := public.admin_add_walk_in(b_b, s30, (dd + time '12:25') at time zone tz, null, null);
  reset role;
  select (upper(b.during) - lower(b.during))::text into txt from public.bookings b where b.code = v_code;
  r := r || case when txt = '00:30:00' then '' else 'FAIL ' end || 'B mask walk-in holds: ' || txt || ' (expect 00:30:00)' || E'\n';
  select a.slots into sl from public.booking_availability(s20, b_b) a where a.day = dd;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl[1:4]) x), ' ');
  r := r || case when txt = '12:00 12:55 13:20 13:45' then '' else 'FAIL ' end || 'B cut after a mask at 12:25: ' || txt || ' … (expect 12:00 12:55 13:20 13:45)' || E'\n';

  -- An old 30-minute booking at 12:30 on barber C ----------------------------------------------------------------
  insert into public.bookings (kind, barber_id, service_id, service_name_ar, price_ils, duration_min, during, status)
  values ('walk_in', b_c, s30, 'ماسكات اختبار', 25, 30,
          tstzrange((dd + time '12:30') at time zone tz, (dd + time '13:00') at time zone tz), 'confirmed');
  select a.slots into sl from public.booking_availability(s20, b_c) a where a.day = dd;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl[1:3]) x), ' ');
  r := r || case when txt = '12:00 13:00 13:25' then '' else 'FAIL ' end || 'C cut around an old 12:30–13:00: ' || txt || ' … (expect 12:00 13:00 13:25)' || E'\n';

  -- Trim (15) then steam (45) on barber D, and a closure once 15:00–15:30 ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform * from public.create_booking(gen_random_uuid(), s15, b_d, (dd + time '12:00') at time zone tz, 'زبون رابع', '+970599000004', secret);
  reset role;
  select a.slots into sl from public.booking_availability(s45, b_d) a where a.day = dd;
  r := r || case when sl[1] = (dd + time '12:25') at time zone tz then '' else 'FAIL ' end
        || 'D steam after the trim starts at: ' || coalesce(to_char(sl[1] at time zone tz, 'HH24:MI'), '∅') || ' (expect 12:25)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform * from public.create_booking(gen_random_uuid(), s45, b_d, (dd + time '12:25') at time zone tz, 'زبون خامس', '+970599000005', secret);
  reset role;
  select string_agg((upper(b.during) - lower(b.during))::text || ' / ' || b.duration_min, ', ' order by lower(b.during)) into txt
  from public.bookings b where b.barber_id = b_d;
  r := r || case when txt = '00:25:00 / 15, 00:45:00 / 45' then '' else 'FAIL ' end
        || 'D trim, steam: ' || coalesce(txt, '∅') || ' (expect 00:25:00 / 15, 00:45:00 / 45)' || E'\n';

  insert into public.closures (barber_id, during, reason)
  values (b_d, tstzrange((dd + time '15:00') at time zone tz, (dd + time '15:30') at time zone tz), 'اختبار');
  select a.slots into sl from public.booking_availability(s20, b_d) a where a.day = dd;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl[1:6]) x), ' ');
  r := r || case when txt = '13:10 13:35 14:00 14:25 15:30 15:55' then '' else 'FAIL ' end
        || 'D cut with a closure 15:00–15:30: ' || txt || ' … (expect 13:10 13:35 14:00 14:25 15:30 15:55)' || E'\n';

  -- A weekly closure 15:00–15:30 on barber E ------------------------------------------------------------------------
  insert into public.closures (barber_id, weekday, start_time, end_time, valid_from, reason)
  values (b_e, extract(dow from dd)::smallint, '15:00', '15:30', today, 'اختبار أسبوعي');
  select a.slots into sl from public.booking_availability(s20, b_e) a where a.day = dd;
  txt := array_to_string(array(select to_char(x at time zone tz, 'HH24:MI') from unnest(sl[1:9]) x), ' ');
  r := r || case when txt = '12:00 12:25 12:50 13:15 13:40 14:05 14:30 15:30 15:55' then '' else 'FAIL ' end
        || 'E cut with a weekly closure 15:00–15:30: ' || txt || ' … (expect … 14:05 14:30 15:30 15:55)' || E'\n';

  -- Walk-in, an old 15-minute booking, and the table check on barber F ---------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_code := public.admin_add_walk_in(b_f, s20, (dd + time '12:05') at time zone tz, null, null);
  reset role;
  select (upper(b.during) - lower(b.during))::text || ' / ' || b.duration_min into txt from public.bookings b where b.code = v_code;
  r := r || case when txt = '00:25:00 / 20' then '' else 'FAIL ' end || 'F cut walk-in at 12:05: ' || txt || ' (expect 00:25:00 / 20)' || E'\n';

  insert into public.bookings (kind, barber_id, service_id, service_name_ar, price_ils, duration_min, during, status)
  values ('walk_in', b_f, s15, 'تحديد اختبار', 15, 15,
          tstzrange((dd + time '13:00') at time zone tz, (dd + time '13:15') at time zone tz), 'confirmed')
  returning id into bk;
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.admin_set_booking_status(bk, 'cancelled', 'اختبار');
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'FAIL old 15-minute booking status: ' || st || ' ' || msg || E'\n'; end;
  reset role;
  select b.status into txt from public.bookings b where b.id = bk;
  r := r || case when txt = 'cancelled' then '' else 'FAIL ' end || 'old 15-minute booking (length 15) cancelled: ' || txt || ' (expect cancelled)' || E'\n';

  begin
    insert into public.bookings (kind, barber_id, service_id, service_name_ar, price_ils, duration_min, during, status)
    values ('walk_in', b_f, s20, 'حلاقة اختبار', 30, 20,
            tstzrange((dd + time '16:00') at time zone tz, (dd + time '16:30') at time zone tz), 'confirmed');
    r := r || 'FAIL 30 minutes held for a 20-minute service' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || case when st = '23514' then '' else 'FAIL ' end || '30 minutes for a 20-minute service: ' || st || ' (expect 23514)' || E'\n'; end;

  -- The helpers are server-only ------------------------------------------------------------------------------------
  ok := not has_function_privilege('anon', 'private.booking_starts(uuid, date, integer)', 'execute')
    and not has_function_privilege('authenticated', 'private.booking_starts(uuid, date, integer)', 'execute')
    and not has_function_privilege('anon', 'private.booking_block_min(integer)', 'execute')
    and not has_function_privilege('authenticated', 'private.booking_block_min(integer)', 'execute');
  r := r || case when ok then '' else 'FAIL ' end || 'booking_starts / booking_block_min executable by anon or authenticated: ' || (not ok)::text || ' (expect false)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform private.booking_starts(b_a, dd, 25);
    r := r || 'FAIL authenticated called booking_starts' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || case when st = '42501' then '' else 'FAIL ' end || 'authenticated booking_starts: ' || st || ' (expect 42501)' || E'\n'; end;
  begin
    perform private.booking_block_min(20);
    r := r || 'FAIL authenticated called booking_block_min' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || case when st = '42501' then '' else 'FAIL ' end || 'authenticated booking_block_min: ' || st || ' (expect 42501)' || E'\n'; end;
  reset role;

  raise exception E'E5 SMART STARTS TESTS (rolled back)\n%', r;
end $t$;
