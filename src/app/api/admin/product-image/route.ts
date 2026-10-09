import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { getCurrentUser, getRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError } from "@/lib/admin/errors";
import { productImagePaths } from "@/lib/format";
import { expireCatalogNow } from "@/lib/catalog-cache";
import { keptNote, removeFiles } from "@/lib/storage-files";

/*
  A product photo, from the admin's image picker. The browser has already decoded the photo (HEIC included on an
  iPhone), applied its EXIF rotation and sent a JPEG of at most 2400px, so the body stays under Vercel's 4.5 MB limit.
  Here, for staff only:
    - check it really is an image (sharp reads it; the file name and type are not trusted), with a pixel limit;
    - .rotate() for any orientation left, then two WebP files with no metadata at all (sharp drops EXIF, GPS
      included, unless asked to keep it):
        <product id>/<uuid>.webp     1600px on the longest side, quality 82 (the product page)
        <product id>/<uuid>.sm.webp  covers 480×600, the 4:5 card frame at 2× (cards and admin thumbnails)
    - upload both with a year-long cache, record the large one with admin_set_product_image(), then remove the
      previous photo's files. Nothing is recorded if an upload fails, and the new files go if recording fails.
*/

// Runs on Node (the default; segment config like `runtime` isn't allowed with cacheComponents), which sharp needs.

const MAX_BYTES = 4.4 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

/** `warning`: saved, but the previous photo's files couldn't be removed (said, not swallowed). */
type Body = { ok: true; path: string; warning?: string } | { ok: false; message: string };
const reply = (body: Body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ ok: false, message: "طلب غير مسموح." }, 403);

  // Staff only, read fresh (layer 2); Storage policies and admin_set_product_image check again (layer 3).
  const user = await getCurrentUser();
  const role = user ? await getRole(user.id) : null;
  if (!role) return reply({ ok: false, message: "ليست لديك صلاحية لهذه العملية." }, 404);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
    return reply({ ok: false, message: "الصورة كبيرة جداً. جرّب صورة أخرى." }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ ok: false, message: "تعذّر قراءة الصورة. حاول مرة أخرى." }, 400);
  }
  const productId = form.get("productId");
  const file = form.get("file");
  if (typeof productId !== "string" || !z.uuid().safeParse(productId).success || !(file instanceof Blob)) {
    return reply({ ok: false, message: "تعذّر قراءة الصورة. حاول مرة أخرى." }, 400);
  }
  if (file.size > MAX_BYTES) return reply({ ok: false, message: "الصورة كبيرة جداً. جرّب صورة أخرى." }, 413);

  const input = Buffer.from(await file.arrayBuffer());
  let large: Buffer;
  let small: Buffer;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.format || !FORMATS.has(meta.format)) throw new Error(`format ${meta.format}`);
    const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
    [large, small] = await Promise.all([
      base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base.clone().resize({ width: 480, height: 600, fit: "outside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    ]);
  } catch (e) {
    console.error("product-image: not an image", e instanceof Error ? e.message : e);
    return reply({ ok: false, message: "هذا الملف ليس صورة نقرؤها. جرّب صورة أخرى من المعرض." }, 415);
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("products").select("image_path").eq("id", productId).maybeSingle();
  const path = `${productId}/${crypto.randomUUID()}.webp`;
  const paths = productImagePaths(path)!;
  const bucket = supabase.storage.from("products");
  const upload = (key: string, body: Buffer) =>
    bucket.upload(key, body, { contentType: "image/webp", cacheControl: "31536000", upsert: false });

  const uploads = await Promise.all([upload(paths.large, large), upload(paths.small, small)]);
  const failed = uploads.find((u) => u.error);
  // Cleaning up after a failure: only what did get uploaded, and say so if it couldn't be removed.
  const cleanUp = async (message: string, status: number) => {
    const done = [paths.large, paths.small].filter((_, i) => !uploads[i].error);
    const removed = await removeFiles(supabase, "products", done, "product-image cleanup");
    return reply({ ok: false, message: removed.ok ? message : `${message} ${keptNote(removed.kept.length)}` }, status);
  };
  if (failed) {
    console.error("product-image: upload", failed.error?.message);
    return cleanUp("تعذّر رفع الصورة. تأكد من الاتصال وحاول مرة أخرى.", 502);
  }

  const { error } = await supabase.rpc("admin_set_product_image", { p_id: productId, p_path: path });
  if (error) {
    if (!isExpectedAdminError(error.code)) console.error("admin_set_product_image", error.code, error.message);
    return cleanUp(adminErrorMessage(error), 400);
  }

  // The previous photo (only one that lives in Storage; the demo SVGs are in public/). The new one is saved either way.
  const old = productImagePaths((before as { image_path: string | null } | null)?.image_path ?? null);
  const removedOld = old ? await removeFiles(supabase, "products", [old.large, old.small], `product-image old ${productId}`) : null;
  const warning = removedOld && !removedOld.ok ? `الصورة القديمة: ${keptNote(removedOld.kept.length)}` : undefined;

  // A Route Handler can't use updateTag; revalidateTag with expire 0 has the same effect (no stale copy served).
  expireCatalogNow();
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  return reply({ ok: true, path, warning });
}
