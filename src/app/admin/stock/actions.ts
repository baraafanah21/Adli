"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";
import { MANUAL_REASONS } from "@/lib/admin/stock";

const Input = z.object({
  variantId: z.uuid(),
  reason: z.enum(["receive", "adjust", "damage"]),
  quantity: z.coerce.number().int().min(0).max(100000),
  note: z.string().trim().max(500).optional(),
});

/** Receive, count or write off stock. One movement row per change, recorded by admin_adjust_stock(). */
export async function adjustStock(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(["owner", "staff"], "/admin/stock");
  const parsed = Input.safeParse({
    variantId: form.get("variantId"),
    reason: form.get("reason"),
    quantity: form.get("quantity"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "اكتب الكمية رقماً صحيحاً من 0 فما فوق." };
  const a = parsed.data;
  if (a.reason !== "adjust" && a.quantity === 0) return { ok: false, message: "الكمية يجب أن تكون 1 على الأقل." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_adjust_stock", {
    p_variant_id: a.variantId,
    p_reason: a.reason,
    p_quantity: a.quantity,
    p_note: a.note ?? null,
  });
  if (error) {
    if (!isExpectedAdminError(error.code)) console.error("admin_adjust_stock", error.code, error.message);
    if (error.code === "23514" && error.message.includes("stock_below_zero")) {
      return { ok: false, message: `المخزون الحالي ${error.details ?? "أقل"} فقط، فلا يمكن خصم هذه الكمية. راجع العدد.` };
    }
    if (error.code === "22023" && error.message.includes("bundle_has_no_stock")) {
      return { ok: false, message: "البكجة بلا مخزون خاص بها: عدّل مخزون القطع التي فيها." };
    }
    return { ok: false, message: adminErrorMessage(error) };
  }

  // The shop shows availability (in / low / out), the admin shows the numbers: both are stale now.
  revalidatePath("/", "layout");
  const done = MANUAL_REASONS.find((r) => r.reason === a.reason)!.done;
  return { ok: true, message: `${done}. المخزون الآن ${data as number}.` };
}
