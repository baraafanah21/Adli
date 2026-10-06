-- Phase F1: the admin's orders. Status changes, stock taken on confirm and returned on cancel, and two ledgers.
--
--   order_events     every status change (from, to, who, when, note). place_order() writes the first one (→ new).
--   stock_movements  every stock change (receive / sale / cancel / adjust / damage). stock_quantity changes ONLY
--                    through private.apply_stock_movement(): a trigger refuses any other write, even from the SQL Editor.
--                    Manual fix: select private.apply_stock_movement(
--                                  (select id from public.product_variants where sku = 'oud-malaki'), 5, 'receive', 'تصحيح يدوي');
--
-- Admin functions (security definer, execute for authenticated only, role checked in their first line):
--   admin_set_order_status(order_id, status, note)   owner, staff
--   admin_orders(status, from, to, q, limit, offset)  owner, staff
--   admin_order(code)                                 owner, staff
--   admin_new_orders_count()                          owner, staff
-- Error codes: 42501 forbidden, 22023 invalid input, P0001 not enough stock (DETAIL = [{variant_id, name_ar, needed,
-- available}]), P0004 transition not allowed (DETAIL = 'from->to'), P0006 order not found.
--
-- Removes: the policy "admins update orders" and every direct write grant on orders / order_items (all roles), and
-- anon's write grants on products / categories. No data is deleted.

-- Direct writes off ------------------------------------------------------------------------------------------

drop policy "admins update orders" on public.orders;
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;
revoke select on public.orders, public.order_items from anon;
revoke insert, update, delete on public.products, public.categories from anon;

-- Order events ------------------------------------------------------------------------------------------------

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text check (from_status in ('new', 'confirmed', 'done', 'cancelled')),  -- null: the order was placed
  to_status text not null check (to_status in ('new', 'confirmed', 'done', 'cancelled')),
  actor uuid references auth.users (id) on delete set null,                            -- null: a guest placed it
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);
create index order_events_actor_idx on public.order_events (actor);

alter table public.order_events enable row level security;
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;
create policy "staff read order events" on public.order_events for select to authenticated
  using ((select private.is_admin()));

-- Stock movements ---------------------------------------------------------------------------------------------

create table public.stock_movements (
  id bigint generated always as identity primary key,
  -- restrict: a variant with history is hidden (is_active = false), never deleted.
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('receive', 'sale', 'cancel', 'adjust', 'damage')),
  note text check (char_length(note) <= 500),
  order_id uuid references public.orders (id) on delete set null,
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;
create index stock_movements_actor_idx on public.stock_movements (actor);

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated;
create policy "staff read stock movements" on public.stock_movements for select to authenticated
  using ((select private.is_admin()));

-- Opening balance: the quantities set in Phase D become the first movement of each variant, so
-- stock_quantity = sum(delta) from here on. (Rows only; stock_quantity itself is already right.)
insert into public.stock_movements (variant_id, delta, reason, note)
select v.id, v.stock_quantity, 'adjust', 'رصيد افتتاحي'
from public.product_variants v
where v.stock_quantity <> 0;

-- stock_quantity only moves through apply_stock_movement() ------------------------------------------------------

create function private.stock_quantity_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('adli.stock_movement', true), '') <> 'on'
     and (tg_op = 'INSERT' and new.stock_quantity <> 0
          or tg_op = 'UPDATE' and new.stock_quantity is distinct from old.stock_quantity) then
    raise exception 'stock_via_movements' using errcode = '42501',
      hint = 'Change stock with private.apply_stock_movement(variant_id, delta, reason, note).';
  end if;
  return new;
end $$;

create trigger product_variants_stock_guard before insert or update of stock_quantity on public.product_variants
for each row execute function private.stock_quantity_guard();

-- The one way to change stock: writes the movement and the new quantity together. Never below 0 (check constraint).
create function private.apply_stock_movement(
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_note text default null,
  p_order_id uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_qty integer;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'delta_zero' using errcode = '22023';
  end if;
  perform set_config('adli.stock_movement', 'on', true);
  update public.product_variants v set stock_quantity = v.stock_quantity + p_delta
  where v.id = p_variant_id
  returning v.stock_quantity into v_qty;
  perform set_config('adli.stock_movement', '', true);
  if v_qty is null then
    raise exception 'variant_not_found' using errcode = '22023';
  end if;
  insert into public.stock_movements (variant_id, delta, reason, note, order_id, actor)
  values (p_variant_id, p_delta, p_reason, nullif(btrim(p_note), ''), p_order_id, (select auth.uid()));
  return v_qty;
end $$;

-- Taking and returning an order's stock -------------------------------------------------------------------------

-- Confirm: what each order line draws on (bundles split into their pieces as they are now), locked, checked, taken.
create function private.take_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_short jsonb;
  r record;
begin
  -- A line whose variant was deleted, or a bundle with no pieces, can't be confirmed.
  select jsonb_agg(jsonb_build_object('variant_id', i.variant_id, 'name_ar',
           i.name_ar || coalesce(' ' || i.variant_name_ar, ''), 'needed', i.qty, 'available', 0))
  into v_short
  from public.order_items i
  left join public.product_variants v on v.id = i.variant_id
  left join public.products p on p.id = v.product_id
  where i.order_id = p_order_id
    and (v.id is null or (p.kind = 'bundle' and not exists (
      select 1 from public.bundle_items bi where bi.bundle_product_id = p.id)));
  if v_short is not null then
    raise exception 'not_enough_stock' using errcode = 'P0001', detail = v_short::text;
  end if;

  create temporary table if not exists pg_temp.order_need (variant_id uuid primary key, qty integer not null) on commit drop;
  truncate pg_temp.order_need;
  insert into pg_temp.order_need (variant_id, qty)
  select coalesce(bi.variant_id, i.variant_id), sum(i.qty * coalesce(bi.qty, 1))
  from public.order_items i
  join public.product_variants v on v.id = i.variant_id
  join public.products p on p.id = v.product_id
  left join public.bundle_items bi on p.kind = 'bundle' and bi.bundle_product_id = p.id
  where i.order_id = p_order_id
  group by 1;

  -- Lock in id order so two confirmations touching the same variants can't deadlock.
  perform 1 from public.product_variants v
  where v.id in (select n.variant_id from pg_temp.order_need n)
  order by v.id
  for update;

  select jsonb_agg(jsonb_build_object(
           'variant_id', v.id,
           'name_ar', p.name_ar || coalesce(' ' || private.variant_label(v.id), ''),
           'needed', n.qty,
           'available', v.stock_quantity) order by p.name_ar)
  into v_short
  from pg_temp.order_need n
  join public.product_variants v on v.id = n.variant_id
  join public.products p on p.id = v.product_id
  where v.stock_quantity < n.qty;
  if v_short is not null then
    raise exception 'not_enough_stock' using errcode = 'P0001', detail = v_short::text;
  end if;

  for r in select n.variant_id, n.qty from pg_temp.order_need n order by n.variant_id loop
    perform private.apply_stock_movement(r.variant_id, -r.qty, 'sale', null, p_order_id);
  end loop;
end $$;

-- Cancel after confirm: give back exactly what this order took (its own movements), even if a bundle changed since.
create function private.return_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select m.variant_id, -sum(m.delta)::integer as qty
    from public.stock_movements m
    where m.order_id = p_order_id and m.reason in ('sale', 'cancel')
    group by m.variant_id
    having sum(m.delta) <> 0
    order by m.variant_id
  loop
    perform private.apply_stock_movement(r.variant_id, r.qty, 'cancel', null, p_order_id);
  end loop;
end $$;

revoke all on function private.stock_quantity_guard(), private.apply_stock_movement(uuid, integer, text, text, uuid),
  private.take_order_stock(uuid), private.return_order_stock(uuid)
from public, anon, authenticated;

-- Admin: change an order's status ---------------------------------------------------------------------------------
-- new → confirmed | cancelled; confirmed → done | cancelled. Same status again is a no-op (changed = false), so a
-- double press never takes stock twice. The order row is locked for the whole change.

create function public.admin_set_order_status(p_order_id uuid, p_status text, p_note text default null)
returns table (status text, changed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_from text;
begin
  if not private.has_role(array['owner', 'staff']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('new', 'confirmed', 'done', 'cancelled') then
    raise exception 'status_invalid' using errcode = '22023';
  end if;

  select o.status into v_from from public.orders o where o.id = p_order_id for update;
  if v_from is null then
    raise exception 'order_not_found' using errcode = 'P0006';
  end if;

  if v_from = p_status then
    return query select v_from, false;
    return;
  end if;

  if not ((v_from = 'new' and p_status in ('confirmed', 'cancelled'))
          or (v_from = 'confirmed' and p_status in ('done', 'cancelled'))) then
    raise exception 'invalid_transition' using errcode = 'P0004', detail = v_from || '->' || p_status;
  end if;

  if p_status = 'confirmed' then
    perform private.take_order_stock(p_order_id);
  elsif p_status = 'cancelled' and v_from = 'confirmed' then
    perform private.return_order_stock(p_order_id);
  end if;

  update public.orders o set status = p_status where o.id = p_order_id;
  insert into public.order_events (order_id, from_status, to_status, actor, note)
  values (p_order_id, v_from, p_status, (select auth.uid()), nullif(btrim(p_note), ''));

  return query select p_status, true;
end $$;

-- Admin: the orders list. Days are salon days (Asia/Hebron); q matches the code, the name, or the phone digits.

create function public.admin_orders(
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 30,
  p_offset integer default 0
) returns table (
  id uuid, code text, status text, customer_name text, area text, phone text,
  total_ils integer, item_count integer, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_digits text;
begin
  if not private.has_role(array['owner', 'staff']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := nullif(regexp_replace(v_q, '\D', '', 'g'), '');
    if char_length(v_digits) < 3 then v_digits := null; end if;
  end if;

  return query
  select o.id, o.code, o.status, o.customer_name, o.area, o.phone, o.total_ils,
         (select coalesce(sum(i.qty), 0)::integer from public.order_items i where i.order_id = o.id),
         o.created_at, count(*) over ()
  from public.orders o
  where (p_status is null or o.status = p_status)
    and (p_from is null or o.created_at >= (p_from::timestamp at time zone 'Asia/Hebron'))
    and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Hebron'))
    and (v_q is null
         or o.code ilike v_like
         or o.customer_name ilike v_like
         or (v_digits is not null and regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'))
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- Admin: one order by its code, with its lines (and the stock each line can draw on now) and its history.

create function public.admin_order(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_result jsonb;
begin
  if not private.has_role(array['owner', 'staff']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_order from public.orders o where o.code = upper(btrim(p_code));
  if v_order.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'status', v_order.status,
    'customer_name', v_order.customer_name,
    'area', v_order.area,
    'phone', v_order.phone,
    'total_ils', v_order.total_ils,
    'created_at', v_order.created_at,
    'account_email', (select u.email from auth.users u where u.id = v_order.user_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'variant_id', i.variant_id,
        'name_ar', i.name_ar,
        'variant_name_ar', i.variant_name_ar,
        'volume_ml', i.volume_ml,
        'qty', i.qty,
        'unit_price_ils', i.unit_price_ils,
        -- What this line could take right now: the variant's stock, or for a bundle how many its pieces allow.
        'available', case
          when v.id is null then 0
          when p.kind = 'bundle' then (
            select coalesce(min(cv.stock_quantity / bi.qty), 0)
            from public.bundle_items bi join public.product_variants cv on cv.id = bi.variant_id
            where bi.bundle_product_id = p.id)
          else v.stock_quantity
        end
      ) order by i.id)
      from public.order_items i
      left join public.product_variants v on v.id = i.variant_id
      left join public.products p on p.id = v.product_id
      where i.order_id = v_order.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_status', e.from_status,
        'to_status', e.to_status,
        'note', e.note,
        'created_at', e.created_at,
        'actor_name', coalesce(pr.full_name, u.email)
      ) order by e.created_at, e.id)
      from public.order_events e
      left join public.profiles pr on pr.id = e.actor
      left join auth.users u on u.id = e.actor
      where e.order_id = v_order.id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create function public.admin_new_orders_count() returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['owner', 'staff']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select count(*)::integer from public.orders o where o.status = 'new');
end $$;

revoke all on function public.admin_set_order_status(uuid, text, text),
  public.admin_orders(text, date, date, text, integer, integer),
  public.admin_order(text),
  public.admin_new_orders_count()
from public, anon;
grant execute on function public.admin_set_order_status(uuid, text, text),
  public.admin_orders(text, date, date, text, integer, integer),
  public.admin_order(text),
  public.admin_new_orders_count()
to authenticated;

-- place_order: unchanged, plus the first order_events row (→ new) -------------------------------------------------

create or replace function public.place_order(
  p_idempotency_key uuid,
  p_customer_name text,
  p_area text,
  p_phone text,
  p_items jsonb,       -- [{ "variant_id": uuid, "qty": int }]
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

  -- Requested lines, merged by variant.
  create temporary table if not exists pg_temp.req_lines (variant_id uuid primary key, qty integer not null) on commit drop;
  truncate pg_temp.req_lines;
  insert into pg_temp.req_lines (variant_id, qty)
    select (e ->> 'variant_id')::uuid, sum((e ->> 'qty')::integer)
    from jsonb_array_elements(p_items) e
    group by 1;

  if exists (select 1 from pg_temp.req_lines r where r.variant_id is null) then
    raise exception 'items_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.req_lines r where r.qty is null or r.qty not between 1 and 20) then
    raise exception 'qty_invalid' using errcode = '22023';
  end if;

  with lines as (
    select r.variant_id, r.qty, v.id as found_id, v.is_active as v_active,
           p.id as product_id, p.is_active as p_active, p.kind, p.name_ar
    from pg_temp.req_lines r
    left join public.product_variants v on v.id = r.variant_id
    left join public.products p on p.id = v.product_id
  ),
  -- The stock each line draws on: the variant itself, or a bundle's components.
  demand as (
    select l.variant_id as line_id, l.variant_id as stock_id, l.qty as need
    from lines l where l.kind = 'simple'
    union all
    select l.variant_id, bi.variant_id, l.qty * bi.qty
    from lines l join public.bundle_items bi on bi.bundle_product_id = l.product_id
    where l.kind = 'bundle'
  ),
  short as (
    select d.stock_id
    from demand d
    join public.product_variants sv on sv.id = d.stock_id
    join public.products sp on sp.id = sv.product_id
    group by d.stock_id, sv.stock_quantity, sv.is_active, sp.is_active
    having not sv.is_active or not sp.is_active or sv.stock_quantity < sum(d.need)
  )
  select jsonb_agg(jsonb_build_object(
           'id', l.variant_id,
           'name_ar', l.name_ar || coalesce(' ' || private.variant_label(l.found_id), '')
         ))
  into v_unavailable
  from lines l
  where l.found_id is null or not l.v_active or not l.p_active
     or (l.kind = 'bundle' and not exists (select 1 from public.bundle_items bi where bi.bundle_product_id = l.product_id))
     or exists (select 1 from demand d join short s on s.stock_id = d.stock_id where d.line_id = l.variant_id);
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

  -- Prices come from the database, never from the browser. A bundle is one line at its fixed price.
  insert into public.order_items (order_id, product_id, variant_id, name_ar, variant_name_ar, volume_ml, unit_price_ils, qty)
  select v_order_id, p.id, v.id, p.name_ar, private.variant_label(v.id), p.volume_ml, coalesce(v.price_ils, p.price_ils), r.qty
  from pg_temp.req_lines r
  join public.product_variants v on v.id = r.variant_id
  join public.products p on p.id = v.product_id
  order by p.sort, v.sort;

  update public.orders o
  set total_ils = (select sum(i.unit_price_ils * i.qty) from public.order_items i where i.order_id = v_order_id)
  where o.id = v_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor)
  values (v_order_id, null, 'new', (select auth.uid()));

  return query select s.code, s.total_ils, s.items from private.order_summary(v_order_id) s;
end $$;

-- create or replace keeps the existing grants (anon, authenticated; protected by the gateway secret).
