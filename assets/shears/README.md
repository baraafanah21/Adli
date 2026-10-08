# Adli shears

Barber shears rendered in Blender Cycles: mirror-polished steel blades, brushed brass handles, and a brass
pivot carrying the exact Adli seal (traced from the logo, public/brand/adli-seal.svg): forest enamel where
the logo is green, polished brass where it is cream (the ع and the thin ring).

## Files
- public/shears/v1/f000.webp … f047.webp: 48 frames, 494×618 (4:5), a full turn (7.5° apart), **transparent
  background** (WebP with alpha, ~700 KB total). They sit on any section: paper or forest.
- public/shears/preview.html: a standalone viewer (drag, arrows, auto-turn, paper/forest toggle). Open it to check.
- scene.py: builds the scene from code. seal_paths.txt: the seal outline it carves on the pivot.
- turn-sheet.png: 8 of the frames on paper.

## Showing it on the site (same approach as the hero bottle)
- Frames are transparent, so blending between two frames must be additive: draw frame i at alpha (1−f) and
  frame i+1 at alpha f with `globalCompositeOperation = 'lighter'`, after `clearRect`. A plain alpha-over blend
  leaves a light halo on the edges.
- 360°: angle → frame = (angle mod 360) / 7.5. Unlike the bottle, the shears are not symmetric.
- Poster: f000.webp as the first paint (fetchpriority only if it is the LCP of its page).
- Load the 48 frames only when the section is visible (IntersectionObserver), never with Save-Data or
  prefers-reduced-motion (then show the poster only).
- Cache: the folder is versioned (v1); serve with a long immutable cache. A re-render goes to v2.

## Re-rendering
pip install bpy (Python 3.13), then:
  python3 scene.py --still test.png --res-pct 40 --samples 40           # quick check (transparent)
  python3 scene.py --turntable frames 48 0 --res-pct 60 --samples 48    # the 48 frames
  python3 scene.py --studio --still hero.png --res-pct 100 --samples 160 # dark studio still, like the bottle
Options: --open DEG (blade opening, default 24), --border x0 x1 y0 y1 (render a crop).
Then crop to the union of the alpha bounding boxes and save WebP quality 84 into public/shears/v2/.
