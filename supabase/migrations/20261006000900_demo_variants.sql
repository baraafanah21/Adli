-- Phase D: two hidden demo products so staff can try the variant picker and the bundle page.
-- Both are is_active = false: the public never sees them, and place_order() refuses them.
-- Names start with «تجريبي». No sizes, colours or prices are invented for real products.
-- Delete them once the real catalog is in:
--   delete from public.products where slug in ('demo-cap', 'demo-gift-box');

-- A cap with sizes and colours (6 variants). Black and navy are written out as «سوداء» / «كحلية» through
-- label_ar, because the generated label would read «طاقية أسود».
insert into public.products (category_id, slug, name_ar, family_ar, description_ar, price_ils, image_path, is_active, sort)
select c.id, 'demo-cap', 'تجريبي: طاقية', 'قطن', 'منتج تجريبي لتجربة اختيار المقاس واللون. لا يظهر للزبائن.', 45, null, false, 1
from public.categories c where c.slug = 'caps';

insert into public.product_options (product_id, name_ar, kind, sort)
select p.id, o.name_ar, o.kind, o.sort
from public.products p, (values ('اللون', 'color', 1), ('المقاس', 'size', 2)) o (name_ar, kind, sort)
where p.slug = 'demo-cap';

insert into public.product_option_values (option_id, label_ar, hex, sort)
select o.id, v.label_ar, v.hex, v.sort
from public.product_options o
join public.products p on p.id = o.product_id and p.slug = 'demo-cap'
join (values
  ('اللون', 'أسود', '#111111', 1),
  ('اللون', 'كحلي', '#1F2A44', 2),
  ('المقاس', 'S', null, 1),
  ('المقاس', 'M', null, 2),
  ('المقاس', 'L', null, 3)
) v (option_name, label_ar, hex, sort) on v.option_name = o.name_ar;

-- L costs more, so the card reads «من ₪ 45». Black L and navy S are out; black M is low.
insert into public.product_variants (product_id, sku, option_value_ids, label_ar, price_ils, stock_quantity, sort)
select p.id, v.sku,
  array[
    (select ov.id from public.product_option_values ov join public.product_options o on o.id = ov.option_id
     where o.product_id = p.id and o.name_ar = 'اللون' and ov.label_ar = v.color),
    (select ov.id from public.product_option_values ov join public.product_options o on o.id = ov.option_id
     where o.product_id = p.id and o.name_ar = 'المقاس' and ov.label_ar = v.size)
  ],
  v.label_ar, v.price_ils, v.stock, v.sort
from public.products p
cross join (values
  ('demo-cap-black-s', 'أسود', 'S', 'سوداء، مقاس S', null::integer, 10, 1),
  ('demo-cap-black-m', 'أسود', 'M', 'سوداء، مقاس M', null, 2, 2),
  ('demo-cap-black-l', 'أسود', 'L', 'سوداء، مقاس L', 50, 0, 3),
  ('demo-cap-navy-s',  'كحلي', 'S', 'كحلية، مقاس S', null, 0, 4),
  ('demo-cap-navy-m',  'كحلي', 'M', 'كحلية، مقاس M', null, 10, 5),
  ('demo-cap-navy-l',  'كحلي', 'L', 'كحلية، مقاس L', 50, 10, 6)
) v (sku, color, size, label_ar, price_ils, stock, sort)
where p.slug = 'demo-cap';

-- A fixed bundle of two existing demo products: ₪ 180 + ₪ 45 = ₪ 225 separately, ₪ 190 together.
insert into public.products (category_id, slug, name_ar, family_ar, description_ar, price_ils, image_path, kind, is_active, sort)
select c.id, 'demo-gift-box', 'تجريبي: بكجة هدية', 'عطر وكريم',
  'بكجة تجريبية لتجربة صفحة البكجات. لا تظهر للزبائن.', 190, '/products/oud-malaki.svg', 'bundle', false, 1
from public.categories c where c.slug = 'gift-boxes';

insert into public.product_variants (product_id, sku)
select p.id, 'demo-gift-box' from public.products p where p.slug = 'demo-gift-box';

insert into public.bundle_items (bundle_product_id, variant_id, qty, sort)
select b.id, v.id, 1, x.sort
from public.products b
cross join (values ('oud-malaki', 1), ('beard-cream', 2)) x (slug, sort)
join public.products p on p.slug = x.slug
join public.product_variants v on v.product_id = p.id and v.option_value_ids = '{}'
where b.slug = 'demo-gift-box';

-- Performance advisor (multiple_permissive_policies): the old "for all" write policies also applied to SELECT.
-- One policy per action instead, same rule (staff only).
drop policy "admins write categories" on public.categories;
create policy "staff insert categories" on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy "staff update categories" on public.categories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "staff delete categories" on public.categories for delete to authenticated
  using ((select private.is_admin()));

drop policy "admins write products" on public.products;
create policy "staff insert products" on public.products for insert to authenticated
  with check ((select private.is_admin()));
create policy "staff update products" on public.products for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "staff delete products" on public.products for delete to authenticated
  using ((select private.is_admin()));
