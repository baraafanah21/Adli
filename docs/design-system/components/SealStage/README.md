# SealStage

The product card: the logo's double-ring seal as a circular turntable holding the product's 3D model, then name, meta, price and the add-to-order button.

- Markup: `article.ad-card` > `.ad-seal` (brass outer ring, `space-2` gap) > `.ad-seal__disc` (the R3F `<View>` or the fallback PNG goes inside), then `.ad-card__body`.
- The consumer provides: `name_ar`, one meta line (family or key ingredient, then volume), `price_ils`, and a model path or a transparent PNG.
- Optional `.ad-tag` inside the disc for "جديد" or "كمية محدودة", in `oud`. One tag at most.
- The seal is always a perfect circle (`radius-seal`) with exactly two rings, as in the logo. Don't add a third ring or a card background around it.
- Hover or keyboard focus turns the turntable 25° and lights `shadow-glow` on the ring; that is the card's only hover effect.
- Grid: 248px cards, `space-6` gap; two per row on phones.
