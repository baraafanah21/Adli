"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { ok?: boolean; error?: string; field?: "full_name" | "area" | "phone" };

const Profile = z.object({
  full_name: z.string().trim().min(1, "name").max(80),
  area: z.string().trim().max(80),
  phone: z.string().trim().regex(/^[0-9+ ]{7,20}$/).or(z.literal("")),
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
          ? "اكتب رقم الهاتف بالأرقام فقط، مثل 0599123456، أو اتركه فارغاً."
          : "المنطقة طويلة. اكتبها في 80 حرفاً على الأكثر.";
    return { error, field };
  }

  const supabase = await createClient();
  const { full_name, area, phone } = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name, area: area || null, phone: phone || null })
    .eq("id", user.id);
  if (error) {
    console.error("updateProfile", error.code, error.message);
    return { error: "تعذّر حفظ بياناتك الآن. حاول مرة أخرى بعد قليل." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
