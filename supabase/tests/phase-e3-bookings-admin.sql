-- Phase E3: the salon's side of bookings. Run in the SQL Editor after 20261007000800_bookings_admin.sql.
-- One DO block ending in a deliberate exception: everything is rolled back (test accounts, barbers, bookings, closures,
-- hours). Only booking_code_seq moves on. Each line is one check; a line starting with FAIL is a failure.
-- For the length of the test every day is open 00:00–24:00, so it gives the same result at any hour.

do $t$
declare
  r text := '';
  st text;
  dt text;
  n int;
  j jsonb;
  tz constant text := 'Asia/Hebron';
  today date := (now() at time zone 'Asia/Hebron')::date;
  dd date := (now() at time zone 'Asia/Hebron')::date + 3;
  own uuid := gen_random_uuid();   -- owner
  stf uuid := gen_random_uuid();   -- staff linked to barber A
  stf2 uuid := gen_random_uuid();  -- staff with no barber
  cust uuid := gen_random_uuid();  -- customer
  ba uuid; bb uuid;                -- test barbers A (linked to stf) and B
  v_cut uuid; v_wax uuid;
  bk uuid;
  v_code text;
  cl uuid;
  sv uuid;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (own,  'authenticated', 'authenticated', 'e3-owner@test.invalid', now(), now()),
    (stf,  'authenticated', 'authenticated', 'e3-staff@test.invalid', now(), now()),
    (stf2, 'authenticated', 'authenticated', 'e3-staff2@test.invalid', now(), now()),
    (cust, 'authenticated', 'authenticated', 'e3-cust@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (own, 'owner'), (stf, 'staff'), (stf2, 'staff');
  insert into public.barbers (name_ar, sort, user_id) values ('حلاق أ', 900, stf) returning id into ba;
  insert into public.barbers (name_ar, sort) values ('حلاق ب', 901) returning id into bb;
  select id into v_cut from public.services where slug = 'full-cut';
  select id into v_wax from public.services where slug = 'wax';
  delete from public.salon_hours;
  insert into public.salon_hours (weekday, open_time, close_time) select d, '00:00', '24:00' from generate_series(0, 6) d;

  -- A customer's booking on barber A, D 13:00–13:30 (inserted directly; create_booking is tested in E1).
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status)
  values (gen_random_uuid(), cust, ba, v_cut, 'حلاقة كاملة', 30, 30, 'زبون', '+970599000001',
          tstzrange((dd + time '13:00') at time zone tz, (dd + time '13:30') at time zone tz), 'confirmed')
  returning id into bk;

  -- Customer: no admin function -------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_bookings_day(dd); r := r || 'FAIL customer read the calendar' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'customer admin_bookings_day: ' || st || ' (expect 42501)' || E'\n'; end;
  begin perform public.admin_add_walk_in(ba, v_cut, (dd + time '15:00') at time zone tz); r := r || 'FAIL customer added a walk-in' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'customer admin_add_walk_in: ' || st || ' (expect 42501)' || E'\n'; end;
  reset role;

  -- Staff linked to barber A -----------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_bookings_day(dd);
  r := r || 'calendar: barber A is mine: ' || (select (b ->> 'mine') from jsonb_array_elements(j -> 'barbers') b where (b ->> 'id')::uuid = ba)
        || ', bookings on D for A: ' || (select count(*) from jsonb_array_elements(j -> 'bookings') b where (b ->> 'barber_id')::uuid = ba) || ' (expect true, 1)' || E'\n';
  r := r || 'calendar shows the phone to staff: ' || coalesce((select b ->> 'phone' from jsonb_array_elements(j -> 'bookings') b where (b ->> 'id')::uuid = bk), 'null') || E'\n';

  -- walk-ins: any staff, any barber
  v_code := public.admin_add_walk_in(bb, v_cut, (dd + time '13:00') at time zone tz, 'ماشي', '0599000002');
  r := r || 'staff walk-in on barber B 13:00: ' || v_code || ' ' || (select b.status || ' ' || b.kind || ' ' || b.phone from public.bookings b where b.code = v_code)
        || ' (expect confirmed walk_in +970599000002)' || E'\n';
  begin perform public.admin_add_walk_in(ba, v_cut, (dd + time '13:15') at time zone tz); r := r || 'FAIL walk-in over a booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in over A''s booking: ' || st || ' (expect P0020)' || E'\n'; end;
  begin perform public.admin_add_walk_in(ba, v_cut, (dd + time '13:32') at time zone tz); r := r || 'FAIL off-grid walk-in' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in at 13:32: ' || st || ' (expect 22023)' || E'\n'; end;
  begin perform public.admin_add_walk_in(ba, v_wax, (dd + time '16:00') at time zone tz); r := r || 'FAIL walk-in for an add-on' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in for an add-on (no duration): ' || st || ' (expect P0027)' || E'\n'; end;
  begin perform public.admin_add_walk_in(ba, v_cut, now() - interval '2 hours'); r := r || 'FAIL walk-in two hours ago' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in two hours ago: ' || st || ' (expect P0021)' || E'\n'; end;
  begin perform public.admin_add_walk_in(ba, v_cut, (dd + time '17:00') at time zone tz, null, '02 2345678'); r := r || 'FAIL walk-in with a landline' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in with a landline: ' || st || ' (expect 22023)' || E'\n'; end;

  -- closures: own barber yes, another barber or the whole salon no
  cl := public.admin_close_time(ba, (dd + time '16:00') at time zone tz, (dd + time '17:00') at time zone tz, 'استراحة');
  r := r || 'staff closes own barber 16–17: ' || (cl is not null)::text || E'\n';
  begin perform public.admin_close_time(bb, (dd + time '16:00') at time zone tz, (dd + time '17:00') at time zone tz); r := r || 'FAIL staff closed another barber' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'staff closes barber B: ' || st || ' (expect 42501)' || E'\n'; end;
  begin perform public.admin_close_time(null, (dd + time '16:00') at time zone tz, (dd + time '17:00') at time zone tz); r := r || 'FAIL staff closed the salon' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'staff closes the whole salon: ' || st || ' (expect 42501)' || E'\n'; end;
  begin perform public.admin_close_time(ba, (dd + time '12:30') at time zone tz, (dd + time '13:10') at time zone tz); r := r || 'FAIL closure over a booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail;
    r := r || 'closure over A''s booking: ' || st || ' ' || coalesce(dt, '') || ' (expect P0026 with its code)' || E'\n'; end;
  begin perform public.admin_add_walk_in(ba, v_cut, (dd + time '16:30') at time zone tz); r := r || 'FAIL walk-in inside a closure' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in inside the closure: ' || st || ' (expect P0020)' || E'\n'; end;
  begin perform public.admin_save_weekly_closure(null, ba, extract(dow from dd)::smallint, '12:45', '13:15', today, null, 'غداء'); r := r || 'FAIL weekly closure over a booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'weekly closure over A''s booking: ' || st || ' (expect P0026)' || E'\n'; end;
  perform public.admin_save_weekly_closure(null, ba, extract(dow from dd)::smallint, '19:00', '19:30', today, null, 'صلاة');
  j := public.admin_bookings_day(dd);
  r := r || 'calendar closures on D for A: ' || (select string_agg((c ->> 'weekly') || ' ' || to_char((c ->> 'starts_at')::timestamptz at time zone tz, 'HH24:MI'), ', ' order by c ->> 'starts_at')
                                                 from jsonb_array_elements(j -> 'closures') c where (c ->> 'barber_id')::uuid = ba)
        || ' (expect false 16:00, true 19:00)' || E'\n';
  perform public.admin_delete_closure(cl);
  r := r || 'staff opens own closure again: ' || (not exists (select 1 from public.closures where id = cl))::text || E'\n';

  -- owner-only functions
  begin perform * from public.admin_barbers(); r := r || 'FAIL staff listed barbers' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'staff admin_barbers: ' || st || ' (expect 42501)' || E'\n'; end;
  begin perform public.admin_save_service(null, 'e3-test', 'اختبار', 10, 15, true, 999, true); r := r || 'FAIL staff added a service' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'staff admin_save_service: ' || st || ' (expect 42501)' || E'\n'; end;
  begin perform public.admin_save_salon_hours(5::smallint, '12:00', '20:00'); r := r || 'FAIL staff changed the hours' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'staff admin_save_salon_hours: ' || st || ' (expect 42501)' || E'\n'; end;
  r := r || 'staff summary: pending ' || jsonb_array_length(public.admin_bookings_summary() -> 'pending') || ', my barber «' || (public.admin_bookings_summary() ->> 'my_barber') || '»' || E'\n';
  reset role;

  -- Staff with no barber: can't close anything
  perform set_config('request.jwt.claims', json_build_object('sub', stf2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_close_time(ba, (dd + time '20:00') at time zone tz, (dd + time '21:00') at time zone tz); r := r || 'FAIL unlinked staff closed time' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'unlinked staff closes barber A: ' || st || ' (expect 42501)' || E'\n'; end;
  reset role;

  -- Owner ------------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cl := public.admin_close_time(null, ((dd + 1) + time '14:00') at time zone tz, ((dd + 1) + time '15:00') at time zone tz, 'الصالون مغلق');
  r := r || 'owner closes the whole salon: ' || (cl is not null)::text || E'\n';
  -- a closure over several days, clipped per day on the calendar
  perform public.admin_close_time(bb, ((dd + 2) + time '20:00') at time zone tz, ((dd + 3) + time '10:00') at time zone tz, 'إجازة');
  j := public.admin_bookings_day(dd + 3);
  r := r || 'multi-day closure on its 2nd day starts at: ' || (select to_char((c ->> 'starts_at')::timestamptz at time zone tz, 'HH24:MI') from jsonb_array_elements(j -> 'closures') c where (c ->> 'barber_id')::uuid = bb) || ' (expect 00:00)' || E'\n';

  begin perform public.admin_save_barber(ba, 'حلاق أ', stf, false, 900); r := r || 'FAIL barber with bookings deactivated' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate, dt = pg_exception_detail; r := r || 'deactivate A with a booking: ' || st || ' ' || dt || ' (expect P0025 1)' || E'\n'; end;
  perform public.admin_set_booking_status(bk, 'cancelled', 'نقلناه');
  perform public.admin_save_barber(ba, 'حلاق أ', stf, false, 900);
  r := r || 'after cancelling, A deactivated: ' || (select (not is_active)::text from public.barbers where id = ba) || E'\n';
  begin perform public.admin_add_walk_in(ba, v_cut, (dd + time '18:00') at time zone tz); r := r || 'FAIL walk-in on an inactive barber' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'walk-in on inactive A: ' || st || ' (expect P0020)' || E'\n'; end;
  begin perform public.admin_save_barber(bb, 'حلاق ب', stf, true, 901); r := r || 'FAIL one account linked to two barbers' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'link staff to a second barber: ' || st || ' (expect 23505)' || E'\n'; end;
  begin perform public.admin_save_barber(bb, 'حلاق ب', cust, true, 901); r := r || 'FAIL customer linked to a barber' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'link a customer (not staff): ' || st || ' (expect 23503)' || E'\n'; end;

  sv := public.admin_save_service(null, 'e3-test', 'خدمة اختبار', 40, 25, true, 999, true);
  r := r || 'owner adds a service: ' || (select name_ar || ' ₪' || price_ils || ' ' || duration_min from public.services where id = sv) || E'\n';
  begin perform public.admin_save_service(sv, 'e3-test', 'خدمة اختبار', 40, null, true, 999, true); r := r || 'FAIL bookable service without a duration' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'bookable without duration: ' || st || ' (expect 23514)' || E'\n'; end;

  -- hours: the walk-in on B (D 13:00) blocks opening later than 13:00 that weekday
  begin perform public.admin_save_salon_hours(extract(dow from dd)::smallint, '14:00', '22:00'); r := r || 'FAIL hours moved past a booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'open at 14:00 with a 13:00 booking: ' || st || ' (expect P0026)' || E'\n'; end;
  perform public.admin_save_salon_hours(extract(dow from dd)::smallint, '12:00', '22:00');
  r := r || 'hours saved: ' || (select open_time || '–' || close_time from public.salon_hours where weekday = extract(dow from dd)) || E'\n';
  begin perform public.admin_save_salon_hours(extract(dow from dd)::smallint, null, null); r := r || 'FAIL closed a day with a booking' || E'\n';
  exception when others then get stacked diagnostics st = returned_sqlstate; r := r || 'close the weekday with a booking: ' || st || ' (expect P0026)' || E'\n'; end;
  perform public.admin_update_staff(stf, 'staff');
  r := r || 'admin_update_staff without is_barber: ok' || E'\n';
  reset role;

  raise exception E'E3 TESTS (rolled back)\n%', r;
end $t$;
