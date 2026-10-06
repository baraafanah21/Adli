-- Phase F2: products, options, variants, images and bundles from the admin.
--
-- Catalog writes now go only through admin_* functions (security definer, execute for authenticated only, role check
-- first). Reads stay as they are: staff read every catalog row through RLS (private.is_admin()), and quantities
-- through admin_variant_stock().
--
--   admin_create_product(kind, category_id, name_ar, slug, price_ils)          → product id (hidden, with its default variant)
--   admin_update_product(id, name_ar, slug, family_ar, description_ar, price_ils, volume_ml, category_id, sort, is_active)
--   admin_set_product_image(id, path)                                          path = '<product id>/<uuid>.webp|png'
--   admin_save_option(product_id, option_id, name_ar, kind, sort)              → option id (null option_id = new)
--   admin_delete_option(option_id)
--   admin_save_option_value(option_id, value_id, label_ar, hex, sort)          → value id
--   admin_delete_option_value(value_id)
--   admin_generate_variants(product_id)                                        → how many were created
--   admin_update_variant(variant_id, sku, label_ar, price_ils, low_stock_threshold, is_active, sort)
--   admin_set_bundle(product_id, price_ils, items [{variant_id, qty}])
--   admin_variant_stock(product_id)                                            → (variant_id, stock_quantity)
-- All for owner and staff. Errors: 42501 forbidden, 22023 invalid, 23505 slug / sku / name taken (constraint name in
-- the message), 23514 a constraint or integrity trigger, P0006 not found, P0011 option or value still used by a
-- variant, P0013 an option has no values yet.
--
-- Removes: the direct write policies and grants on categories, products, product_options, product_option_values,
-- product_variants and bundle_items (staff, from 0800 / 0900). Categories get their own owner-only function in F4.
-- No data is deleted.

-- Direct catalog writes off --------------------------------------------------------------------------------------

drop policy "staff insert categories" on public.categories;
drop policy "staff update categories" on public.categories;
drop policy "staff delete categories" on public.categories;
drop policy "staff insert products" on public.products;
drop policy "staff update products" on public.products;
drop policy "staff delete products" on public.products;
drop policy "staff insert options" on public.product_options;
drop policy "staff update options" on public.product_options;
drop policy "staff delete options" on public.product_options;
drop policy "staff insert option values" on public.product_option_values;
drop policy "staff update option values" on public.product_option_values;
drop policy "staff delete option values" on public.product_option_values;
drop policy "staff insert variants" on public.product_variants;
drop policy "staff update variants" on public.product_variants;
drop policy "staff delete variants" on public.product_variants;
drop policy "staff insert bundle items" on public.bundle_items;
drop policy "staff update bundle items" on public.bundle_items;
drop policy "staff delete bundle items" on public.bundle_items;

revoke insert, update, delete on public.categories, public.products, public.product_options,
  public.product_option_values, public.product_variants, public.bundle_items
from anon, authenticated;

-- Product images: WebP (or PNG where the browser can't encode WebP, e.g. Safari), 5 MB at most.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024, allowed_mime_types = array['image/webp', 'image/png']
where id = 'products';

-- One role check for every admin function ---------------------------------------------------------------------

create function private.require_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['owner', 'staff']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

revoke all on function private.require_staff() from public, anon, authenticated;

-- Products ------------------------------------------------------------------------------------------------------

-- A new product starts hidden, with its default variant (sku = slug, stock 0). Stock arrives through «المخزون».
create function public.admin_create_product(
  p_kind text, p_category_id uuid, p_name_ar text, p_slug text, p_price_ils integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_staff();
  if p_kind is null or p_kind not in ('simple', 'bundle') then
    raise exception 'kind_invalid' using errcode = '22023';
  end if;
  insert into public.products (category_id, slug, name_ar, price_ils, kind, is_active, sort)
  values (p_category_id, lower(btrim(p_slug)), btrim(p_name_ar), p_price_ils, p_kind, false,
          coalesce((select max(p.sort) + 1 from public.products p where p.category_id = p_category_id), 1))
  returning id into v_id;
  insert into public.product_variants (product_id, sku) values (v_id, lower(btrim(p_slug)));
  return v_id;
end $$;

create function public.admin_update_product(
  p_id uuid, p_name_ar text, p_slug text, p_family_ar text, p_description_ar text, p_price_ils integer,
  p_volume_ml integer, p_category_id uuid, p_sort integer, p_is_active boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  update public.products p set
    name_ar = btrim(p_name_ar),
    slug = lower(btrim(p_slug)),
    family_ar = nullif(btrim(p_family_ar), ''),
    description_ar = nullif(btrim(p_description_ar), ''),
    price_ils = p_price_ils,
    volume_ml = p_volume_ml,
    category_id = p_category_id,
    sort = p_sort,
    is_active = p_is_active
  where p.id = p_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0006';
  end if;
end $$;

-- The browser uploads to the products bucket (storage policy: staff only); this only records the path.
create function public.admin_set_product_image(p_id uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if p_path is null or p_path !~ ('^' || p_id::text || '/[0-9a-f-]{36}\.(webp|png)$') then
    raise exception 'image_path_invalid' using errcode = '22023';
  end if;
  update public.products p set image_path = p_path where p.id = p_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Options and values (the integrity triggers from 0800 still check colour hex and bundles) -----------------------

create function public.admin_save_option(
  p_product_id uuid, p_option_id uuid, p_name_ar text, p_kind text, p_sort integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_staff();
  if p_option_id is null then
    insert into public.product_options (product_id, name_ar, kind, sort)
    values (p_product_id, btrim(p_name_ar), p_kind, coalesce(p_sort, 0))
    returning id into v_id;
  else
    update public.product_options o set name_ar = btrim(p_name_ar), kind = p_kind, sort = coalesce(p_sort, o.sort)
    where o.id = p_option_id and o.product_id = p_product_id
    returning o.id into v_id;
    if v_id is null then
      raise exception 'option_not_found' using errcode = 'P0006';
    end if;
  end if;
  return v_id;
end $$;

create function public.admin_delete_option(p_option_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if exists (
    select 1 from public.product_variants v
    join public.product_options o on o.product_id = v.product_id and o.id = p_option_id
    where v.option_value_ids && array(select ov.id from public.product_option_values ov where ov.option_id = p_option_id)
  ) then
    raise exception 'option_in_use' using errcode = 'P0011';
  end if;
  delete from public.product_options o where o.id = p_option_id;
end $$;

create function public.admin_save_option_value(
  p_option_id uuid, p_value_id uuid, p_label_ar text, p_hex text, p_sort integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_staff();
  if p_value_id is null then
    insert into public.product_option_values (option_id, label_ar, hex, sort)
    values (p_option_id, btrim(p_label_ar), nullif(upper(btrim(p_hex)), ''), coalesce(p_sort,
      (select coalesce(max(ov.sort), 0) + 1 from public.product_option_values ov where ov.option_id = p_option_id)))
    returning id into v_id;
  else
    update public.product_option_values ov
    set label_ar = btrim(p_label_ar), hex = nullif(upper(btrim(p_hex)), ''), sort = coalesce(p_sort, ov.sort)
    where ov.id = p_value_id and ov.option_id = p_option_id
    returning ov.id into v_id;
    if v_id is null then
      raise exception 'value_not_found' using errcode = 'P0006';
    end if;
  end if;
  return v_id;
end $$;

create function public.admin_delete_option_value(p_value_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if exists (select 1 from public.product_variants v where p_value_id = any (v.option_value_ids)) then
    raise exception 'value_in_use' using errcode = 'P0011';
  end if;
  delete from public.product_option_values ov where ov.id = p_value_id;
end $$;

-- Variants --------------------------------------------------------------------------------------------------------

-- Creates every missing combination of the product's option values (stock 0, price inherited, sku slug-N).
-- Variants that don't cover every option (the default one, or ones made before an option was added) are hidden,
-- never deleted: orders and stock history point at them.
create function public.admin_generate_variants(p_product_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text;
  v_options integer;
  v_created integer := 0;
  v_n integer;
  v_combo uuid[];
begin
  perform private.require_staff();
  select left(p.slug, 70) into v_slug from public.products p where p.id = p_product_id and p.kind = 'simple';
  if v_slug is null then
    raise exception 'not_a_simple_product' using errcode = '22023';
  end if;

  select count(*) into v_options from public.product_options o where o.product_id = p_product_id;
  if v_options = 0 then
    return 0;
  end if;
  if exists (
    select 1 from public.product_options o
    where o.product_id = p_product_id
      and not exists (select 1 from public.product_option_values ov where ov.option_id = o.id)
  ) then
    raise exception 'option_without_values' using errcode = 'P0013';
  end if;
  if (select exp(sum(ln(c)))::integer from (
        select count(*) as c from public.product_option_values ov
        join public.product_options o on o.id = ov.option_id
        where o.product_id = p_product_id group by o.id) x) > 100 then
    raise exception 'too_many_combinations' using errcode = '22023', hint = 'At most 100 variants per product.';
  end if;

  v_n := (select count(*) from public.product_variants v where v.product_id = p_product_id);

  for v_combo in
    with recursive opts as (
      select o.id, row_number() over (order by o.sort, o.name_ar) as rn
      from public.product_options o where o.product_id = p_product_id
    ),
    combos (rn, ids, path) as (
      select 0::bigint, '{}'::uuid[], '{}'::integer[]
      union all
      select o.rn, c.ids || ov.id, c.path || ov.sort
      from combos c
      join opts o on o.rn = c.rn + 1
      join public.product_option_values ov on ov.option_id = o.id
    )
    select c.ids from combos c where c.rn = v_options order by c.path
  loop
    if not exists (
      select 1 from public.product_variants v
      where v.product_id = p_product_id
        and v.option_value_ids = array(select x from unnest(v_combo) x order by x)
    ) then
      loop
        v_n := v_n + 1;
        exit when not exists (select 1 from public.product_variants v where v.sku = v_slug || '-' || v_n);
      end loop;
      insert into public.product_variants (product_id, sku, option_value_ids, sort)
      values (p_product_id, v_slug || '-' || v_n, v_combo, v_n);
      v_created := v_created + 1;
    end if;
  end loop;

  update public.product_variants v set is_active = false
  where v.product_id = p_product_id and cardinality(v.option_value_ids) <> v_options and v.is_active;

  return v_created;
end $$;

-- price_ils null = the product's price. Stock is not here: it moves through «المخزون» (adjust_stock, F3).
create function public.admin_update_variant(
  p_variant_id uuid, p_sku text, p_label_ar text, p_price_ils integer, p_low_stock_threshold integer,
  p_is_active boolean, p_sort integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  update public.product_variants v set
    sku = lower(btrim(p_sku)),
    label_ar = nullif(btrim(p_label_ar), ''),
    price_ils = p_price_ils,
    low_stock_threshold = p_low_stock_threshold,
    is_active = p_is_active,
    sort = p_sort
  where v.id = p_variant_id;
  if not found then
    raise exception 'variant_not_found' using errcode = 'P0006';
  end if;
end $$;

create function public.admin_variant_stock(p_product_id uuid)
returns table (variant_id uuid, stock_quantity integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_staff();
  return query select v.id, v.stock_quantity from public.product_variants v where v.product_id = p_product_id;
end $$;

-- Bundles: the fixed price and the pieces, replaced together --------------------------------------------------

create function public.admin_set_bundle(p_product_id uuid, p_price_ils integer, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if not exists (select 1 from public.products p where p.id = p_product_id and p.kind = 'bundle') then
    raise exception 'not_a_bundle' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    raise exception 'items_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e ->> 'variant_id') is null or coalesce((e ->> 'qty')::integer, 0) not between 1 and 20
  ) then
    raise exception 'items_invalid' using errcode = '22023';
  end if;

  delete from public.bundle_items bi where bi.bundle_product_id = p_product_id;
  insert into public.bundle_items (bundle_product_id, variant_id, qty, sort)
  select p_product_id, (e ->> 'variant_id')::uuid, sum((e ->> 'qty')::integer), min(n)
  from jsonb_array_elements(p_items) with ordinality as t (e, n)
  group by 2;

  -- The price lives on the product; the bundle's one variant inherits it.
  update public.products p set price_ils = p_price_ils where p.id = p_product_id;
  update public.product_variants v set price_ils = null where v.product_id = p_product_id;
end $$;

-- Grants ----------------------------------------------------------------------------------------------------------

revoke all on function
  public.admin_create_product(text, uuid, text, text, integer),
  public.admin_update_product(uuid, text, text, text, text, integer, integer, uuid, integer, boolean),
  public.admin_set_product_image(uuid, text),
  public.admin_save_option(uuid, uuid, text, text, integer),
  public.admin_delete_option(uuid),
  public.admin_save_option_value(uuid, uuid, text, text, integer),
  public.admin_delete_option_value(uuid),
  public.admin_generate_variants(uuid),
  public.admin_update_variant(uuid, text, text, integer, integer, boolean, integer),
  public.admin_variant_stock(uuid),
  public.admin_set_bundle(uuid, integer, jsonb)
from public, anon;

grant execute on function
  public.admin_create_product(text, uuid, text, text, integer),
  public.admin_update_product(uuid, text, text, text, text, integer, integer, uuid, integer, boolean),
  public.admin_set_product_image(uuid, text),
  public.admin_save_option(uuid, uuid, text, text, integer),
  public.admin_delete_option(uuid),
  public.admin_save_option_value(uuid, uuid, text, text, integer),
  public.admin_delete_option_value(uuid),
  public.admin_generate_variants(uuid),
  public.admin_update_variant(uuid, text, text, integer, integer, boolean, integer),
  public.admin_variant_stock(uuid),
  public.admin_set_bundle(uuid, integer, jsonb)
to authenticated;
