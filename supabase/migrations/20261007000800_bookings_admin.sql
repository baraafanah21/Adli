-- Phase E3: the salon's side of bookings. Nothing is dropped (user_roles.is_barber goes in 20261007000900, applied by
-- hand from the SQL Editor).
--
-- Staff (owner, staff):
--   admin_bookings_day(day)                         → jsonb {day, hours, barbers[], bookings[], closures[]} for the calendar
--   admin_bookings_summary()                        → jsonb for the admin home: today's bookings, pending ones, open flags
--   admin_add_walk_in(barber, service, starts_at, name, phone) → code. Any staff, any barber.
--   admin_close_time(barber|null, starts_at, ends_at, reason)  → closure id (once)
--   admin_save_weekly_closure(id|null, barber|null, weekday, start, end, valid_from, valid_until, reason) → id
--   admin_delete_closure(id)
--   admin_open_flags()                              → accounts with an open no-show flag
-- Closures: the owner for any barber or the whole salon (barber null); staff linked to a barber for that barber only.
-- Owner:
--   admin_barbers()                                 → barbers with their linked account and upcoming bookings
--   admin_save_barber(id|null, name_ar, user_id|null, is_active, sort) → id
--   admin_save_service(id|null, slug, name_ar, price_ils, duration_min, bookable_online, sort, is_active) → id
--   admin_save_salon_hours(weekday, open|null, close|null)   (null = closed that day)
--
-- Changes that would leave a booking stranded are refused: P0025 a barber with upcoming bookings can't be
-- deactivated (DETAIL = count), P0026 a closure or new hours overlap pending / confirmed bookings (DETAIL = jsonb
-- [{code, starts_at, customer_name, barber_name_ar}]). Every function that writes a salon day's times takes the
-- day lock (private.lock_salon_day), several days in ascending order.
--
-- Also: slot_is_free() now refuses an inactive barber (so a booking racing a deactivation loses), and
-- admin_update_staff's is_barber parameter gets a default, so the app can stop sending it before the column goes.

-- Helpers -------------------------------------------------------------------------------------------------------

create function private.lock_salon_day(p_day date) returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('booking_day:' || p_day::text, 0));
end $$;

-- Every salon day a booking can still be on: today … today + horizon, locked in ascending order.
-- (plpgsql + perform on purpose: a void SQL function would stop after the first row, locking one day only.)
create function private.lock_booking_window() returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform private.lock_salon_day(d::date)
  from generate_series((now() at time zone 'Asia/Hebron')::date,
                       (now() at time zone 'Asia/Hebron')::date + private.booking_rule('horizon_days'),
                       interval '1 day') d
  order by d;
end $$;

create function private.my_barber_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select b.id from public.barbers b where b.user_id = (select auth.uid());
$$;

-- Closures: the owner for anyone (and the whole salon); a staff member linked to a barber for that barber only.
create function private.require_close_for(p_barber_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if private.has_role(array['owner']::public.app_role[]) then
    return;
  end if;
  if p_barber_id is null or p_barber_id is distinct from private.my_barber_id() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Staff close times for their own barber only.';
  end if;
end $$;

create function private.booking_conflict_row(b public.bookings) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', b.code, 'starts_at', lower(b.during), 'customer_name', b.customer_name,
                            'barber_name_ar', (select br.name_ar from public.barbers br where br.id = b.barber_id));
$$;

-- An inactive barber has no free time: a booking racing a deactivation loses after the day lock.
create or replace function private.slot_is_free(p_barber_id uuid, p_during tstzrange, p_ignore uuid default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  with d as (
    select lower(p_during) at time zone 'Asia/Hebron' as ls,
           upper(p_during) at time zone 'Asia/Hebron' as le,
           (lower(p_during) at time zone 'Asia/Hebron')::date as day
  )
  select
    exists (select 1 from public.barbers br where br.id = p_barber_id and br.is_active)
    and exists (
      select 1 from d join public.salon_hours h on h.weekday = extract(dow from d.day)
      where d.ls >= d.day + h.open_time and d.le <= d.day + h.close_time)
    and not exists (
      select 1 from public.bookings b
      where b.barber_id = p_barber_id and b.during && p_during
        and b.status in ('pending', 'confirmed', 'completed')
        and b.id is distinct from p_ignore)
    and not exists (
      select 1 from public.closures c cross join d
      where (c.barber_id is null or c.barber_id = p_barber_id)
        and (c.during && p_during
             or (c.weekday = extract(dow from d.day)
                 and d.day >= c.valid_from and (c.valid_until is null or d.day <= c.valid_until)
                 and tstzrange((d.day + c.start_time) at time zone 'Asia/Hebron',
                               (d.day + c.end_time) at time zone 'Asia/Hebron') && p_during)));
$$;

-- The calendar: one salon day ----------------------------------------------------------------------------------

create function public.admin_bookings_day(p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mine uuid;
begin
  perform private.require_staff();
  if p_day is null then
    raise exception 'day_required' using errcode = '22023';
  end if;
  v_mine := private.my_barber_id();

  return jsonb_build_object(
    'day', p_day,
    'hours', (select jsonb_build_object('open', to_char(h.open_time, 'HH24:MI'), 'close', to_char(h.close_time, 'HH24:MI'))
              from public.salon_hours h where h.weekday = extract(dow from p_day)),
    -- Active barbers, plus an inactive one who still has bookings that day.
    'barbers', coalesce((
      select jsonb_agg(jsonb_build_object('id', br.id, 'name_ar', br.name_ar, 'is_active', br.is_active, 'mine', br.id = v_mine)
                       order by br.sort, br.name_ar)
      from public.barbers br
      where br.is_active or exists (select 1 from public.bookings b where b.barber_id = br.id and b.salon_date = p_day)
    ), '[]'),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'code', b.code, 'kind', b.kind, 'status', b.status, 'barber_id', b.barber_id,
               'service_name_ar', b.service_name_ar, 'price_ils', b.price_ils, 'duration_min', b.duration_min,
               'starts_at', lower(b.during), 'ends_at', upper(b.during),
               'customer_name', b.customer_name, 'phone', b.phone,
               'flagged', b.user_id is not null and exists (
                 select 1 from public.account_flags f where f.user_id = b.user_id and f.cleared_at is null),
               'user_id', b.user_id,
               'cancelled_by', b.cancelled_by, 'cancel_reason', b.cancel_reason)
             order by lower(b.during))
      from public.bookings b where b.salon_date = p_day
    ), '[]'),
    -- Closures that touch the day, clipped to it; weekly ones become that day's times.
    'closures', coalesce((
      select jsonb_agg(c order by c ->> 'starts_at')
      from (
        select jsonb_build_object(
                 'id', x.id, 'barber_id', x.barber_id, 'weekly', false, 'reason', x.reason,
                 'starts_at', greatest(lower(x.during), p_day::timestamp at time zone 'Asia/Hebron'),
                 'ends_at', least(upper(x.during), (p_day + 1)::timestamp at time zone 'Asia/Hebron')) as c
        from public.closures x
        where x.during && tstzrange(p_day::timestamp at time zone 'Asia/Hebron', (p_day + 1)::timestamp at time zone 'Asia/Hebron')
        union all
        select jsonb_build_object(
                 'id', x.id, 'barber_id', x.barber_id, 'weekly', true, 'reason', x.reason,
                 'starts_at', (p_day + x.start_time) at time zone 'Asia/Hebron',
                 'ends_at', (p_day + x.end_time) at time zone 'Asia/Hebron')
        from public.closures x
        where x.weekday = extract(dow from p_day)
          and p_day >= x.valid_from and (x.valid_until is null or p_day <= x.valid_until)
      ) s
    ), '[]')
  );
end $$;

-- The admin home card ------------------------------------------------------------------------------------------

create function public.admin_bookings_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Hebron')::date;
  v_mine uuid;
begin
  perform private.require_staff();
  v_mine := private.my_barber_id();
  return jsonb_build_object(
    'my_barber', (select br.name_ar from public.barbers br where br.id = v_mine),
    'today_total', (select count(*) from public.bookings b
                    where b.salon_date = v_today and b.status in ('pending', 'confirmed', 'completed', 'no_show')),
    'today_left', (select count(*) from public.bookings b
                   where b.salon_date = v_today and b.status in ('pending', 'confirmed') and upper(b.during) > now()),
    'next', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'starts_at', lower(b.during), 'status', b.status,
                                          'customer_name', b.customer_name, 'service_name_ar', b.service_name_ar,
                                          'barber_name_ar', br.name_ar)
                       order by lower(b.during))
      from (select * from public.bookings b
            where b.salon_date = v_today and b.status in ('pending', 'confirmed') and upper(b.during) > now()
            order by lower(b.during) limit 5) b
      join public.barbers br on br.id = b.barber_id
    ), '[]'),
    -- Waiting for the salon until someone decides (or they expire at their start time).
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'starts_at', lower(b.during),
                                          'customer_name', b.customer_name, 'service_name_ar', b.service_name_ar,
                                          'barber_name_ar', br.name_ar)
                       order by lower(b.during))
      from public.bookings b join public.barbers br on br.id = b.barber_id
      where b.status = 'pending'
    ), '[]'),
    'open_flags', (select count(*) from public.account_flags f where f.cleared_at is null)
  );
end $$;

-- Walk-ins -------------------------------------------------------------------------------------------------------
-- Someone at the door: any staff, any barber, any service with a duration. A 5-minute grid, from an hour ago (already
-- seated) to the end of the booking window. Confirmed at once; name and phone are optional.

create function public.admin_add_walk_in(
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
  v_during := tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_service.duration_min));

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

-- Closures -------------------------------------------------------------------------------------------------------

create function public.admin_close_time(p_barber_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_during tstzrange;
  v_conflicts jsonb;
  v_id uuid;
begin
  perform private.require_close_for(p_barber_id);
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at > interval '31 days' then
    raise exception 'range_invalid' using errcode = '22023';
  end if;
  if p_barber_id is not null and not exists (select 1 from public.barbers b where b.id = p_barber_id) then
    raise exception 'barber_not_found' using errcode = 'P0006';
  end if;
  v_during := tstzrange(p_starts_at, p_ends_at);

  perform private.lock_salon_day(d::date)
  from generate_series((p_starts_at at time zone 'Asia/Hebron')::date, (p_ends_at at time zone 'Asia/Hebron')::date,
                       interval '1 day') d
  order by d;

  select jsonb_agg(private.booking_conflict_row(b) order by lower(b.during)) into v_conflicts
  from public.bookings b
  where b.status in ('pending', 'confirmed') and b.during && v_during
    and (p_barber_id is null or b.barber_id = p_barber_id);
  if v_conflicts is not null then
    raise exception 'closure_conflicts' using errcode = 'P0026', detail = v_conflicts::text;
  end if;

  insert into public.closures (barber_id, during, reason, created_by)
  values (p_barber_id, v_during, nullif(btrim(coalesce(p_reason, '')), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create function public.admin_save_weekly_closure(
  p_id uuid, p_barber_id uuid, p_weekday smallint, p_start_time time, p_end_time time,
  p_valid_from date default null, p_valid_until date default null, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_from date := coalesce(p_valid_from, (now() at time zone 'Asia/Hebron')::date);
  v_old uuid;
  v_conflicts jsonb;
  v_id uuid;
begin
  perform private.require_close_for(p_barber_id);
  if p_id is not null then
    select c.barber_id into v_old from public.closures c where c.id = p_id and c.weekday is not null;
    if not found then
      raise exception 'closure_not_found' using errcode = 'P0006';
    end if;
    perform private.require_close_for(v_old);
  end if;
  if p_weekday is null or p_weekday not between 0 and 6 or p_start_time is null or p_end_time is null
     or p_end_time <= p_start_time or (p_valid_until is not null and p_valid_until < v_from) then
    raise exception 'weekly_invalid' using errcode = '22023';
  end if;

  perform private.lock_booking_window();

  select jsonb_agg(private.booking_conflict_row(b) order by lower(b.during)) into v_conflicts
  from public.bookings b
  where b.status in ('pending', 'confirmed') and upper(b.during) > now()
    and (p_barber_id is null or b.barber_id = p_barber_id)
    and extract(dow from b.salon_date) = p_weekday
    and b.salon_date >= v_from and (p_valid_until is null or b.salon_date <= p_valid_until)
    and b.during && tstzrange((b.salon_date + p_start_time) at time zone 'Asia/Hebron',
                              (b.salon_date + p_end_time) at time zone 'Asia/Hebron');
  if v_conflicts is not null then
    raise exception 'closure_conflicts' using errcode = 'P0026', detail = v_conflicts::text;
  end if;

  if p_id is null then
    insert into public.closures (barber_id, weekday, start_time, end_time, valid_from, valid_until, reason, created_by)
    values (p_barber_id, p_weekday, p_start_time, p_end_time, v_from, p_valid_until,
            nullif(btrim(coalesce(p_reason, '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.closures c
    set barber_id = p_barber_id, weekday = p_weekday, start_time = p_start_time, end_time = p_end_time,
        valid_from = v_from, valid_until = p_valid_until, reason = nullif(btrim(coalesce(p_reason, '')), '')
    where c.id = p_id
    returning c.id into v_id;
  end if;
  return v_id;
end $$;

-- Opening a closed time again never strands anyone: no conflict check.
create function public.admin_delete_closure(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_barber uuid;
begin
  perform private.require_staff();
  select c.barber_id into v_barber from public.closures c where c.id = p_id;
  if not found then
    raise exception 'closure_not_found' using errcode = 'P0006';
  end if;
  perform private.require_close_for(v_barber);
  delete from public.closures c where c.id = p_id;
end $$;

-- Flags ---------------------------------------------------------------------------------------------------------

create function public.admin_open_flags()
returns table (user_id uuid, full_name text, email text, phone text, flagged_at timestamptz, booking_code text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_staff();
  return query
  select f.user_id, p.full_name, u.email::text, p.phone, f.flagged_at, b.code
  from public.account_flags f
  join auth.users u on u.id = f.user_id
  left join public.profiles p on p.id = f.user_id
  left join public.bookings b on b.id = f.booking_id
  where f.cleared_at is null
  order by f.flagged_at desc;
end $$;

-- Owner: barbers ---------------------------------------------------------------------------------------------------

create function public.admin_barbers()
returns table (id uuid, name_ar text, user_id uuid, linked_name text, linked_email text, is_active boolean, sort integer,
               upcoming integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_owner();
  return query
  select br.id, br.name_ar, br.user_id, p.full_name, u.email::text, br.is_active, br.sort,
         (select count(*)::integer from public.bookings b
          where b.barber_id = br.id and b.status in ('pending', 'confirmed') and upper(b.during) > now())
  from public.barbers br
  left join auth.users u on u.id = br.user_id
  left join public.profiles p on p.id = br.user_id
  order by br.is_active desc, br.sort, br.name_ar;
end $$;

create function public.admin_save_barber(p_id uuid, p_name_ar text, p_user_id uuid, p_is_active boolean, p_sort integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_upcoming integer;
  v_id uuid;
begin
  perform private.require_owner();
  if p_id is null then
    insert into public.barbers (name_ar, user_id, is_active, sort)
    values (btrim(coalesce(p_name_ar, '')), p_user_id, coalesce(p_is_active, true), coalesce(p_sort, 0))
    returning id into v_id;
    return v_id;
  end if;

  if p_is_active = false then
    perform private.lock_booking_window();
    select count(*) into v_upcoming from public.bookings b
    where b.barber_id = p_id and b.status in ('pending', 'confirmed') and upper(b.during) > now();
    if v_upcoming > 0 then
      raise exception 'barber_has_bookings' using errcode = 'P0025', detail = v_upcoming::text;
    end if;
  end if;

  update public.barbers br
  set name_ar = btrim(coalesce(p_name_ar, br.name_ar)), user_id = p_user_id,
      is_active = coalesce(p_is_active, br.is_active), sort = coalesce(p_sort, br.sort)
  where br.id = p_id
  returning br.id into v_id;
  if v_id is null then
    raise exception 'barber_not_found' using errcode = 'P0006';
  end if;
  return v_id;
end $$;

-- Owner: services ------------------------------------------------------------------------------------------------
-- Existing bookings keep their own name, price and duration (snapshots); only new bookings see the change.

create function public.admin_save_service(
  p_id uuid, p_slug text, p_name_ar text, p_price_ils integer, p_duration_min integer, p_bookable_online boolean,
  p_sort integer, p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_owner();
  if p_id is null then
    insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort, is_active)
    values (lower(btrim(p_slug)), btrim(coalesce(p_name_ar, '')), p_price_ils, p_duration_min,
            coalesce(p_bookable_online, false), coalesce(p_sort, 0), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.services s
    set slug = lower(btrim(p_slug)), name_ar = btrim(coalesce(p_name_ar, '')), price_ils = p_price_ils,
        duration_min = p_duration_min, bookable_online = coalesce(p_bookable_online, s.bookable_online),
        sort = coalesce(p_sort, s.sort), is_active = coalesce(p_is_active, s.is_active)
    where s.id = p_id
    returning s.id into v_id;
    if v_id is null then
      raise exception 'service_not_found' using errcode = 'P0006';
    end if;
  end if;
  return v_id;
end $$;

-- Owner: opening hours -------------------------------------------------------------------------------------------
-- null open and close = closed that weekday. Refused while a pending / confirmed booking would fall outside.

create function public.admin_save_salon_hours(p_weekday smallint, p_open time, p_close time) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conflicts jsonb;
begin
  perform private.require_owner();
  if p_weekday is null or p_weekday not between 0 and 6
     or (p_open is null) <> (p_close is null) or (p_open is not null and p_close <= p_open) then
    raise exception 'hours_invalid' using errcode = '22023';
  end if;

  perform private.lock_booking_window();

  select jsonb_agg(private.booking_conflict_row(b) order by lower(b.during)) into v_conflicts
  from public.bookings b
  where b.status in ('pending', 'confirmed') and upper(b.during) > now()
    and extract(dow from b.salon_date) = p_weekday
    and (p_open is null
         or lower(b.during) < (b.salon_date + p_open) at time zone 'Asia/Hebron'
         or upper(b.during) > (b.salon_date + p_close) at time zone 'Asia/Hebron');
  if v_conflicts is not null then
    raise exception 'hours_conflict' using errcode = 'P0026', detail = v_conflicts::text;
  end if;

  if p_open is null then
    delete from public.salon_hours h where h.weekday = p_weekday;
  else
    insert into public.salon_hours (weekday, open_time, close_time) values (p_weekday, p_open, p_close)
    on conflict (weekday) do update set open_time = excluded.open_time, close_time = excluded.close_time;
  end if;
end $$;

-- is_barber is going (20261007000900): the app stops sending it. Same body, the parameter now has a default.
create or replace function public.admin_update_staff(p_user_id uuid, p_role public.app_role, p_is_barber boolean default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  update public.user_roles r set role = p_role, is_barber = coalesce(p_is_barber, r.is_barber)
  where r.user_id = p_user_id;   -- the keep_one_owner trigger refuses demoting the last owner (P0003)
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Grants -------------------------------------------------------------------------------------------------------

revoke all on function
  private.lock_salon_day(date),
  private.lock_booking_window(),
  private.my_barber_id(),
  private.require_close_for(uuid),
  private.booking_conflict_row(public.bookings),
  public.admin_bookings_day(date),
  public.admin_bookings_summary(),
  public.admin_add_walk_in(uuid, uuid, timestamptz, text, text),
  public.admin_close_time(uuid, timestamptz, timestamptz, text),
  public.admin_save_weekly_closure(uuid, uuid, smallint, time, time, date, date, text),
  public.admin_delete_closure(uuid),
  public.admin_open_flags(),
  public.admin_barbers(),
  public.admin_save_barber(uuid, text, uuid, boolean, integer),
  public.admin_save_service(uuid, text, text, integer, integer, boolean, integer, boolean),
  public.admin_save_salon_hours(smallint, time, time)
from public, anon, authenticated;

grant execute on function
  public.admin_bookings_day(date),
  public.admin_bookings_summary(),
  public.admin_add_walk_in(uuid, uuid, timestamptz, text, text),
  public.admin_close_time(uuid, timestamptz, timestamptz, text),
  public.admin_save_weekly_closure(uuid, uuid, smallint, time, time, date, date, text),
  public.admin_delete_closure(uuid),
  public.admin_open_flags(),
  public.admin_barbers(),
  public.admin_save_barber(uuid, text, uuid, boolean, integer),
  public.admin_save_service(uuid, text, text, integer, integer, boolean, integer, boolean),
  public.admin_save_salon_hours(smallint, time, time)
to authenticated;
