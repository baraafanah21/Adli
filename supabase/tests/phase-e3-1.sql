-- Phase E3.1: upcoming bookings and «جديد», and phones in full form only (the prefix the person chose, no guessing).
-- Run after 20261008000000_bookings_upcoming_phone_prefix.sql. One DO block ending in a deliberate exception:
-- everything is rolled back (test accounts, barber, bookings, product, order, the temporary gateway secret, hours).
-- Each line is one check; a line starting with FAIL is a failure. Nothing is deleted (so the Supabase connector runs
-- it): the open days are set to 00:00–24:00 for the test, and the closed day is a day with no salon_hours row
-- (Friday, always inside the 7-day window).

do $t$
declare
  r text := '';
  st text; msg text;
  n int;
  j jsonb;
  tz constant text := 'Asia/Hebron';
  today date := (now() at time zone 'Asia/Hebron')::date;
  dd date;     -- the first open day after today: the test's bookings go there
  shut date;   -- a day in the window with no salon_hours row (closed)
  own uuid := gen_random_uuid();
  stf uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  ba uuid;
  v_cut uuid;
  b_old uuid; b_pend uuid; b_walk uuid; b_cancel uuid; b_late uuid;
  p_test uuid; v_test uuid;
  secret text := 'phase-e3-1-test-secret';
  v_code text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (own, 'authenticated', 'authenticated', 'e31-owner@test.invalid', now(), now()),
    (stf, 'authenticated', 'authenticated', 'e31-staff@test.invalid', now(), now()),
    (c1,  'authenticated', 'authenticated', 'e31-c1@test.invalid', now(), now()),
    (c2,  'authenticated', 'authenticated', 'e31-c2@test.invalid', now(), now()),
    (c3,  'authenticated', 'authenticated', 'e31-c3@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (own, 'owner'), (stf, 'staff');
  insert into public.barbers (name_ar, sort) values ('حلاق E31', 950) returning id into ba;
  select id into v_cut from public.services where slug = 'full-cut';
  update public.salon_hours set open_time = '00:00', close_time = '24:00';
  select min(g::date) into shut from generate_series(today, today + 6, interval '1 day') g
  where not exists (select 1 from public.salon_hours h where h.weekday = extract(dow from g));
  select min(g::date) into dd from generate_series(today + 1, today + 6, interval '1 day') g
  where exists (select 1 from public.salon_hours h where h.weekday = extract(dow from g));
  if shut is null or dd is null then
    raise exception 'E3.1 TEST SETUP: needs one closed weekday and one open day in the next 7 days';
  end if;

  -- Bookings on day D: one seen long ago, one pending a minute old, a walk-in the staff member seated, a cancelled one.
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status, created_at)
  values (gen_random_uuid(), c1, ba, v_cut, 'حلاقة كاملة', 30, 30, 'قديم', '+970599000011',
          tstzrange((dd + time '13:00') at time zone tz, (dd + time '13:30') at time zone tz), 'confirmed', now() - interval '2 days')
  returning id into b_old;
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status, created_at)
  values (gen_random_uuid(), c2, ba, v_cut, 'حلاقة كاملة', 30, 30, 'معلّق', '+972599000012',
          tstzrange((dd + time '14:00') at time zone tz, (dd + time '14:30') at time zone tz), 'pending', now() - interval '1 minute')
  returning id into b_pend;
  insert into public.bookings (idempotency_key, kind, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, during, status, created_by, created_at)
  values (gen_random_uuid(), 'walk_in', ba, v_cut, 'حلاقة كاملة', 30, 30, 'بدون موعد',
          tstzrange((dd + time '15:00') at time zone tz, (dd + time '15:30') at time zone tz), 'confirmed', stf, now())
  returning id into b_walk;
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status, created_at)
  values (gen_random_uuid(), c3, ba, v_cut, 'حلاقة كاملة', 30, 30, 'ملغى', '+970599000013',
          tstzrange((dd + time '16:00') at time zone tz, (dd + time '16:30') at time zone tz), 'cancelled', now())
  returning id into b_cancel;

  -- A customer can't read or mark anything --------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_upcoming_bookings(); r := r || 'FAIL customer read upcoming bookings' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_upcoming_bookings refused (42501)' || E'\n'; end;
  begin perform public.admin_mark_bookings_seen(); r := r || 'FAIL customer marked bookings seen' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_mark_bookings_seen refused (42501)' || E'\n'; end;
  begin perform public.admin_bookings_badges(); r := r || 'FAIL customer read the badges' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_bookings_badges refused (42501)' || E'\n'; end;
  reset role;

  -- Staff, never visited: every upcoming booking is new, except the walk-in they seated ------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_upcoming_bookings();
  r := r || 'window: ' || jsonb_array_length(j -> 'days') || ' days from ' || (j -> 'days' -> 0 ->> 'day')
       || ' (expect 7 from ' || today || ')' || E'\n';
  r := r || 'never visited, seen_at: ' || coalesce(j ->> 'seen_at', 'null') || ' (expect null)' || E'\n';
  r := r || 'closed day ' || shut || ': ' || (select d ->> 'closed' from jsonb_array_elements(j -> 'days') d where d ->> 'day' = shut::text)
       || ' (expect true)' || E'\n';
  r := r || 'open day D: ' || (select d ->> 'closed' from jsonb_array_elements(j -> 'days') d where d ->> 'day' = dd::text)
       || ' (expect false)' || E'\n';
  select count(*) into n from jsonb_array_elements(j -> 'days') d, jsonb_array_elements(d -> 'bookings') b
  where (b ->> 'id')::uuid in (b_old, b_pend, b_walk, b_cancel);
  r := r || 'test bookings listed: ' || n || ' (expect 3: the cancelled one is left out)' || E'\n';
  r := r || 'is_new old / pending / own walk-in: '
       || (select string_agg(b ->> 'is_new', ' / ' order by b ->> 'starts_at') from jsonb_array_elements(j -> 'days') d,
             jsonb_array_elements(d -> 'bookings') b where (b ->> 'id')::uuid in (b_old, b_pend, b_walk))
       || ' (expect true / true / false)' || E'\n';
  r := r || 'pending status kept: ' || (select b ->> 'status' from jsonb_array_elements(j -> 'days') d,
             jsonb_array_elements(d -> 'bookings') b where (b ->> 'id')::uuid = b_pend) || ' (expect pending)' || E'\n';

  -- The visit: now only bookings created after it are new ---------------------------------------------------------
  perform public.admin_mark_bookings_seen();
  reset role;
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status, created_at)
  values (gen_random_uuid(), c3, ba, v_cut, 'حلاقة كاملة', 30, 30, 'بعد الزيارة', '+970599000014',
          tstzrange((dd + time '17:00') at time zone tz, (dd + time '17:30') at time zone tz), 'confirmed', clock_timestamp() + interval '1 second')
  returning id into b_late;
  set local role authenticated;
  j := public.admin_upcoming_bookings();
  r := r || 'after the visit, is_new old / pending / later: '
       || (select string_agg(b ->> 'is_new', ' / ' order by b ->> 'starts_at') from jsonb_array_elements(j -> 'days') d,
             jsonb_array_elements(d -> 'bookings') b where (b ->> 'id')::uuid in (b_old, b_pend, b_late))
       || ' (expect false / false / true)' || E'\n';
  r := r || 'seen_at set: ' || ((j ->> 'seen_at') is not null)::text || ' (expect true)' || E'\n';
  r := r || 'day D new count ≥ 1: ' || ((select (d ->> 'new')::int from jsonb_array_elements(j -> 'days') d where d ->> 'day' = dd::text) >= 1)::text
       || ' (expect true)' || E'\n';
  j := public.admin_bookings_badges();
  r := r || 'badges new ≥ 1, pending ≥ 1: ' || ((j ->> 'new')::int >= 1 and (j ->> 'pending')::int >= 1)::text || ' (expect true)' || E'\n';
  reset role;

  -- Another staff member's visit doesn't clear mine (per user, in the database) -----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_upcoming_bookings();
  r := r || 'owner (never visited) sees the old booking as new: '
       || (select b ->> 'is_new' from jsonb_array_elements(j -> 'days') d, jsonb_array_elements(d -> 'bookings') b where (b ->> 'id')::uuid = b_old)
       || ' (expect true)' || E'\n';

  -- Walk-in phones: full form only ------------------------------------------------------------------------------
  begin
    perform public.admin_add_walk_in(ba, v_cut, (dd + time '18:00') at time zone tz, 'محلي', '0599000002');
    r := r || 'FAIL walk-in with a local number' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'walk-in 0599000002 (local): ' || st || ' ' || msg || ' (expect 22023 phone_invalid)' || E'\n';
  end;
  v_code := public.admin_add_walk_in(ba, v_cut, (dd + time '18:00') at time zone tz, 'كامل', '+972 59 900 0002');
  r := r || 'walk-in +972 59 900 0002 saved as: ' || (select b.phone from public.bookings b where b.code = v_code) || ' (expect +972599000002)' || E'\n';
  reset role;

  -- Profiles: a signed-in customer (not staff) saves their number from «بياناتي» -----------------------------------
  -- As the plain authenticated role, the way updateProfile() writes it (RLS: own row; column grant on phone). This is
  -- the case that caught phone_normalize() running as SECURITY INVOKER (42501 on private.normalize_mobile): the
  -- trigger must work for a customer, not only for the owner.
  r := r || 'c1 is not staff: ' || (not exists (select 1 from public.user_roles where user_id = c1))::text || ' (expect true)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set full_name = 'زبون E31', area = 'رفيديا', phone = '+970599123456' where id = c1;
    r := r || 'customer saves +970599123456 from «بياناتي»: '
         || coalesce((select phone from public.profiles where id = c1), 'null') || ' (expect +970599123456)' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'FAIL customer saving their own phone: ' || st || ' ' || msg || E'\n';
  end;
  update public.profiles set phone = '+970599000099' where id = c2;
  reset role;  -- read c2's row as the owner: as c1, RLS would hide it and the check would always pass
  r := r || 'customer changed someone else''s phone: ' || coalesce((select phone from public.profiles where id = c2), 'null')
       || ' (expect null: RLS, own row only)' || E'\n';
  set local role authenticated;
  begin
    update public.profiles set phone = '0599123456' where id = c1;
    r := r || 'FAIL profile saved a local number' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'profile 0599123456 (local): ' || st || ' ' || msg || ' (expect 22023 phone_invalid)' || E'\n';
  end;
  update public.profiles set phone = '+972 52 123 4567' where id = c1;
  r := r || 'profile +972 52 123 4567 saved as: ' || (select phone from public.profiles where id = c1) || ' (expect +972521234567)' || E'\n';
  update public.profiles set phone = '' where id = c1;
  r := r || 'profile phone emptied: ' || coalesce((select phone from public.profiles where id = c1), 'null') || ' (expect null)' || E'\n';
  reset role;

  -- Orders: place_order goes through the same rule ----------------------------------------------------------------
  update private.app_secrets set secret_hash = extensions.digest(convert_to(secret, 'UTF8'), 'sha256') where name = 'order_gateway';
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  p_test := public.admin_create_product('simple', (select id from public.categories where slug = 'caps'), 'طاقية E31', 'e31-cap', 25);
  perform public.admin_update_product(p_test, 'طاقية E31', 'e31-cap', null, null, 25, null, (select id from public.categories where slug = 'caps'), 1, true);
  reset role;
  select id into v_test from public.product_variants where product_id = p_test;
  perform private.apply_stock_movement(v_test, 5, 'receive', 'E31');
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.place_order(gen_random_uuid(), 'زبون', null, '0599123456', jsonb_build_array(jsonb_build_object('variant_id', v_test, 'qty', 1)), 'e31', secret);
    r := r || 'FAIL order with a local number' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'order 0599123456 (local): ' || st || ' ' || msg || ' (expect 22023 phone_invalid)' || E'\n';
  end;
  select o.code into v_code from public.place_order(gen_random_uuid(), 'زبون', null, '+970 59 912 3456',
    jsonb_build_array(jsonb_build_object('variant_id', v_test, 'qty', 1)), 'e31', secret) o;
  reset role;
  r := r || 'order +970 59 912 3456 saved as: ' || (select phone from public.orders where code = v_code) || ' (expect +970599123456)' || E'\n';
  select o.code into v_code from public.place_order(gen_random_uuid(), 'بلا رقم', null, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_test, 'qty', 1)), 'e31b', secret) o;
  r := r || 'order without a phone: ' || coalesce((select phone from public.orders where code = v_code), 'null') || ' (expect null)' || E'\n';

  -- Saved numbers: all in full form (the old test order was corrected by the migration) ------------------------------
  select count(*) into n from (
    select phone from public.orders union all select phone from public.profiles union all select phone from public.bookings
  ) x where phone is not null and phone !~ '^\+97[02]5[0-9]{8}$';
  r := r || 'saved phones not in full form: ' || n || ' (expect 0)' || E'\n';

  raise exception E'E3.1 TESTS (rolled back)\n%', r;
end $t$;
