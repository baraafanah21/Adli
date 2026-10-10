-- Booking revenue: what a customer paid at a «حضر» visit, and the owner's revenue figures.
--
-- bookings.paid_ils: the amount paid for a completed visit. A trigger keeps it with the status: when a booking becomes
-- completed with no amount, it takes price_ils (the price snapshot); when it is not completed (any more), it is null.
-- A check holds that rule (every completed booking has an amount, no other booking has one). Existing completed
-- bookings take their price here (touch_updated_at bumps their updated_at, which nothing reads).
--
-- admin_complete_booking(): «حضر» with the amount, any staff. It goes through admin_set_booking_status (its
-- transitions, booking_events and no-show flag handling unchanged), then records the amount, in one transaction. A
-- booking that was already completed is the same no-op as before: its amount isn't touched.
--
-- admin_set_booking_paid(): the amount of a completed booking, changed afterwards (a relative who paid less, a
-- mistake), any staff. Logged in booking_events as completed → completed with the old and new amount.
--
-- admin_bookings_day(): the same function, each booking now also carries paid_ils (the calendar shows it).
--
-- admin_revenue(): owner only. Completed bookings by salon_date, from–to inclusive, optional barber and service:
-- total, count, and the split by barber, by service and by day. Products (orders) are not in it.
--
-- Additive only: one nullable column, a check, a trigger, three new functions, one more key in admin_bookings_day.
-- admin_set_booking_status and admin_add_walk_in are unchanged: a walk-in is seated as confirmed and becomes completed
-- through admin_set_booking_status, so the trigger covers both (and any later path).

-- The column --------------------------------------------------------------------------------------------------------

alter table public.bookings add column paid_ils integer check (paid_ils >= 0);

create function private.bookings_paid_follows_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' then
    if new.paid_ils is null then
      new.paid_ils := new.price_ils;
    end if;
  else
    new.paid_ils := null;
  end if;
  return new;
end $$;

revoke all on function private.bookings_paid_follows_status() from public, anon, authenticated;

create trigger bookings_paid_follows_status before insert or update of status, paid_ils on public.bookings
for each row execute function private.bookings_paid_follows_status();

update public.bookings b set paid_ils = b.price_ils where b.status = 'completed' and b.paid_ils is null;

alter table public.bookings add constraint bookings_paid_when_completed
  check ((status = 'completed') = (paid_ils is not null));

-- «حضر» with the amount paid ------------------------------------------------------------------------------------------

create function public.admin_complete_booking(p_booking_id uuid, p_paid_ils integer, p_note text default null)
returns table (status text, changed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r record;
begin
  perform private.require_staff();
  -- Same bounds as a service price; null = the booking's price (the trigger).
  if p_paid_ils is not null and (p_paid_ils < 0 or p_paid_ils > 10000) then
    raise exception 'paid_invalid' using errcode = '22023';
  end if;

  select * into r from public.admin_set_booking_status(p_booking_id, 'completed', p_note);

  if r.changed and p_paid_ils is not null then
    update public.bookings b set paid_ils = p_paid_ils where b.id = p_booking_id;
  end if;

  return query select r.status, r.changed;
end $$;

-- The amount, changed after «حضر» ---------------------------------------------------------------------------------

create function public.admin_set_booking_paid(p_booking_id uuid, p_paid_ils integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_paid integer;
begin
  perform private.require_staff();
  if p_paid_ils is null or p_paid_ils < 0 or p_paid_ils > 10000 then
    raise exception 'paid_invalid' using errcode = '22023';
  end if;

  select b.status, b.paid_ils into v_status, v_paid from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0006';
  end if;
  if v_status <> 'completed' then
    raise exception 'not_completed' using errcode = '22023';
  end if;

  if v_paid is distinct from p_paid_ils then
    update public.bookings b set paid_ils = p_paid_ils where b.id = p_booking_id;
    insert into public.booking_events (booking_id, from_status, to_status, actor, note)
    values (p_booking_id, 'completed', 'completed', (select auth.uid()),
            'المبلغ المدفوع: ₪ ' || coalesce(v_paid::text, '—') || ' ← ₪ ' || p_paid_ils);
  end if;
  return p_paid_ils;
end $$;

-- The calendar's day, with the amount ---------------------------------------------------------------------------------

create or replace function public.admin_bookings_day(p_day date) returns jsonb
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
               'customer_name', b.customer_name, 'phone', b.phone, 'paid_ils', b.paid_ils,
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

-- Revenue (owner) -----------------------------------------------------------------------------------------------------

create function public.admin_revenue(p_from date, p_to date, p_barber uuid default null, p_service uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform private.require_owner();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'range_invalid' using errcode = '22023';
  end if;

  with done as (
    select b.barber_id, b.service_id, b.salon_date, b.paid_ils
    from public.bookings b
    where b.status = 'completed'
      and b.salon_date between p_from and p_to
      and (p_barber is null or b.barber_id = p_barber)
      and (p_service is null or b.service_id = p_service)
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'total_ils', (select coalesce(sum(d.paid_ils), 0) from done d),
    'count', (select count(*) from done d),
    'by_barber', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.barber_id, 'name_ar', br.name_ar, 'total_ils', x.total, 'count', x.n)
                       order by x.total desc, br.name_ar)
      from (select d.barber_id, sum(d.paid_ils) as total, count(*) as n from done d group by d.barber_id) x
      join public.barbers br on br.id = x.barber_id
    ), '[]'::jsonb),
    'by_service', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.service_id, 'name_ar', s.name_ar, 'total_ils', x.total, 'count', x.n)
                       order by x.total desc, s.name_ar)
      from (select d.service_id, sum(d.paid_ils) as total, count(*) as n from done d group by d.service_id) x
      join public.services s on s.id = x.service_id
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.salon_date, 'total_ils', x.total, 'count', x.n) order by x.salon_date)
      from (select d.salon_date, sum(d.paid_ils) as total, count(*) as n from done d group by d.salon_date) x
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke all on function
  public.admin_complete_booking(uuid, integer, text),
  public.admin_set_booking_paid(uuid, integer),
  public.admin_revenue(date, date, uuid, uuid)
from public, anon;
grant execute on function
  public.admin_complete_booking(uuid, integer, text),
  public.admin_set_booking_paid(uuid, integer),
  public.admin_revenue(date, date, uuid, uuid)
to authenticated;
