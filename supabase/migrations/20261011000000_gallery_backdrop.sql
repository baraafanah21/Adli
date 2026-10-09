-- «زبايننا المرتّبين»: photos the owner marks «خلفية» become the section's background (GalleryBackdrop on the home
-- page) instead of cards in the row. Additive: one column with a default, one check, one column grant, one function.
-- Nothing existing changes: code that doesn't know the column keeps working (every row starts false).
--
--   is_backdrop   a published photo marked as a backdrop. Only a photo (check). The public reads it like the other
--                 named columns; it still needs is_published to be seen at all (the existing RLS policy).
--   admin_gallery_set_backdrop(p_id, p_backdrop)   owner only (private.require_owner()); P0006 not found,
--                 P0037 not a photo.

alter table public.gallery_items add column is_backdrop boolean not null default false;

alter table public.gallery_items
  add constraint gallery_items_backdrop_image check (not is_backdrop or kind = 'image');

grant select (is_backdrop) on table public.gallery_items to anon, authenticated;

create function public.admin_gallery_set_backdrop(p_id uuid, p_backdrop boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
begin
  perform private.require_owner();
  select g.kind into v_kind from public.gallery_items g where g.id = p_id for update;
  if not found then
    raise exception 'gallery_item_not_found' using errcode = 'P0006';
  end if;
  if coalesce(p_backdrop, false) and v_kind <> 'image' then
    raise exception 'gallery_backdrop_not_image' using errcode = 'P0037';
  end if;
  update public.gallery_items g set is_backdrop = coalesce(p_backdrop, false) where g.id = p_id;
end $$;

revoke all on function public.admin_gallery_set_backdrop(uuid, boolean) from public, anon;
grant execute on function public.admin_gallery_set_backdrop(uuid, boolean) to authenticated;
