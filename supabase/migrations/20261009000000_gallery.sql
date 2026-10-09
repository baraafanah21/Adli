-- U5.3 «من الكرسي»: the salon's gallery, photos and short silent videos. Display only: no caption, no service, no
-- barber, nothing to type. Owner only. Additive: nothing existing is dropped, renamed or changed.
--
--   public.gallery_items      read by everyone, published rows only (column grants: never created_by)
--   storage bucket "gallery"  public read; owner write; image/webp and video/mp4; 5 MB
--
--   admin_gallery_items()                                   → every item, published or not, in order
--   admin_gallery_add(id, kind, aspect, storage_path, poster_path, sm_path, width, height, duration_ms, bytes) → id
--   admin_gallery_set_published(id, published)              unpublishing a featured item also unfeatures it
--   admin_gallery_set_featured(id)                          the one video in «مرآة الصالون»; null = none
--   admin_gallery_reorder(ids uuid[])                       every item, once, in the new order
--   admin_gallery_delete(id)                                → {storage_path, poster_path, sm_path} for the caller
--                                                             to remove from Storage (the server action does)
--
-- Files: the server uploads first, under the item's own id, then records them:
--   image  <id>/<uuid>.webp (1600px)   sm <id>/<uuid>.sm.webp (480px)   no poster
--   video  <id>/<uuid>.mp4             poster <id>/<uuid>.webp (1080px)  sm <id>/<uuid>.sm.webp (480px)
--
-- Errors (new, from P0031): P0031 featured must be a video, P0032 featured must be published, P0033 the new order
-- doesn't list every item exactly once, P0034 a file path that doesn't match the item, P0035 video over 20 s or no
-- duration, P0036 file over 5 MB. Not found: P0006 (as everywhere). Not the owner: 42501.

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  aspect text not null check (aspect in ('9:16', '4:5', '1:1')),
  storage_path text not null,
  poster_path text,
  sm_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  duration_ms integer,
  bytes integer not null check (bytes > 0 and bytes <= 5 * 1024 * 1024),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- A video has a duration (≤ 20 s) and a poster; a photo has neither.
  constraint gallery_items_video_duration check (
    case when kind = 'video' then duration_ms is not null and duration_ms > 0 and duration_ms <= 20000
         else duration_ms is null end
  ),
  constraint gallery_items_video_poster check ((kind = 'video') = (poster_path is not null)),
  -- «مرآة الصالون» is a video, and only a published one.
  constraint gallery_items_featured_video check (not is_featured or kind = 'video'),
  constraint gallery_items_featured_published check (not is_featured or is_published)
);

comment on table public.gallery_items is 'U5.3 «من الكرسي»: the salon gallery. Writes only through admin_gallery_* (owner).';

-- At most one featured item, ever.
create unique index gallery_items_one_featured on public.gallery_items ((true)) where is_featured;
create index gallery_items_order on public.gallery_items (sort_order, created_at);
create index gallery_items_created_by on public.gallery_items (created_by);

-- Unpublishing a featured item takes its featuring away (before the check above would refuse the change).
create function private.gallery_unfeature_unpublished() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_published then
    new.is_featured := false;
  end if;
  return new;
end $$;

revoke all on function private.gallery_unfeature_unpublished() from public, anon, authenticated;

create trigger gallery_items_unfeature_unpublished
before insert or update of is_published, is_featured on public.gallery_items
for each row execute function private.gallery_unfeature_unpublished();

-- Access: published rows to everyone, named columns only; no direct writes for any API role --------------------------

alter table public.gallery_items enable row level security;

create policy "public reads published gallery" on public.gallery_items for select to anon, authenticated
  using (is_published);

revoke all on table public.gallery_items from anon, authenticated;
grant select (
  id, kind, aspect, storage_path, poster_path, sm_path, width, height, duration_ms, bytes, sort_order, is_published,
  is_featured, created_at
) on table public.gallery_items to anon, authenticated;

-- Storage --------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5 * 1024 * 1024, array['image/webp', 'video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "owner uploads gallery files" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and (select private.has_role(array['owner']::public.app_role[])));
create policy "owner updates gallery files" on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and (select private.has_role(array['owner']::public.app_role[])))
  with check (bucket_id = 'gallery' and (select private.has_role(array['owner']::public.app_role[])));
create policy "owner deletes gallery files" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and (select private.has_role(array['owner']::public.app_role[])));

-- Functions (owner only) -------------------------------------------------------------------------------------------

create function public.admin_gallery_items()
returns setof public.gallery_items
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_owner();
  return query select g.* from public.gallery_items g order by g.sort_order, g.created_at;
end $$;

create function public.admin_gallery_add(
  p_id uuid, p_kind text, p_aspect text, p_storage_path text, p_poster_path text, p_sm_path text,
  p_width integer, p_height integer, p_duration_ms integer, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_dir text := p_id::text || '/[0-9a-f-]{36}';
begin
  perform private.require_owner();
  if p_id is null or p_kind is null or p_kind not in ('image', 'video')
     or p_aspect is null or p_aspect not in ('9:16', '4:5', '1:1') then
    raise exception 'gallery_item_invalid' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes > 5 * 1024 * 1024 then
    raise exception 'gallery_file_too_large' using errcode = 'P0036';
  end if;
  if p_kind = 'video' and (p_duration_ms is null or p_duration_ms <= 0 or p_duration_ms > 20000) then
    raise exception 'gallery_video_too_long' using errcode = 'P0035';
  end if;
  if p_sm_path is null or p_sm_path !~ ('^' || v_dir || '\.sm\.webp$')
     or (p_kind = 'image' and (p_storage_path is null or p_storage_path !~ ('^' || v_dir || '\.webp$') or p_poster_path is not null))
     or (p_kind = 'video' and (p_storage_path is null or p_storage_path !~ ('^' || v_dir || '\.mp4$')
                               or p_poster_path is null or p_poster_path !~ ('^' || v_dir || '\.webp$'))) then
    raise exception 'gallery_path_invalid' using errcode = 'P0034';
  end if;
  insert into public.gallery_items (
    id, kind, aspect, storage_path, poster_path, sm_path, width, height, duration_ms, bytes, sort_order
  ) values (
    p_id, p_kind, p_aspect, p_storage_path, p_poster_path, p_sm_path, p_width, p_height,
    case when p_kind = 'video' then p_duration_ms end, p_bytes,
    (select coalesce(max(g.sort_order), 0) + 1 from public.gallery_items g)
  );
  return p_id;
end $$;

create function public.admin_gallery_set_published(p_id uuid, p_published boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  update public.gallery_items g set is_published = coalesce(p_published, false) where g.id = p_id;
  if not found then
    raise exception 'gallery_item_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Moves the featuring in one transaction: the old one is cleared first (the unique index is checked per row).
create function public.admin_gallery_set_featured(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.gallery_items;
begin
  perform private.require_owner();
  if p_id is not null then
    select * into v from public.gallery_items g where g.id = p_id for update;
    if not found then
      raise exception 'gallery_item_not_found' using errcode = 'P0006';
    end if;
    if v.kind <> 'video' then
      raise exception 'gallery_featured_not_video' using errcode = 'P0031';
    end if;
    if not v.is_published then
      raise exception 'gallery_featured_unpublished' using errcode = 'P0032';
    end if;
  end if;
  update public.gallery_items g set is_featured = false where g.is_featured and g.id is distinct from p_id;
  if p_id is not null then
    update public.gallery_items g set is_featured = true where g.id = p_id;
  end if;
end $$;

-- The whole gallery in its new order; anything else (a missing, unknown or repeated id) is refused.
create function public.admin_gallery_reorder(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  perform 1 from public.gallery_items for update;
  if p_ids is null
     or cardinality(p_ids) <> (select count(*) from public.gallery_items)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
     or exists (select 1 from unnest(p_ids) x where not exists (select 1 from public.gallery_items g where g.id = x)) then
    raise exception 'gallery_reorder_mismatch' using errcode = 'P0033';
  end if;
  update public.gallery_items g set sort_order = o.n
  from unnest(p_ids) with ordinality as o (id, n)
  where g.id = o.id and g.sort_order is distinct from o.n;
end $$;

create function public.admin_gallery_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.gallery_items;
begin
  perform private.require_owner();
  delete from public.gallery_items g where g.id = p_id returning g.* into v;
  if not found then
    raise exception 'gallery_item_not_found' using errcode = 'P0006';
  end if;
  return jsonb_build_object('storage_path', v.storage_path, 'poster_path', v.poster_path, 'sm_path', v.sm_path);
end $$;

-- Grants ----------------------------------------------------------------------------------------------------------

revoke all on function
  public.admin_gallery_items(),
  public.admin_gallery_add(uuid, text, text, text, text, text, integer, integer, integer, integer),
  public.admin_gallery_set_published(uuid, boolean),
  public.admin_gallery_set_featured(uuid),
  public.admin_gallery_reorder(uuid[]),
  public.admin_gallery_delete(uuid)
from public, anon;
grant execute on function
  public.admin_gallery_items(),
  public.admin_gallery_add(uuid, text, text, text, text, text, integer, integer, integer, integer),
  public.admin_gallery_set_published(uuid, boolean),
  public.admin_gallery_set_featured(uuid),
  public.admin_gallery_reorder(uuid[]),
  public.admin_gallery_delete(uuid)
to authenticated;
