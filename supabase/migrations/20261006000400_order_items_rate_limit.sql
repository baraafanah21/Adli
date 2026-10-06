-- Phase A: order lines as rows, server-only ordering, and a per-IP rate limit.
--
-- place_order() now requires a gateway secret that only the site's server holds (env ORDER_GATEWAY_SECRET,
-- generated with `openssl rand -hex 32`). The database keeps only its SHA-256 (pgcrypto), never the secret.
-- The row is inserted per environment, outside migrations:
--   insert into private.app_secrets (name, secret_hash) values ('order_gateway', decode('<sha256 hex>', 'hex'));
-- So the browser can't call /rest/v1/rpc/place_order directly and skip the rate limit.

-- Order lines ---------------------------------------------------------------

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  -- set null: deleting an old product keeps its order history (name and price are snapshots below).
  product_id uuid references public.products (id) on delete set null,
  name_ar text not null,            -- snapshot at order time
  volume_ml integer,                -- snapshot at order time
  unit_price_ils integer not null check (unit_price_ils >= 0),
  qty integer not null check (qty between 1 and 20),
  unique (order_id, product_id)
);

create index order_items_product_idx on public.order_items (product_id);

alter table public.order_items enable row level security;

create policy "admins read order items" on public.order_items for select to authenticated
  using ((select private.is_admin()));

-- orders has no rows yet, so the jsonb copy of the lines can go.
alter table public.orders drop column items;
alter table public.orders add column phone text check (phone ~ '^[0-9+ ]{7,20}$');

-- Private state: never exposed through the API ---------------------------------

create table private.app_secrets (
  name text primary key,
  secret_hash bytea not null,       -- extensions.digest(secret, 'sha256')
  created_at timestamptz not null default now()
);

-- One row per placed order, kept 10 minutes (pruned on every call).
create table private.order_rate_hits (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index order_rate_hits_ip_created_idx on private.order_rate_hits (ip, created_at);

alter table private.app_secrets enable row level security;
alter table private.order_rate_hits enable row level security;
revoke all on private.app_secrets, private.order_rate_hits from public, anon, authenticated;

-- What place_order returns: same shape as before, built from order_items.
create function private.order_summary(p_order_id uuid)
returns table (code text, total_ils integer, items jsonb)
language sql stable security definer set search_path = '' as $$
  select o.code, o.total_ils,
    (select jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'name_ar', i.name_ar, 'volume_ml', i.volume_ml,
        'qty', i.qty, 'unit_price_ils', i.unit_price_ils, 'line_total_ils', i.unit_price_ils * i.qty
      ) order by i.id)
     from public.order_items i
     where i.order_id = o.id)
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function private.order_summary(uuid) from public, anon, authenticated;

-- place_order v2 ------------------------------------------------------------------
-- Errors the API maps for the UI:
--   42501 forbidden (bad gateway secret)                         -> 403
--   22023 invalid input                                           -> 400
--   P0001 products_unavailable, DETAIL = [{id, name_ar}] as JSON  -> 409
--   P0002 rate_limited (5 orders / minute / IP)                   -> 429

drop function public.place_order(uuid, text, text, jsonb);

create function public.place_order(
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

  insert into public.orders as o (idempotency_key, customer_name, area, phone, total_ils)
  values (p_idempotency_key, v_name, nullif(btrim(p_area), ''), nullif(btrim(p_phone), ''), 0)
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

revoke all on function public.place_order(uuid, text, text, text, jsonb, text, text) from public;
grant execute on function public.place_order(uuid, text, text, text, jsonb, text, text) to anon, authenticated;
