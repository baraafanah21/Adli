-- Storage deletes that silently did nothing. Additive: two SELECT policies, nothing else changes.
--
-- Supabase Storage removes (and lists) only the objects the caller may SELECT on storage.objects. Both buckets had
-- insert / update / delete policies but no SELECT, so remove() found nothing and answered [] without an error:
-- deleting a gallery item or a product left its files behind, and deleteProduct's list() of the folder came back
-- empty. The app now checks what remove() answers (src/lib/storage-files.ts); these policies let it succeed.
--
--   gallery   the owner only (the same as its write policies, private.has_role(owner))
--   products  any admin (owner or staff, private.is_admin(), the same as its write policies)
--
-- Public reading doesn't change: both buckets are public and their files are served by the public URL, which never
-- reads storage.objects through RLS. anon and signed-in customers still can't list either bucket.
-- Leftover files from before (orphans): scripts/storage-orphans.mjs (dry run by default, --delete to remove).

create policy "owner reads gallery files" on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and (select private.has_role(array['owner']::public.app_role[])));

create policy "admins read product files" on storage.objects for select to authenticated
  using (bucket_id = 'products' and (select private.is_admin()));
