"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";
import { CATEGORY_ICON_NAMES } from "@/components/icons";

const Input = z.object({
  id: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(1).max(60),
  icon: z.enum(CATEGORY_ICON_NAMES),
  description: z.string().trim().max(140),
  sort: z.coerce.number().int(),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

/** Owner only: add or edit a category. The header, the shelf and the category pages read categories, so all revalidate. */
export async function saveCategory(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(["owner"], "/admin/categories");
  const parsed = Input.safeParse({ ...Object.fromEntries(form), active: form.get("active") });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "slug") return { ok: false, message: "رابط الفئة: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل hair-beard." };
    if (field === "name") return { ok: false, message: "اكتب اسم الفئة." };
    if (field === "icon") return { ok: false, message: "اختر أيقونة من القائمة." };
    if (field === "description") return { ok: false, message: "الوصف القصير 140 حرفاً على الأكثر." };
    return { ok: false, message: "بعض الحقول غير صحيحة. راجعها وحاول مرة أخرى." };
  }
  const c = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_category", {
    p_id: c.id,
    p_slug: c.slug,
    p_name_ar: c.name,
    p_icon: c.icon,
    p_description_ar: c.description,
    p_sort: c.sort,
    p_is_active: c.active,
  });
  if (error) {
    if (!isExpectedAdminError(error.code)) console.error("admin_save_category", error.code, error.message);
    return { ok: false, message: adminErrorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: c.id ? "حُفظت الفئة." : "أُضيفت الفئة." };
}
