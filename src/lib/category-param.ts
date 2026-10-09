/** Sets ?c= (and optionally the hash) without a navigation or a new Supabase round trip. Browser only. */
export function setCategoryParam(slug: string | null, hash = "") {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("c", slug);
  else url.searchParams.delete("c");
  url.hash = hash;
  window.history.replaceState(null, "", url);
}

/** Sets ?q= (the search on /products) the same way: replaced, so typing adds no history entries. Browser only. */
export function setQueryParam(q: string) {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", url);
}
