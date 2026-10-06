-- Phase C: accounts by email.
--   profiles   : one row per auth user, created by a trigger on sign-up.
--   user_roles : owner / staff (+ is_barber), replaces public.admins. private.is_admin() now reads it.
--   orders     : optional user_id, filled by place_order() when the caller is signed in.
--
-- First owner, after their first sign-in (run once in the SQL Editor; no email lives in the code):
--   insert into public.user_roles (user_id, role) select id, 'owner' from auth.users where email = '<owner email>';

create type public.app_role as enum ('owner', 'staff');

-- Profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) between 1 and 80),   -- null for magic-link sign-ups until they add it
  area text check (char_length(area) <= 80),
  phone text check (phone ~ '^[0-9+ ]{7,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

-- Customers edit their own contact fields only; id and timestamps are not theirs to change.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, area, phone) on public.profiles to authenticated;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

-- Users who signed up before this migration.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- Roles ----------------------------------------------------------------------

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  is_barber boolean not null default false,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index user_roles_granted_by_idx on public.user_roles (granted_by);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

-- Carry over existing admins as owners (there are none yet), then retire the old table.
insert into public.user_roles (user_id, role)
select a.user_id, 'owner' from public.admins a
on conflict (user_id) do nothing;

-- Same name and OID as before, so every policy that calls it (catalog, orders, storage) keeps working.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()));
$$;

create function private.has_role(p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = any (p_roles));
$$;

revoke all on function private.has_role(public.app_role[]) from public;
grant execute on function private.has_role(public.app_role[]) to authenticated;

drop table public.admins;

-- There is always at least one owner.
create function private.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from public.user_roles r where r.role = 'owner' and r.user_id <> old.user_id) then
    raise exception 'last_owner' using errcode = 'P0003', hint = 'Add another owner first.';
  end if;
  return coalesce(new, old);
end $$;

create trigger user_roles_keep_owner before update or delete on public.user_roles
for each row execute function private.keep_one_owner();

create policy "read own role" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "read own profile, staff read all" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Orders belong to accounts (optional) -------------------------------------------------

alter table public.orders add column user_id uuid references auth.users (id) on delete set null;
create index orders_user_created_idx on public.orders (user_id, created_at desc) where user_id is not null;

-- One permissive policy per action: the customer's own rows, or everything for staff.
drop policy "admins read orders" on public.orders;
create policy "read own orders, staff read all" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy "admins read order items" on public.order_items;
create policy "read own order items, staff read all" on public.order_items for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = (select auth.uid()))
  );

-- place_order: unchanged except that it records the signed-in caller (guests stay null).
create or replace function public.place_order(
  p_idempotency_key uuid,
  p_customer_name text,
  p_area text,
  p_phone text,
  p_items jsonb,       -- [{ "product_id": uuid, "qty": int }]
  p_client_ip text,    -- first x-forwarded-for value, or 'local' in development
  p_gateway_secret text
) returns table (code text, total_ils integer, items jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_order_id uuid;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_ip text := left(coalesce(nullif(btrim(p_client_ip), ''), 'unknown'), 64);
  v_unavailable jsonb;
begin
  if p_gateway_secret is null or not exists (
    select 1 from private.app_secrets s
    where s.name = 'order_gateway'
      and s.secret_hash = extensions.digest(convert_to(p_gateway_secret, 'UTF8'), 'sha256')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Same key, same order: a double press or a network retry never creates a second order.
  select o.id into v_order_id from public.orders o where o.idempotency_key = p_idempotency_key;
  if found then
    return query select s.code, s.total_ils, s.items from private.order_summary(v_order_id) s;
    return;
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'items_invalid' using errcode = '22023';
  end if;

  -- Requested lines, merged by product.
  create temporary table if not exists pg_temp.req (product_id uuid primary key, qty integer not null) on commit drop;
  truncate pg_temp.req;
  insert into pg_temp.req (product_id, qty)
    select (e ->> 'product_id')::uuid, sum((e ->> 'qty')::integer)
    from jsonb_array_elements(p_items) e
    group by 1;

  if exists (select 1 from pg_temp.req r where r.qty is null or r.qty not between 1 and 20) then
    raise exception 'qty_invalid' using errcode = '22023';
  end if;

  -- Hidden, deleted or out-of-stock products, with their names so the customer knows what to remove.
  select jsonb_agg(jsonb_build_object('id', r.product_id, 'name_ar', p.name_ar)) into v_unavailable
  from pg_temp.req r
  left join public.products p on p.id = r.product_id
  where p.id is null or not p.is_active or p.stock_status = 'out';
  if v_unavailable is not null then
    raise exception 'products_unavailable' using errcode = 'P0001', detail = v_unavailable::text;
  end if;

  -- Rate limit: serialize per IP so two parallel requests can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('order_rate:' || v_ip, 0));
  delete from private.order_rate_hits h where h.created_at < now() - interval '10 minutes';
  if (select count(*) from private.order_rate_hits h
      where h.ip = v_ip and h.created_at > now() - interval '1 minute') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0002';
  end if;
  insert into private.order_rate_hits (ip) values (v_ip);

  -- Signed in: the order belongs to the caller (auth.uid() comes from the verified JWT, never the body).
  insert into public.orders as o (idempotency_key, customer_name, area, phone, total_ils, user_id)
  values (p_idempotency_key, v_name, nullif(btrim(p_area), ''), nullif(btrim(p_phone), ''), 0, (select auth.uid()))
  on conflict (idempotency_key) do nothing
  returning o.id into v_order_id;

  if v_order_id is null then
    -- A parallel request with the same key won the race; return its order.
    select o.id into v_order_id from public.orders o where o.idempotency_key = p_idempotency_key;
    return query select s.code, s.total_ils, s.items from private.order_summary(v_order_id) s;
    return;
  end if;

  -- Prices come from the database, never from the browser.
  insert into public.order_items (order_id, product_id, name_ar, volume_ml, unit_price_ils, qty)
  select v_order_id, p.id, p.name_ar, p.volume_ml, p.price_ils, r.qty
  from pg_temp.req r join public.products p on p.id = r.product_id
  order by p.sort;

  update public.orders o
  set total_ils = (select sum(i.unit_price_ils * i.qty) from public.order_items i where i.order_id = v_order_id)
  where o.id = v_order_id;

  return query select s.code, s.total_ils, s.items from private.order_summary(v_order_id) s;
end $$;


-- create or replace keeps the existing grants (anon, authenticated; protected by the gateway secret).
