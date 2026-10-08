"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";

/*
  «الزبائن» (E3.2). Staff: reset the booking limit, the internal note. Owner: block and unblock (with a reason).
  Every action checks the role here (layer 2) and again inside its admin_* function (layer 3).
*/

const staff = (id: string) => requireRole(["owner", "staff"], `/admin/customers/${id}`);
const owner = (id: string) => requireRole(["owner"], `/admin/customers/${id}`);

const fail = (error: { code?: string; message?: string; details?: string | null }, where: string): ActionState => {
  if (!isExpectedAdminError(error.code)) console.error(where, error.code, error.message);
  return { ok: false, message: adminErrorMessage(error) };
};

const INVALID: ActionState = { ok: false, message: "تعذّر قراءة البيانات. حدّث الصفحة وحاول مرة أخرى." };

function done(id: string, message: string): ActionState {
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { ok: true, message };
}

const idOf = (form: FormData) => {
  const id = String(form.get("userId") ?? "");
  return z.uuid().safeParse(id).success ? id : null;
};

/** The limit (5 bookings created per hour) counts again from now; the reset is logged with who did it. */
export async function resetBookingRate(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = idOf(form);
  if (!id) return INVALID;
  await staff(id);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reset_booking_rate", { p_user_id: id });
  if (error) return fail(error, "admin_reset_booking_rate");
  return done(id, "صُفّر حد المحاولات. يقدر يحجز الآن.");
}

/** For the staff only; the customer never sees it. Empty = no note. */
export async function saveCustomerNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = idOf(form);
  if (!id) return INVALID;
  await staff(id);
  const note = String(form.get("note") ?? "").trim();
  if (note.length > 1000) return { ok: false, message: "الملاحظة 1000 حرف على الأقصى." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_customer_note", { p_user_id: id, p_note: note });
  if (error) return fail(error, "admin_set_customer_note");
  return done(id, note ? "حُفظت الملاحظة." : "حُذفت الملاحظة.");
}

/** Owner only. A blocked account can't book or order; its upcoming bookings stay for the staff to decide. */
export async function blockCustomer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = idOf(form);
  if (!id) return INVALID;
  await owner(id);
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3) return { ok: false, message: "اكتب سبب الحظر (3 أحرف على الأقل). يبقى في سجل الزبون، ولا يراه الزبون." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_block_customer", { p_user_id: id, p_reason: reason });
  if (error) return fail(error, "admin_block_customer");
  return done(id, "حُظر الزبون. لا يقدر يحجز أو يطلب من حسابه، ومواعيده القادمة باقية لتقرر فيها.");
}

export async function unblockCustomer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = idOf(form);
  if (!id) return INVALID;
  await owner(id);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unblock_customer", { p_user_id: id, p_note: String(form.get("note") ?? "").trim() || null });
  if (error) return fail(error, "admin_unblock_customer");
  return done(id, "رُفع الحظر. يقدر يحجز ويطلب من جديد.");
}
