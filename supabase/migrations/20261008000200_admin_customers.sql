-- Phase E3.2: «الزبائن» in the admin. Nothing is dropped and no data is deleted.
--
-- Server-only state (private, read and written only through the functions below):
--   private.customer_notes        one internal note per customer (staff only; never reaches the customer)
--   private.booking_rate_resets   who reset a customer's booking limit, and when (a log, never edited)
--   private.customer_blocks       blocks with reason and history; one open block per account
--
--   admin_customers(q, filter, limit, offset)  staff: every account that isn't staff, searchable, filterable
--   admin_customer(user_id)                    staff: one customer's details, bookings, orders, flags, blocks, note
--   admin_reset_booking_rate(user_id)          staff
--   admin_set_customer_note(user_id, note)     staff (empty note = no note)
--   admin_block_customer(user_id, reason)      owner (reason required)
--   admin_unblock_customer(user_id, note)      owner
--
-- Money: each order's amount is shown to staff (they collect it); totals (a customer's spending) only to the owner:
-- spent_ils is null for anyone else, computed in here.
-- «Last visit» = the latest of: the last booking marked «حضر» (completed), the last order delivered (order_events → done).
-- The booking limit (5 created per hour) counts from greatest(now − 1 hour, the last reset); created_at never changes.
-- A blocked account can't book (create_booking) or order (the orders trigger): P0029 customer_blocked. Its upcoming
-- bookings stay, for the staff to decide. The block is on the account only: ordering as a guest is still possible
-- (accepted: every order is confirmed by hand on WhatsApp).
-- Error codes: P0029 customer blocked, P0030 already blocked; P0006 not found (or not a customer); 22023 block_reason_required / note_too_long.

-- Tables ----------------------------------------------------------------------------------------------------------

create table private.customer_notes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table private.booking_rate_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reset_at timestamptz not null default now(),
  reset_by uuid references auth.users (id) on delete set null
);

create index booking_rate_resets_user_idx on private.booking_rate_resets (user_id, reset_at desc);
create index booking_rate_resets_by_idx on private.booking_rate_resets (reset_by);

create table private.customer_blocks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  blocked_at timestamptz not null default now(),
  blocked_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  unblocked_at timestamptz,
  unblocked_by uuid references auth.users (id) on delete set null,
  unblock_note text check (char_length(unblock_note) <= 300)
);

create unique index customer_blocks_one_open on private.customer_blocks (user_id) where unblocked_at is null;
create index customer_blocks_user_idx on private.customer_blocks (user_id, blocked_at desc);
create index customer_blocks_blocked_by_idx on private.customer_blocks (blocked_by);
create index customer_blocks_unblocked_by_idx on private.customer_blocks (unblocked_by);
create index customer_notes_updated_by_idx on private.customer_notes (updated_by);

alter table private.customer_notes enable row level security;
alter table private.booking_rate_resets enable row level security;
alter table private.customer_blocks enable row level security;
revoke all on private.customer_notes, private.booking_rate_resets, private.customer_blocks from public, anon, authenticated;

-- Helpers (private; security definer so the orders trigger works for a plain customer, see CLAUDE.md) -------------

create function private.is_blocked(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.customer_blocks b where b.user_id = p_user_id and b.unblocked_at is null);
$$;

-- Bookings this account created in the current window: the last hour, or since the last reset if that is later.
create function private.bookings_in_rate_window(p_user_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.bookings b
  where b.user_id = p_user_id
    and b.created_at > greatest(now() - interval '1 hour',
                                coalesce((select max(r.reset_at) from private.booking_rate_resets r where r.user_id = p_user_id),
                                         '-infinity'));
$$;

-- A customer = an account with a profile and no staff role.
create function private.require_customer(p_user_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user_id is null
     or not exists (select 1 from public.profiles p where p.id = p_user_id)
     or exists (select 1 from public.user_roles r where r.user_id = p_user_id) then
    raise exception 'customer_not_found' using errcode = 'P0006';
  end if;
end $$;

-- A staff member's name for the history lines.
create function private.staff_name(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(p.full_name), ''), u.email, 'الطاقم')
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;

revoke all on function private.is_blocked(uuid), private.bookings_in_rate_window(uuid), private.require_customer(uuid),
  private.staff_name(uuid) from public, anon, authenticated;

-- A blocked account can't order (place_order inserts the order; the guest path has no user_id) ------------------

create function private.orders_refuse_blocked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and private.is_blocked(new.user_id) then
    raise exception 'customer_blocked' using errcode = 'P0029';
  end if;
  return new;
end $$;

revoke all on function private.orders_refuse_blocked() from public, anon, authenticated;

create trigger orders_refuse_blocked before insert on public.orders
for each row execute function private.orders_refuse_blocked();

-- create_booking: the same as 20261007000700 / E3.1, with two changes: a blocked account is refused (P0029), and the
-- hourly limit counts from the last reset when that is later than an hour ago. ---------------------------------------

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

-- The list ----------------------------------------------------------------------------------------------------------

create function public.admin_customers(p_q text default null, p_filter text default null, p_limit integer default 50,
                                       p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_owner boolean;
  v_like text := '%' || replace(replace(replace(coalesce(nullif(btrim(p_q), ''), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digits text := regexp_replace(translate(coalesce(p_q, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_result jsonb;
begin
  perform private.require_staff();
  v_owner := private.has_role(array['owner']::public.app_role[]);
  if p_filter is not null and p_filter not in ('flagged', 'rate_limited', 'blocked', 'upcoming', 'new_week') then
    raise exception 'filter_invalid' using errcode = '22023';
  end if;

  with customers as (
    select p.id, p.full_name, p.phone, u.email, u.created_at as joined_at,
           (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'completed')::integer as attended,
           (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'no_show')::integer as no_show,
           (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'cancelled')::integer as cancelled,
           (select jsonb_build_object('id', b.id, 'starts_at', lower(b.during), 'status', b.status,
                                      'service_name_ar', b.service_name_ar, 'day', b.salon_date)
            from public.bookings b
            where b.user_id = p.id and b.status in ('pending', 'confirmed') and upper(b.during) > now()
            order by lower(b.during) limit 1) as next_booking,
           (select count(*) from public.orders o where o.user_id = p.id)::integer as orders,
           case when v_owner then (select coalesce(sum(o.total_ils), 0) from public.orders o
                                   where o.user_id = p.id and o.status in ('confirmed', 'done'))::integer end as spent_ils,
           greatest(
             (select max(lower(b.during)) from public.bookings b where b.user_id = p.id and b.status = 'completed'),
             (select max(e.created_at) from public.order_events e join public.orders o on o.id = e.order_id
              where o.user_id = p.id and e.to_status = 'done')
           ) as last_visit,
           exists (select 1 from public.account_flags f where f.user_id = p.id and f.cleared_at is null) as flagged,
           private.bookings_in_rate_window(p.id) >= private.booking_rule('per_hour') as rate_limited,
           private.is_blocked(p.id) as blocked
    from public.profiles p
    join auth.users u on u.id = p.id
    where not exists (select 1 from public.user_roles r where r.user_id = p.id)
      and (p_q is null or btrim(p_q) = ''
           or p.full_name ilike v_like or u.email ilike v_like
           or (char_length(v_digits) >= 3 and p.phone like '%' || ltrim(v_digits, '0') || '%'))
  ),
  filtered as (
    select * from customers c
    where p_filter is null
       or (p_filter = 'flagged' and c.flagged)
       or (p_filter = 'rate_limited' and c.rate_limited)
       or (p_filter = 'blocked' and c.blocked)
       or (p_filter = 'upcoming' and c.next_booking is not null)
       or (p_filter = 'new_week' and c.joined_at > now() - interval '7 days')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'owner', v_owner,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.joined_at desc)
      from (select * from filtered order by joined_at desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)) x
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- One customer --------------------------------------------------------------------------------------------------

create function public.admin_customer(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_owner boolean;
  v_result jsonb;
begin
  perform private.require_staff();
  perform private.require_customer(p_user_id);
  v_owner := private.has_role(array['owner']::public.app_role[]);

  select jsonb_build_object(
    'owner', v_owner,
    'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone, 'area', p.area,
                                  'email', u.email, 'joined_at', u.created_at),
    'attended', (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'completed'),
    'no_show', (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'no_show'),
    'cancelled', (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'cancelled'),
    'spent_ils', case when v_owner then (select coalesce(sum(o.total_ils), 0) from public.orders o
                                         where o.user_id = p.id and o.status in ('confirmed', 'done')) end,
    'last_visit', greatest(
      (select max(lower(b.during)) from public.bookings b where b.user_id = p.id and b.status = 'completed'),
      (select max(e.created_at) from public.order_events e join public.orders o on o.id = e.order_id
       where o.user_id = p.id and e.to_status = 'done')),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'starts_at', lower(b.during), 'day', b.salon_date,
                                          'status', b.status, 'service_name_ar', b.service_name_ar,
                                          'barber_name_ar', br.name_ar)
                       order by lower(b.during) desc)
      from (select * from public.bookings b where b.user_id = p.id order by lower(b.during) desc limit 50) b
      join public.barbers br on br.id = b.barber_id), '[]'::jsonb),
    -- Each order's amount: staff collect it at the counter, so they see it. Only the total above is the owner's.
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'created_at', o.created_at, 'status', o.status,
                                          'total_ils', o.total_ils)
                       order by o.created_at desc)
      from (select * from public.orders o where o.user_id = p.id order by o.created_at desc limit 50) o), '[]'::jsonb),
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'flagged_at', f.flagged_at, 'flagged_by', private.staff_name(f.flagged_by),
                                          'booking_code', (select b.code from public.bookings b where b.id = f.booking_id),
                                          'cleared_at', f.cleared_at, 'cleared_by', private.staff_name(f.cleared_by),
                                          'clear_note', f.clear_note)
                       order by f.flagged_at desc)
      from public.account_flags f where f.user_id = p.id), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('blocked_at', k.blocked_at, 'blocked_by', private.staff_name(k.blocked_by),
                                          'reason', k.reason, 'unblocked_at', k.unblocked_at,
                                          'unblocked_by', private.staff_name(k.unblocked_by), 'unblock_note', k.unblock_note)
                       order by k.blocked_at desc)
      from private.customer_blocks k where k.user_id = p.id), '[]'::jsonb),
    'blocked', private.is_blocked(p.id),
    'rate', jsonb_build_object(
      'in_window', private.bookings_in_rate_window(p.id),
      'per_hour', private.booking_rule('per_hour'),
      'limited', private.bookings_in_rate_window(p.id) >= private.booking_rule('per_hour'),
      'resets', coalesce((
        select jsonb_agg(jsonb_build_object('reset_at', r.reset_at, 'reset_by', private.staff_name(r.reset_by))
                         order by r.reset_at desc)
        from (select * from private.booking_rate_resets r where r.user_id = p.id order by r.reset_at desc limit 10) r),
        '[]'::jsonb)),
    'note', (select jsonb_build_object('text', n.note, 'updated_at', n.updated_at, 'updated_by', private.staff_name(n.updated_by))
             from private.customer_notes n where n.user_id = p.id)
  ) into v_result
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user_id;
  return v_result;
end $$;

-- Actions -------------------------------------------------------------------------------------------------------

create function public.admin_reset_booking_rate(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  perform private.require_customer(p_user_id);
  insert into private.booking_rate_resets (user_id, reset_by) values (p_user_id, (select auth.uid()));
end $$;

create function public.admin_set_customer_note(p_user_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_staff();
  perform private.require_customer(p_user_id);
  if v_note is null then
    delete from private.customer_notes n where n.user_id = p_user_id;
    return;
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  insert into private.customer_notes (user_id, note, updated_at, updated_by) values (p_user_id, v_note, now(), (select auth.uid()))
  on conflict (user_id) do update set note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end $$;

create function public.admin_block_customer(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform private.require_owner();
  perform private.require_customer(p_user_id);
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'block_reason_required' using errcode = '22023';
  end if;
  if private.is_blocked(p_user_id) then
    raise exception 'already_blocked' using errcode = 'P0030';
  end if;
  insert into private.customer_blocks (user_id, blocked_by, reason) values (p_user_id, (select auth.uid()), v_reason);
end $$;

create function public.admin_unblock_customer(p_user_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  perform private.require_customer(p_user_id);
  update private.customer_blocks k
  set unblocked_at = now(), unblocked_by = (select auth.uid()), unblock_note = nullif(btrim(coalesce(p_note, '')), '')
  where k.user_id = p_user_id and k.unblocked_at is null;
  if not found then
    raise exception 'not_blocked' using errcode = 'P0006';
  end if;
end $$;

-- Grants --------------------------------------------------------------------------------------------------------

revoke all on function
  public.admin_customers(text, text, integer, integer), public.admin_customer(uuid), public.admin_reset_booking_rate(uuid),
  public.admin_set_customer_note(uuid, text), public.admin_block_customer(uuid, text), public.admin_unblock_customer(uuid, text)
from public, anon;
grant execute on function
  public.admin_customers(text, text, integer, integer), public.admin_customer(uuid), public.admin_reset_booking_rate(uuid),
  public.admin_set_customer_note(uuid, text), public.admin_block_customer(uuid, text), public.admin_unblock_customer(uuid, text)
to authenticated;
