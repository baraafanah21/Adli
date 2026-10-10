-- The home page's products, chosen by the owner.
--
-- home_products: up to 4 slots (1–4), one product each, a product in one slot at most. The public reads the slots of
-- active products only (named columns); the shop (src/lib/catalog.ts, homeShelf) shows them in slot order and fills
-- any empty slot automatically (one product per category in turn), so nothing chosen = the page as before.
--
-- admin_set_home_products(ids): owner only, replaces every slot at once (the array's order = the slots; empty clears
-- them). Only a live product (active, not archived) can be chosen; one hidden or archived later simply drops out of
-- the page (the policy below, and the shop's own filter) until the owner changes the slots. Deleting a product
-- removes its slot (on delete cascade).
--
-- Additive only: a new table and a new function. Nothing existing reads or writes it.

create table public.home_products (
  slot smallint primary key check (slot between 1 and 4),
  product_id uuid not null unique references public.products (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.home_products enable row level security;
revoke all on public.home_products from anon, authenticated;
grant select (slot, product_id) on public.home_products to anon, authenticated;

-- products' own policies apply inside the subquery: anon sees active products, staff every one.
create policy "public reads home slots of active products" on public.home_products for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));

create function public.admin_set_home_products(p_product_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[] := coalesce(p_product_ids, '{}');
begin
  perform private.require_owner();
  if cardinality(v_ids) > 4
     or array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'home_products_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from public.products p where p.id = x and p.is_active and p.archived_at is null)
  ) then
    raise exception 'home_product_unavailable' using errcode = '22023';
  end if;

  delete from public.home_products h where h.slot is not null;
  insert into public.home_products (slot, product_id)
  select u.i::smallint, u.x from unnest(v_ids) with ordinality as u(x, i);
  return cardinality(v_ids);
end $$;

revoke all on function public.admin_set_home_products(uuid[]) from public, anon;
grant execute on function public.admin_set_home_products(uuid[]) to authenticated;
