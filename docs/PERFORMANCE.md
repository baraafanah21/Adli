# الأداء والكاش (المرحلة G)

القياس على الموقع الحي `adli-salon.vercel.app` (منطقة fra1). لا توجد صفحة `/shop`: الرف في الرئيسية (`/#shelf`).

## طريقة القياس

- **Lighthouse 12.8، موبايل** (المحاكاة الافتراضية: Moto G Power، 4G بطيء، المعالج ×4)، أداء فقط، 3 مرات لكل صفحة، والجدول يعرض الوسيط. Chrome headless shell 155. السكربت خارج المستودع: `lighthouse --only-categories=performance --form-factor=mobile` لكل صفحة.
- **TTFB الحقيقي**: `curl -w %{time_starttransfer}`، 5 طلبات لكل صفحة من جهاز التطوير (فلسطين ← fra1)، والرقم هو المدى.
- **INP**: Lighthouse لا يقيسه (يقيس TBT بدلاً منه). يُقاس في G3 على جوال حقيقي بـ `web-vitals` على ثلاث تفاعلات: «أضف للطلب»، اختيار نسخة، اختيار وقت حجز.
- **الحزمة**: `next build` (`.next/diagnostics/route-bundle-stats.json`: JS أول تحميل بلا ضغط) و`next experimental-analyze -o`، وأحجام gzip لكل chunk.

## قبل (7 أكتوبر 2026، commit `9f5a243`)

كل الصفحات ديناميكية (`ƒ`): `SiteChrome` و`SiteHeader` يقرآن الجلسة من الكوكيز، فالرد `Cache-Control: private, no-cache, no-store` و`x-vercel-cache: MISS`، وكل زيارة تمر بـ Supabase.

### Lighthouse موبايل (الوسيط من 3)

| الصفحة | الدرجة | LCP | FCP | CLS | TBT | TTFB (Lighthouse) | JS منقول | عنصر LCP |
|---|---|---|---|---|---|---|---|---|
| `/` | 56 | 3.36s | 0.97s | 0 | (انظر الملاحظة) | 68ms | 317KB | بوستر القنينة `<img>` |
| `/c/perfumes` | 97 | 2.64s | 0.99s | 0 | 21ms | 64ms | 161KB | فقرة الوصف |
| `/p/oud-malaki` | 98 | 2.50s | 1.00s | 0 | 36ms | 66ms | 162KB | صورة المنتج |
| `/booking` | 97 | 2.51s | 1.01s | 0 | 52ms | 62ms | 228KB | فقرة المقدمة |

- **TBT في الرئيسية غير صالح للمقارنة**: القنينة الحية تُرسم بـ WebGL برمجي (SwiftShader) في Chrome headless، فحلقة الرسم تشغل الخيط الرئيسي طوال القياس. الجوال الحقيقي يرسم بالـ GPU. يبقى المهم: LCP الرئيسية 3.36s، فوق الهدف (2.5s).
- JS المنقول في الرئيسية يشمل three.js (حوالي 145KB gzip) لأنه يتحمّل أثناء القياس، بعد أول رسم.
- عنصر LCP في الرئيسية هو البوستر وعليه class `hidden`: القنينة الحية ظهرت فوقه أثناء القياس.

### TTFB الحقيقي (curl، 5 طلبات)

| الصفحة | TTFB |
|---|---|
| `/` | 0.38–0.49s |
| `/c/perfumes` | 0.31–0.47s |
| `/p/oud-malaki` | 0.32–0.44s |
| `/booking` | 0.34–0.46s |

### JS أول تحميل (بلا ضغط، من `next build`)

| الصفحة | JS |
|---|---|
| `/` | 523KB |
| `/c/[slug]` | 510KB |
| `/p/[slug]` | 513KB |
| `/booking` | 762KB |
| `/login` | 754KB |

### أكبر 5 في حزمة العميل

| # | الحزمة | gzip | أين |
|---|---|---|---|
| 1 | three.js | 145KB | الرئيسية فقط، dynamic import بعد أول رسم (ليس في أول تحميل) |
| 2 | react-dom + App Router | 69KB | كل الصفحات |
| 3 | supabase-js (GoTrue، Realtime، PostgREST) | 65KB | أول تحميل في `/booking` و`/login` و`/signup` و`/auth/*` ومحرر المنتج |
| 4 | Next.js runtime | 34KB | كل الصفحات |
| 5 | كود الموقع + lenis | 16KB | كل الصفحات العامة |

`gsap` كان في `package.json` وغير مستعمل في أي ملف (لم يدخل الحزمة)، وحُذف في G1.

## بعد

يُملأ في G3.
