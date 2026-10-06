-- Phase F3: stock in the admin. Read quantities, adjust them with a reason, see each variant's history.
-- Every change still goes through private.apply_stock_movement() (one movement row per change). Nothing is dropped.
--
--   admin_stock_levels(filter, q, category_id)   every variant with its quantity; bundles too, with what their pieces
--                                                 allow (min(floor(stock / qty)), read-only). Below threshold first.
--                                                 filter: null | 'low' (low or out) | 'out'
--   admin_adjust_stock(variant_id, reason, quantity, note) → new quantity
--       reason 'receive': quantity received (> 0) is added
--       reason 'damage' : quantity damaged (> 0) is taken off
--       reason 'adjust' : quantity is the counted total; the difference is recorded (no row if it already matches)
--   admin_stock_movements(variant_id, limit)      newest first, with the balance after each movement
-- Owner and staff. Errors: 42501, 22023 (invalid input, or a bundle: it has no stock of its own), 23514 (would go
-- below 0), P0006 (variant not found).

create function public.admin_stock_levels(p_filter text default null, p_q text default null, p_category_id uuid default null)
returns table (
  variant_id uuid, product_id uuid, product_name text, variant_label text, sku text, kind text, category_name text,
  image_path text, stock_quantity integer, low_stock_threshold integer, stock_state text,
  variant_active boolean, product_active boolean
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
    where (p_category_id is null or p.category_id = p_category_id)
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
  -- What needs attention first: shown items below their threshold, then everything else by name.
  order by (r.variant_active and r.product_active and r.qty <= r.low_stock_threshold) desc,
           r.product_name, r.v_sort
  limit 500;
end $$;

create function public.admin_adjust_stock(p_variant_id uuid, p_reason text, p_quantity integer, p_note text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_current integer;
  v_kind text;
  v_delta integer;
begin
  perform private.require_staff();
  if p_reason is null or p_reason not in ('receive', 'adjust', 'damage') then
    raise exception 'reason_invalid' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000
     or (p_reason in ('receive', 'damage') and p_quantity = 0) then
    raise exception 'quantity_invalid' using errcode = '22023';
  end if;

  -- Lock the row: two people counting at once get one after the other, each from the real current number.
  select v.stock_quantity, p.kind into v_current, v_kind
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = p_variant_id
  for update of v;
  if v_current is null then
    raise exception 'variant_not_found' using errcode = 'P0006';
  end if;
  if v_kind = 'bundle' then
    raise exception 'bundle_has_no_stock' using errcode = '22023';
  end if;

  v_delta := case p_reason
    when 'receive' then p_quantity
    when 'damage' then -p_quantity
    else p_quantity - v_current
  end;
  if v_delta = 0 then
    return v_current;  -- the count matches: nothing to record
  end if;
  if v_current + v_delta < 0 then
    raise exception 'stock_below_zero' using errcode = '23514', detail = v_current::text;
  end if;
  return private.apply_stock_movement(p_variant_id, v_delta, p_reason, p_note);
end $$;

create function public.admin_stock_movements(p_variant_id uuid, p_limit integer default 50)
returns table (
  id bigint, delta integer, reason text, note text, order_code text, actor_name text, created_at timestamptz,
  balance integer
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_staff();
  return query
  select m.id, m.delta, m.reason, m.note, o.code, coalesce(pr.full_name, u.email), m.created_at,
         (sum(m.delta) over (order by m.created_at, m.id))::integer
  from public.stock_movements m
  left join public.orders o on o.id = m.order_id
  left join public.profiles pr on pr.id = m.actor
  left join auth.users u on u.id = m.actor
  where m.variant_id = p_variant_id
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

revoke all on function
  public.admin_stock_levels(text, text, uuid),
  public.admin_adjust_stock(uuid, text, integer, text),
  public.admin_stock_movements(uuid, integer)
from public, anon;
grant execute on function
  public.admin_stock_levels(text, text, uuid),
  public.admin_adjust_stock(uuid, text, integer, text),
  public.admin_stock_movements(uuid, integer)
to authenticated;
