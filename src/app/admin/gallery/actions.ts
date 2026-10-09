"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";
import { expireGallery } from "@/lib/gallery-cache";

/*
  «المعرض» (U5.3): owner only, here (requireRole) and in the database (admin_gallery_*). Each write expires the cached
  gallery (updateTag "gallery") once the RPC has succeeded. Photos and videos are added by the upload routes
  (/api/admin/gallery/image and /video); a video's MP4 first goes straight from the browser to Storage, at the path
  prepareGalleryVideo() hands out.
*/

const owner = () => requireRole(["owner"], "/admin/gallery");
const uuid = z.uuid();

const fail = (error: { code?: string; message?: string; details?: string | null }, where: string): ActionState => {
  if (!isExpectedAdminError(error.code)) console.error(where, error.code, error.message);
  return { ok: false, message: adminErrorMessage(error) };
};

const done = (message: string): ActionState => {
  expireGallery();
  revalidatePath("/admin/gallery");
  return { ok: true, message };
};

/** A new item id and where its MP4 goes: <id>/<uuid>.mp4 (the video route checks the same shape). */
export async function prepareGalleryVideo(): Promise<{ ok: true; id: string; path: string } | { ok: false; message: string }> {
  await owner();
  const id = crypto.randomUUID();
  return { ok: true, id, path: `${id}/${crypto.randomUUID()}.mp4` };
}

export async function setGalleryPublished(id: string, published: boolean): Promise<ActionState> {
  await owner();
  if (!uuid.safeParse(id).success) return { ok: false, message: "حدّث الصفحة وحاول مرة أخرى." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_gallery_set_published", { p_id: id, p_published: published });
  if (error) return fail(error, "admin_gallery_set_published");
  return done(published ? "نُشر في المعرض." : "أُخفي من المعرض.");
}

/** The one video in «مرآة الصالون»; null takes it off the mirror. */
export async function setGalleryFeatured(id: string | null): Promise<ActionState> {
  await owner();
  if (id !== null && !uuid.safeParse(id).success) return { ok: false, message: "حدّث الصفحة وحاول مرة أخرى." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_gallery_set_featured", { p_id: id });
  if (error) return fail(error, "admin_gallery_set_featured");
  return done(id ? "صار هذا الفيديو في المرآة." : "أُزيل الفيديو من المرآة.");
}

/** Every item, once, in the new order. */
export async function reorderGallery(ids: string[]): Promise<ActionState> {
  await owner();
  if (!z.array(uuid).min(1).max(500).safeParse(ids).success) return { ok: false, message: "حدّث الصفحة ورتّب من جديد." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_gallery_reorder", { p_ids: ids });
  if (error) return fail(error, "admin_gallery_reorder");
  return done("حُفظ الترتيب.");
}

/** The row goes first; then its files (the function returns their paths). A file left behind is only logged. */
export async function deleteGalleryItem(id: string): Promise<ActionState> {
  await owner();
  if (!uuid.safeParse(id).success) return { ok: false, message: "حدّث الصفحة وحاول مرة أخرى." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_gallery_delete", { p_id: id });
  if (error) return fail(error, "admin_gallery_delete");
  const files = data as { storage_path: string; poster_path: string | null; sm_path: string };
  const paths = [files.storage_path, files.poster_path, files.sm_path].filter((p): p is string => Boolean(p));
  const { error: removeError } = await supabase.storage.from("gallery").remove(paths);
  if (removeError) console.error("gallery delete: files kept", id, removeError.message);
  return done("حُذف من المعرض.");
}
