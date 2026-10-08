# SealStage

The product card: the product's photo filling a 4:5 frame, with the logo seal as a small badge in its corner, then name, meta, price and the add-to-order button. (Until F6 it was a round seal disc holding a transparent cut-out; the salon now photographs watches, glasses, clothes and boxes, which a circle crops badly.)

- Markup: `article.ad-card` > `.ad-photo` (brass hairline, `space-1` gap, `radius-md`) > `.ad-photo__frame` (the photo, `object-fit: cover`, plus `.ad-photo__seal`), then `.ad-card__body`.
- Two rings, as in the seal: the brass hairline, a small gap, then the photo. Nothing else around it: no card background, no third ring.
- The frame's ratio is fixed (`aspect-ratio: 4 / 5`), so the card has its final size before the photo loads (no layout shift). The photo fills the whole frame; whatever falls outside 4:5 is cropped equally from both sides, so the product must sit in the middle of the photo.
- The badge is the colour seal, `public/brand/adli-seal.svg` through `BrandMark` (32px on cards, 40px on the product page), at the photo's bottom inline-end corner. Colour, not mono: its cream backing keeps it readable on any photo. It is decorative (`aria-hidden`) and never covers the tag. A product without a photo shows the mono seal in `--line-strong`, centred.
- No photo yet: the frame shows the seal alone, centred.
- Loading: cards use the `.sm.webp` as it is (`unoptimized`, no Vercel transformation) and load lazily, except the first card of a category page (its LCP on a phone), which is preloaded; the product page preloads its large photo, resized by next/image.
- The consumer provides: `name_ar`, one meta line (family or key ingredient, then volume), `price_ils`, and the photo path. Cards load the small file (`<uuid>.sm.webp`, covers 480×600), the product page the large one (`<uuid>.webp`, 1600px); see «الصور» in the brand book.
- Optional `.ad-tag` at the frame's top inline-start corner for «جديد» or «كمية محدودة», in `oud` on a solid `surface-sunk` pill, so it reads over any photo. One tag at most, on one line.
- Hover or keyboard focus scales the photo to 1.03 inside the frame and lights `shadow-glow` around it; that is the card's only hover effect. None under `prefers-reduced-motion`.
- Grid: 248px cards, `space-6` gap; two per row on phones.
- Shelf grid (`ul.ad-shelf`): 248px columns centered on desktop; under 600px, two fluid columns with a `space-4` gap so two cards fit at 360px. In a row, price and button line up at the bottom.
- Under 480px `.ad-card__row` stacks: price above a full-width button (a 48px button and the price don't fit side by side in a ~156px card).
- `.ad-card--lg` is the product page: a 440px frame (2px hairline, `space-2` gap), the name in `display-md` as the page's `h1`, start-aligned body, side by side from 840px. The photo there has the product name as its alt text; on cards it is decorative (the name is the link).
- Out of stock (`.ad-card--out`): only the photo (`.ad-photo__frame`) is dimmed; name, meta and price stay at full contrast, and the button is disabled and says «نفدت الكمية».
- «أضف للطلب» flies a rounded-square copy of the card photo (`object-fit: cover`) to the bottle icon in the header.
- The meta line is `family_ar` (falling back to the category name), then the volume: «عطر شرقي، 100 مل».
- Phase D: the card reads the product's variants. The price is the lowest variant price, shown as «من ₪ 45» when variant prices differ. A product with nothing to choose adds its one variant directly; a product with options (size, colour) has a ghost link «اختر اللون والمقاس» to its page instead of «أضف للطلب». Stock on the card is the best across variants (one in stock is enough).
- On the product page the price row is replaced by the purchase block: `VariantPicker`, then the chosen variant's price and button, then the «كمية محدودة» line. The low-stock tag on the frame is card-only.
- The admin uses the same frame: the image picker previews a new photo in `.ad-photo` at 200px before saving, and the product and stock lists show 4:5 cover thumbnails with a brass hairline.
