-- Phase E3.2: «الزبائن». Permissions, staff never get totals (each order's amount yes), the booking-limit reset, the
-- block on booking and ordering, the note. Run after 20261008000200_admin_customers.sql. One DO block ending in a
-- deliberate exception: everything is rolled back (accounts, barber, bookings, product, orders, resets, blocks, note,
-- the temporary gateway secret, hours). Nothing is deleted. A line starting with FAIL is a failure.

do $t$
declare
  r text := '';
  st text; msg text;
  n int;
  j jsonb;
  tz constant text := 'Asia/Hebron';
  today date := (now() at time zone 'Asia/Hebron')::date;
  d1 date; d2 date;   -- two open days after today
  own uuid := gen_random_uuid();
  stf uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid();   -- reaches the booking limit
  c2 uuid := gen_random_uuid();   -- gets blocked
  ba uuid;
  v_cut uuid;
  p_test uuid; v_test uuid;
  b_up uuid;
  secret text := 'phase-e3-2-test-secret';
  v_code text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (own, 'authenticated', 'authenticated', 'e32-owner@test.invalid', now(), now()),
    (stf, 'authenticated', 'authenticated', 'e32-staff@test.invalid', now(), now()),
    (c1,  'authenticated', 'authenticated', 'e32-c1@test.invalid', now(), now()),
    (c2,  'authenticated', 'authenticated', 'e32-c2@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (own, 'owner'), (stf, 'staff');
  update public.profiles set full_name = 'زبون حد', phone = '+970599000031' where id = c1;
  update public.profiles set full_name = 'زبون حظر', phone = '+972599000032' where id = c2;
  insert into public.barbers (name_ar, sort) values ('حلاق E32', 960) returning id into ba;
  select id into v_cut from public.services where slug = 'full-cut';
  update public.salon_hours set open_time = '00:00', close_time = '24:00';
  select min(g::date) into d1 from generate_series(today + 1, today + 6, interval '1 day') g
  where exists (select 1 from public.salon_hours h where h.weekday = extract(dow from g));
  select min(g::date) into d2 from generate_series(d1 + 1, today + 6, interval '1 day') g
  where exists (select 1 from public.salon_hours h where h.weekday = extract(dow from g));
  update private.app_secrets set secret_hash = extensions.digest(convert_to(secret, 'UTF8'), 'sha256') where name = 'order_gateway';

  -- A product to order, and orders for c2 (one confirmed for the totals).
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  p_test := public.admin_create_product('simple', (select id from public.categories where slug = 'caps'), 'طاقية E32', 'e32-cap', 40);
  perform public.admin_update_product(p_test, 'طاقية E32', 'e32-cap', null, null, 40, null, (select id from public.categories where slug = 'caps'), 1, true);
  reset role;
  select id into v_test from public.product_variants where product_id = p_test;
  perform private.apply_stock_movement(v_test, 10, 'receive', 'E32');
  insert into public.orders (idempotency_key, customer_name, total_ils, status, user_id)
  values (gen_random_uuid(), 'زبون حظر', 40, 'confirmed', c2);

  -- c2's upcoming booking (must survive the block).
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status)
  values (gen_random_uuid(), c2, ba, v_cut, 'حلاقة كاملة', 30, 30, 'زبون حظر', '+972599000032',
          tstzrange((d1 + time '16:00') at time zone tz, (d1 + time '16:30') at time zone tz), 'confirmed')
  returning id into b_up;

  -- A customer can't use any of it --------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_customers(); r := r || 'FAIL customer listed customers' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_customers refused (42501)' || E'\n'; end;
  begin perform public.admin_customer(c2); r := r || 'FAIL customer read a customer' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_customer refused (42501)' || E'\n'; end;
  begin perform public.admin_reset_booking_rate(c1); r := r || 'FAIL customer reset their own limit' || E'\n';
  exception when insufficient_privilege then r := r || 'customer admin_reset_booking_rate refused (42501)' || E'\n'; end;
  begin perform count(*) from private.customer_notes; r := r || 'FAIL customer read the notes table' || E'\n';
  exception when insufficient_privilege then r := r || 'customer reading private.customer_notes refused (42501)' || E'\n'; end;
  reset role;

  -- Staff: no totals, each order's amount yes; can't block ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_customers(p_q => 'e32-');
  r := r || 'staff list, test customers: ' || jsonb_array_length(j -> 'rows') || ' (expect 2: the staff accounts are left out)' || E'\n';
  r := r || 'staff sees spent_ils: ' || coalesce((select string_agg(coalesce(x ->> 'spent_ils', 'null'), ',') from jsonb_array_elements(j -> 'rows') x), '-')
       || ' (expect null,null)' || E'\n';
  j := public.admin_customer(c2);
  r := r || 'staff customer page spent_ils: ' || coalesce(j ->> 'spent_ils', 'null') || ' (expect null)' || E'\n';
  r := r || 'staff sees each order''s amount: ' || coalesce(j -> 'orders' -> 0 ->> 'total_ils', 'null') || ' (expect 40)' || E'\n';
  j := public.admin_customers(p_q => '599000032');
  r := r || 'search by phone digits: ' || coalesce(j -> 'rows' -> 0 ->> 'full_name', 'none') || ' (expect زبون حظر)' || E'\n';
  begin perform public.admin_customer(stf); r := r || 'FAIL staff account opened as a customer' || E'\n';
  exception when sqlstate 'P0006' then r := r || 'a staff account is not a customer (P0006)' || E'\n'; end;
  begin perform public.admin_block_customer(c2, 'سبب كاف'); r := r || 'FAIL staff blocked a customer' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_block_customer refused (42501)' || E'\n'; end;

  -- The note: staff only, emptied = gone ---------------------------------------------------------------------------
  perform public.admin_set_customer_note(c1, 'يفضّل الحلاق أ');
  r := r || 'note saved: ' || coalesce(public.admin_customer(c1) -> 'note' ->> 'text', 'null') || ' (expect يفضّل الحلاق أ)' || E'\n';
  perform public.admin_set_customer_note(c1, '   ');
  r := r || 'note emptied: ' || coalesce(public.admin_customer(c1) ->> 'note', 'null') || ' (expect null)' || E'\n';
  reset role;

  -- Owner: totals --------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || 'owner customer page spent_ils: ' || coalesce(public.admin_customer(c2) ->> 'spent_ils', 'null') || ' (expect 40)' || E'\n';
  reset role;

  -- The booking limit: 5 created within the hour, then refused; a reset lets the next one through ---------------------
  insert into public.bookings (idempotency_key, user_id, barber_id, service_id, service_name_ar, price_ils, duration_min,
                               customer_name, phone, during, status)
  select gen_random_uuid(), c1, ba, v_cut, 'حلاقة كاملة', 30, 30, 'زبون حد', '+970599000031',
         tstzrange((d2 + time '09:00') at time zone tz + make_interval(mins => 30 * i),
                   (d2 + time '09:30') at time zone tz + make_interval(mins => 30 * i)), 'cancelled'
  from generate_series(0, 4) i;
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_customers(p_filter => 'rate_limited', p_q => 'e32-');
  r := r || 'filter «وصل حد المحاولات»: ' || coalesce(j -> 'rows' -> 0 ->> 'full_name', 'none') || ' (expect زبون حد)' || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, ba, (d1 + time '13:00') at time zone tz, 'زبون حد', '+970599000031', secret);
    r := r || 'FAIL 6th booking within the hour accepted' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || '6th booking within the hour: ' || st || ' ' || msg || ' (expect P0023 rate_limited)' || E'\n';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_reset_booking_rate(c1);
  j := public.admin_customer(c1);
  r := r || 'after the reset: in window ' || (j -> 'rate' ->> 'in_window') || ', limited ' || (j -> 'rate' ->> 'limited')
       || ', reset by ' || coalesce(j -> 'rate' -> 'resets' -> 0 ->> 'reset_by', 'null') || ' (expect 0, false, e32-staff@test.invalid)' || E'\n';
  reset role;
  r := r || 'created_at untouched: ' || (select count(*) from public.bookings where user_id = c1 and created_at = now()) || ' (expect 5)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.code into v_code from public.create_booking(gen_random_uuid(), v_cut, ba, (d1 + time '13:00') at time zone tz,
    'زبون حد', '+970599000031', secret) c;
  r := r || 'booking after the reset: ' || coalesce(v_code, 'none') || ' (expect a code)' || E'\n';
  reset role;

  -- Blocking (owner): reason required, one open block, booking and ordering refused, upcoming booking kept ----------
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_block_customer(c2, ' '); r := r || 'FAIL block without a reason' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'block without a reason: ' || st || ' ' || msg || ' (expect 22023 block_reason_required)' || E'\n';
  end;
  perform public.admin_block_customer(c2, 'لم يحضر ثلاث مرات');
  begin perform public.admin_block_customer(c2, 'مرة ثانية'); r := r || 'FAIL blocked twice' || E'\n';
  exception when sqlstate 'P0030' then r := r || 'second block refused (P0030)' || E'\n'; end;
  j := public.admin_customers(p_filter => 'blocked', p_q => 'e32-');
  r := r || 'filter «محظور»: ' || coalesce(j -> 'rows' -> 0 ->> 'full_name', 'none') || ' (expect زبون حظر)' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.create_booking(gen_random_uuid(), v_cut, ba, (d2 + time '18:00') at time zone tz, 'زبون حظر', '+972599000032', secret);
    r := r || 'FAIL blocked customer booked' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'blocked customer books: ' || st || ' ' || msg || ' (expect P0029 customer_blocked)' || E'\n';
  end;
  begin
    perform public.place_order(gen_random_uuid(), 'زبون حظر', null, '+972599000032',
      jsonb_build_array(jsonb_build_object('variant_id', v_test, 'qty', 1)), 'e32a', secret);
    r := r || 'FAIL blocked customer ordered' || E'\n';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    r := r || 'blocked customer orders: ' || st || ' ' || msg || ' (expect P0029 customer_blocked)' || E'\n';
  end;
  reset role;
  r := r || 'upcoming booking kept: ' || (select status from public.bookings where id = b_up) || ' (expect confirmed)' || E'\n';
  -- The known limit: signed out, as a guest, the same person can still order (confirmed by hand on WhatsApp).
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select o.code into v_code from public.place_order(gen_random_uuid(), 'زبون حظر', null, '+972599000032',
    jsonb_build_array(jsonb_build_object('variant_id', v_test, 'qty', 1)), 'e32b', secret) o;
  reset role;
  r := r || 'as a guest (no account): ' || coalesce(v_code, 'none') || ' (expect a code: the block is on the account)' || E'\n';

  -- Unblock (owner): ordering works again ----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_unblock_customer(c2, null); r := r || 'FAIL staff unblocked' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_unblock_customer refused (42501)' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_unblock_customer(c2, 'اعتذر');
  j := public.admin_customer(c2);
  r := r || 'block history: ' || jsonb_array_length(j -> 'blocks') || ' entry, unblocked by ' || coalesce(j -> 'blocks' -> 0 ->> 'unblocked_by', 'null')
       || ', blocked ' || (j ->> 'blocked') || ' (expect 1, e32-owner@test.invalid, false)' || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select o.code into v_code from public.place_order(gen_random_uuid(), 'زبون حظر', null, '+972599000032',
    jsonb_build_array(jsonb_build_object('variant_id', v_test, 'qty', 1)), 'e32c', secret) o;
  reset role;
  r := r || 'order after unblock: ' || coalesce(v_code, 'none') || ' (expect a code)' || E'\n';

  raise exception E'E3.2 TESTS (rolled back)\n%', r;
end $t$;
