import { formatWeekdayTime } from "@/lib/dates";
import { PHONE_MESSAGES } from "@/lib/phone";

/*
  Errors from the admin_* functions → Arabic that says what to do. Used by every admin Server Action.
  Codes: supabase/migrations/20261007000200_admin_products.sql (and 0000 / 0100 for orders, 0700 / 0800 for bookings,
  1000 for deleting / archiving products).
*/

export type ActionState = { ok: boolean; message: string } | null;

type DbError = { code?: string; message?: string; details?: string | null };

const UNIQUE: Record<string, string> = {
  products_slug_key: "هذا الرابط مستعمل لمنتج آخر. اختر رابطاً مختلفاً.",
  product_variants_sku_key: "رمز SKU هذا مستعمل لنسخة أخرى. اختر رمزاً مختلفاً.",
  product_options_product_id_name_ar_key: "للمنتج خيار بهذا الاسم من قبل.",
  product_option_values_option_id_label_ar_key: "هذه القيمة موجودة في هذا الخيار من قبل.",
  categories_slug_key: "هذا الرابط مستعمل لفئة أخرى. اختر رابطاً مختلفاً.",
  services_slug_key: "هذا الرابط مستعمل لخدمة أخرى. اختر رابطاً مختلفاً.",
  barbers_user_id_key: "هذا الحساب مربوط بحلاق آخر. افصله عنه أولاً.",
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
  services_slug_check: "رابط الخدمة: حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل full-cut.",
  services_name_ar_check: "اسم الخدمة من حرف إلى 60 حرفاً.",
  services_price_ils_check: "السعر رقم صحيح من 0 إلى 10000.",
  services_duration_min_check: "المدة بالدقائق من 5 إلى 240، ومن مضاعفات 5.",
  services_bookable_needs_duration: "الخدمة التي تُحجز من الموقع تحتاج مدة.",
  barbers_name_ar_check: "اسم الحلاق من حرف إلى 40 حرفاً.",
  closures_reason_check: "السبب 200 حرف على الأكثر.",
};

const RAISED: Record<string, string> = {
  too_many_combinations: "التركيبات أكثر من 100 نسخة. قلّل القيم أو الخيارات.",
  image_path_invalid: "تعذّر حفظ الصورة. ارفعها من جديد.",
  items_invalid: "محتوى البكجة غير صحيح: الكمية من 1 إلى 20، و20 قطعة على الأكثر.",
  not_a_bundle: "هذا المنتج ليس بكجة.",
  not_a_simple_product: "توليد النسخ للمنتجات العادية فقط، لا للبكجات.",
  kind_invalid: "اختر نوع المنتج: منتج أو بكجة.",
  phone_invalid: `${PHONE_MESSAGES.number} الرقم اختياري، فتقدر تتركه فارغاً.`,
  start_off_grid: "اختر وقتاً على رأس 5 دقائق، مثل 4:05 أو 4:10.",
  reason_required: "اكتب السبب، فهو يظهر للزبون.",
  paid_invalid: "اكتب المبلغ المدفوع بالشيكل، رقماً من 0 إلى 10000.",
  home_products_invalid: "اختر 4 منتجات على الأكثر، كل منتج في مكان واحد.",
  home_product_unavailable: "أحد المنتجات المختارة مخفي أو مؤرشف أو حُذف. حدّث الصفحة واختر منتجاً ظاهراً.",
  not_completed: "المبلغ يُعدَّل للمواعيد المسجّلة «حضر» فقط. حدّث الصفحة.",
  range_invalid: "وقت النهاية يجب أن يكون بعد البداية، ولمدة 31 يوماً على الأكثر.",
  weekly_invalid: "اختر اليوم، ووقت نهاية بعد البداية.",
  hours_invalid: "وقت الإغلاق يجب أن يكون بعد الفتح.",
  block_reason_required: "اكتب سبب الحظر (3 أحرف على الأقل). يبقى في سجل الزبون، ولا يراه الزبون.",
  note_too_long: "الملاحظة 1000 حرف على الأقصى.",
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
      return msg.includes("barbers_user_id_fkey")
        ? "الحساب المختار ليس في الطاقم. أضفه للطاقم أولاً من «الطاقم»."
        : "الفئة أو المنتج المختار لم يعد موجوداً. حدّث الصفحة.";
    case "22023":
      return named(RAISED) ?? "بعض القيم غير صحيحة. راجع الحقول وحاول مرة أخرى.";
    case "P0006":
      return "لم نجد هذا العنصر. ربما حُذف. حدّث الصفحة.";
    case "P0011":
      return "هذه القيمة مستعملة في نسخ. أخفِ النسخ بدلاً من حذفها.";
    case "P0013":
      return "أضف قيمة واحدة على الأقل لكل خيار قبل توليد النسخ.";
    case "P0014":
      return `هذا المنتج داخل بكجة ظاهرة${error.details ? `: «${error.details}»` : ""}. أخرجه منها أو أخفِها أولاً، ثم احذفه.`;
    case "P0015":
      return "هذا المنتج مؤرشف، فلا يُعدَّل ولا يوضع في بكجة. استرجعه من «المؤرشفة» أولاً.";
    case "P0003":
      return "لا يمكن إزالة آخر صاحب صالون أو تحويله إلى طاقم. أضف صاحب صالون آخر أولاً.";
    case "P0005":
      return "هذا البريد لم يسجّل في الموقع بعد. اطلب منه إنشاء حساب ثم أضفه.";
    case "P0012":
      return "هذا الشخص في الطاقم من قبل. عدّل دوره من القائمة.";
    case "P0029":
      return "هذا الحساب محظور. ارفع الحظر من صفحة الزبون أولاً.";
    case "P0030":
      return "هذا الزبون محظور من قبل. حدّث الصفحة.";
    case "P0020":
      return "هذا الوقت غير متاح لهذا الحلاق: محجوز أو مسكّر أو خارج الدوام. اختر وقتاً آخر.";
    case "P0021":
      return "هذا الوقت خارج المسموح: من ساعة مضت حتى 7 أيام قدّام.";
    case "P0025":
      return `عند هذا الحلاق ${error.details ?? ""} مواعيد قادمة. ألغها أو انقلها لحلاق آخر، ثم عطّله.`;
    case "P0026":
      return conflictMessage(error.details);
    case "P0027":
      return "هذه الخدمة أو هذا الحلاق غير متاح. اختر غيره.";
    case "P0028":
      return "تغيّرت حالة هذا الموعد، أو هذه الخطوة غير ممكنة الآن. حدّث الصفحة.";
    // «زبايننا المرتّبين» (admin_gallery_*)
    case "P0031":
      return "المرآة تعرض فيديو فقط. اختر فيديو.";
    case "P0032":
      return "انشر الفيديو أولاً، ثم اعرضه في المرآة.";
    case "P0033":
      return "تغيّر المعرض أثناء الترتيب. حدّث الصفحة ورتّب من جديد.";
    case "P0034":
      return "تعذّر حفظ ملفات هذا العنصر. ارفعه من جديد.";
    case "P0035":
      return "الفيديو أطول من 20 ثانية. قصّه ثم ارفعه.";
    case "P0036":
      return "الملف أكبر من 5 ميغابايت. اضغطه ثم ارفعه.";
    case "P0037":
      return "الخلفية تكون صورة فقط، مش فيديو.";
    default:
      return "تعذّر الحفظ. تأكد من الاتصال وحاول مرة أخرى.";
  }
}


/** P0026: the bookings in the way, by code and time, so the salon knows what to move first. */
function conflictMessage(details?: string | null) {
  let list: { code: string; starts_at: string; customer_name: string | null; barber_name_ar: string | null }[] = [];
  try {
    list = JSON.parse(details ?? "[]");
  } catch {}
  const shown = list
    .slice(0, 5)
    .map((c) => `${c.code} (${[c.customer_name, c.barber_name_ar, formatWeekdayTime(c.starts_at)].filter(Boolean).join("، ")})`);
  const more = list.length > 5 ? ` و${list.length - 5} غيرها` : "";
  return `يتعارض مع مواعيد قائمة: ${shown.join("، ")}${more}. ألغها أو انقلها أولاً، أو اختر وقتاً آخر.`;
}

/** Codes that are the user's to fix; anything else is logged on the server. */
export const isExpectedAdminError = (code?: string) =>
  !!code &&
  [
    "42501", "23505", "23514", "23503", "22023", "P0003", "P0005", "P0006", "P0011", "P0012", "P0013", "P0014", "P0015", "P0029", "P0030",
    "P0020", "P0021", "P0025", "P0026", "P0027", "P0028", "P0031", "P0032", "P0033", "P0035", "P0036", "P0037",
  ].includes(code);
