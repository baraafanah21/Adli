-- Short meta line on product cards: the scent family or key ingredient ("عطر شرقي", "زبدة الشيا والأرغان").
-- Nullable: the site falls back to the category name when it is empty.
alter table public.products
  add column family_ar text check (char_length(family_ar) between 1 and 60);
