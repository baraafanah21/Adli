"use server";

import { revalidatePath } from "next/cache";
import { expireCatalog } from "@/lib/catalog-cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ORDER_ACTIONS, ORDER_STATUSES, STATUS_LABEL, isOrderStatus } from "@/lib/order-status";

export type StatusState = { ok: boolean; message: string } | null;

const Input = z.object({
  orderId: z.uuid(),
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
});

type Short = { name_ar: string | null; needed: number; available: number };

function errorMessage(error: { code?: string; details?: string | null }) {
  switch (error.code) {
    case "P0001": {
      let short: Short[] = [];
      try {
        short = JSON.parse(error.details ?? "[]");
      } catch {}
      const lines = short.map((s) => `${s.name_ar ?? "صنف محذوف"} (المطلوب ${s.needed}، المتوفر ${s.available})`);
      return `لا يكفي المخزون: ${lines.join("، ")}. أضف الكمية من «المخزون» أو ألغِ الطلب.`;
    }
    case "P0010": {
      const from = error.details?.split("->")[0];
      const now = isOrderStatus(from) ? `«${STATUS_LABEL[from]}»` : "في حالة أخرى";
      return `لا يمكن هذا التغيير: الطلب ${now} الآن. حدّث الصفحة لترى حالته.`;
    }
    case "P0006":
      return "لم نجد هذا الطلب. ارجع إلى قائمة الطلبات.";
    case "42501":
      return "ليست لديك صلاحية لهذه العملية.";
    default:
      return "تعذّر حفظ التغيير. تأكد من الاتصال وحاول مرة أخرى.";
  }
}

/** Confirm, deliver or cancel an order. The database checks the role, the move, and the stock in one transaction. */
export async function setOrderStatus(_prev: StatusState, form: FormData): Promise<StatusState> {
  await requireRole(["owner", "staff"], "/admin/orders");

  const parsed = Input.safeParse({
    orderId: form.get("orderId"),
    status: form.get("status"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "تعذّر قراءة الطلب. حدّث الصفحة وحاول مرة أخرى." };
  const { orderId, status, note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) {
    if (!["P0001", "P0010", "P0006", "42501"].includes(error.code)) console.error("admin_set_order_status", error.code, error.message);
    return { ok: false, message: errorMessage(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { status: string; changed: boolean } | undefined;
  // Confirming takes stock and cancelling gives it back: the shop's availability is stale. «done» moves nothing.
  if (row?.changed !== false && status !== "done") expireCatalog();
  revalidatePath("/admin", "layout");

  if (row && !row.changed) return { ok: true, message: `لم يتغير شيء: الطلب «${STATUS_LABEL[status]}» من قبل.` };
  const done = Object.values(ORDER_ACTIONS)
    .flat()
    .find((a) => a.to === status)?.done;
  return { ok: true, message: done ?? "حُفظ." };
}
