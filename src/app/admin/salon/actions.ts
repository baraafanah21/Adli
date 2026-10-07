"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";

/* «الصالون»: barbers, services, opening hours. Owner only, here and in the database. */

const owner = () => requireRole(["owner"], "/admin/salon");

const blankToNull = (v: unknown) => (v === "" || v == null ? null : v);
const checkbox = z.preprocess((v) => v === "on", z.boolean());

const fail = (error: { code?: string; message?: string; details?: string | null }, where: string): ActionState => {
  if (!isExpectedAdminError(error.code)) console.error(where, error.code, error.message);
  return { ok: false, message: adminErrorMessage(error) };
};

/**
 * Called only after the admin_save_* RPC succeeded. updateTag expires the cached hours / services / barbers
 * (src/lib/salon-data.ts) at once: the next visit to the home page or /booking waits for fresh data instead of
 * being served the old copy. The admin page itself is dynamic and just re-renders.
 */
const saved = (message: string): ActionState => {
  updateTag("salon");
  revalidatePath("/admin/salon");
  return { ok: true, message };
};

export async function saveBarber(_prev: ActionState, form: FormData): Promise<ActionState> {
  await owner();
  const parsed = z
    .object({
      id: z.preprocess(blankToNull, z.uuid().nullable()),
      name: z.string().trim().min(1).max(40),
      userId: z.preprocess(blankToNull, z.uuid().nullable()),
      sort: z.coerce.number().int(),
      active: checkbox,
    })
    .safeParse({ ...Object.fromEntries(form), active: form.get("active") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.path[0] === "name" ? "اكتب اسم الحلاق (حتى 40 حرفاً)." : "راجع الحقول وحاول مرة أخرى." };
  }
  const b = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_barber", {
    p_id: b.id,
    p_name_ar: b.name,
    p_user_id: b.userId,
    p_is_active: b.active,
    p_sort: b.sort,
  });
  if (error) return fail(error, "admin_save_barber");
  return saved(b.id ? "حُفظ الحلاق." : "أُضيف الحلاق.");
}

export async function saveService(_prev: ActionState, form: FormData): Promise<ActionState> {
  await owner();
  const parsed = z
    .object({
      id: z.preprocess(blankToNull, z.uuid().nullable()),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      name: z.string().trim().min(1).max(60),
      price: z.coerce.number().int().min(0).max(10000),
      duration: z.preprocess(blankToNull, z.coerce.number().int().min(5).max(240).multipleOf(5).nullable()),
      bookable: checkbox,
      sort: z.coerce.number().int(),
      active: checkbox,
    })
    .safeParse({ ...Object.fromEntries(form), bookable: form.get("bookable"), active: form.get("active") });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "slug") return { ok: false, message: "رابط الخدمة: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل full-cut." };
    if (field === "name") return { ok: false, message: "اكتب اسم الخدمة (حتى 60 حرفاً)." };
    if (field === "price") return { ok: false, message: "السعر رقم صحيح من 0 إلى 10000." };
    if (field === "duration") return { ok: false, message: "المدة بالدقائق من 5 إلى 240، ومن مضاعفات 5." };
    return { ok: false, message: "راجع الحقول وحاول مرة أخرى." };
  }
  const s = parsed.data;
  if (s.bookable && s.duration === null) return { ok: false, message: "الخدمة التي تُحجز من الموقع تحتاج مدة." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_service", {
    p_id: s.id,
    p_slug: s.slug,
    p_name_ar: s.name,
    p_price_ils: s.price,
    p_duration_min: s.duration,
    p_bookable_online: s.bookable,
    p_sort: s.sort,
    p_is_active: s.active,
  });
  if (error) return fail(error, "admin_save_service");
  return saved(s.id ? "حُفظت الخدمة." : "أُضيفت الخدمة.");
}

export async function saveHours(_prev: ActionState, form: FormData): Promise<ActionState> {
  await owner();
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const parsed = z
    .object({
      weekday: z.coerce.number().int().min(0).max(6),
      closed: checkbox,
      open: z.preprocess(blankToNull, time.nullable()),
      close: z.preprocess(blankToNull, time.nullable()),
    })
    .safeParse({ ...Object.fromEntries(form), closed: form.get("closed") });
  if (!parsed.success) return { ok: false, message: "اختر وقت الفتح والإغلاق." };
  const h = parsed.data;
  if (!h.closed && (!h.open || !h.close)) return { ok: false, message: "اختر وقت الفتح والإغلاق، أو علّم «مغلق»." };
  if (!h.closed && h.close! <= h.open!) return { ok: false, message: "وقت الإغلاق يجب أن يكون بعد الفتح." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_salon_hours", {
    p_weekday: h.weekday,
    p_open: h.closed ? null : h.open,
    p_close: h.closed ? null : h.close,
  });
  if (error) return fail(error, "admin_save_salon_hours");
  return saved("حُفظ الدوام.");
}
