-- Demo catalog until the owner sends the real product list (docs/ROADMAP.md).
-- Images are placeholder SVGs in public/products/. Safe to re-run: existing slugs are skipped.
insert into public.products
  (category_id, slug, name_ar, family_ar, description_ar, price_ils, volume_ml, image_path, stock_status, sort)
select c.id, v.slug, v.name_ar, v.family_ar, v.description_ar, v.price_ils, v.volume_ml, v.image_path, v.stock_status, v.sort
from (values
  ('perfumes', 'oud-malaki', 'عود ملكي', 'عطر شرقي',
   'عطر شرقي بقلب من العود والعنبر، تفتتحه لمسة زعفران. للرجال، ويثبت على الجلد من 8 إلى 10 ساعات.',
   180, 100, '/products/oud-malaki.svg', 'in_stock', 1),
  ('perfumes', 'anbar-al-layl', 'عنبر الليل', 'عطر عنبري',
   'عنبر دافئ مع الفانيليا وخشب الصندل. يناسب المساء وأيام الشتاء، ويثبت نحو 8 ساعات.',
   160, 100, '/products/anbar-al-layl.svg', 'low', 2),
  ('perfumes', 'nasim-al-bahr', 'نسيم البحر', 'عطر منعش',
   'حمضيات ونعناع مع نفحة بحرية خفيفة. عطر نهاري للصيف والعمل، ويثبت من 5 إلى 6 ساعات.',
   130, 100, '/products/nasim-al-bahr.svg', 'in_stock', 3),
  ('perfumes', 'jild-wa-tabgh', 'جلد وتبغ', 'عطر جلدي',
   'رائحة الجلد المدبوغ مع أوراق التبغ والهيل. عطر رجالي قوي الحضور، ويثبت نحو 9 ساعات.',
   150, 50, '/products/jild-wa-tabgh.svg', 'in_stock', 4),
  ('perfumes', 'ward-taifi', 'ورد طائفي', 'عطر زهري شرقي',
   'ورد طائفي مع عود خفيف ومسك. تركيز عالٍ تكفي منه رشّة أو رشّتان، ويثبت أكثر من 10 ساعات.',
   260, 50, '/products/ward-taifi.svg', 'out', 5),
  ('perfumes', 'misk-abyad', 'مسك أبيض', 'عطر مسكي',
   'مسك أبيض نظيف وناعم، للاستعمال اليومي وبعد الحلاقة. يثبت نحو 6 ساعات.',
   120, 100, '/products/misk-abyad.svg', 'in_stock', 6),

  ('creams', 'beard-cream', 'كريم ترطيب اللحية', 'زبدة الشيا والأرغان',
   'يرطّب اللحية ويليّن الشعر الخشن ويخفف الحكة. ضع كمية صغيرة بعد الاستحمام.',
   45, 50, '/products/beard-cream.svg', 'in_stock', 1),
  ('creams', 'shaving-cream', 'كريم الحلاقة', 'المنثول والألوفيرا',
   'رغوة كثيفة تحمي البشرة من تهيّج الشفرة، مع برودة خفيفة من المنثول.',
   35, 150, '/products/shaving-cream.svg', 'in_stock', 2),
  ('creams', 'after-shave-balm', 'بلسم ما بعد الحلاقة', 'الألوفيرا والبابونج',
   'يهدّئ البشرة بعد الحلاقة ويخفف الاحمرار، بلا كحول. مناسب للبشرة الحساسة.',
   40, 100, '/products/after-shave-balm.svg', 'in_stock', 3),
  ('creams', 'hair-wax', 'شمع تصفيف الشعر', 'تثبيت متوسط',
   'يثبّت التسريحة طوال اليوم بلمعة خفيفة، ويُغسل بالماء بسهولة.',
   55, 100, '/products/hair-wax.svg', 'in_stock', 4),

  ('grooming', 'straight-razor', 'شفرة حلاقة مستقيمة', 'فولاذ وخشب الجوز',
   'شفرة كلاسيكية من الفولاذ المقاوم للصدأ بمقبض من خشب الجوز، وأمواسها قابلة للتبديل. نفس الشفرة التي نستعملها في الصالون.',
   85, null, '/products/straight-razor.svg', 'in_stock', 1),
  ('grooming', 'beard-comb', 'مشط اللحية', 'خشب الصندل',
   'مشط من خشب الصندل بجهة أسنان ناعمة وأخرى خشنة، يفك تشابك اللحية بلا كهرباء ساكنة.',
   30, null, '/products/beard-comb.svg', 'in_stock', 2)
) as v (category_slug, slug, name_ar, family_ar, description_ar, price_ils, volume_ml, image_path, stock_status, sort)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;
