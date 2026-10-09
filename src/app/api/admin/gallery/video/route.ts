import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError } from "@/lib/admin/errors";
import { MAX_FILE, MAX_UPLOAD, framedWebp, ownerGate, reply } from "@/lib/admin/gallery-files";
import { aspectValue } from "@/lib/gallery-aspects";
import { expireGalleryNow } from "@/lib/gallery-cache";
import { isH264, readMp4 } from "@/lib/mp4";
import { keptNote, removeFiles } from "@/lib/storage-files";

/*
  A gallery video (owner only), second step. A video can be 5 MB and a request through Vercel at most 4.5 MB, so the
  browser has already uploaded the MP4 straight to Storage (the bucket lets only the owner write, only video/mp4, at
  most 5 MB) at the path prepareGalleryVideo() handed out. This gets that path, the item id and the poster (a JPEG
  from the ImageEditor) and trusts none of what the browser checked:
    - the path must be <id>/<uuid>.mp4 for this id;
    - the file is read back from Storage: at most 5 MB, an MP4 (not QuickTime), H.264, at most 20 s
      (src/lib/mp4.ts reads the boxes); its size and duration are what gets recorded;
    - the poster goes through sharp like a photo (1080 + 480 WebP, cropped to the aspect).
  Any refusal removes the video; a failed recording removes all three files.
*/

const TOO_LONG = "الفيديو أطول من 20 ثانية. قصّه بسكربت الضغط (scripts/media/compress.mjs) ثم ارفعه.";

export async function POST(request: Request) {
  const refused = await ownerGate(request);
  if (refused) return refused;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, message: "تعذّر قراءة الطلب. حاول مرة أخرى." }, 400);
  }
  const id = String(form.get("id") ?? "");
  const videoPath = String(form.get("video") ?? "");
  const aspect = String(form.get("aspect") ?? "");
  const poster = form.get("poster");
  const ratio = aspectValue(aspect);
  if (!z.uuid().safeParse(id).success || !new RegExp(`^${id}/[0-9a-f-]{36}\\.mp4$`).test(videoPath) || ratio === null || !(poster instanceof Blob)) {
    return reply({ ok: false, message: "تعذّر قراءة الطلب. حاول مرة أخرى." }, 400);
  }
  if (poster.size > MAX_UPLOAD) return reply({ ok: false, message: "صورة الغلاف كبيرة جداً. جرّب لقطة أخرى." }, 413);

  const supabase = await createClient();
  const bucket = supabase.storage.from("gallery");
  const drop = async (paths: string[], message: string, status: number) => {
    const removed = await removeFiles(supabase, "gallery", paths, "gallery-video refused");
    return reply({ ok: false, message: removed.ok ? message : `${message} ${keptNote(removed.kept.length)}` }, status);
  };

  // Sent twice (a retry after it had already worked): the item exists, and its files must not be removed below.
  const { data: items, error: listError } = await supabase.rpc("admin_gallery_items");
  if (listError) {
    console.error("gallery-video: admin_gallery_items", listError.code, listError.message);
    return reply({ ok: false, message: adminErrorMessage(listError) }, 400);
  }
  if ((items as { id: string }[]).some((item) => item.id === id)) {
    return reply({ ok: false, message: "حُفظ هذا الفيديو من قبل. حدّث الصفحة." }, 409);
  }

  // The video, read back.
  const { data: blob, error: downloadError } = await bucket.download(videoPath);
  if (downloadError || !blob) {
    console.error("gallery-video: download", downloadError?.message);
    return drop([videoPath], "لم يصل الفيديو كاملاً. ارفعه من جديد.", 400);
  }
  if (blob.size > MAX_FILE) return drop([videoPath], "الفيديو أكبر من 5 ميغابايت. اضغطه بسكربت الضغط ثم ارفعه.", 413);
  const info = readMp4(new Uint8Array(await blob.arrayBuffer()));
  if (!info || info.brand === "qt  ") return drop([videoPath], "هذا الملف ليس فيديو MP4. صدّره MP4 أو اضغطه بسكربت الضغط.", 415);
  if (!isH264(info.codec)) {
    return drop([videoPath], "ترميز هذا الفيديو (HEVC) لا تشغّله كل المتصفحات. اضغطه بسكربت الضغط ليصير H.264.", 415);
  }
  if (info.durationMs <= 0 || info.durationMs > 20000) return drop([videoPath], TOO_LONG, 422);
  if (!info.width || !info.height) return drop([videoPath], "تعذّر قراءة أبعاد الفيديو. اضغطه بسكربت الضغط ثم ارفعه.", 415);

  // The poster.
  let framed;
  try {
    framed = await framedWebp(Buffer.from(await poster.arrayBuffer()), ratio, { width: 1080 });
  } catch (e) {
    console.error("gallery-video: poster not an image", e instanceof Error ? e.message : e);
    return drop([videoPath], "تعذّر قراءة صورة الغلاف. جرّب لقطة أخرى.", 415);
  }
  const name = crypto.randomUUID();
  const paths = { poster: `${id}/${name}.webp`, small: `${id}/${name}.sm.webp` };
  const upload = (key: string, body: Buffer) =>
    bucket.upload(key, body, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  const uploads = await Promise.all([upload(paths.poster, framed.large), upload(paths.small, framed.small)]);
  const failed = uploads.find((u) => u.error);
  // Only the poster files that did get uploaded are removed (with the video).
  const posterDone = [paths.poster, paths.small].filter((_, i) => !uploads[i].error);
  if (failed) {
    console.error("gallery-video: poster upload", failed.error?.message);
    return drop([videoPath, ...posterDone], "تعذّر رفع صورة الغلاف. تأكد من الاتصال وحاول مرة أخرى.", 502);
  }

  const { error } = await supabase.rpc("admin_gallery_add", {
    p_id: id,
    p_kind: "video",
    p_aspect: aspect,
    p_storage_path: videoPath,
    p_poster_path: paths.poster,
    p_sm_path: paths.small,
    p_width: info.width,
    p_height: info.height,
    p_duration_ms: info.durationMs,
    p_bytes: blob.size,
  });
  if (error) {
    if (!isExpectedAdminError(error.code)) console.error("admin_gallery_add video", error.code, error.message);
    return drop([videoPath, paths.poster, paths.small], adminErrorMessage(error), 400);
  }

  expireGalleryNow();
  revalidatePath("/admin/gallery");
  return reply({ ok: true, id });
}
