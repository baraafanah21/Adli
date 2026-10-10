#!/usr/bin/env bash
# Rebuilds src/fonts/*.woff2 from the upstream fonts (google/fonts, the same versions Google Fonts serves: Amiri 1.002,
# Readex Pro 1.205). Not part of `npm run build`: run it by hand when a range or a version changes, then check the
# headings (see src/fonts/README.md). Needs Python 3 with fonttools and brotli:
#   python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli && PY=/tmp/fontenv/bin/python scripts/fonts/build-fonts.sh
set -euo pipefail

PY="${PY:-python3}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/src/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
RAW="https://raw.githubusercontent.com/google/fonts/main/ofl"

curl -fsSL -o "$WORK/Amiri-Regular.ttf" "$RAW/amiri/Amiri-Regular.ttf"
curl -fsSL -o "$WORK/Amiri-Bold.ttf" "$RAW/amiri/Amiri-Bold.ttf"
curl -fsSL -o "$WORK/ReadexPro.ttf" "$RAW/readexpro/ReadexPro%5BHEXP%2Cwght%5D.ttf"
curl -fsSL -o "$OUT/Amiri-OFL.txt" "$RAW/amiri/OFL.txt"
curl -fsSL -o "$OUT/ReadexPro-OFL.txt" "$RAW/readexpro/OFL.txt"

# Keep in step with the unicode-range values in src/app/layout.tsx.
# Amiri, Arabic file: the Arabic letters and diacritics, Arabic punctuation, پ چ ڤ گ ک ی, and the space, digits and ASCII
# punctuation (so a heading with a space doesn't pull in the Latin file, as Google's split did).
AMIRI_ARABIC="U+0020-0040,U+005B-0060,U+007B-007E,U+00A0,U+00AB,U+00BB,U+00D7,U+060C,U+061B,U+061F,U+0621-0652,U+0640,U+0670,U+067E,U+0686,U+06A4,U+06A9,U+06AF,U+06CC,U+200C-200F,U+2010-2014,U+2018-201D,U+2026,U+25CC"
# Amiri, Latin file: what Google's latin file had (ASCII punctuation, digits, Latin letters, Latin-1, dashes and quotes),
# except the space, the no-break space and the joiners / bidi marks, which stay with the Arabic. Listed first in
# --font-amiri, so these always come from here as before: "9pm" stays one run with its kerning, and a hyphen beside
# Arabic keeps its Latin shape (in an Arabic run Amiri slants it). The Arabic file's copies are only a fallback.
AMIRI_LATIN="U+0021-007E,U+00A1-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2010-2027,U+2030-205E,U+20AC,U+2122"
# Readex Pro: Google's latin + arabic subsets in one file, plus ₪ (which pulled in the whole latin-ext file before).
READEX="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AA,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0600-06FF,U+25CC"

# Unhinted, like the files Google serves; fontTools' default layout features (everything the browser applies on its
# own; the stylistic sets, aalt and dlig are dropped, as Google drops them).
for w in Regular Bold; do
  lw="$(echo "$w" | tr '[:upper:]' '[:lower:]')"
  "$PY" -m fontTools.subset "$WORK/Amiri-$w.ttf" --unicodes="$AMIRI_ARABIC" --no-hinting --flavor=woff2 --output-file="$OUT/amiri-$lw-arabic.woff2"
  "$PY" -m fontTools.subset "$WORK/Amiri-$w.ttf" --unicodes="$AMIRI_LATIN" --no-hinting --flavor=woff2 --output-file="$OUT/amiri-$lw-latin.woff2"
done
# Readex Pro: the width axis (HEXP) pinned at 0 as Google serves it; the weight axis whole (160–700), as Google serves it:
# narrowing it rescales the deltas and moves a few points (a shadda shifted).
"$PY" -m fontTools.varLib.instancer "$WORK/ReadexPro.ttf" HEXP=0 -q -o "$WORK/readex-inst.ttf"
"$PY" -m fontTools.subset "$WORK/readex-inst.ttf" --unicodes="$READEX" --no-hinting --flavor=woff2 --output-file="$OUT/readex-pro.woff2"

ls -l "$OUT"/*.woff2
