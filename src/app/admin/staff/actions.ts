"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isCompleteEmail } from "@/lib/auth/errors";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";

const owner = () => requireRole(["owner"], "/admin/staff");
const role = z.enum(["owner", "staff"]);

const fail = (error: { code?: string; message?: string }, where: string, lastOwner?: string): ActionState => {
  if (!isExpectedAdminError(error.code)) console.error(where, error.code, error.message);
  return { ok: false, message: error.code === "P0003" && lastOwner ? lastOwner : adminErrorMessage(error) };
};

export async function addStaff(_prev: ActionState, form: FormData): Promise<ActionState> {
  await owner();
  const parsed = z
    .object({ email: z.string().trim().max(254), role })
    .safeParse({ email: form.get("email"), role: form.get("role") });
  if (!parsed.success || !isCompleteEmail(parsed.data.email)) return { ok: false, message: "اكتب البريد كاملاً، مثل name@gmail.com" };
  const s = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_staff", { p_email: s.email, p_role: s.role });
  if (error) return fail(error, "admin_add_staff");
  revalidatePath("/admin/staff");
  return { ok: true, message: s.role === "owner" ? "أُضيف صاحب صالون." : "أُضيف للطاقم." };
}

export async function updateStaff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await owner();
  const parsed = z
    .object({ userId: z.uuid(), role })
    .safeParse({ userId: form.get("userId"), role: form.get("role") });
  if (!parsed.success) return { ok: false, message: "تعذّر قراءة البيانات. حدّث الصفحة وحاول مرة أخرى." };
  const s = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_staff", { p_user_id: s.userId, p_role: s.role });
  if (error) {
    return fail(error, "admin_update_staff", "لا يمكن تحويل آخر صاحب صالون إلى طاقم. أضف صاحب صالون آخر أولاً.");
  }
  revalidatePath("/admin", "layout");
  // The owner made themselves staff: this page is owner-only now, so go to the admin home.
  if (s.userId === user.id && s.role !== "owner") redirect("/admin");
  return { ok: true, message: "حُفظ." };
}

export async function removeStaff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await owner();
  const parsed = z.object({ userId: z.uuid() }).safeParse({ userId: form.get("userId") });
  if (!parsed.success) return { ok: false, message: "تعذّر قراءة البيانات. حدّث الصفحة وحاول مرة أخرى." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_staff", { p_user_id: parsed.data.userId });
  if (error) return fail(error, "admin_remove_staff", "لا يمكن إزالة آخر صاحب صالون. أضف صاحب صالون آخر أولاً.");
  revalidatePath("/admin", "layout");
  // Removed themselves: no admin access any more.
  if (parsed.data.userId === user.id) redirect("/");
  return { ok: true, message: "أُزيل من الطاقم." };
}
