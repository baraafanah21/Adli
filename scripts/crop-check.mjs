// Image editor geometry (src/lib/image-crop.ts): rotation, tilt, zoom floor, clamp, no empty corner. Run: npm run check:crop
import { clampPosition, cropPlan, fitLongest, minZoomFor, sourceCorners } from "../src/lib/image-crop.ts";
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (!cond) fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` ${detail}`}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Photos (natural pixels) and how the stage shows them at zoom 1 (react-easy-crop "contain" in a 360×480 stage).
const STAGE = { width: 360, height: 480 };
const show = (natural) => {
  const k = Math.min(STAGE.width / natural.width, STAGE.height / natural.height);
  return { width: natural.width * k, height: natural.height * k };
};
// The frame: the largest box of that aspect inside the stage (as react-easy-crop sizes it, minus a margin).
const frameFor = (aspect) => {
  const w = Math.min(STAGE.width * 0.9, STAGE.height * 0.9 * aspect);
  return { width: w, height: w / aspect };
};
const photos = { portrait: { width: 3024, height: 4032 }, landscape: { width: 4032, height: 3024 }, square: { width: 2000, height: 2000 } };
const aspects = { "4:5": 4 / 5, "9:16": 9 / 16, "1:1": 1 };
const angles = [0, 90, 180, 270, -90, 12.5, -12.5, 45, -45, 90 + 7, 270 - 33.5, 180 + 0.5];

// A deterministic "random" drag: positions far outside, then clamped.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

for (const [pName, natural] of Object.entries(photos)) {
  const media = show(natural);
  for (const [aName, aspect] of Object.entries(aspects)) {
    const frame = frameFor(aspect);
    for (const deg of angles) {
      const label = `${pName} ${aName} ${deg}°`;
      const zMin = minZoomFor(media, frame, deg);
      let worst = 0;
      let aspectOff = 0;
      let tooBig = false;
      for (const zoomK of [1, 1.0001, 1.5, 3]) {
        const zoom = zMin * zoomK;
        for (let i = 0; i < 40; i++) {
          const wild = { x: rnd() * 2000, y: rnd() * 2000 };
          const crop = i === 0 ? { x: 0, y: 0 } : clampPosition(wild, media, frame, zoom, deg);
          const view = { natural, media, frame, crop, zoom, deg };
          const plan = cropPlan(view, 2400);
          for (const p of sourceCorners(view, plan)) {
            worst = Math.max(worst, -p.x, -p.y, p.x - natural.width, p.y - natural.height);
          }
          aspectOff = Math.max(aspectOff, Math.abs(plan.out.width / plan.out.height - aspect));
          tooBig ||= Math.max(plan.out.width, plan.out.height) > 2400;
        }
      }
      ok(`${label}: no corner outside the photo`, worst <= 0.5, `(${worst.toFixed(3)}px outside)`);
      ok(`${label}: output keeps ${aName}`, aspectOff < 0.002, `(off by ${aspectOff})`);
      ok(`${label}: longest side ≤ 2400`, !tooBig);
    }
  }
}

// Below the zoom floor the frame can't fit: clampPosition centres it, and that is exactly why the editor never
// lets zoom go below minZoomFor.
{
  const natural = photos.landscape;
  const media = show(natural);
  const frame = frameFor(4 / 5);
  const deg = 30;
  const zoom = minZoomFor(media, frame, deg) * 0.8;
  const view = { natural, media, frame, crop: clampPosition({ x: 0, y: 0 }, media, frame, zoom, deg), zoom, deg };
  const corners = sourceCorners(view, cropPlan(view, 2400));
  ok("below the zoom floor a corner does fall outside (the floor is needed)", corners.some((p) => p.x < -1 || p.y < -1 || p.x > natural.width + 1 || p.y > natural.height + 1));
}

// Right angles: the zoom floor is exact (the frame touches two edges), and 90° swaps the photo's sides.
{
  const natural = photos.landscape;
  const media = show(natural);
  const frame = frameFor(4 / 5);
  const z0 = minZoomFor(media, frame, 0);
  ok("0°: zoom floor fills the frame's height", near(z0, Math.max(frame.width / media.width, frame.height / media.height)));
  const z90 = minZoomFor(media, frame, 90);
  ok("90°: zoom floor uses the turned sides", near(z90, Math.max(frame.height / media.width, frame.width / media.height)));
  ok("180° = 0°, 270° = 90°", near(minZoomFor(media, frame, 180), z0) && near(minZoomFor(media, frame, 270), z90));
  ok("tilt raises the floor", minZoomFor(media, frame, 10) > z0 && minZoomFor(media, frame, -10) > z0);
}

// 90° on a landscape iPhone-sized photo, 4:5 at the floor and centred: the whole height of the turned photo.
{
  const natural = photos.landscape; // 4032×3024 → turned, 3024 wide × 4032 tall
  const media = show(natural);
  const frame = frameFor(4 / 5);
  const zoom = minZoomFor(media, frame, 90);
  const view = { natural, media, frame, crop: { x: 0, y: 0 }, zoom, deg: 90 };
  const plan = cropPlan(view, 2400);
  ok("90° landscape → 4:5 output 1920×2400", plan.out.width === 1920 && plan.out.height === 2400, JSON.stringify(plan.out));
  ok("90° landscape: the frame spans the turned photo's width (3024px)", Math.abs(plan.sourceWidth - 3024) < 0.5, String(plan.sourceWidth));
}

// Small photos are never upscaled, and are flagged (< 1200px of real pixels across the frame).
{
  const natural = { width: 900, height: 1200 };
  const media = show(natural);
  const frame = frameFor(4 / 5);
  const zoom = minZoomFor(media, frame, 0);
  const plan = cropPlan({ natural, media, frame, crop: { x: 0, y: 0 }, zoom, deg: 0 }, 2400);
  ok("small photo: not upscaled", plan.out.width <= 900 && plan.out.height <= 1200, JSON.stringify(plan.out));
  ok("small photo: under 1200 real pixels wide (the soft warning)", plan.sourceWidth < 1200);
}

ok("fitLongest 4032×3024 → 3000", JSON.stringify(fitLongest({ width: 4032, height: 3024 }, 3000)) === JSON.stringify({ width: 3000, height: 2250 }));
ok("fitLongest never upscales", JSON.stringify(fitLongest({ width: 800, height: 600 }, 3000)) === JSON.stringify({ width: 800, height: 600 }));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
