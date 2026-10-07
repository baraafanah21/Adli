"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { normalizeMobile } from "@/lib/phone";

export type ProfileState = { ok?: boolean; error?: string; field?: "full_name" | "area" | "phone" };

const Profile = z.object({
  full_name: z.string().trim().min(1, "name").max(80),
  area: z.string().trim().max(80),
  // The full number from PhoneField (+9705… / +9725…), or empty. The profiles trigger checks it again.
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizeMobile(v) !== null),
});

/** Saves «بياناتي». Identity is re-checked here (not trusted from the page); RLS limits the row to the caller. */
export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser("/account");
  const parsed = Profile.safeParse({
    full_name: form.get("full_name") ?? "",
    area: form.get("area") ?? "",
    phone: form.get("phone") ?? "",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as ProfileState["field"];
    const error =
      field === "full_name"
        ? "اكتب اسمك (حتى 80 حرفاً)."
        : field === "phone"
          ? "اكتب رقم الجوال: 9 أرقام تبدأ بـ 5 واختر المقدمة +970 أو +972، أو اتركه فارغاً."
          : "المنطقة طويلة. اكتبها في 80 حرفاً على الأكثر.";
    return { error, field };
  }

  const supabase = await createClient();
  const { full_name, area, phone } = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name, area: area || null, phone: phone ? normalizeMobile(phone) : null })
    .eq("id", user.id);
  if (error) {
    console.error("updateProfile", error.code, error.message);
    return { error: "تعذّر حفظ بياناتك الآن. حاول مرة أخرى بعد قليل." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export type CancelState = { done?: boolean; error?: "too_late" | "changed" | "failed" };

/** «ألغِ الموعد». Identity is re-checked here; cancel_my_booking() checks ownership and the 2-hour limit itself. */
export async function cancelMyBooking(_prev: CancelState, form: FormData): Promise<CancelState> {
  await requireUser("/account");
  const id = z.uuid().safeParse(form.get("booking_id"));
  if (!id.success) return { error: "failed" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_booking", { p_booking_id: id.data });
  if (error) {
    if (error.code === "P0024") return { error: "too_late" };
    if (error.code === "P0006" || error.code === "P0028") return { error: "changed" };
    console.error("cancelMyBooking", error.code, error.message);
    return { error: "failed" };
  }
  revalidatePath("/account");
  return { done: true };
}
