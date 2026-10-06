# SealStage

The product card: the logo's double-ring seal as a circular stage holding the product's transparent photo, then name, meta, price and the add-to-order button.

- Markup: `article.ad-card` > `.ad-seal` (brass outer ring, `space-2` gap) > `.ad-seal__disc` (the product image goes inside), then `.ad-card__body`.
- The consumer provides: `name_ar`, one meta line (family or key ingredient, then volume), `price_ils`, and a transparent product image (PNG, served as WebP/AVIF by next/image).
- Optional `.ad-tag` inside the disc for "جديد" or "كمية محدودة", in `oud`. One tag at most.
- The seal is always a perfect circle (`radius-seal`) with exactly two rings, as in the logo. Don't add a third ring or a card background around it.
- Hover or keyboard focus tilts the product 25° in CSS perspective and lights `shadow-glow` on the ring; that is the card's only hover effect.
- Grid: 248px cards, `space-6` gap; two per row on phones.
- Shelf grid (`ul.ad-shelf`): 248px columns centered on desktop; under 600px, two fluid columns with a `space-4` gap so two cards fit at 360px. In a row, price and button line up at the bottom.
- Under 480px `.ad-card__row` stacks: price above a full-width button (a 48px button and the price don't fit side by side in a ~156px card).
- `.ad-card--lg` is the product page: a 440px seal, the name in `display-md` as the page's `h1`, start-aligned body, side by side from 840px.
- Out of stock (`.ad-card--out`): only `.ad-seal__disc` is dimmed; name, meta and price stay at full contrast, and the button is disabled and says «نفدت الكمية». Low stock shows the «كمية محدودة» tag (kept on one line).
- The disc holds `.ad-seal__img` (next/image, `object-fit: contain`), which tilts 25° in perspective on hover or focus; no tilt under `prefers-reduced-motion`. There are no 3D product models.
- The meta line is `family_ar` (falling back to the category name), then the volume: «عطر شرقي، 100 مل».
- Phase D: the card reads the product's variants. The price is the lowest variant price, shown as «من ₪ 45» when variant prices differ. A product with nothing to choose adds its one variant directly; a product with options (size, colour) has a ghost link «اختر اللون والمقاس» to its page instead of «أضف للطلب». Stock on the card is the best across variants (one in stock is enough).
- On the product page the price row is replaced by the purchase block: `VariantPicker`, then the chosen variant's price and button, then the «كمية محدودة» line. The low-stock tag on the disc is card-only.
