# البناء: Supabase وVercel

## الحزمة

- Next.js (App Router) + TypeScript، منشور على Vercel.
- `lenis` (smooth scroll). `gsap` was removed in Phase G: nothing used it; motion is CSS.
- `@supabase/supabase-js` و`@supabase/ssr`.
- الألوان والمسافات من `tokens.css` لهذا النظام كمتغيرات CSS؛ Tailwind اختياري ويقرأ نفس المتغيرات.

## الجداول في Supabase

| الجدول | الأعمدة الأساسية |
|---|---|
| `categories` | id، slug (عشر فئات: `perfumes`، `shavers`، `caps`، …)، name_ar، icon (من مجموعة ثابتة في `icons.tsx`)، description_ar، is_active، sort |
| `products` | id، category_id، slug، name_ar، family_ar، description_ar، price_ils (integer)، volume_ml، image_path، kind (`simple` / `bundle`)، is_active |
| `product_options` | id، product_id، name_ar («المقاس»، «اللون»)، kind (`size` / `color` / `text`)، sort |
| `product_option_values` | id، option_id، label_ar، hex (للألوان فقط)، sort |
| `product_variants` | id، product_id، sku (فريد، وهو `?v=` في الرابط)، option_value_ids، label_ar (اختياري)، price_ils (فارغ = سعر المنتج)، stock_quantity، low_stock_threshold، stock_state (مولّد: in / low / out)، is_active |
| `bundle_items` | bundle_product_id، variant_id، qty |
| `orders` | id، code (مثل `AD-1042`)، idempotency_key، customer_name، area، phone، total_ils، status، user_id (اختياري)، created_at |
| `order_items` | order_id، product_id، variant_id، name_ar، variant_name_ar، volume_ml، unit_price_ils، qty |
| `profiles` | id (= المستخدم)، full_name، area، phone |
| `user_roles` | user_id، role (`owner` / `staff`)، is_barber، granted_by |

- صور المنتجات (WebP) في Supabase Storage (bucket عام `products`).
- لكل منتج نسخة واحدة على الأقل. المنتج البسيط له نسخة افتراضية بلا قيم خيارات، مخفية في الواجهة، فالمخزون والطلب دائماً على مستوى النسخة. الخيارات والقيم والنسخ ومحتوى البكجات بيانات فقط: تُضاف بلا تغيير في الكود.
- البكجة منتج `kind = 'bundle'` بسعر ثابت ونسخة افتراضية واحدة، ومحتواها في `bundle_items`. حالتها من مكوناتها: `out` إذا نفد أي مكوّن، `low` إذا قلّ أي مكوّن، وإلا `in`.
- الكميات لا تظهر للزبائن: `stock_quantity` غير ممنوح لـ anon وauthenticated (صلاحيات على مستوى الأعمدة)، والموقع يقرأ `stock_state` أو view `variant_availability` (الحالة واسم النسخة). لذلك كل استعلام يسمّي أعمدته، و`select('*')` على `product_variants` مرفوض.
- RLS: القراءة العامة على `categories` و`products` النشطة فقط، والنسخ النشطة لمنتجات نشطة؛ `orders` لا تُقرأ للعامة؛ الزبون المسجّل يقرأ طلباته فقط، والطاقم يقرأ الكل. الطلب يُنشأ فقط عبر دالة `place_order` في القاعدة (`items = [{variant_id, qty}]`): تعيد حساب المجموع من أسعار القاعدة، وتتحقق أن `stock_quantity` يكفي الطلب كله (مع مكونات البكجات)، وتمنع تكرار الطلب بمفتاح `idempotency_key`. خصم المخزون في المرحلة F.
- لوحة تحكم صاحب الصالون: Supabase Auth، والطاقم هو من له صف في جدول `user_roles` (انظر `accounts-and-roles.md`).

## رسالة واتساب

```
مرحباً صالون عدلي، أريد تثبيت طلب رقم AD-1042:
• عود ملكي 100 مل × 1 — ₪ 180
• طاقية سوداء، مقاس L × 1 — ₪ 50
• كريم لحية × 2 — ₪ 90
المجموع: ₪ 320
الاسم: أحمد — المنطقة: رفيديا
```

- السطر: اسم المنتج، ثم اسم النسخة إن وُجد (`variant_name_ar`)، ثم الحجم. البكجة سطر واحد بسعرها الثابت.
- الرابط: `https://wa.me/<رقم الصالون بصيغة دولية بلا +>?text=<encodeURIComponent(message)>`.
- رقم الصالون في متغير بيئة `NEXT_PUBLIC_WHATSAPP_NUMBER` على Vercel.

## متغيرات البيئة على Vercel

`NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`، `NEXT_PUBLIC_WHATSAPP_NUMBER`. لا حاجة لمفتاح service role.
