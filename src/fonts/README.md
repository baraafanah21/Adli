# Fonts (P-A)

Self-hosted subsets of the two site fonts, loaded with `next/font/local` in `src/app/layout.tsx`. Built from the upstream
files in google/fonts (Amiri 1.002, Readex Pro 1.205, the versions Google Fonts serves) by `scripts/fonts/build-fonts.sh`.
Both are under the SIL Open Font License 1.1 (`Amiri-OFL.txt`, `ReadexPro-OFL.txt`); subsetting is allowed, and neither
"Amiri" nor "Readex Pro" is a Reserved Font Name.

| File | What | Loaded |
|---|---|---|
| `readex-pro.woff2` | Readex Pro, weight 160–700 (variable, the width axis pinned as Google serves it), Arabic + Latin + ₪ | preloaded on every page |
| `amiri-regular-arabic.woff2`, `amiri-bold-arabic.woff2` | Amiri 400 / 700: Arabic letters, diacritics, punctuation, space, digits | where a display style is used, no preload |
| `amiri-regular-latin.woff2`, `amiri-bold-latin.woff2` | Amiri 400 / 700: Latin letters, digits and punctuation (as Google's latin file) | only when an Amiri heading has one of them |

The shaping features the browser applies on its own are kept (GSUB / GPOS: ccmp, locl, init / medi / fina, rlig, calt,
liga, mark / mkmk, curs, kern); the stylistic sets are dropped. Unhinted, as Google serves them. After changing a range
or a version: rebuild, update the `unicode-range` values in `layout.tsx` to match, and compare the home page headings
and a product page title with screenshots (they must be identical).
