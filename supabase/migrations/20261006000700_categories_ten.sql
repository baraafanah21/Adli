-- Phase D: the ten categories.
--   is_active      : hidden categories are invisible to the public (staff still see them).
--   icon           : a name from the fixed icon set in src/components/icons.tsx (CategoryIcon).
--   description_ar : one short line, shown on the category page and in the «قريباً» state.
-- The 12 demo products move from creams / grooming to hair-beard / body-care, then the old two go.

alter table public.categories
  add column is_active boolean not null default true,
  add column icon text check (icon in (
    'perfume', 'shaver', 'cap', 'watch', 'underwear', 'sports', 'sunglasses', 'gift', 'beard', 'body'
  )),
  add column description_ar text check (char_length(description_ar) between 1 and 140);

insert into public.categories (slug, name_ar, icon, description_ar, sort) values
  ('perfumes',            'عطور',                 'perfume',    'عطور رجالية شرقية وعصرية، نجرّبها معك في الصالون.', 1),
  ('shavers',             'ماكنات حلاقة',          'shaver',     'ماكنات حلاقة وتحديد للبيت، نفس اللي نستعملها في الصالون.', 2),
  ('caps',                'طواقي',                'cap',        'طواقي بمقاسات وألوان مختلفة.', 3),
  ('watches-accessories', 'ساعات وإكسسوارات',      'watch',      'ساعات وأساور وإكسسوارات رجالية.', 4),
  ('underwear',           'ملابس داخلية',          'underwear',  'ملابس داخلية قطنية بمقاسات مختلفة.', 5),
  ('sports',              'لوازم رياضية',          'sports',     'لوازم للرياضة والنادي.', 6),
  ('sunglasses',          'نظارات شمسية',          'sunglasses', 'نظارات شمسية رجالية.', 7),
  ('gift-boxes',          'بكجات هدايا',           'gift',       'بكجات جاهزة للهدية بسعر أقل من شراء القطع منفردة.', 8),
  ('hair-beard',          'عناية بالشعر واللحية',   'beard',      'كريمات وشمع وزيوت وأدوات للشعر واللحية.', 9),
  ('body-care',           'عناية بالجسم',          'body',       'منتجات العناية بالبشرة والجسم بعد الحلاقة وكل يوم.', 10)
on conflict (slug) do update set
  name_ar = excluded.name_ar, icon = excluded.icon, description_ar = excluded.description_ar, sort = excluded.sort;

update public.products p set category_id = (select id from public.categories where slug = 'hair-beard')
where p.slug in ('beard-cream', 'shaving-cream', 'hair-wax', 'straight-razor', 'beard-comb');

update public.products p set category_id = (select id from public.categories where slug = 'body-care')
where p.slug = 'after-shave-balm';

-- on delete restrict on products.category_id: this fails loudly if a product was left behind.
delete from public.categories where slug in ('creams', 'grooming');

-- The public reads active categories only; staff read all.
drop policy "public reads categories" on public.categories;
create policy "public reads active categories" on public.categories for select to anon, authenticated
  using (is_active or (select private.is_admin()));
