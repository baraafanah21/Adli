"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";

/*
  The calendar's actions. Every one re-checks the role here; the database checks it again (and, for closures,
  that a staff member only closes their own barber's time).
*/

const staff = () => requireRole(["owner", "staff"], "/admin/bookings");

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalUuid = z.preprocess((v) => (v === "" || v == null || v === "salon" ? null : v), z.uuid().nullable());

/** "2026-10-12" + "14:05" → a timestamptz literal Postgres reads in the salon's zone. */
const salonTime = (d: string, t: string) => `${d} ${t}:00 Asia/Hebron`;

const fail = (error: { code?: string; message?: string; details?: string | null }, where: string): ActionState => {
  if (!isExpectedAdminError(error.code)) console.error(where, error.code, error.message);
  return { ok: false, message: adminErrorMessage(error) };
};

const done = (message: string): ActionState => {
  revalidatePath("/admin", "layout");
  return { ok: true, message };
};

const STATUS_DONE: Record<string, string> = {
  confirmed: "أُكّد الموعد.",
  rejected: "رُفض الموعد.",
  cancelled: "أُلغي الموعد.",
  completed: "سُجّل «حضر».",
  no_show: "سُجّل «لم يحضر».",
};

export async function setBookingStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = z
    .object({
      bookingId: z.uuid(),
      status: z.enum(["confirmed", "rejected", "cancelled", "completed", "no_show"]),
      note: z.string().trim().max(300),
    })
    .safeParse({ bookingId: form.get("bookingId"), status: form.get("status"), note: form.get("note") ?? "" });
  if (!parsed.success) return { ok: false, message: "تعذّر قراءة البيانات. حدّث الصفحة وحاول مرة أخرى." };
  const s = parsed.data;
  if ((s.status === "cancelled" || s.status === "rejected") && !s.note) {
    return { ok: false, message: "اكتب السبب، فهو يظهر للزبون." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_booking_status", {
    p_booking_id: s.bookingId,
    p_status: s.status,
    p_note: s.note || null,
  });
  if (error) return fail(error, "admin_set_booking_status");
  return done(STATUS_DONE[s.status]);
}

export async function addWalkIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = z
    .object({
      barberId: z.uuid(),
      serviceId: z.uuid(),
      day,
      time,
      name: z.string().trim().max(80),
      phone: z.string().trim().max(30),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "barberId") return { ok: false, message: "اختر الحلاق." };
    if (field === "serviceId") return { ok: false, message: "اختر الخدمة." };
    if (field === "time" || field === "day") return { ok: false, message: "اختر الوقت." };
    return { ok: false, message: "الاسم 80 حرفاً على الأكثر." };
  }
  const s = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_add_walk_in", {
    p_barber_id: s.barberId,
    p_service_id: s.serviceId,
    p_starts_at: salonTime(s.day, s.time),
    p_customer_name: s.name || null,
    p_phone: s.phone || null,
  });
  if (error) return fail(error, "admin_add_walk_in");
  return done(`أُضيف الزبون (${data}).`);
}

export async function closeTime(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = z
    .object({
      barberId: optionalUuid,
      day,
      untilDay: z.preprocess((v) => (v === "" || v == null ? null : v), day.nullable()),
      from: time,
      to: time,
      weekly: z.preprocess((v) => v === "on", z.boolean()),
      reason: z.string().trim().max(200),
    })
    .safeParse({ ...Object.fromEntries(form), weekly: form.get("weekly") });
  if (!parsed.success) return { ok: false, message: "اختر اليوم ووقت البداية والنهاية." };
  const s = parsed.data;
  const supabase = await createClient();

  if (s.weekly) {
    if (s.to <= s.from) return { ok: false, message: "وقت النهاية يجب أن يكون بعد البداية." };
    const weekday = new Date(`${s.day}T12:00:00Z`).getUTCDay();
    const { error } = await supabase.rpc("admin_save_weekly_closure", {
      p_id: null,
      p_barber_id: s.barberId,
      p_weekday: weekday,
      p_start_time: s.from,
      p_end_time: s.to,
      p_valid_from: s.day,
      p_valid_until: s.untilDay,
      p_reason: s.reason || null,
    });
    if (error) return fail(error, "admin_save_weekly_closure");
    return done("سُكّر الوقت كل أسبوع.");
  }

  const { error } = await supabase.rpc("admin_close_time", {
    p_barber_id: s.barberId,
    p_starts_at: salonTime(s.day, s.from),
    p_ends_at: salonTime(s.untilDay ?? s.day, s.to),
    p_reason: s.reason || null,
  });
  if (error) return fail(error, "admin_close_time");
  return done("سُكّر الوقت.");
}

export async function deleteClosure(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const id = z.uuid().safeParse(form.get("closureId"));
  if (!id.success) return { ok: false, message: "تعذّر قراءة البيانات. حدّث الصفحة وحاول مرة أخرى." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_closure", { p_id: id.data });
  if (error) return fail(error, "admin_delete_closure");
  return done("فُتح الوقت من جديد.");
}

export async function clearFlag(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = z
    .object({ userId: z.uuid(), note: z.string().trim().max(300) })
    .safeParse({ userId: form.get("userId"), note: form.get("note") ?? "" });
  if (!parsed.success) return { ok: false, message: "تعذّر قراءة البيانات. حدّث الصفحة وحاول مرة أخرى." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_clear_flag", { p_user_id: parsed.data.userId, p_note: parsed.data.note || null });
  if (error) return fail(error, "admin_clear_flag");
  return done("رُفع الوسم. مواعيده الجديدة تُثبَّت فوراً.");
}
