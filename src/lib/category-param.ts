/** Sets ?c= (and optionally the hash) without a navigation or a new Supabase round trip. Browser only. */
export function setCategoryParam(slug: string | null, hash = "") {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("c", slug);
  else url.searchParams.delete("c");
  url.hash = hash;
  window.history.replaceState(null, "", url);
}
