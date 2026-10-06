/*
  Errors from the admin_* functions → Arabic that says what to do. Used by every admin Server Action.
  Codes: supabase/migrations/20261007000200_admin_products.sql (and 0000 / 0100 for orders).
*/

export type ActionState = { ok: boolean; message: string } | null;

type DbError = { code?: string; message?: string; details?: string | null };

const UNIQUE: Record<string, string> = {
  products_slug_key: "هذا الرابط مستعمل لمنتج آخر. اختر رابطاً مختلفاً.",
  product_variants_sku_key: "رمز SKU هذا مستعمل لنسخة أخرى. اختر رمزاً مختلفاً.",
  product_options_product_id_name_ar_key: "للمنتج خيار بهذا الاسم من قبل.",
  product_option_values_option_id_label_ar_key: "هذه القيمة موجودة في هذا الخيار من قبل.",
  categories_slug_key: "هذا الرابط مستعمل لفئة أخرى. اختر رابطاً مختلفاً.",
};

const CHECKS: Record<string, string> = {
  products_slug_check: "الرابط: حروف إنجليزية صغيرة وأرقام وشرطة فقط، من 2 إلى 80 حرفاً، مثل oud-malaki.",
  product_variants_sku_check: "رمز SKU: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل cap-black-l.",
  products_price_ils_check: "السعر رقم صحيح من 0 فما فوق.",
  product_variants_price_ils_check: "السعر رقم صحيح من 0 فما فوق.",
  products_volume_ml_check: "الحجم رقم أكبر من 0، أو اتركه فارغاً.",
  option_value_hex: "قيمة اللون تحتاج درجة لون، وقيم المقاس والنص بلا لون.",
  bundle_in_bundle: "لا يمكن وضع بكجة داخل بكجة. اختر منتجات عادية.",
  bundle_has_no_options: "البكجة لا تأخذ خيارات (مقاس أو لون).",
  product_kind_locked: "لا يمكن تغيير نوع منتج له خيارات أو داخل بكجة.",
  variant_values_invalid: "كل نسخة تأخذ قيمة واحدة من كل خيار. ولّد النسخ من جديد.",
  categories_slug_check: "رابط الفئة: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل hair-beard.",
  categories_icon_check: "اختر أيقونة من القائمة.",
  categories_description_ar_check: "الوصف القصير 140 حرفاً على الأكثر.",
  categories_name_ar_check: "اسم الفئة من حرف إلى 60 حرفاً.",
};

const RAISED: Record<string, string> = {
  too_many_combinations: "التركيبات أكثر من 100 نسخة. قلّل القيم أو الخيارات.",
  image_path_invalid: "تعذّر حفظ الصورة. ارفعها من جديد.",
  items_invalid: "محتوى البكجة غير صحيح: الكمية من 1 إلى 20، و20 قطعة على الأكثر.",
  not_a_bundle: "هذا المنتج ليس بكجة.",
  not_a_simple_product: "توليد النسخ للمنتجات العادية فقط، لا للبكجات.",
  kind_invalid: "اختر نوع المنتج: منتج أو بكجة.",
};

export function adminErrorMessage(error: DbError): string {
  const msg = error.message ?? "";
  const named = (map: Record<string, string>) => Object.entries(map).find(([k]) => msg.includes(k))?.[1];
  switch (error.code) {
    case "42501":
      return "ليست لديك صلاحية لهذه العملية.";
    case "23505":
      return named(UNIQUE) ?? "هذه القيمة مستعملة من قبل. اختر قيمة مختلفة.";
    case "23514":
      return named(CHECKS) ?? "بعض القيم غير صحيحة. راجع الحقول وحاول مرة أخرى.";
    case "23503":
      return "الفئة أو المنتج المختار لم يعد موجوداً. حدّث الصفحة.";
    case "22023":
      return named(RAISED) ?? "بعض القيم غير صحيحة. راجع الحقول وحاول مرة أخرى.";
    case "P0006":
      return "لم نجد هذا العنصر. ربما حُذف. حدّث الصفحة.";
    case "P0011":
      return "هذه القيمة مستعملة في نسخ. أخفِ النسخ بدلاً من حذفها.";
    case "P0013":
      return "أضف قيمة واحدة على الأقل لكل خيار قبل توليد النسخ.";
    case "P0003":
      return "لا يمكن إزالة آخر صاحب صالون أو تحويله إلى طاقم. أضف صاحب صالون آخر أولاً.";
    case "P0005":
      return "هذا البريد لم يسجّل في الموقع بعد. اطلب منه إنشاء حساب ثم أضفه.";
    case "P0012":
      return "هذا الشخص في الطاقم من قبل. عدّل دوره من القائمة.";
    default:
      return "تعذّر الحفظ. تأكد من الاتصال وحاول مرة أخرى.";
  }
}

/** Codes that are the user's to fix; anything else is logged on the server. */
export const isExpectedAdminError = (code?: string) =>
  !!code && ["42501", "23505", "23514", "23503", "22023", "P0003", "P0005", "P0006", "P0011", "P0012", "P0013"].includes(code);
