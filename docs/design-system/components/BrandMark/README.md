# BrandMark

The Adli logo on the site. `src/components/brand/BrandMark.tsx`. It only shows the traced files in `public/brand/`
(see `public/brand/README.md`); nothing in the code draws or types any part of the logo.

```tsx
<BrandMark kind="seal" width={36} />                              // colour seal, decorative
<BrandMark kind="wordmark" tone="mono" height={30} />             // takes the parent's `color`
<BrandMark kind="logo" tone="mono" width={136} label="عدلي" />   // announced as an image
<BrandMark kind="bottle" tone="mono" height={26} />               // the cart
```

- `kind`: `seal` · `wordmark` · `logo` · `bottle`.
- `tone="color"` (default): the file as `<img>` (next/image, `unoptimized`). Seal, wordmark and logo only.
- `tone="mono"`: the `-mono` file as a CSS mask over `currentColor` (`.ad-mark--mono` in `components.css`), so it
  takes the parent's text colour. The wordmark and the full logo are forest only: on a dark ground use mono.
- Give `width` or `height`; the other follows the file's viewBox, so the box is fixed before the file loads (no CLS).
- Without `label` the mark is `aria-hidden`. Give a `label` when it is the only content of a link or a heading.
- README minimums: seal 24px, full logo 120px wide. Keep clear space of at least the ring width around the seal.
- Never: stretch, recolour inside the seal, outline, shadow, or animate the mark.

Where each one is used: the table in `docs/design-system/brand-book.md` («الشعار»).
