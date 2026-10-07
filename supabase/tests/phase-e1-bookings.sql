-- Phase E1: bookings against the live database. Run in the SQL Editor after 20261007000700_bookings.sql.
-- One DO block ending in a deliberate exception: everything is rolled back (the temporary gateway secret, the test
-- accounts, barber, hours and bookings). Only booking_code_seq moves on (sequences don't roll back).
-- Each line is one check; a line starting with FAIL is a failure. Times are relative to now(), and for the length
-- of the test every day is open 00:00–24:00 (one day is then closed again), so it gives the same result at any hour.
-- Real concurrency (two sessions) is in phase-e1-concurrency.sh; here the lock path and the constraint path are
-- checked one after the other.

do $t$
declare
  r text := '';
  st text;
  msg text;
  dt text;
  n int;
  b boolean;
  tz constant text := 'Asia/Hebron';
  secret constant text := 'phase-e1-test-secret';
  today date := (now() at time zone 'Asia/Hebron')::date;
  dd date := (now() at time zone 'Asia/Hebron')::date + 3;      -- the main test day
  fri date;
  c1 uuid := gen_random_uuid();  -- books, cancels, books again
  c2 uuid := gen_random_uuid();  -- the second customer on the same time
  c3 uuid := gen_random_uuid();  -- the no-show
  c4 uuid := gen_random_uuid();  -- window, late cancel, rate limit
  c5 uuid := gen_random_uuid();  -- closing time
  c6 uuid := gen_random_uuid();  -- pending that expires
  s1 uuid := gen_random_uuid();  -- staff
  tb uuid;                        -- test barber
  tb_off uuid;                    -- inactive test barber
  v_cut uuid; v_short uuid; v_wax uuid;
  k1 uuid := gen_random_uuid();
  code1 text; code1b text; st1 text;
  bk1 uuid; bk2 uuid; bk4 uuid; bk3_past uuid; bk3_new uuid; bk6 uuid;
  t_soon timestamptz; t_ok timestamptz;
  sl timestamptz[];
begin
  -- Setup (as postgres) ---------------------------------------------------------------------------------------
  update private.app_secrets set secret_hash = extensions.digest(convert_to(secret, 'UTF8'), 'sha256') where name = 'order_gateway';

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (c1, 'authenticated', 'authenticated', 'e1-c1@test.invalid', now(), now()),
    (c2, 'authenticated', 'authenticated', 'e1-c2@test.invalid', now(), now()),
    (c3, 'authenticated', 'authenticated', 'e1-c3@test.invalid', now(), now()),
    (c4, 'authenticated', 'authenticated', 'e1-c4@test.invalid', now(), now()),
    (c5, 'authenticated', 'authenticated', 'e1-c5@test.invalid', now(), now()),
    (c6, 'authenticated', 'authenticated', 'e1-c6@test.invalid', now(), now()),
    (s1, 'authenticated', 'authenticated', 'e1-s1@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (s1, 'staff');

  insert into public.barbers (name_ar, sort) values ('حلاق اختبار', 900) returning id into tb;
  insert into public.barbers (name_ar, sort, is_active) values ('حلاق معطّل', 901, false) returning id into tb_off;
  select id into v_cut from public.services where slug = 'full-cut';     -- 30 min
  select id into v_short from public.services where slug = 'hair-beard'; -- 15 min
  select id into v_wax from public.services where slug = 'wax';          -- not bookable online

  delete from public.salon_hours;
  insert into public.salon_hours (weekday, open_time, close_time) select d, '00:00', '24:00' from generate_series(0, 6) d;

  -- Phone numbers ---------------------------------------------------------------------------------------------
  r := r || 'phone 059 912 3456 → ' || coalesce(private.normalize_mobile('059 912 3456'), 'null') || ' (expect +970599123456)' || E'\n';
  r := r || 'phone 054-123-4567 → ' || coalesce(private.normalize_mobile('054-123-4567'), 'null') || ' (expect +972541234567)' || E'\n';
  r := r || 'phone +970 56 123 4567 → ' || coalesce(private.normalize_mobile('+970 56 123 4567'), 'null') || ' (expect +970561234567)' || E'\n';
  r := r || 'phone 00972 052 1234567 → ' || coalesce(private.normalize_mobile('00972 052 1234567'), 'null') || ' (expect +972521234567)' || E'\n';
  r := r || 'phone ٠٥٩٩١٢٣٤٥٦ → ' || coalesce(private.normalize_mobile('٠٥٩٩١٢٣٤٥٦'), 'null') || ' (expect +970599123456)' || E'\n';
  r := r || 'phone 02 2345678 (landline) → ' || coalesce(private.normalize_mobile('02 2345678'), 'null') || ' (expect null)' || E'\n';
  r := r || 'phone 0599a123456 → ' || coalesce(private.normalize_mobile('0599a123456'), 'null') || ' (expect null)' || E'\n';

  -- Availability as anon ---------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.booking_availability(v_cut, tb);
  r := r || 'availability days: ' || n || ' (expect 8)' || E'\n';
  select a.slots into sl from public.booking_availability(v_cut, tb) a where a.day = dd;
  r := r || 'D 13:00 offered: ' || (((dd + time '13:00') at time zone tz) = any (sl))::text || ' (expect true)' || E'\n';
  r := r || 'anon mine on D: ' || (select a.mine from public.booking_availability(v_cut, tb) a where a.day = dd)::text || ' (expect false)' || E'\n';
  begin
    perform * from public.booking_availability(v_wax, tb); r := r || 'FAIL add-on service offered' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'add-on availability: ' || st || ' (expect P0027)' || E'\n'; end;
  begin
    perform * from public.booking_availability(v_cut, tb_off); r := r || 'FAIL inactive barber offered' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'inactive barber availability: ' || st || ' (expect P0027)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '13:00') at time zone tz, 'زائر', '0599123456', secret);
    r := r || 'FAIL anon booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'anon create_booking: ' || st || ' (expect 42501)' || E'\n'; end;
  begin
    perform count(*) from public.bookings; r := r || 'FAIL anon read bookings' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'anon reads bookings: ' || st || ' (expect 42501)' || E'\n'; end;
  begin
    perform user_id from public.barbers; r := r || 'FAIL anon read barbers.user_id' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'anon reads barbers.user_id: ' || st || ' (expect 42501)' || E'\n'; end;
  select count(*) into n from public.barbers where id in (tb, tb_off);
  r := r || 'anon sees test barbers: ' || n || ' (expect 1, the inactive one hidden)' || E'\n';
  reset role;

  -- c1 books D 13:00 ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '13:00') at time zone tz, 'عميل', '0599123456', 'wrong');
    r := r || 'FAIL wrong secret accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'wrong secret: ' || st || ' (expect 42501)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '13:00') at time zone tz, 'عميل', '02 2345678', secret);
    r := r || 'FAIL landline accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'landline: ' || st || ' ' || msg || ' (expect 22023 phone_invalid)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_wax, tb, (dd + time '13:00') at time zone tz, 'عميل', '0599123456', secret);
    r := r || 'FAIL add-on booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'add-on booked: ' || st || ' (expect P0027)' || E'\n'; end;

  select c.code, c.status into code1, st1
  from public.create_booking(k1, v_cut, tb, (dd + time '13:00') at time zone tz, ' عميل أول ', '059 912 3456', secret) c;
  r := r || 'c1 booked: ' || code1 || ' ' || st1 || ' (expect confirmed)' || E'\n';
  select c.code into code1b
  from public.create_booking(k1, v_cut, tb, (dd + time '13:00') at time zone tz, 'عميل أول', '0599123456', secret) c;
  r := r || 'same key, same booking: ' || (code1b = code1)::text || E'\n';
  select count(*) into n from public.bookings where user_id = c1;
  r := r || 'c1 bookings after the double press: ' || n || ' (expect 1)' || E'\n';
  select id into bk1 from public.bookings where code = code1;
  r := r || 'c1 profile: ' || (select full_name || ' ' || phone from public.profiles where id = c1) || ' (expect عميل أول +970599123456)' || E'\n';
  r := r || 'c1 booking: ' || (select service_name_ar || ' ₪' || price_ils || ' ' || duration_min || 'min, ends '
        || to_char(upper(during) at time zone tz, 'HH24:MI') from public.bookings where id = bk1) || ' (expect 30 min, ends 13:30)' || E'\n';
  r := r || 'c1 mine on D: ' || (select a.mine from public.booking_availability(v_cut, tb) a where a.day = dd)::text || ' (expect true)' || E'\n';

  -- daily limit
  begin
    perform * from public.create_booking(gen_random_uuid(), v_short, tb, (dd + time '18:00') at time zone tz, 'عميل أول', '0599123456', secret);
    r := r || 'FAIL second booking the same day' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'second booking same day: ' || st || ' (expect P0022)' || E'\n'; end;
  reset role;

  -- c2 on the same time ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '13:00') at time zone tz, 'عميل ثان', '0541234567', secret);
    r := r || 'FAIL same time booked twice' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'same time, second customer: ' || st || ' (expect P0020)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '13:15') at time zone tz, 'عميل ثان', '0541234567', secret);
    r := r || 'FAIL overlapping time booked' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'overlapping 13:15: ' || st || ' (expect P0020)' || E'\n'; end;
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '13:30') at time zone tz, 'عميل ثان', '0541234567', secret) c;
  r := r || 'right after it, 13:30 (no gap needed): ' || st1 || ' (expect confirmed)' || E'\n';
  select id into bk2 from public.bookings where user_id = c2;
  select a.slots into sl from public.booking_availability(v_cut, tb) a where a.day = dd;
  r := r || 'D offers 13:00 / 13:15 / 13:30 / 14:00: '
        || (((dd + time '13:00') at time zone tz) = any (sl))::text || ' / '
        || (((dd + time '13:15') at time zone tz) = any (sl))::text || ' / '
        || (((dd + time '13:30') at time zone tz) = any (sl))::text || ' / '
        || (((dd + time '14:00') at time zone tz) = any (sl))::text || ' (expect false / false / false / true)' || E'\n';
  -- c2 sees only its own booking, no closures, no events
  select count(*) into n from public.bookings where user_id is distinct from c2;
  r := r || 'c2 sees others'' bookings: ' || n || ' (expect 0)' || E'\n';
  select count(*) into n from public.booking_events;
  r := r || 'c2 sees booking events: ' || n || ' (expect 0)' || E'\n';
  begin
    perform * from public.cancel_my_booking(bk1); r := r || 'FAIL c2 cancelled c1''s booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'c2 cancels c1''s booking: ' || st || ' (expect P0006)' || E'\n'; end;
  begin
    perform * from public.admin_set_booking_status(bk1, 'cancelled', 'x'); r := r || 'FAIL customer changed a status' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'customer admin_set_booking_status: ' || st || ' (expect 42501)' || E'\n'; end;
  begin
    perform public.admin_clear_flag(c2); r := r || 'FAIL customer cleared a flag' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'customer admin_clear_flag: ' || st || ' (expect 42501)' || E'\n'; end;
  reset role;

  -- the constraint underneath: a direct overlapping insert (no function, no lock)
  begin
    insert into public.bookings (kind, barber_id, service_id, service_name_ar, price_ils, duration_min, during, status)
    values ('walk_in', tb, v_cut, 'x', 0, 30, tstzrange((dd + time '13:10') at time zone tz, (dd + time '13:40') at time zone tz), 'confirmed');
    r := r || 'FAIL overlapping insert accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'direct overlapping insert: ' || st || ' (expect 23P01)' || E'\n'; end;

  -- c1 cancels, then the day is free again -----------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.status into st1 from public.cancel_my_booking(bk1) c;
  r := r || 'c1 cancels days ahead: ' || st1 || E'\n';
  select c.changed::text into st1 from public.cancel_my_booking(bk1) c;
  r := r || 'cancel again changes nothing: changed=' || st1 || E'\n';
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_short, tb, (dd + time '18:00') at time zone tz, 'عميل أول', '0599123456', secret) c;
  r := r || 'c1 books again that day after cancelling: ' || st1 || ' (expect confirmed)' || E'\n';
  reset role;

  -- Window, grid, closing time, closed day (c4, c5) -------------------------------------------------------------
  t_soon := (date_bin('15 minutes', (now() + interval '30 minutes') at time zone tz, timestamp '2000-01-01') + interval '15 minutes') at time zone tz;
  t_ok   := (date_bin('15 minutes', (now() + interval '61 minutes') at time zone tz, timestamp '2000-01-01') + interval '15 minutes') at time zone tz;
  perform set_config('request.jwt.claims', json_build_object('sub', c4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_short, tb, t_soon, 'عميل رابع', '0599000004', secret);
    r := r || 'FAIL booked less than an hour ahead' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate;
    r := r || 'start in ' || round(extract(epoch from t_soon - now()) / 60) || ' min: ' || st || ' (expect P0021)' || E'\n'; end;
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_short, tb, t_ok, 'عميل رابع', '0599000004', secret) c;
  r := r || 'start in ' || round(extract(epoch from t_ok - now()) / 60) || ' min: ' || st1 || ' (expect confirmed)' || E'\n';
  select id into bk4 from public.bookings where user_id = c4;
  begin
    perform * from public.cancel_my_booking(bk4); r := r || 'FAIL cancelled less than 2 hours before' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'cancel less than 2 h before: ' || st || ' (expect P0024)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_short, tb, ((today + 8) + time '13:00') at time zone tz, 'عميل رابع', '0599000004', secret);
    r := r || 'FAIL booked 8 days ahead' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'today + 8: ' || st || ' (expect P0021)' || E'\n'; end;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_short, tb, (dd + time '13:07') at time zone tz, 'عميل رابع', '0599000004', secret);
    r := r || 'FAIL off-grid start accepted' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text; r := r || '13:07: ' || st || ' ' || msg || ' (expect 22023 start_off_grid)' || E'\n'; end;

  -- rate limit: c4 already has 1 booking this hour; 4 more on other days pass, the 6th is refused
  n := 0;
  for i in 1..7 loop
    exit when n = 4;
    continue when today + i = (t_ok at time zone tz)::date or today + i = dd;
    perform * from public.create_booking(gen_random_uuid(), v_short, tb, ((today + i) + time '10:00') at time zone tz, 'عميل رابع', '0599000004', secret);
    n := n + 1;
  end loop;
  r := r || 'c4 bookings this hour: ' || (select count(*) from public.bookings where user_id = c4) || ' (expect 5)' || E'\n';
  begin
    perform * from public.create_booking(gen_random_uuid(), v_short, tb, (dd + time '10:00') at time zone tz, 'عميل رابع', '0599000004', secret);
    r := r || 'FAIL 6th booking within the hour' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || '6th booking in an hour: ' || st || ' (expect P0023)' || E'\n'; end;
  reset role;

  -- closing time on D: 20:00 for this test
  update public.salon_hours set close_time = '20:00' where weekday = extract(dow from dd);
  perform set_config('request.jwt.claims', json_build_object('sub', c5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '19:45') at time zone tz, 'عميل خامس', '0599000005', secret);
    r := r || 'FAIL booking runs past closing' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || '19:45 + 30 min with closing 20:00: ' || st || ' (expect P0020)' || E'\n'; end;
  select a.slots into sl from public.booking_availability(v_cut, tb) a where a.day = dd;
  r := r || 'last slot offered on D: ' || to_char(sl[array_upper(sl, 1)] at time zone tz, 'HH24:MI') || ' (expect 19:30)' || E'\n';
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '19:30') at time zone tz, 'عميل خامس', '0599000005', secret) c;
  r := r || '19:30 + 30 min: ' || st1 || ' (expect confirmed)' || E'\n';
  reset role;

  -- Closures -----------------------------------------------------------------------------------------------------
  insert into public.closures (barber_id, weekday, start_time, end_time, valid_from, reason)
  values (tb, extract(dow from dd), '16:00', '17:00', today, 'استراحة');
  insert into public.closures (barber_id, during, reason)
  values (null, tstzrange(((dd + 1) + time '14:00') at time zone tz, ((dd + 1) + time '15:00') at time zone tz), 'الصالون مغلق');
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select a.slots into sl from public.booking_availability(v_cut, tb) a where a.day = dd;
  r := r || 'weekly break 16–17 on D, offers 15:30 / 15:45 / 16:30 / 17:00: '
        || (((dd + time '15:30') at time zone tz) = any (sl))::text || ' / '
        || (((dd + time '15:45') at time zone tz) = any (sl))::text || ' / '
        || (((dd + time '16:30') at time zone tz) = any (sl))::text || ' / '
        || (((dd + time '17:00') at time zone tz) = any (sl))::text || ' (expect true / false / false / true)' || E'\n';
  select a.slots into sl from public.booking_availability(v_cut, tb) a where a.day = dd + 1;
  r := r || 'salon-wide 14–15 on D+1, offers 14:00: ' || (((dd + 1 + time '14:00') at time zone tz) = any (sl))::text || ' (expect false)' || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (dd + time '16:15') at time zone tz, 'عميل سادس', '0599000006', secret);
    r := r || 'FAIL booked inside a break' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'booking inside the break: ' || st || ' (expect P0020)' || E'\n'; end;
  select count(*) into n from public.closures;
  r := r || 'customer sees closures: ' || n || ' (expect 0)' || E'\n';
  reset role;

  -- No-show, flag, pending, expiry ------------------------------------------------------------------------------
  -- c3 had a booking earlier today (inserted directly: the past can't be booked).
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status)
  values (gen_random_uuid(), c3, tb, v_cut, 'حلاقة كاملة', 30, 30, 'عميل ثالث', '+970599000003',
          tstzrange(now() - interval '2 hours', now() - interval '90 minutes'), 'confirmed')
  returning id into bk3_past;

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.admin_set_booking_status(bk2, 'completed'); r := r || 'FAIL completed before its start' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail; r := r || 'completed before start: ' || st || ' ' || dt || ' (expect P0028)' || E'\n'; end;
  begin
    perform * from public.admin_set_booking_status(bk2, 'cancelled'); r := r || 'FAIL salon cancelled without a reason' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text; r := r || 'salon cancel without reason: ' || st || ' ' || msg || ' (expect 22023 reason_required)' || E'\n'; end;
  perform * from public.admin_set_booking_status(bk2, 'cancelled', 'الحلاق مريض');
  perform * from public.admin_set_booking_status(bk3_past, 'no_show');
  r := r || 'c3 flag: ' || (select count(*) || ' open, by staff ' || bool_and(flagged_by = s1)::text from public.account_flags where user_id = c3 and cleared_at is null) || ' (expect 1 open, true)' || E'\n';
  reset role;

  -- a no-show still counts for that day (the index refuses a second row for c3 today)
  begin
    insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                                 customer_name, phone, during, status)
    values (gen_random_uuid(), c3, tb, v_cut, 'حلاقة كاملة', 30, 30, 'عميل ثالث', '+970599000003',
            (select during from public.bookings where id = bk3_past), 'confirmed');  -- same salon day, whatever the hour
    r := r || 'FAIL second booking after a no-show the same day' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'same day after a no-show: ' || st || ' (expect 23505)' || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || 'c2 sees the salon''s reason: ' || (select status || ' / ' || cancelled_by || ' / ' || cancel_reason from public.bookings where id = bk2) || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.account_flags where cleared_at is null;
  r := r || 'c3 sees own flag: ' || n || ' (expect 1)' || E'\n';
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_cut, tb, ((dd + 2) + time '13:00') at time zone tz, 'عميل ثالث', '0599000003', secret) c;
  r := r || 'c3 books with the flag: ' || st1 || ' (expect pending)' || E'\n';
  select id into bk3_new from public.bookings where user_id = c3 and status = 'pending';
  select a.slots into sl from public.booking_availability(v_cut, tb) a where a.day = dd + 2;
  r := r || 'a pending booking holds its time: ' || (not (((dd + 2 + time '13:00') at time zone tz) = any (sl)))::text || E'\n';
  begin
    perform public.admin_clear_flag(c3); r := r || 'FAIL customer cleared own flag' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'c3 clears own flag: ' || st || ' (expect 42501)' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.status into st1 from public.admin_set_booking_status(bk3_new, 'confirmed') c;
  r := r || 'staff confirms the pending booking: ' || st1 || E'\n';
  -- correction: c3 did come after all → the flag this booking raised is cleared, by whom and when
  select c.status into st1 from public.admin_set_booking_status(bk3_past, 'completed', 'جاء متأخراً') c;
  r := r || 'no_show → completed: ' || st1 || ', flag cleared by staff: '
        || (select (cleared_by = s1 and cleared_at is not null)::text || ' «' || clear_note || '»' from public.account_flags where booking_id = bk3_past) || E'\n';
  begin
    perform public.admin_clear_flag(c3); r := r || 'FAIL cleared a flag that is not open' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'clear with no open flag: ' || st || ' (expect P0006)' || E'\n'; end;
  reset role;

  -- a flag cleared by staff: c6 gets one, books (pending), staff clears it, the next booking is confirmed
  insert into public.account_flags (user_id, flagged_by) values (c6, s1);
  perform set_config('request.jwt.claims', json_build_object('sub', c6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_short, tb, ((dd + 2) + time '15:00') at time zone tz, 'عميل سادس', '0599000006', secret) c;
  r := r || 'c6 with a flag: ' || st1 || ' (expect pending)' || E'\n';
  select id into bk6 from public.bookings where user_id = c6;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_clear_flag(c6, 'اتصل واعتذر');
  reset role;
  r := r || 'c6 flag cleared: ' || (select (cleared_by = s1)::text || ' «' || clear_note || '»' from public.account_flags where user_id = c6) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.status into st1 from public.create_booking(gen_random_uuid(), v_short, tb, ((dd + 3) + time '15:00') at time zone tz, 'عميل سادس', '0599000006', secret) c;
  r := r || 'c6 after the flag is cleared: ' || st1 || ' (expect confirmed)' || E'\n';
  reset role;

  -- the pending booking nobody decided on reaches its start time
  update public.bookings set during = tstzrange(now() - interval '1 minute', now() + interval '14 minutes') where id = bk6;
  n := private.expire_pending_bookings();
  r := r || 'expired: ' || n || ', c6 booking: ' || (select status || ' / ' || cancelled_by || ' / ' || cancel_reason from public.bookings where id = bk6)
        || ' (expect 1, rejected / system / لم يُؤكَّد في الوقت)' || E'\n';
  r := r || 'expiry logged: ' || (select count(*) from public.booking_events where booking_id = bk6 and to_status = 'rejected' and actor is null) || ' (expect 1)' || E'\n';
  r := r || 'events for c3''s past booking: ' || (select string_agg(coalesce(from_status, '∅') || '→' || to_status, ', ' order by id) from public.booking_events where booking_id = bk3_past)
        || ' (expect confirmed→no_show, no_show→completed)' || E'\n';
  r := r || 'cron job scheduled: ' || (select count(*) from cron.job where jobname = 'bookings-expire-pending') || ' (expect 1)' || E'\n';

  -- a closed day (last, so the other test days stay open): the next Friday in the window
  select d into fri from generate_series(today + 1, today + 7, interval '1 day') g(d0), lateral (select g.d0::date as d) x where extract(dow from x.d) = 5;
  delete from public.salon_hours where weekday = 5;
  perform set_config('request.jwt.claims', json_build_object('sub', c5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select a.closed, cardinality(a.slots) into b, n from public.booking_availability(v_cut, tb) a where a.day = fri;
  r := r || 'Friday: closed=' || b::text || ', slots=' || n || ' (expect true, 0)' || E'\n';
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, tb, (fri + time '13:00') at time zone tz, 'عميل خامس', '0599000005', secret);
    r := r || 'FAIL booked on a closed day' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail; r := r || 'Friday booking: ' || st || ' ' || coalesce(dt, '') || ' (expect P0020 closed)' || E'\n'; end;
  reset role;

  raise exception E'E1 TESTS (rolled back)\n%', r;
end $t$;
