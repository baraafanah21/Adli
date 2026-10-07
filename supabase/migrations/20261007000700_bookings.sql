-- Phase E1: bookings. Barbers, services, salon hours and closures become data; bookings with a database-level guard
-- against double booking; the daily limit; the no-show flag; pending bookings expire at their start time.
--
--   booking_availability(service_id, barber_id)  → per salon day: closed, mine, free start times. anon + authenticated.
--   create_booking(key, service_id, barber_id, starts_at, name, phone, gateway_secret)
--                                                → via POST /api/bookings only (ORDER_GATEWAY_SECRET). authenticated.
--   cancel_my_booking(booking_id)                → the customer, until 2 hours before the start.
--   admin_set_booking_status(booking_id, status, note)   owner, staff
--   admin_clear_flag(user_id, note)                      owner, staff
--
-- Rules (private.booking_rule): 15-minute grid from opening time, at least 60 minutes ahead, up to 7 salon days ahead,
-- customer cancels until 120 minutes before, at most 5 bookings created per account per hour. Salon time Asia/Hebron.
--
-- Error codes: 42501 forbidden / bad secret / signed out, 22023 invalid input (message: name_required, phone_invalid,
-- start_off_grid, reason_required…), P0006 not found, P0020 time not available (taken, closed, outside hours),
-- P0021 outside the booking window, P0022 already has a booking that salon day, P0023 too many bookings,
-- P0024 too late to cancel online, P0027 service not bookable online or barber inactive, P0028 status change not
-- allowed (DETAIL = 'from->to').
--
-- Nothing is dropped. src/lib/salon.ts WEEK and src/lib/services.ts are replaced by these tables in E2.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Rules in one place ----------------------------------------------------------------------------------------------

create function private.booking_rule(p_name text) returns integer
language sql immutable set search_path = '' as $$
  select case p_name
    when 'grid_min' then 15       -- start times every 15 minutes from opening
    when 'lead_min' then 60       -- book at least an hour ahead
    when 'horizon_days' then 7    -- today + 7 salon days
    when 'cancel_min' then 120    -- the customer cancels online until 2 hours before
    when 'per_hour' then 5        -- bookings created per account per hour
  end;
$$;

-- Mobile numbers: 05x local, +970 / +972 (or 00…). Stored as +9705XXXXXXXX / +9725XXXXXXXX; null = not a mobile.
-- Local 056 / 059 are Palestinian (+970), every other 05x is +972. Arabic-Indic digits are accepted.
create function private.normalize_mobile(p_phone text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := regexp_replace(translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'),
                           '[[:space:]().\-‎‏]', '', 'g');
  m text[];
begin
  if v ~ '^05[0-9]{8}$' then
    return case when substr(v, 1, 3) in ('056', '059') then '+970' else '+972' end || substr(v, 2);
  end if;
  m := regexp_match(v, '^(?:\+|00)?(970|972)0?(5[0-9]{8})$');
  if m is not null then
    return '+' || m[1] || m[2];
  end if;
  return null;
end $$;

-- Barbers ---------------------------------------------------------------------------------------------------------

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 40),
  -- Optional link to a staff account, so the barber sees his own column. Removing the role unlinks him.
  user_id uuid unique references public.user_roles (user_id) on delete set null,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger barbers_touch before update on public.barbers
for each row execute function public.touch_updated_at();

-- Services --------------------------------------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 60),
  price_ils integer not null check (price_ils between 0 and 10000),
  duration_min integer check (duration_min between 5 and 240 and duration_min % 5 = 0),
  bookable_online boolean not null default false,   -- false: an add-on, asked for at the salon
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_bookable_needs_duration check (not bookable_online or duration_min is not null)
);

create trigger services_touch before update on public.services
for each row execute function public.touch_updated_at();

-- Salon hours: one row per open weekday (0 = Sunday, as extract(dow) and Date#getDay()). No row = closed. ---------

create table public.salon_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  open_time time not null,
  close_time time not null,
  updated_at timestamptz not null default now(),
  constraint salon_hours_order check (open_time < close_time)
);

create trigger salon_hours_touch before update on public.salon_hours
for each row execute function public.touch_updated_at();

-- Closures: breaks and closed times, for one barber or the whole salon (barber_id null), once or every week. ---------

create table public.closures (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid references public.barbers (id) on delete restrict,
  during tstzrange,                                       -- once
  weekday smallint check (weekday between 0 and 6),       -- weekly: weekday, start_time–end_time, valid_from…valid_until
  start_time time,
  end_time time,
  valid_from date,
  valid_until date,
  reason text check (char_length(reason) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint closures_shape check (
    (during is not null and weekday is null and start_time is null and end_time is null
      and valid_from is null and valid_until is null
      and not isempty(during) and not lower_inf(during) and not upper_inf(during))
    or (during is null and weekday is not null and start_time is not null and end_time is not null
      and start_time < end_time and valid_from is not null and (valid_until is null or valid_until >= valid_from))
  )
);

create index closures_barber_idx on public.closures (barber_id);
create index closures_created_by_idx on public.closures (created_by);
create index closures_during_idx on public.closures using gist (during) where during is not null;

-- Bookings --------------------------------------------------------------------------------------------------------

create sequence public.booking_code_seq start 1001;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('BK-' || nextval('public.booking_code_seq')),
  idempotency_key uuid unique,                                      -- online bookings; null for walk-ins
  kind text not null default 'online' check (kind in ('online', 'walk_in')),
  user_id uuid references auth.users (id) on delete set null,       -- null: a walk-in
  barber_id uuid not null references public.barbers (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  -- Snapshots at booking time: later price or duration changes don't touch existing bookings.
  service_name_ar text not null,
  price_ils integer not null check (price_ils >= 0),
  duration_min integer not null check (duration_min between 5 and 240),
  customer_name text check (char_length(customer_name) between 1 and 80),
  phone text check (phone ~ '^\+97[02]5[0-9]{8}$'),
  during tstzrange not null,
  salon_date date generated always as ((lower(during) at time zone 'Asia/Hebron')::date) stored,
  status text not null check (status in ('pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'rejected')),
  cancelled_by text check (cancelled_by in ('customer', 'salon', 'system')),
  cancel_reason text check (char_length(cancel_reason) <= 300),     -- shown to the customer
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_during_shape check (
    not isempty(during) and lower_inc(during) and not upper_inc(during)
    and not lower_inf(during) and not upper_inf(during)
    and upper(during) - lower(during) = make_interval(mins => duration_min)),
  constraint bookings_online_contact check (kind = 'walk_in' or (customer_name is not null and phone is not null)),
  constraint bookings_closed_by check ((status in ('cancelled', 'rejected')) = (cancelled_by is not null)),
  constraint bookings_salon_gives_reason check (cancelled_by is null or cancelled_by = 'customer' or cancel_reason is not null),
  -- One barber, one customer at a time. Pending bookings hold their time too; a no-show frees it for a walk-in.
  constraint bookings_no_overlap exclude using gist (barber_id with =, during with &&)
    where (status in ('pending', 'confirmed', 'completed'))
);

-- One booking per account per salon day, whatever its outcome; only cancelling or a rejection frees the day.
create unique index bookings_one_per_day on public.bookings (user_id, salon_date)
  where user_id is not null and status in ('pending', 'confirmed', 'completed', 'no_show');

create index bookings_user_day_idx on public.bookings (user_id, salon_date desc) where user_id is not null;
create index bookings_day_barber_idx on public.bookings (salon_date, barber_id);
create index bookings_barber_idx on public.bookings (barber_id);
create index bookings_service_idx on public.bookings (service_id);
create index bookings_created_by_idx on public.bookings (created_by);
create index bookings_pending_start_idx on public.bookings (lower(during)) where status = 'pending';

create trigger bookings_touch before update on public.bookings
for each row execute function public.touch_updated_at();

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status text check (from_status in ('pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'rejected')),
  to_status text not null check (to_status in ('pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'rejected')),
  actor uuid references auth.users (id) on delete set null,          -- null: the system (expiry)
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, created_at);
create index booking_events_actor_idx on public.booking_events (actor);

-- The no-show flag: while one is open, new bookings wait for the salon's confirmation. History is kept. -------------

create table public.account_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  flagged_at timestamptz not null default now(),
  flagged_by uuid references auth.users (id) on delete set null,
  cleared_at timestamptz,
  cleared_by uuid references auth.users (id) on delete set null,
  clear_note text check (char_length(clear_note) <= 300),
  constraint account_flags_cleared check (cleared_at is not null or (cleared_by is null and clear_note is null))
);

create unique index account_flags_one_open on public.account_flags (user_id) where cleared_at is null;
create index account_flags_user_idx on public.account_flags (user_id, flagged_at desc);
create index account_flags_booking_idx on public.account_flags (booking_id);
create index account_flags_flagged_by_idx on public.account_flags (flagged_by);
create index account_flags_cleared_by_idx on public.account_flags (cleared_by);

-- Who reads what. No direct writes for anyone: every change goes through the functions below. --------------------------

alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.salon_hours enable row level security;
alter table public.closures enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.account_flags enable row level security;

revoke all on public.barbers, public.services, public.salon_hours, public.closures, public.bookings,
  public.booking_events, public.account_flags from anon, authenticated;
revoke all on sequence public.booking_code_seq from anon, authenticated;

-- barbers.user_id stays private (column grants); the admin reads it through admin_* functions.
grant select (id, name_ar, sort, is_active) on public.barbers to anon, authenticated;
grant select on public.services, public.salon_hours to anon, authenticated;
grant select on public.closures, public.bookings, public.booking_events, public.account_flags to authenticated;

create policy "anon read active barbers" on public.barbers for select to anon using (is_active);
create policy "read active barbers, staff read all" on public.barbers for select to authenticated
  using (is_active or (select private.is_admin()));

create policy "anon read active services" on public.services for select to anon using (is_active);
create policy "read active services, staff read all" on public.services for select to authenticated
  using (is_active or (select private.is_admin()));

create policy "read salon hours" on public.salon_hours for select to anon, authenticated using (true);

create policy "staff read closures" on public.closures for select to authenticated
  using ((select private.is_admin()));

create policy "read own bookings, staff read all" on public.bookings for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "staff read booking events" on public.booking_events for select to authenticated
  using ((select private.is_admin()));

create policy "read own flags, staff read all" on public.account_flags for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Data from the owner ------------------------------------------------------------------------------------------------

insert into public.barbers (name_ar, sort) values ('أبو عادل', 10), ('ليث', 20);

insert into public.services (slug, name_ar, price_ils, duration_min, bookable_online, sort) values
  ('full-cut',      'حلاقة كاملة',            30,  30,   true,  10),
  ('hair-beard',    'تحديد شعر وتدريج لحية',  15,  15,   true,  20),
  ('wax',           'شمع',                    5,   null, false, 30),
  ('blow-dry',      'سشوار',                  10,  null, false, 40),
  ('steam-facial',  'تنظيف بشرة بالبخار',     50,  45,   true,  50),
  ('pore-strip',    'لزقة زوان',              5,   null, false, 60),
  ('clay-mask',     'ماسك طين أو ألوفيرا',    5,   null, false, 70),
  ('mask-facial',   'تنظيف بشرة بالماسكات',   25,  30,   true,  80),
  ('oil-bath',      'حمام زيت',               10,  20,   true,  90),
  ('protein',       'بروتين مع شامبو',        200, 90,   true,  100),
  ('groom',         'حلاقة عريس',             200, 90,   true,  110);

-- Saturday to Thursday 12:00–22:00, Monday until 20:00, Friday closed (no row).
insert into public.salon_hours (weekday, open_time, close_time) values
  (6, '12:00', '22:00'), (0, '12:00', '22:00'), (1, '12:00', '20:00'),
  (2, '12:00', '22:00'), (3, '12:00', '22:00'), (4, '12:00', '22:00');

-- Is this time free for this barber? Inside the hours of its salon day, no closure, no booking holding it. ----------
-- p_ignore: a booking to leave out (one that is being moved or corrected).

create function private.slot_is_free(p_barber_id uuid, p_during tstzrange, p_ignore uuid default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  with d as (
    select lower(p_during) at time zone 'Asia/Hebron' as ls,
           upper(p_during) at time zone 'Asia/Hebron' as le,
           (lower(p_during) at time zone 'Asia/Hebron')::date as day
  )
  select
    exists (
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

create function private.booking_summary(p_booking_id uuid)
returns table (code text, status text, starts_at timestamptz, ends_at timestamptz,
               barber_name_ar text, service_name_ar text, price_ils integer)
language sql stable security definer set search_path = '' as $$
  select b.code, b.status, lower(b.during), upper(b.during), br.name_ar, b.service_name_ar, b.price_ils
  from public.bookings b join public.barbers br on br.id = b.barber_id
  where b.id = p_booking_id;
$$;

-- Availability ---------------------------------------------------------------------------------------------------
-- Free start times only: never who booked, nor why a time is taken. `mine` is true on a salon day where the caller
-- already has a booking (always false for a visitor who isn't signed in).

create function public.booking_availability(p_service_id uuid, p_barber_id uuid)
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
      from generate_series(days.d + h.open_time, days.d + h.close_time - make_interval(mins => v_dur),
                           make_interval(mins => private.booking_rule('grid_min'))) t
      cross join lateral (select t at time zone 'Asia/Hebron' as st) x
      where x.st >= now() + make_interval(mins => private.booking_rule('lead_min'))
        and private.slot_is_free(p_barber_id, tstzrange(x.st, x.st + make_interval(mins => v_dur)))
    ), '{}')
  from days
  left join public.salon_hours h on h.weekday = extract(dow from days.d)
  order by days.d;
end $$;

-- Creating a booking --------------------------------------------------------------------------------------------
-- Called by POST /api/bookings with the server-held gateway secret, as the signed-in customer.
-- Two requests for the same time: both wait on the salon day's advisory lock, so the second one sees the first
-- booking and gets P0020. The exclusion constraint is the floor underneath (23P01, mapped to P0020 too).

create function public.create_booking(
  p_idempotency_key uuid,
  p_service_id uuid,
  p_barber_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_phone text,
  p_gateway_secret text
) returns table (code text, status text, starts_at timestamptz, ends_at timestamptz,
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

  if char_length(v_name) not between 1 and 80 then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'phone_invalid' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'start_required' using errcode = '22023';
  end if;

  if (select count(*) from public.bookings b
      where b.user_id = v_uid and b.created_at > now() - interval '1 hour') >= private.booking_rule('per_hour') then
    raise exception 'rate_limited' using errcode = 'P0023';
  end if;

  select * into v_service from public.services s
  where s.id = p_service_id and s.is_active and s.bookable_online;
  if not found or not exists (select 1 from public.barbers b where b.id = p_barber_id and b.is_active) then
    raise exception 'not_bookable' using errcode = 'P0027';
  end if;

  v_during := tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_service.duration_min));
  v_day := (p_starts_at at time zone 'Asia/Hebron')::date;

  if p_starts_at < now() + make_interval(mins => private.booking_rule('lead_min'))
     or v_day > (now() at time zone 'Asia/Hebron')::date + private.booking_rule('horizon_days') then
    raise exception 'outside_window' using errcode = 'P0021';
  end if;

  select h.open_time into v_open from public.salon_hours h where h.weekday = extract(dow from v_day);
  if v_open is null then
    raise exception 'slot_unavailable' using errcode = 'P0020', detail = 'closed';
  end if;
  if extract(epoch from (p_starts_at at time zone 'Asia/Hebron') - (v_day + v_open))::bigint
       % (private.booking_rule('grid_min') * 60) <> 0 then
    raise exception 'start_off_grid' using errcode = '22023';
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

-- The customer cancels ------------------------------------------------------------------------------------------

create function public.cancel_my_booking(p_booking_id uuid)
returns table (status text, changed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_from text;
  v_start timestamptz;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select b.status, lower(b.during) into v_from, v_start
  from public.bookings b where b.id = p_booking_id and b.user_id = v_uid
  for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0006';
  end if;

  if v_from = 'cancelled' then
    return query select v_from, false;
    return;
  end if;
  if v_from not in ('pending', 'confirmed') then
    raise exception 'invalid_transition' using errcode = 'P0028', detail = v_from || '->cancelled';
  end if;
  if v_start - now() < make_interval(mins => private.booking_rule('cancel_min')) then
    raise exception 'too_late_to_cancel' using errcode = 'P0024';
  end if;

  update public.bookings b set status = 'cancelled', cancelled_by = 'customer' where b.id = p_booking_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor)
  values (p_booking_id, v_from, 'cancelled', v_uid);

  return query select 'cancelled'::text, true;
end $$;

-- The salon changes a status ------------------------------------------------------------------------------------
--   pending   → confirmed (before its start) | rejected (reason required)
--   confirmed → cancelled (reason required) | completed «حضر» | no_show (both from its start time)
--   no_show   → completed (a correction: also clears the flag this booking raised)
-- The same status again changes nothing. A no-show opens a flag on the account unless one is open already.

create function public.admin_set_booking_status(p_booking_id uuid, p_status text, p_note text default null)
returns table (status text, changed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_from text;
  v_during tstzrange;
  v_day date;
  v_user uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_staff();
  if p_status is null or p_status not in ('confirmed', 'completed', 'no_show', 'cancelled', 'rejected') then
    raise exception 'status_invalid' using errcode = '22023';
  end if;

  select b.status, b.during, b.salon_date, b.user_id into v_from, v_during, v_day, v_user
  from public.bookings b where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0006';
  end if;

  if v_from = p_status then
    return query select v_from, false;
    return;
  end if;

  if not ((v_from = 'pending' and p_status = 'confirmed' and lower(v_during) > now())
          or (v_from = 'pending' and p_status = 'rejected')
          or (v_from = 'confirmed' and p_status = 'cancelled')
          or (v_from = 'confirmed' and p_status in ('completed', 'no_show') and lower(v_during) <= now())
          or (v_from = 'no_show' and p_status = 'completed')) then
    raise exception 'invalid_transition' using errcode = 'P0028', detail = v_from || '->' || p_status;
  end if;

  if p_status in ('cancelled', 'rejected') and v_note is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- A corrected no-show takes its time back: someone may have been seated in it meanwhile.
  if v_from = 'no_show' then
    perform pg_advisory_xact_lock(hashtextextended('booking_day:' || v_day::text, 0));
  end if;

  begin
    update public.bookings b
    set status = p_status,
        cancelled_by = case when p_status in ('cancelled', 'rejected') then 'salon' end,
        cancel_reason = case when p_status in ('cancelled', 'rejected') then v_note end
    where b.id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0020';
  end;

  if p_status = 'no_show' and v_user is not null
     and not exists (select 1 from public.account_flags f where f.user_id = v_user and f.cleared_at is null) then
    insert into public.account_flags (user_id, booking_id, flagged_by) values (v_user, p_booking_id, v_uid);
  end if;

  if v_from = 'no_show' and p_status = 'completed' then
    update public.account_flags f
    set cleared_at = now(), cleared_by = v_uid, clear_note = coalesce(v_note, 'تصحيح: حضر')
    where f.booking_id = p_booking_id and f.cleared_at is null;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor, note)
  values (p_booking_id, v_from, p_status, v_uid, v_note);

  return query select p_status, true;
end $$;

-- The salon clears a no-show flag (who and when are kept) --------------------------------------------------------

create function public.admin_clear_flag(p_user_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  update public.account_flags f
  set cleared_at = now(), cleared_by = (select auth.uid()), clear_note = nullif(btrim(coalesce(p_note, '')), '')
  where f.user_id = p_user_id and f.cleared_at is null;
  if not found then
    raise exception 'flag_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Pending bookings nobody decided on are rejected at their start time (pg_cron, every minute). ----------------------

create function private.expire_pending_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with x as (
    update public.bookings b
    set status = 'rejected', cancelled_by = 'system', cancel_reason = 'لم يُؤكَّد في الوقت'
    where b.status = 'pending' and lower(b.during) <= now()
    returning b.id
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor, note)
  select x.id, 'pending', 'rejected', null, 'لم يُؤكَّد في الوقت' from x;
  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('bookings-expire-pending', '* * * * *', 'select private.expire_pending_bookings()');

-- Function grants ------------------------------------------------------------------------------------------------

revoke all on function
  private.booking_rule(text),
  private.normalize_mobile(text),
  private.slot_is_free(uuid, tstzrange, uuid),
  private.booking_summary(uuid),
  private.expire_pending_bookings(),
  public.booking_availability(uuid, uuid),
  public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text),
  public.cancel_my_booking(uuid),
  public.admin_set_booking_status(uuid, text, text),
  public.admin_clear_flag(uuid, text)
from public, anon, authenticated;

grant execute on function public.booking_availability(uuid, uuid) to anon, authenticated;
grant execute on function
  public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text),
  public.cancel_my_booking(uuid),
  public.admin_set_booking_status(uuid, text, text),
  public.admin_clear_flag(uuid, text)
to authenticated;
