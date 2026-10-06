-- Phase D: variants (size / colour) and fixed gift bundles. Sizes, colours and bundle contents arrive
-- later as data only (inserts), no code change.
--
--   product_options        named options per product («المقاس», «اللون»), ordered. kind 'color' values carry a hex.
--   product_option_values  the values of an option («L», «أسود» + #111111).
--   product_variants       what is stocked and ordered. Every product has at least one; a simple product has one
--                          default variant with no option values (hidden in the UI). price_ils null = product price.
--   bundle_items           a bundle (products.kind = 'bundle') is its own product with a fixed price; this lists
--                          what is inside it. A later «ركّب بكجتك» gets its own tables and doesn't touch these.
--   variant_availability   public view: stock_state per variant ('in' | 'low' | 'out'), bundles derived from their
--                          components, plus the display label. The public never sees exact quantities.
--
-- Stock is not decremented yet (Phase F). place_order() checks stock_quantity >= requested qty.

-- Products: simple or bundle ------------------------------------------------------------

alter table public.products
  add column kind text not null default 'simple' check (kind in ('simple', 'bundle'));

-- Options and values --------------------------------------------------------------------

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name_ar text not null check (char_length(name_ar) between 1 and 40),
  kind text not null default 'text' check (kind in ('size', 'color', 'text')),
  sort integer not null default 0,
  unique (product_id, name_ar)
);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.product_options (id) on delete cascade,
  label_ar text not null check (char_length(label_ar) between 1 and 40),
  hex text check (hex ~ '^#[0-9A-Fa-f]{6}$'),   -- required for colour options, empty otherwise (trigger below)
  sort integer not null default 0,
  unique (option_id, label_ar)
);

create index product_option_values_option_idx on public.product_option_values (option_id, sort);

-- Variants ------------------------------------------------------------------------------

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique check (sku ~ '^[a-z0-9][a-z0-9-]{0,79}$'),  -- also the ?v= value in product URLs
  option_value_ids uuid[] not null default '{}',  -- one value per option of the product, kept sorted (trigger)
  label_ar text check (char_length(label_ar) between 1 and 80),    -- overrides the generated «أسود، مقاس L»
  price_ils integer check (price_ils >= 0),                         -- null: inherits products.price_ils
  stock_quantity integer not null default 0 check (stock_quantity >= 0),  -- ignored for bundles
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  stock_state text generated always as (
    case when stock_quantity <= 0 then 'out' when stock_quantity <= low_stock_threshold then 'low' else 'in' end
  ) stored,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No two variants with the same combination; the default variant ('{}') is unique per product too.
  unique (product_id, option_value_ids)
);

create trigger product_variants_touch before update on public.product_variants
for each row execute function public.touch_updated_at();

-- Bundles -------------------------------------------------------------------------------

create table public.bundle_items (
  bundle_product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  qty integer not null default 1 check (qty between 1 and 20),
  sort integer not null default 0,
  primary key (bundle_product_id, variant_id)
);

create index bundle_items_variant_idx on public.bundle_items (variant_id);

-- Integrity triggers (private: never callable through the API) ---------------------------

-- A variant takes exactly one value from each option of its own product. Stored sorted, so the unique
-- constraint above compares combinations, not orderings.
create function private.variants_validate() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_options integer;
  v_matched integer;
begin
  new.option_value_ids := array(select distinct x from unnest(new.option_value_ids) x where x is not null order by x);
  select count(*) into v_options from public.product_options o where o.product_id = new.product_id;
  select count(distinct ov.option_id) into v_matched
  from public.product_option_values ov
  join public.product_options o on o.id = ov.option_id
  where ov.id = any (new.option_value_ids) and o.product_id = new.product_id;
  if v_matched <> v_options or cardinality(new.option_value_ids) <> v_options then
    raise exception 'variant_values_invalid' using errcode = '23514',
      hint = 'A variant takes exactly one value from each option of its product.';
  end if;
  return new;
end $$;

create trigger product_variants_validate before insert or update of product_id, option_value_ids
on public.product_variants for each row execute function private.variants_validate();

-- Every product keeps at least one variant. Deferred, so a product and its first variant can be
-- inserted in the same transaction, in either order.
create function private.product_needs_variant() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_product uuid;
begin
  -- NEW is null on DELETE, so branch before touching it.
  if tg_table_name = 'products' then
    v_product := new.id;
  else
    v_product := old.product_id;
  end if;
  if exists (select 1 from public.products p where p.id = v_product)
     and not exists (select 1 from public.product_variants v where v.product_id = v_product) then
    raise exception 'product_needs_variant' using errcode = '23514', detail = v_product::text;
  end if;
  return null;
end $$;

-- Colour values carry a hex; other values don't. Bundles have no options.
create function private.option_values_validate() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
begin
  select o.kind into v_kind from public.product_options o where o.id = new.option_id;
  if (v_kind = 'color') <> (new.hex is not null) then
    raise exception 'option_value_hex' using errcode = '23514', hint = 'Colour values need a hex; other values must not have one.';
  end if;
  return new;
end $$;

create trigger product_option_values_validate before insert or update of option_id, hex
on public.product_option_values for each row execute function private.option_values_validate();

create function private.options_validate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.products p where p.id = new.product_id and p.kind = 'bundle') then
    raise exception 'bundle_has_no_options' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind and exists (
    select 1 from public.product_option_values ov
    where ov.option_id = new.id and (new.kind = 'color') <> (ov.hex is not null)
  ) then
    raise exception 'option_value_hex' using errcode = '23514', hint = 'Fix the values'' hex before changing the option kind.';
  end if;
  return new;
end $$;

create trigger product_options_validate before insert or update of product_id, kind
on public.product_options for each row execute function private.options_validate();

-- Bundle contents are simple-product variants, inside a bundle product.
create function private.bundle_items_validate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.products p where p.id = new.bundle_product_id and p.kind = 'bundle') then
    raise exception 'not_a_bundle' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = new.variant_id and p.kind <> 'simple'
  ) then
    raise exception 'bundle_in_bundle' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger bundle_items_validate before insert or update
on public.bundle_items for each row execute function private.bundle_items_validate();

-- A product's kind is fixed once it has options, bundle contents, or sits inside a bundle.
create function private.products_kind_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind is distinct from old.kind and (
    exists (select 1 from public.bundle_items bi where bi.bundle_product_id = new.id)
    or exists (select 1 from public.bundle_items bi join public.product_variants v on v.id = bi.variant_id
               where v.product_id = new.id)
    or exists (select 1 from public.product_options o where o.product_id = new.id)
  ) then
    raise exception 'product_kind_locked' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger products_kind_guard before update of kind on public.products
for each row execute function private.products_kind_guard();

revoke all on function
  private.variants_validate(), private.product_needs_variant(), private.option_values_validate(),
  private.options_validate(), private.bundle_items_validate(), private.products_kind_guard()
from public, anon, authenticated;

-- Display label: «أسود، مقاس L» from the option values, or the variant's own label_ar.
-- Null for a default variant. Used by the public view and by place_order(), so the site and the
-- WhatsApp message always say the same thing. Invoker rights: callers only see what RLS lets them.
create function private.variant_label(p_variant_id uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(v.label_ar, (
    select string_agg(case when o.kind = 'size' then 'مقاس ' || ov.label_ar else ov.label_ar end, '، '
                      order by o.sort, o.name_ar)
    from public.product_option_values ov
    join public.product_options o on o.id = ov.option_id
    where ov.id = any (v.option_value_ids)
  ))
  from public.product_variants v
  where v.id = p_variant_id;
$$;

revoke all on function private.variant_label(uuid) from public;
grant execute on function private.variant_label(uuid) to anon, authenticated;

-- Existing products: one default variant each, stock carried over, then stock_status goes -----

insert into public.product_variants (product_id, sku, stock_quantity)
select p.id, p.slug, case p.stock_status when 'out' then 0 when 'low' then 2 else 10 end
from public.products p;

alter table public.products drop column stock_status;

create constraint trigger products_need_variant after insert on public.products
deferrable initially deferred for each row execute function private.product_needs_variant();
create constraint trigger product_variants_keep_one after delete or update of product_id on public.product_variants
deferrable initially deferred for each row execute function private.product_needs_variant();

-- Availability (public) --------------------------------------------------------------------
-- Simple variant: its own stock_state. Bundle: 'out' if any component is out, hidden or missing,
-- 'low' if any is low, else 'in'. Exact counts (and a bundle's min(floor(stock / qty))) are staff-only, Phase F.
create view public.variant_availability with (security_invoker = true) as
select
  v.id as variant_id,
  v.product_id,
  case when p.kind = 'bundle' then (
    select case
      when count(*) = 0 then 'out'
      when bool_or(cv.id is null or not cv.is_active or cp.id is null or not cp.is_active or cv.stock_state = 'out') then 'out'
      when bool_or(cv.stock_state = 'low') then 'low'
      else 'in'
    end
    from public.bundle_items bi
    left join public.product_variants cv on cv.id = bi.variant_id
    left join public.products cp on cp.id = cv.product_id
    where bi.bundle_product_id = p.id
  ) else v.stock_state end as stock_state,
  private.variant_label(v.id) as label_ar
from public.product_variants v
join public.products p on p.id = v.product_id;

-- Grants: read for everyone (RLS filters rows), writes for signed-in (RLS: staff only).
-- product_variants: every column except stock_quantity. Select lists must name columns; select=* is refused.
revoke all on public.product_options, public.product_option_values, public.product_variants,
  public.bundle_items, public.variant_availability from anon, authenticated;
grant select on public.product_options, public.product_option_values, public.bundle_items,
  public.variant_availability to anon, authenticated;
grant select (id, product_id, sku, option_value_ids, label_ar, price_ils, low_stock_threshold, stock_state,
  is_active, sort, created_at, updated_at) on public.product_variants to anon, authenticated;
grant insert, update, delete on public.product_options, public.product_option_values, public.product_variants,
  public.bundle_items to authenticated;

-- RLS ----------------------------------------------------------------------------------------
-- Public: rows of active products only (and active variants). Staff: everything. One policy per action.

alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.bundle_items enable row level security;

create policy "public reads options of active products" on public.product_options for select to anon, authenticated
  using ((select private.is_admin())
         or exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "staff insert options" on public.product_options for insert to authenticated
  with check ((select private.is_admin()));
create policy "staff update options" on public.product_options for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "staff delete options" on public.product_options for delete to authenticated
  using ((select private.is_admin()));

create policy "public reads option values of active products" on public.product_option_values for select to anon, authenticated
  using ((select private.is_admin())
         or exists (select 1 from public.product_options o join public.products p on p.id = o.product_id
                    where o.id = option_id and p.is_active));
create policy "staff insert option values" on public.product_option_values for insert to authenticated
  with check ((select private.is_admin()));
create policy "staff update option values" on public.product_option_values for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "staff delete option values" on public.product_option_values for delete to authenticated
  using ((select private.is_admin()));

create policy "public reads active variants of active products" on public.product_variants for select to anon, authenticated
  using ((select private.is_admin())
         or (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active)));
create policy "staff insert variants" on public.product_variants for insert to authenticated
  with check ((select private.is_admin()));
create policy "staff update variants" on public.product_variants for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "staff delete variants" on public.product_variants for delete to authenticated
  using ((select private.is_admin()));

create policy "public reads contents of active bundles" on public.bundle_items for select to anon, authenticated
  using ((select private.is_admin())
         or exists (select 1 from public.products p where p.id = bundle_product_id and p.is_active));
create policy "staff insert bundle items" on public.bundle_items for insert to authenticated
  with check ((select private.is_admin()));
create policy "staff update bundle items" on public.bundle_items for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "staff delete bundle items" on public.bundle_items for delete to authenticated
  using ((select private.is_admin()));

-- Order lines point at the variant ----------------------------------------------------------
-- product_id stays; name_ar (product) and variant_name_ar (label) are snapshots at order time.
-- No orders exist yet, so nothing to carry over.

alter table public.order_items
  add column variant_id uuid references public.product_variants (id) on delete set null,
  add column variant_name_ar text check (char_length(variant_name_ar) <= 80);
alter table public.order_items drop constraint order_items_order_id_product_id_key;
alter table public.order_items add constraint order_items_order_id_variant_id_key unique (order_id, variant_id);
create index order_items_variant_idx on public.order_items (variant_id);

create or replace function private.order_summary(p_order_id uuid)
returns table (code text, total_ils integer, items jsonb)
language sql stable security definer set search_path = '' as $$
  select o.code, o.total_ils,
    (select jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'variant_id', i.variant_id,
        'name_ar', i.name_ar, 'variant_name_ar', i.variant_name_ar, 'volume_ml', i.volume_ml,
        'qty', i.qty, 'unit_price_ils', i.unit_price_ils, 'line_total_ils', i.unit_price_ils * i.qty
      ) order by i.id)
     from public.order_items i
     where i.order_id = o.id)
  from public.orders o
  where o.id = p_order_id;
$$;

-- place_order v3 ------------------------------------------------------------------------------
-- p_items is now [{ "variant_id": uuid, "qty": int }]. Same signature, grants and error codes.
-- P0001 DETAIL = [{id: variant_id, name_ar: «طاقية أسود، مقاس L»}] for every line that can't be served:
-- missing / hidden variant or product, an empty bundle, or stock too low for the whole order (a variant ordered
-- on its own and inside a bundle counts once with the summed quantity).

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

  return query select s.code, s.total_ils, s.items from private.order_summary(v_order_id) s;
end $$;

-- create or replace keeps the existing grants (anon, authenticated; protected by the gateway secret).
