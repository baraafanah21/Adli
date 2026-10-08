# ضغط ميديا الصالون (`compress.mjs`)

بيحوّل صور وفيديوهات الصالون لملفات جاهزة لـ «من الكرسي» (U5.3)، ضمن حدود الـ bucket `gallery`: فيديو ≤ 20 ثانية و ≤ 5 MB، webp و mp4 بس. كله محلي: بيقرأ `salon-media/` وبيكتب `salon-media/out/`، والاثنين برّا git (`.gitignore`). ولا ملف ميديا بيدخل الريبو.

## المتطلبات

- `ffmpeg` و `ffprobe` (`sudo apt install ffmpeg`)
- `sharp` (موجود بالمشروع)

## الاستعمال

```bash
cp scripts/media/manifest.example.json salon-media/manifest.json   # أول مرة، وبعدين عدّله
npm run media:compress                     # كل العناصر
npm run media:compress -- --dry-run        # بيفحص الـ manifest والمقاطع بدون ما يكتب إشي
npm run media:compress -- --only <id>      # عنصر واحد (report.json بيصير فيه هالعنصر بس)
npm run media:compress -- --audio          # بيضل الصوت (AAC 96k). الافتراضي بدون صوت
```

## الـ manifest (`salon-media/manifest.json`)

```json
{ "version": 1, "items": [
  { "id": "v-line-design", "file": "IMG_0412.mov", "start": 6.8, "duration": 8.4, "poster": 7.6 },
  { "id": "salon-chair", "file": "photos/chair.jpg" }
] }
```

| الحقل | | |
|---|---|---|
| `id` | إجباري | أحرف لاتينية صغيرة وأرقام وشرطات، وما بيتكرر. هو اسم ملفات الناتج |
| `file` | إجباري | مسار جوّا `salon-media/` (مش جوّا `out/`). النوع من الامتداد: `.mp4 .mov .m4v .webm .mkv` فيديو، و `.jpg .jpeg .png .webp .avif` صورة |
| `start` | فيديو، اختياري | ثانية البداية بالأصل (الافتراضي 0) |
| `duration` | فيديو، اختياري | طول المقطع (الافتراضي لآخر الفيديو). بيفشل إذا المقطع أطول من 20 ث |
| `poster` | فيديو، اختياري | ثانية لقطة الـ poster **بالأصل**، ولازم تكون جوّا المقطع (الافتراضي بعد ثانية من البداية) |

أي حقل ثاني (مثلاً `why`، `faces`) للمراجعة بس، والسكربت ما بيقرأه.

HEIC ما بينقرأ هون (sharp المنزّل بيقرأ AVIF بس). صدّر الصورة JPEG أول.

## الناتج (`salon-media/out/`)

**الفيديو**
- `<id>.mp4`: H.264 (High، yuv420p)، والتدوير مطبّق (بدون علامة rotation). الطول الأقصر min(720، الأصل)، يعني ما في تكبير. أقصى 30 fps. CRF 26، و `-movflags +faststart`، وبدون ميتاداتا، وبدون صوت.
- إذا طلع أكبر من 5 MB، بيعيد الضغط بـ CRF 28 ثم 30 ثم 32 ثم 34. إذا لسا أكبر، بيفشل وبيطلب تقصّر المقطع.
- `<id>.poster.webp` (عرض 1080، q82) و `<id>.poster.sm.webp` (عرض 480، q78)، من لحظة `poster`. ما في تكبير: فيديو عرضه 576 بيعطي poster عرضه 576.

**الصورة** (نفس طريقة صور المنتجات: `.rotate()` وبدون ميتاداتا)
- `<id>.webp` (عرض 1600، q82) و `<id>.sm.webp` (عرض 480، q78). ما في تكبير.

**`report.json`**: لكل عنصر `kind`، `width`، `height`، `duration_ms`، `bytes`، وهي نفس قيم `gallery_items`.

## الأخطاء

كل خطأ بيوقّف السكربت (exit 1) برسالة عربية بتحكي شو بيتصلّح بالـ manifest: ملف مش موجود، مسار برّا `salon-media/`، `id` مكرر، مقطع أطول من 20 ث، poster برّا المقطع، فيديو أكبر من 5 MB حتى بـ CRF 34، HEIC، أو ffmpeg مش منزّل.
