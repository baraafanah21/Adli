"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminErrorMessage, isExpectedAdminError, type ActionState } from "@/lib/admin/errors";

/*
  Every action: requireRole() first (layer 2), then one admin_* function that checks the role again (layer 3).
  After a save, the shop pages that show the product are revalidated (home shelf, category, product page).
  Deleting and restoring are the owner's (admin_delete_product / admin_restore_product check it again).
*/

const staff = () => requireRole(["owner", "staff"], "/admin/products");

function revalidateCatalog(productId?: string) {
  revalidatePath("/");
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/admin/products");
  if (productId) revalidatePath(`/admin/products/${productId}`);
}

const fail = (error: { code?: string; message?: string; details?: string | null }, where: string): ActionState => {
  if (!isExpectedAdminError(error.code)) console.error(where, error.code, error.message);
  return { ok: false, message: adminErrorMessage(error) };
};

const INVALID: ActionState = { ok: false, message: "بعض الحقول غير صحيحة. راجعها وحاول مرة أخرى." };

// Form helpers: "" → null for optional numbers and text.
const optInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).nullable());
const reqInt = z.coerce.number().int().min(0);
const text = (max: number) => z.string().trim().max(max);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/);

// ---------- Products ----------

const NewProduct = z.object({
  kind: z.enum(["simple", "bundle"]),
  categoryId: z.uuid(),
  name: text(120).min(1),
  slug,
  price: reqInt,
});

export async function createProduct(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = NewProduct.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "slug") return { ok: false, message: "الرابط: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل oud-malaki." };
    if (field === "name") return { ok: false, message: "اكتب اسم المنتج." };
    return INVALID;
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_product", {
    p_kind: p.kind,
    p_category_id: p.categoryId,
    p_name_ar: p.name,
    p_slug: p.slug,
    p_price_ils: p.price,
  });
  if (error) return fail(error, "admin_create_product");
  revalidatePath("/admin/products");
  redirect(`/admin/products/${data as string}?created=1`);
}

const ProductFields = z.object({
  id: z.uuid(),
  name: text(120).min(1),
  slug,
  family: text(60),
  description: text(2000),
  price: reqInt,
  volume: optInt,
  categoryId: z.uuid(),
  sort: z.coerce.number().int(),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function updateProduct(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = ProductFields.safeParse({ ...Object.fromEntries(form), active: form.get("active") });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "slug") return { ok: false, message: "الرابط: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل oud-malaki." };
    if (field === "name") return { ok: false, message: "اكتب اسم المنتج." };
    return INVALID;
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_product", {
    p_id: p.id,
    p_name_ar: p.name,
    p_slug: p.slug,
    p_family_ar: p.family,
    p_description_ar: p.description,
    p_price_ils: p.price,
    p_volume_ml: p.volume,
    p_category_id: p.categoryId,
    p_sort: p.sort,
    p_is_active: p.active,
  });
  if (error) return fail(error, "admin_update_product");
  revalidateCatalog(p.id);
  return { ok: true, message: "حُفظ المنتج." };
}

// Photos are saved by POST /api/admin/product-image (sharp makes the WebP files there).

// ---------- Delete / archive / restore (owner only) ----------

const owner = (next: string) => requireRole(["owner"], next);

/**
 * admin_delete_product decides: refused while in a shown bundle (P0014), archived when the product has history,
 * otherwise deleted. After a real delete its photo files go from Storage too (Postgres can't remove them); if that
 * fails the product is still gone and only orphan files stay, so it is logged, not shown.
 */
export async function deleteProduct(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return INVALID;
  await owner(`/admin/products/${id}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_product", { p_id: id });
  if (error) return fail(error, "admin_delete_product");
  const { outcome, name_ar } = data as { outcome: "deleted" | "archived"; name_ar: string };

  if (outcome === "deleted") {
    const bucket = supabase.storage.from("products");
    const { data: files, error: listError } = await bucket.list(id, { limit: 100 });
    const paths = (files ?? []).map((f) => `${id}/${f.name}`);
    const removed = paths.length ? await bucket.remove(paths) : { error: null };
    if (listError || removed.error) console.error("deleteProduct: files kept", id, (listError ?? removed.error)?.message);
  }

  revalidateCatalog();
  redirect(`/admin/products?${outcome}=${encodeURIComponent(name_ar)}`);
}

/** Back in the admin lists, still hidden: the owner checks it and shows it from «التفاصيل». */
export async function restoreProduct(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return INVALID;
  await owner(`/admin/products/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_restore_product", { p_id: id });
  if (error) return fail(error, "admin_restore_product");
  revalidateCatalog(id);
  redirect(`/admin/products/${id}?restored=1`);
}

// ---------- Options and values ----------

const OptionFields = z.object({
  productId: z.uuid(),
  optionId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
  name: text(40).min(1),
  kind: z.enum(["size", "color", "text"]),
  sort: z.coerce.number().int(),
});

export async function saveOption(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = OptionFields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "اكتب اسم الخيار، مثل «المقاس» أو «اللون»." };
  const o = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_option", {
    p_product_id: o.productId,
    p_option_id: o.optionId,
    p_name_ar: o.name,
    p_kind: o.kind,
    p_sort: o.sort,
  });
  if (error) return fail(error, "admin_save_option");
  revalidateCatalog(o.productId);
  return { ok: true, message: o.optionId ? "حُفظ الخيار." : "أُضيف الخيار." };
}

export async function deleteOption(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const ids = z.object({ productId: z.uuid(), optionId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!ids.success) return INVALID;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_option", { p_option_id: ids.data.optionId });
  if (error) return fail(error, "admin_delete_option");
  revalidateCatalog(ids.data.productId);
  return { ok: true, message: "حُذف الخيار." };
}

const ValueFields = z.object({
  productId: z.uuid(),
  optionId: z.uuid(),
  valueId: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
  label: text(40).min(1),
  hex: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()),
});

export async function saveOptionValue(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = ValueFields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "اكتب القيمة، مثل «L» أو «أسود»." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_option_value", {
    p_option_id: v.optionId,
    p_value_id: v.valueId,
    p_label_ar: v.label,
    p_hex: v.hex,
    p_sort: null,
  });
  if (error) return fail(error, "admin_save_option_value");
  revalidateCatalog(v.productId);
  return { ok: true, message: v.valueId ? "حُفظت القيمة." : "أُضيفت القيمة." };
}

export async function deleteOptionValue(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const ids = z.object({ productId: z.uuid(), valueId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!ids.success) return INVALID;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_option_value", { p_value_id: ids.data.valueId });
  if (error) return fail(error, "admin_delete_option_value");
  revalidateCatalog(ids.data.productId);
  return { ok: true, message: "حُذفت القيمة." };
}

// ---------- Variants ----------

export async function generateVariants(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const ids = z.object({ productId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!ids.success) return INVALID;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_generate_variants", { p_product_id: ids.data.productId });
  if (error) return fail(error, "admin_generate_variants");
  revalidateCatalog(ids.data.productId);
  const n = typeof data === "number" ? data : 0;
  return {
    ok: true,
    message: n === 0 ? "كل التركيبات موجودة، لم تُضف نسخ جديدة." : n === 1 ? "وُلّدت نسخة واحدة جديدة." : `وُلّدت ${n} نسخ جديدة.`,
  };
}

const VariantFields = z.object({
  productId: z.uuid(),
  variantId: z.uuid(),
  sku: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  label: text(80),
  price: optInt,
  threshold: reqInt,
  sort: z.coerce.number().int(),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function updateVariant(_prev: ActionState, form: FormData): Promise<ActionState> {
  await staff();
  const parsed = VariantFields.safeParse({ ...Object.fromEntries(form), active: form.get("active") });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "sku") return { ok: false, message: "رمز SKU: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل cap-black-l." };
    return INVALID;
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_variant", {
    p_variant_id: v.variantId,
    p_sku: v.sku,
    p_label_ar: v.label,
    p_price_ils: v.price,
    p_low_stock_threshold: v.threshold,
    p_is_active: v.active,
    p_sort: v.sort,
  });
  if (error) return fail(error, "admin_update_variant");
  revalidateCatalog(v.productId);
  return { ok: true, message: "حُفظت النسخة." };
}

// ---------- Bundles ----------

const BundleInput = z.object({
  productId: z.uuid(),
  price: reqInt,
  items: z.array(z.object({ variant_id: z.uuid(), qty: z.number().int().min(1).max(20) })).max(20),
});

export async function setBundle(input: z.input<typeof BundleInput>): Promise<ActionState> {
  await staff();
  const parsed = BundleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "محتوى البكجة غير صحيح: الكمية من 1 إلى 20، و20 قطعة على الأكثر." };
  const b = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_bundle", { p_product_id: b.productId, p_price_ils: b.price, p_items: b.items });
  if (error) return fail(error, "admin_set_bundle");
  revalidateCatalog(b.productId);
  return { ok: true, message: "حُفظت البكجة." };
}
