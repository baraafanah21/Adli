## الملخص

<!-- شو تغيّر وليش، بسطرين أو ثلاثة. -->

Closes #

## طريقة الفحص

1. 
2. 

<!-- الصفحات، العروض (390 / 1440)، الثيم، الحساب (زائر / زبون / staff / owner). -->

## لقطات / فيديو

<!-- قبل / بعد، أو مسار فيديو Playwright. -->

## Migrations

- [ ] لا يوجد
- [ ] يوجد: `supabase/migrations/<اسم>.sql` + اختبار `supabase/tests/<اسم>.sql`
  - إضافة فقط (بلا حذف أو إعادة تسمية)، متوافقة مع الكود الحالي على Production
  - طبّقها براء على الداتابيس، ومستشارو الأمان نظيفون

## Checklist

- [ ] `npm run lint` و `npx tsc --noEmit` و `npm run build` والاختبارات ناجحة
- [ ] بدون أسرار أو مفاتيح بأي ملف أو لقطة
- [ ] بدون `salon-media/` ولا `.github/tmp/` ولا `.claude/settings.json`
- [ ] الملفات مضافة بالاسم (لا `git add -A` ولا `git add .`)
- [ ] كل كوميت فيه `Co-authored-by: ahmadshanti <ahmad9shanti@gmail.com>` وبدون أي Co-Authored-By ثاني
- [ ] منطق الحجوزات والطلبات وصلاحيات الأدمن ما تغيّر (أو مشروح فوق)
- [ ] `prefers-reduced-motion` والثيمين والجوال مفحوصين
