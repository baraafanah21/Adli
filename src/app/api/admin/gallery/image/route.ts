import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError } from "@/lib/admin/errors";
import { MAX_UPLOAD, framedWebp, ownerGate, reply } from "@/lib/admin/gallery-files";
import { aspectValue } from "@/lib/gallery-aspects";
import { expireGalleryNow } from "@/lib/gallery-cache";

/*
  A gallery photo (owner only). The browser's ImageEditor has framed it (9:16, 4:5 or 1:1) and sends a JPEG of at
  most 2400px with the aspect it was framed to. Here: the owner gate, sharp (src/lib/admin/gallery-files.ts) makes
  the two WebP files, both are uploaded under a new item id, then admin_gallery_add() records the item, hidden
  (the owner publishes it). Nothing is recorded if an upload fails; the files go if recording fails.
*/

export async function POST(request: Request) {
  const refused = await ownerGate(request);
  if (refused) return refused;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, message: "تعذّر قراءة الصورة. حاول مرة أخرى." }, 400);
  }
  const file = form.get("file");
  const aspect = String(form.get("aspect") ?? "");
  const ratio = aspectValue(aspect);
  if (!(file instanceof Blob) || ratio === null) return reply({ ok: false, message: "تعذّر قراءة الصورة. حاول مرة أخرى." }, 400);
  if (file.size > MAX_UPLOAD) return reply({ ok: false, message: "الصورة كبيرة جداً. جرّب صورة أخرى." }, 413);

  let framed;
  try {
    framed = await framedWebp(Buffer.from(await file.arrayBuffer()), ratio, { longest: 1600 });
  } catch (e) {
    console.error("gallery-image: not an image", e instanceof Error ? e.message : e);
    return reply({ ok: false, message: "هذا الملف ليس صورة نقرؤها. جرّب صورة أخرى من المعرض." }, 415);
  }

  const id = crypto.randomUUID();
  const name = crypto.randomUUID();
  const paths = { large: `${id}/${name}.webp`, small: `${id}/${name}.sm.webp` };
  const supabase = await createClient();
  const bucket = supabase.storage.from("gallery");
  const upload = (key: string, body: Buffer) =>
    bucket.upload(key, body, { contentType: "image/webp", cacheControl: "31536000", upsert: false });

  const uploads = await Promise.all([upload(paths.large, framed.large), upload(paths.small, framed.small)]);
  const failed = uploads.find((u) => u.error);
  if (failed) {
    console.error("gallery-image: upload", failed.error?.message);
    await bucket.remove([paths.large, paths.small]);
    return reply({ ok: false, message: "تعذّر رفع الصورة. تأكد من الاتصال وحاول مرة أخرى." }, 502);
  }

  const { error } = await supabase.rpc("admin_gallery_add", {
    p_id: id,
    p_kind: "image",
    p_aspect: aspect,
    p_storage_path: paths.large,
    p_poster_path: null,
    p_sm_path: paths.small,
    p_width: framed.width,
    p_height: framed.height,
    p_duration_ms: null,
    p_bytes: framed.large.length,
  });
  if (error) {
    if (!isExpectedAdminError(error.code)) console.error("admin_gallery_add image", error.code, error.message);
    await bucket.remove([paths.large, paths.small]);
    return reply({ ok: false, message: adminErrorMessage(error) }, 400);
  }

  // A Route Handler can't use updateTag; revalidateTag with expire 0 has the same effect (no stale copy served).
  expireGalleryNow();
  revalidatePath("/admin/gallery");
  return reply({ ok: true, id });
}
