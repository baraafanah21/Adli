-- Smart start times with a 25-minute minimum block.
--
-- Every booking holds greatest(service duration, 25) minutes of the barber's time (private.booking_block_min): a
-- 20-minute cut holds 25 (5 minutes of rest), 15 → 25, 30 / 45 / 90 stay as they are. bookings.duration_min keeps the
-- service's real duration; bookings.during is the block.
--
-- Start times are no longer a fixed 15-minute grid. They are built from the free gaps of the barber's salon day
-- (opening hours minus bookings and closures): in each gap, from its start, every block minutes, while the block fits
-- (private.booking_starts). booking_availability offers those, and create_booking accepts only one of them
-- (start_off_grid otherwise, 22023, checked under the day lock after slot_is_free, so a taken time is still P0020).
-- Walk-ins keep their 5-minute grid and hold the block too.
--
-- bookings_during_shape: the length of during may now be between duration_min and greatest(duration_min, 25). Every
-- existing row has length = duration_min (the old check), so it validates. The same name, the other conditions as
-- they were. grid_min stays in booking_rule, unused.
--
-- Unchanged: slot_is_free, the exclusion constraint, existing bookings, every grant.

-- The table check ---------------------------------------------------------------------------------------------------

alter table public.bookings drop constraint bookings_during_shape;
alter table public.bookings add constraint bookings_during_shape check (
  not isempty(during) and lower_inc(during) and not upper_inc(during)
  and not lower_inf(during) and not upper_inf(during)
  -- 25 must equal booking_rule('min_block_min') (a check doesn't call functions).
  and (upper(during) - lower(during)) between make_interval(mins => duration_min)
                                          and make_interval(mins => greatest(duration_min, 25)));

-- Rules -------------------------------------------------------------------------------------------------------------

create or replace function private.booking_rule(p_name text) returns integer
language sql immutable set search_path = '' as $$
  select case p_name
    when 'grid_min' then 15       -- start times every 15 minutes from opening (unused since smart start times)
    when 'lead_min' then 60       -- book at least an hour ahead
    when 'horizon_days' then 7    -- today + 7 salon days
    when 'cancel_min' then 120    -- the customer cancels online until 2 hours before
    when 'per_hour' then 5        -- bookings created per account per hour
    when 'min_block_min' then 25  -- a booking holds at least 25 minutes (bookings_during_shape repeats it)
  end;
$$;

-- How long a booking of this duration holds the barber.
create or replace function private.booking_block_min(p_duration integer) returns integer
language sql immutable set search_path = '' as $$
  select greatest(p_duration, private.booking_rule('min_block_min'));
$$;

-- Start times -------------------------------------------------------------------------------------------------------
-- The free gaps of one barber's salon day (opening hours minus what slot_is_free counts as taken: pending / confirmed /
-- completed bookings, closures once or weekly for him or the whole salon), and in each gap a start every p_block
-- minutes from its beginning while the block fits. At least lead_min ahead; each one passes slot_is_free too.
-- A closed day (no salon_hours row) gives nothing.

create or replace function private.booking_starts(p_barber_id uuid, p_day date, p_block integer)
returns setof timestamptz
language sql stable security definer set search_path = '' as $$
  with win as (
    select tstzrange((p_day + h.open_time) at time zone 'Asia/Hebron',
                     (p_day + h.close_time) at time zone 'Asia/Hebron') as r
    from public.salon_hours h
    where h.weekday = extract(dow from p_day) and p_block > 0
  ),
  busy as (
    select b.during as r
    from public.bookings b, win
    where b.barber_id = p_barber_id and b.during && win.r
      and b.status in ('pending', 'confirmed', 'completed')
    union all
    select c.during
    from public.closures c, win
    where (c.barber_id is null or c.barber_id = p_barber_id) and c.during && win.r
    union all
    select tstzrange((p_day + c.start_time) at time zone 'Asia/Hebron', (p_day + c.end_time) at time zone 'Asia/Hebron')
    from public.closures c
    where (c.barber_id is null or c.barber_id = p_barber_id)
      and c.weekday = extract(dow from p_day)
      and p_day >= c.valid_from and (c.valid_until is null or p_day <= c.valid_until)
  ),
  gaps as (
    select unnest(tstzmultirange(win.r) - coalesce((select range_agg(busy.r) from busy), '{}'::tstzmultirange)) as g
    from win
  )
  select s.st
  from gaps
  cross join lateral generate_series(lower(gaps.g), upper(gaps.g) - make_interval(mins => p_block),
                                     make_interval(mins => p_block)) as s(st)
  where s.st >= now() + make_interval(mins => private.booking_rule('lead_min'))
    and private.slot_is_free(p_barber_id, tstzrange(s.st, s.st + make_interval(mins => p_block)))
  order by s.st;
$$;

-- Availability: the same as 20261007000700, with the start times from booking_starts. ------------------------------

create or replace function public.booking_availability(p_service_id uuid, p_barber_id uuid)
returns table (day date, closed boolean, mine boolean, slots timestamptz[])
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_dur integer;
  v_today date := (now() at time zone 'Asia/Hebron')::date;
  v_uid uuid := (select auth.uid());
begin
  select s.duration_min into v_dur from public.services s
  where s.id = p_service_id and s.is_active and s.bookable_online;
  if v_dur is null or not exists (select 1 from public.barbers b where b.id = p_barber_id and b.is_active) then
    raise exception 'not_bookable' using errcode = 'P0027';
  end if;

  return query
  with days as (
    select v_today + i as d from generate_series(0, private.booking_rule('horizon_days')) i
  )
  select
    days.d,
    h.weekday is null,
    v_uid is not null and exists (
      select 1 from public.bookings b
      where b.user_id = v_uid and b.salon_date = days.d
        and b.status in ('pending', 'confirmed', 'completed', 'no_show')),
    coalesce((
      select array_agg(x.st order by x.st)
      from private.booking_starts(p_barber_id, days.d, private.booking_block_min(v_dur)) as x(st)
    ), '{}')
  from days
  left join public.salon_hours h on h.weekday = extract(dow from days.d)
  order by days.d;
end $$;

-- create_booking: the same as 20261008000200, with two changes: during holds the block, and the start must be one of
-- booking_starts (in place of the 15-minute grid check), checked after slot_is_free under the day lock. --------------

create or replace function public.create_booking(
  p_idempotency_key uuid, p_service_id uuid, p_barber_id uuid, p_starts_at timestamp with time zone,
  p_customer_name text, p_phone text, p_gateway_secret text
) returns table (code text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone,
                 barber_name_ar text, service_name_ar text, price_ils integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_owner uuid;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := private.normalize_mobile(p_phone);
  v_service public.services%rowtype;
  v_block integer;
  v_during tstzrange;
  v_day date;
  v_open time;
  v_status text;
  v_constraint text;
begin
  if p_gateway_secret is null or not exists (
    select 1 from private.app_secrets s
    where s.name = 'order_gateway'
      and s.secret_hash = extensions.digest(convert_to(p_gateway_secret, 'UTF8'), 'sha256')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'key_required' using errcode = '22023';
  end if;

  -- One request at a time per account: a double press waits, then gets the same booking back.
  perform pg_advisory_xact_lock(hashtextextended('booking_user:' || v_uid::text, 0));

  select b.id, b.user_id into v_id, v_owner from public.bookings b where b.idempotency_key = p_idempotency_key;
  if found then
    if v_owner is distinct from v_uid then
      raise exception 'key_conflict' using errcode = '22023';
    end if;
    return query select s.code, s.status, s.starts_at, s.ends_at, s.barber_name_ar, s.service_name_ar, s.price_ils
                 from private.booking_summary(v_id) s;
    return;
  end if;

  -- E3.2: a blocked account books nothing new (the salon decides on its upcoming bookings).
  if private.is_blocked(v_uid) then
    raise exception 'customer_blocked' using errcode = 'P0029';
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'phone_invalid' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'start_required' using errcode = '22023';
  end if;

  -- E3.2: counted from the last reset by the salon when that is later than an hour ago.
  if private.bookings_in_rate_window(v_uid) >= private.booking_rule('per_hour') then
    raise exception 'rate_limited' using errcode = 'P0023';
  end if;

  select * into v_service from public.services s
  where s.id = p_service_id and s.is_active and s.bookable_online;
  if not found or not exists (select 1 from public.barbers b where b.id = p_barber_id and b.is_active) then
    raise exception 'not_bookable' using errcode = 'P0027';
  end if;

  -- The barber's time held: at least min_block_min; duration_min below stays the service's own.
  v_block := private.booking_block_min(v_service.duration_min);
  v_during := tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_block));
  v_day := (p_starts_at at time zone 'Asia/Hebron')::date;

  if p_starts_at < now() + make_interval(mins => private.booking_rule('lead_min'))
     or v_day > (now() at time zone 'Asia/Hebron')::date + private.booking_rule('horizon_days') then
    raise exception 'outside_window' using errcode = 'P0021';
  end if;

  select h.open_time into v_open from public.salon_hours h where h.weekday = extract(dow from v_day);
  if v_open is null then
    raise exception 'slot_unavailable' using errcode = 'P0020', detail = 'closed';
  end if;

  -- Everything that writes this salon day's times (bookings, walk-ins, closures) takes this lock first.
  perform pg_advisory_xact_lock(hashtextextended('booking_day:' || v_day::text, 0));

  if exists (select 1 from public.bookings b
             where b.user_id = v_uid and b.salon_date = v_day
               and b.status in ('pending', 'confirmed', 'completed', 'no_show')) then
    raise exception 'daily_limit' using errcode = 'P0022';
  end if;
  if not private.slot_is_free(p_barber_id, v_during) then
    raise exception 'slot_unavailable' using errcode = 'P0020';
  end if;
  -- Free, but not one of the offered start times (it would leave a gap too short for anyone).
  if not exists (select 1 from private.booking_starts(p_barber_id, v_day, v_block) as x(st) where x.st = p_starts_at) then
    raise exception 'start_off_grid' using errcode = '22023';
  end if;

  -- An open no-show flag: the booking waits for the salon.
  v_status := case when exists (select 1 from public.account_flags f where f.user_id = v_uid and f.cleared_at is null)
                   then 'pending' else 'confirmed' end;

  begin
    insert into public.bookings (idempotency_key, kind, user_id, barber_id, service_id, service_name_ar, price_ils,
                                 duration_min, customer_name, phone, during, status, created_by)
    values (p_idempotency_key, 'online', v_uid, p_barber_id, v_service.id, v_service.name_ar, v_service.price_ils,
            v_service.duration_min, v_name, v_phone, v_during, v_status, v_uid)
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0020';
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bookings_one_per_day' then
        raise exception 'daily_limit' using errcode = 'P0022';
      end if;
      raise;
  end;

  -- The details typed here become the account's details (the form is filled from them next time).
  update public.profiles p set full_name = v_name, phone = v_phone where p.id = v_uid;

  insert into public.booking_events (booking_id, from_status, to_status, actor) values (v_id, null, v_status, v_uid);

  return query select s.code, s.status, s.starts_at, s.ends_at, s.barber_name_ar, s.service_name_ar, s.price_ils
               from private.booking_summary(v_id) s;
end $$;

-- Walk-ins: the same as 20261007000800, during holds the block. ----------------------------------------------------

create or replace function public.admin_add_walk_in(
  p_barber_id uuid, p_service_id uuid, p_starts_at timestamptz, p_customer_name text default null, p_phone text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_service public.services%rowtype;
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_during tstzrange;
  v_day date;
  v_id uuid;
  v_code text;
begin
  perform private.require_staff();
  if p_starts_at is null then
    raise exception 'start_required' using errcode = '22023';
  end if;
  if v_phone is not null then
    v_phone := private.normalize_mobile(v_phone);
    if v_phone is null then
      raise exception 'phone_invalid' using errcode = '22023';
    end if;
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;

  select * into v_service from public.services s where s.id = p_service_id and s.is_active and s.duration_min is not null;
  if not found then
    raise exception 'not_bookable' using errcode = 'P0027';
  end if;
  if extract(second from p_starts_at) <> 0 or extract(minute from p_starts_at)::integer % 5 <> 0 then
    raise exception 'start_off_grid' using errcode = '22023';
  end if;

  v_day := (p_starts_at at time zone 'Asia/Hebron')::date;
  if p_starts_at < now() - interval '1 hour'
     or v_day > (now() at time zone 'Asia/Hebron')::date + private.booking_rule('horizon_days') then
    raise exception 'outside_window' using errcode = 'P0021';
  end if;
  v_during := tstzrange(p_starts_at, p_starts_at + make_interval(mins => private.booking_block_min(v_service.duration_min)));

  perform private.lock_salon_day(v_day);
  if not private.slot_is_free(p_barber_id, v_during) then
    raise exception 'slot_unavailable' using errcode = 'P0020';
  end if;

  begin
    insert into public.bookings (kind, barber_id, service_id, service_name_ar, price_ils, duration_min,
                                 customer_name, phone, during, status, created_by)
    values ('walk_in', p_barber_id, v_service.id, v_service.name_ar, v_service.price_ils, v_service.duration_min,
            v_name, v_phone, v_during, 'confirmed', v_uid)
    returning id, code into v_id, v_code;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0020';
  end;

  insert into public.booking_events (booking_id, from_status, to_status, actor, note)
  values (v_id, null, 'confirmed', v_uid, 'بدون موعد');
  return v_code;
end $$;

-- Grants: the new helpers are server-only (the replaced functions keep theirs). -----------------------------------

revoke all on function
  private.booking_block_min(integer),
  private.booking_starts(uuid, date, integer)
from public, anon, authenticated;
