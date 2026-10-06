-- iPhone photos: Safari can't encode WebP, so the admin uploads opaque photos as JPEG (and transparent ones as PNG).
-- Allow image/jpeg in the bucket and .jpg in the recorded path. Nothing is dropped.

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
where id = 'products';

create or replace function public.admin_set_product_image(p_id uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if p_path is null or p_path !~ ('^' || p_id::text || '/[0-9a-f-]{36}\.(webp|png|jpg)$') then
    raise exception 'image_path_invalid' using errcode = '22023';
  end if;
  update public.products p set image_path = p_path where p.id = p_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0006';
  end if;
end $$;

-- create or replace keeps the grants (execute: authenticated only).
