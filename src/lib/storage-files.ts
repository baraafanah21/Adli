import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Removing Storage files and checking that they went. Storage's remove() answers with the objects it actually
  removed, and without an error when it removed nothing: it only finds files the caller may SELECT (RLS on
  storage.objects), so a missing policy or a wrong path looks like success. Every caller compares what came back
  with what it asked for, logs what was kept, and tells the person (an admin) instead of swallowing it.
  Used on the server (Route Handlers, Server Actions) and in the browser (VideoAdder). Orphans left anyway (a closed
  tab mid-upload): scripts/storage-orphans.mjs.
*/

export type RemoveResult = { ok: true } | { ok: false; kept: string[] };

export async function removeFiles(
  supabase: SupabaseClient,
  bucket: "products" | "gallery",
  paths: string[],
  where: string,
): Promise<RemoveResult> {
  const wanted = [...new Set(paths.filter(Boolean))];
  if (wanted.length === 0) return { ok: true };
  const { data, error } = await supabase.storage.from(bucket).remove(wanted);
  const removed = new Set((data ?? []).map((o) => o.name));
  const kept = wanted.filter((p) => !removed.has(p));
  if (error || kept.length) {
    console.error(`storage: files kept (${where})`, bucket, error?.message ?? "removed fewer than asked", kept);
    return { ok: false, kept };
  }
  return { ok: true };
}

/** The sentence an admin sees when files were kept (the noun and verb agree with the count). */
export function keptNote(kept: number) {
  const said =
    kept === 1
      ? "بقي ملف في التخزين لم يُحذف"
      : kept === 2
        ? "بقي ملفان في التخزين لم يُحذفا"
        : kept <= 10
          ? `بقيت ${kept} ملفات في التخزين لم تُحذف`
          : `بقي ${kept} ملفاً في التخزين لم يُحذف`;
  return `${said}. أبلغ المطوّر.`;
}
