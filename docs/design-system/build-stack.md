# البناء: Supabase وVercel

## الحزمة

- Next.js (App Router) + TypeScript، منشور على Vercel.
- `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`.
- `gsap` (ScrollTrigger) + `lenis`.
- `@supabase/supabase-js` و`@supabase/ssr`.
- الألوان والمسافات من `tokens.css` لهذا النظام كمتغيرات CSS؛ Tailwind اختياري ويقرأ نفس المتغيرات.

## الجداول في Supabase

| الجدول | الأعمدة الأساسية |
|---|---|
| `categories` | id، slug (`perfumes` / `creams` / `grooming`)، name_ar، sort |
| `products` | id، category_id، slug، name_ar، family_ar، description_ar، price_ils (integer)، volume_ml، model_path، image_path، is_active، stock_status |
| `orders` | id، code (مثل `AD-1042`)، idempotency_key، customer_name، area، items (jsonb)، total_ils، status، created_at |
| `admins` | user_id |

- النماذج والصور في Supabase Storage (bucket عام `products`).
- RLS: القراءة العامة على `categories` و`products` النشطة فقط؛ `orders` لا تُقرأ للعامة. الطلب يُنشأ فقط عبر دالة `place_order` في القاعدة: تعيد حساب المجموع من أسعار القاعدة، وتمنع تكرار الطلب بمفتاح `idempotency_key`.
- لوحة تحكم صاحب الصالون: Supabase Auth، والمدير هو من له صف في جدول `admins`.

## رسالة واتساب

```
مرحباً صالون عدلي، أريد تثبيت طلب رقم AD-1042:
• عود ملكي 100 مل × 1 — ₪ 180
• كريم لحية × 2 — ₪ 90
المجموع: ₪ 270
الاسم: أحمد — المنطقة: رفيديا
```

- الرابط: `https://wa.me/<رقم الصالون بصيغة دولية بلا +>?text=<encodeURIComponent(message)>`.
- رقم الصالون في متغير بيئة `NEXT_PUBLIC_WHATSAPP_NUMBER` على Vercel.

## متغيرات البيئة على Vercel

`NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`، `NEXT_PUBLIC_WHATSAPP_NUMBER`. لا حاجة لمفتاح service role.
