-- Phase E3.1: upcoming bookings and «جديد» for the salon; the phone prefix (970 / 972) chosen by the person, never
-- guessed. Nothing is dropped and no data is deleted (one test order's phone is corrected).
--
-- Phones
--   private.normalize_mobile(text) accepts the full number only: +970 or +972, then 5 and 8 digits (spaces, dashes,
--   dots, brackets and direction marks ignored; Arabic-Indic digits accepted). A local number (05…, 5…) is null:
--   the site always sends the prefix the person chose. No prefix is ever guessed from the first digits.
--   Every phone that is saved goes through it: create_booking and admin_add_walk_in (already), and now orders and
--   profiles through a trigger (place_order, «بياناتي»). Invalid → 22023 phone_invalid. Saved phones are already in
--   full form, except one test order, corrected below.
--
-- Bookings
--   private.staff_seen          when each staff member last opened «المواعيد» (server-only)
--   admin_mark_bookings_seen()  the bookings page calls it from the browser after it has loaded
--   admin_upcoming_bookings()   pending and confirmed bookings from now to the end of the 7th salon day, by day,
--                               each with is_new; each day with its count and closed (no salon_hours row)
--   admin_bookings_badges()     {new, pending} for the admin menu
--   «New» = created after my last visit, and not by me (a walk-in I seated isn't news to me). Never visited: every
--   upcoming booking is new until the first visit.

-- Phones ----------------------------------------------------------------------------------------------------------

create or replace function private.normalize_mobile(p_phone text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := regexp_replace(translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'),
                           '[[:space:]().\-‎‏]', '', 'g');
  m text[];
begin
  m := regexp_match(v, '^\+(970|972)(5[0-9]{8})$');
  if m is null then
    return null;
  end if;
  return '+' || m[1] || m[2];
end $$;

-- Orders and profiles: the phone, when there is one, is saved in full form or refused.
create function private.phone_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.phone is not null and btrim(new.phone) = '' then
    new.phone := null;
  end if;
  if new.phone is not null then
    new.phone := private.normalize_mobile(new.phone);
    if new.phone is null then
      raise exception 'phone_invalid' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.phone_normalize() from public, anon, authenticated;

-- The test order placed before this rule (the salon's own number, written locally).
update public.orders set phone = '+970594369494' where phone = '0594369494';

create trigger orders_phone_normalize before insert or update of phone on public.orders
for each row execute function private.phone_normalize();
create trigger profiles_phone_normalize before insert or update of phone on public.profiles
for each row execute function private.phone_normalize();

-- When each staff member last looked at the bookings -----------------------------------------------------------------

create table private.staff_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bookings_seen_at timestamptz not null
);

alter table private.staff_seen enable row level security;
revoke all on private.staff_seen from public, anon, authenticated;

create function public.admin_mark_bookings_seen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  insert into private.staff_seen (user_id, bookings_seen_at) values ((select auth.uid()), now())
  on conflict (user_id) do update set bookings_seen_at = excluded.bookings_seen_at;
end $$;

create function private.my_bookings_seen_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.bookings_seen_at from private.staff_seen s where s.user_id = (select auth.uid())), '-infinity');
$$;

revoke all on function private.my_bookings_seen_at() from public, anon, authenticated;

create function public.admin_upcoming_bookings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Hebron')::date;
  v_seen timestamptz;
  v_me uuid := (select auth.uid());
begin
  perform private.require_staff();
  v_seen := private.my_bookings_seen_at();
  return jsonb_build_object(
    'seen_at', case when v_seen = '-infinity' then null else v_seen end,
    'days', (
      select jsonb_agg(jsonb_build_object(
               'day', d.day,
               'closed', not exists (select 1 from public.salon_hours h where h.weekday = extract(dow from d.day)),
               'count', coalesce(jsonb_array_length(d.bookings), 0),
               'new', coalesce((select count(*) from jsonb_array_elements(d.bookings) e where (e ->> 'is_new')::boolean), 0),
               'bookings', coalesce(d.bookings, '[]'::jsonb))
             order by d.day)
      from (
        select g.day::date as day, (
          select jsonb_agg(jsonb_build_object(
                   'id', b.id, 'code', b.code, 'starts_at', lower(b.during), 'status', b.status,
                   'customer_name', b.customer_name, 'service_name_ar', b.service_name_ar, 'barber_name_ar', br.name_ar,
                   'is_new', b.created_at > v_seen and b.created_by is distinct from v_me)
                 order by lower(b.during))
          from public.bookings b join public.barbers br on br.id = b.barber_id
          where b.salon_date = g.day::date and b.status in ('pending', 'confirmed') and upper(b.during) > now()
        ) as bookings
        from generate_series(v_today, v_today + 6, interval '1 day') g(day)
      ) d
    )
  );
end $$;

create function public.admin_bookings_badges() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_seen timestamptz;
begin
  perform private.require_staff();
  v_seen := private.my_bookings_seen_at();
  return jsonb_build_object(
    'new', (select count(*) from public.bookings b
            where b.status in ('pending', 'confirmed') and upper(b.during) > now()
              and b.created_at > v_seen and b.created_by is distinct from (select auth.uid())),
    'pending', (select count(*) from public.bookings b where b.status = 'pending')
  );
end $$;

revoke all on function public.admin_mark_bookings_seen(), public.admin_upcoming_bookings(), public.admin_bookings_badges()
from public, anon;
grant execute on function public.admin_mark_bookings_seen(), public.admin_upcoming_bookings(), public.admin_bookings_badges()
to authenticated;
