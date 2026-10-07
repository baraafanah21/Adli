-- Phase F6: deleting a product (owner only) and WebP-only product photos.
--
--   admin_delete_product(id)  → {outcome: 'deleted' | 'archived', name_ar}
--       Refused (P0014, DETAIL = the bundle names) while the product sits in an active bundle.
--       Archived when it has history: an order line, a stock movement other than the opening balance, or a place in
--       an inactive bundle (a hard delete would change that bundle). Archived = hidden (is_active = false) and
--       archived_at set; variants, movements and orders stay as they are, and the slug and SKUs stay reserved.
--       Otherwise deleted for real (options, values, variants and its own bundle lines go with it by cascade). The
--       photo files are removed from Storage by the Server Action (Postgres can't), using the returned outcome.
--   admin_restore_product(id) → clears archived_at; the product stays hidden until the owner shows it.
--   An archived product can't be changed (P0015) except by admin_restore_product, and can't be put in a bundle.
--   admin_stock_levels leaves archived products out.
--   The products bucket accepts image/webp only; admin_set_product_image records .webp paths only.
-- Error codes: P0014 in an active bundle, P0015 archived. The function body deletes rows; applying it deletes nothing.

-- Columns ---------------------------------------------------------------------------------------------------------

alter table public.products
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users (id) on delete set null,
  add constraint products_archived_hidden check (archived_at is null or not is_active);

create index products_archived_by_idx on public.products (archived_by);

-- An archived product is frozen: only admin_restore_product (archived_at → null) may touch it.
create function private.products_archived_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'product_archived' using errcode = 'P0015';
  end if;
  return new;
end $$;

create trigger products_archived_guard before update on public.products
for each row execute function private.products_archived_guard();

-- No archived product inside a bundle (it would make the bundle depend on something the admin no longer shows).
create function private.bundle_items_not_archived() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = new.variant_id and p.archived_at is not null
  ) then
    raise exception 'product_archived' using errcode = 'P0015';
  end if;
  return new;
end $$;

create trigger bundle_items_not_archived before insert or update of variant_id
on public.bundle_items for each row execute function private.bundle_items_not_archived();

revoke all on function private.products_archived_guard(), private.bundle_items_not_archived()
from public, anon, authenticated;

-- Delete or archive -----------------------------------------------------------------------------------------------

create function public.admin_delete_product(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_bundles text;
  v_history boolean;
begin
  perform private.require_owner();

  select p.name_ar into v_name from public.products p where p.id = p_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0006';
  end if;
  if exists (select 1 from public.products p where p.id = p_id and p.archived_at is not null) then
    raise exception 'product_archived' using errcode = 'P0015';
  end if;

  -- An active bundle (shown, not archived) blocks both delete and archive; a hidden one only counts as history.
  select string_agg(distinct b.name_ar, '، ' order by b.name_ar) into v_bundles
  from public.bundle_items bi
  join public.product_variants v on v.id = bi.variant_id
  join public.products b on b.id = bi.bundle_product_id
  where v.product_id = p_id and b.is_active and b.archived_at is null;
  if v_bundles is not null then
    raise exception 'product_in_bundle' using errcode = 'P0014', detail = v_bundles;
  end if;

  v_history :=
    exists (select 1 from public.order_items i where i.product_id = p_id)
    or exists (select 1 from public.order_items i join public.product_variants v on v.id = i.variant_id
               where v.product_id = p_id)
    or exists (select 1 from public.stock_movements m join public.product_variants v on v.id = m.variant_id
               where v.product_id = p_id
                 and not (m.reason = 'adjust' and m.note = 'رصيد افتتاحي' and m.order_id is null and m.actor is null))
    or exists (select 1 from public.bundle_items bi join public.product_variants v on v.id = bi.variant_id
               where v.product_id = p_id);

  if v_history then
    update public.products p
    set archived_at = now(), archived_by = (select auth.uid()), is_active = false
    where p.id = p_id;
    return jsonb_build_object('outcome', 'archived', 'name_ar', v_name);
  end if;

  -- No history: the only movements left are opening balances (seed data), which go with the variants.
  delete from public.stock_movements m
  using public.product_variants v
  where v.id = m.variant_id and v.product_id = p_id;
  delete from public.products p where p.id = p_id;
  return jsonb_build_object('outcome', 'deleted', 'name_ar', v_name);
end $$;

create function public.admin_restore_product(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  -- Stays hidden (is_active = false): the owner checks it and shows it from the editor.
  update public.products p set archived_at = null, archived_by = null where p.id = p_id and p.archived_at is not null;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Photos: WebP only -----------------------------------------------------------------------------------------------

update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'products';

-- <product id>/<uuid>.webp; the 480px copy beside it (<uuid>.sm.webp) is never recorded, only derived.
create or replace function public.admin_set_product_image(p_id uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if p_path is null or p_path !~ ('^' || p_id::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception 'image_path_invalid' using errcode = '22023';
  end if;
  update public.products p set image_path = p_path where p.id = p_id;  -- archived: P0015 from the trigger
  if not found then
    raise exception 'product_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Stock levels without archived products (same as 20261007000400 otherwise) ----------------------------------------

create or replace function public.admin_stock_levels(p_filter text default null, p_q text default null, p_category_id uuid default null)
returns table (
  variant_id uuid, product_id uuid, product_name text, variant_label text, sku text, kind text, category_name text,
  image_path text, stock_quantity integer, low_stock_threshold integer, stock_state text, variant_active boolean,
  product_active boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_like text := '%' || replace(replace(replace(coalesce(nullif(btrim(p_q), ''), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform private.require_staff();
  if p_filter is not null and p_filter not in ('low', 'out') then
    raise exception 'filter_invalid' using errcode = '22023';
  end if;

  return query
  with lvl as (
    select
      v.id as variant_id, p.id as product_id, p.name_ar as product_name, private.variant_label(v.id) as variant_label,
      v.sku, p.kind, c.name_ar as category_name, p.image_path,
      case when p.kind = 'bundle' then coalesce((
        select min(cv.stock_quantity / bi.qty)::integer
        from public.bundle_items bi join public.product_variants cv on cv.id = bi.variant_id
        where bi.bundle_product_id = p.id), 0)
      else v.stock_quantity end as qty,
      v.low_stock_threshold, v.is_active as variant_active, p.is_active as product_active, v.sort as v_sort
    from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where p.archived_at is null
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_q is null or btrim(p_q) = '' or p.name_ar ilike v_like or v.sku ilike v_like)
  )
  select r.variant_id, r.product_id, r.product_name, r.variant_label, r.sku, r.kind, r.category_name, r.image_path,
         r.qty, r.low_stock_threshold,
         case when r.qty <= 0 then 'out' when r.qty <= r.low_stock_threshold then 'low' else 'in' end,
         r.variant_active, r.product_active
  from lvl r
  where p_filter is null
     or (p_filter = 'low' and r.qty <= r.low_stock_threshold)
     or (p_filter = 'out' and r.qty <= 0)
  order by (r.variant_active and r.product_active and r.qty <= r.low_stock_threshold) desc,
           r.product_name, r.v_sort
  limit 500;
end $$;

-- Grants ----------------------------------------------------------------------------------------------------------

revoke all on function public.admin_delete_product(uuid), public.admin_restore_product(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid), public.admin_restore_product(uuid) to authenticated;
