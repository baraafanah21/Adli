import { getCurrentUser, getRole } from "@/lib/auth/guards";

/*
  Server only (the session): the gallery uploads' owner gate and reply (/api/admin/gallery/*). The photo pipeline
  is src/lib/admin/framed-webp.ts.
*/

export const MAX_UPLOAD = 4.4 * 1024 * 1024; // a JPEG through Vercel (4.5 MB request limit)
export const MAX_FILE = 5 * 1024 * 1024; // the bucket's limit, and the table's

export type Reply = { ok: true; id: string } | { ok: false; message: string };
export const reply = (body: Reply, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

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

/** Same origin and the owner, read fresh (layer 2); the bucket policy and admin_gallery_* check again (layer 3). */
export async function ownerGate(request: Request): Promise<Response | null> {
  if (!sameOrigin(request)) return reply({ ok: false, message: "طلب غير مسموح." }, 403);
  const user = await getCurrentUser();
  const role = user ? await getRole(user.id) : null;
  if (role?.role !== "owner") return reply({ ok: false, message: "ليست لديك صلاحية لهذه العملية." }, 404);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD + 64 * 1024) {
    return reply({ ok: false, message: "الصورة كبيرة جداً. جرّب صورة أخرى." }, 413);
  }
  return null;
}

export { framedWebp } from "./framed-webp";
