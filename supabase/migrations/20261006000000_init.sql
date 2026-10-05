-- Adli Salon: catalog + WhatsApp orders.
-- Public can read the active catalog and place orders through place_order() only.
-- Admins (rows in public.admins) manage the catalog and read orders.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null check (char_length(name_ar) between 1 and 60),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  description_ar text check (char_length(description_ar) <= 2000),
  price_ils integer not null check (price_ils >= 0),
  volume_ml integer check (volume_ml > 0),
  model_path text,
  image_path text,
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock', 'low', 'out')),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_active_idx on public.products (category_id, sort) where is_active;

create sequence public.order_code_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('AD-' || nextval('public.order_code_seq')),
  idempotency_key uuid not null unique,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  area text check (char_length(area) <= 80),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  total_ils integer not null check (total_ils >= 0),
  status text not null default 'new' check (status in ('new', 'confirmed', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create index orders_created_idx on public.orders (created_at desc);

-- updated_at
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();

-- admin check
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- RLS
alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

create policy "admins read self" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy "public reads categories" on public.categories for select to anon, authenticated
  using (true);
create policy "admins write categories" on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "public reads active products" on public.products for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "admins write products" on public.products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read orders" on public.orders for select to authenticated
  using ((select public.is_admin()));
create policy "admins update orders" on public.orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- place_order: the only way the public creates an order.
-- Prices come from the database, never from the browser. Same idempotency key returns the same order.
create function public.place_order(
  p_idempotency_key uuid,
  p_customer_name text,
  p_area text,
  p_items jsonb -- [{ "product_id": uuid, "qty": int }]
) returns table (code text, total_ils integer, items jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_total integer;
  v_requested integer;
begin
  return query
    select o.code, o.total_ils, o.items from public.orders o
    where o.idempotency_key = p_idempotency_key;
  if found then return; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'items must be a list of 1 to 30 products' using errcode = '22023';
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'name_ar', p.name_ar, 'volume_ml', p.volume_ml,
      'qty', r.qty, 'unit_price_ils', p.price_ils, 'line_total_ils', p.price_ils * r.qty
    ) order by p.sort),
    sum(p.price_ils * r.qty)::integer,
    count(*)::integer
  into v_items, v_total, v_requested
  from (
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'qty')::integer) as qty
    from jsonb_array_elements(p_items) e
    group by 1
  ) r
  join public.products p on p.id = r.product_id
  where p.is_active and p.stock_status <> 'out' and r.qty between 1 and 20;

  if v_items is null or v_requested <> (
    select count(distinct e ->> 'product_id') from jsonb_array_elements(p_items) e
  ) then
    raise exception 'one or more products are unavailable or quantities are invalid' using errcode = '22023';
  end if;

  return query
    insert into public.orders as o (idempotency_key, customer_name, area, items, total_ils)
    values (p_idempotency_key, btrim(p_customer_name), nullif(btrim(p_area), ''), v_items, v_total)
    on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
    returning o.code, o.total_ils, o.items;
end $$;

revoke all on function public.place_order(uuid, text, text, jsonb) from public;
grant execute on function public.place_order(uuid, text, text, jsonb) to anon, authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Storage: public bucket for models and images, admin writes.
insert into storage.buckets (id, name, public) values ('products', 'products', true)
on conflict (id) do nothing;

create policy "admins upload product files" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and (select public.is_admin()));
create policy "admins update product files" on storage.objects for update to authenticated
  using (bucket_id = 'products' and (select public.is_admin()));
create policy "admins delete product files" on storage.objects for delete to authenticated
  using (bucket_id = 'products' and (select public.is_admin()));

-- Seed categories
insert into public.categories (slug, name_ar, sort) values
  ('perfumes', 'العطور', 1),
  ('creams', 'الكريمات', 2),
  ('grooming', 'أدوات الحلاقة', 3);
