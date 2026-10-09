/*
  The image editor's geometry (ImageEditor), with no DOM: tested by `npm run check:crop`.

  The view is react-easy-crop's: the crop frame sits still in the middle of the stage, and the photo moves under it
  (CSS `translate(crop) rotate(deg) scale(zoom)` about the stage's centre). `media` is the photo's size on screen at
  zoom 1, unrotated; `frame` is the crop frame's size on screen; `natural` is the photo's real pixel size.

  react-easy-crop keeps the photo's *bounding box* over the frame, so at an angle that isn't a multiple of 90° a
  corner of the frame can fall outside the photo (an empty triangle). Here the frame must stay inside the photo
  itself: seen in the photo's own (unrotated) axes, the frame is a rectangle turned by −deg, whose half-extents are
  `extents()`. The frame's centre may move within the photo's half-size minus those extents, which gives both the
  smallest zoom (`minZoomFor`) and the clamp on the position (`clampPosition`). `cropPlan` turns the view into the
  pixels to draw: the output size and the canvas transform, and `sourceCorners` maps the output's corners back onto the
  photo so the tests can check none is ever outside it.
*/

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** cos/sin of an angle, with the multiples of 90° exact (no 6e-17 creeping into the bounds). */
function trig(deg: number) {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) return { c: 1, s: 0 };
  if (d === 90) return { c: 0, s: 1 };
  if (d === 180) return { c: -1, s: 0 };
  if (d === 270) return { c: 0, s: -1 };
  return { c: Math.cos(rad(deg)), s: Math.sin(rad(deg)) };
}

/** Half-extents of the (screen-aligned) frame, measured along the photo's own axes when the photo is turned by deg. */
export function extents(frame: Size, deg: number): Point {
  const { c, s } = trig(deg);
  const ac = Math.abs(c);
  const as = Math.abs(s);
  return { x: (frame.width * ac + frame.height * as) / 2, y: (frame.width * as + frame.height * ac) / 2 };
}

/** The smallest zoom at which the frame fits inside the photo turned by deg: no empty corner anywhere. */
export function minZoomFor(media: Size, frame: Size, deg: number): number {
  const e = extents(frame, deg);
  return Math.max((2 * e.x) / media.width, (2 * e.y) / media.height);
}

/** Where the frame's centre is, relative to the photo's centre, in the photo's own axes (screen px at this zoom). */
function frameCentreInPhoto(crop: Point, deg: number): Point {
  // The photo's centre is at `crop` from the frame's centre, so the frame's centre is at −crop; turn it by −deg.
  const { c, s } = trig(deg);
  return { x: -(c * crop.x + s * crop.y), y: -(-s * crop.x + c * crop.y) };
}

/** Back from the photo's axes to the view's `crop` offset (the inverse of frameCentreInPhoto). */
function cropFromCentre(q: Point, deg: number): Point {
  const { c, s } = trig(deg);
  return { x: -(c * q.x - s * q.y), y: -(s * q.x + c * q.y) };
}

/** The nearest position (react-easy-crop's `crop`) that keeps the whole frame on the photo. */
export function clampPosition(crop: Point, media: Size, frame: Size, zoom: number, deg: number): Point {
  const e = extents(frame, deg);
  const mx = Math.max(0, (media.width * zoom) / 2 - e.x);
  const my = Math.max(0, (media.height * zoom) / 2 - e.y);
  const q = frameCentreInPhoto(crop, deg);
  return cropFromCentre({ x: clamp(q.x, -mx, mx), y: clamp(q.y, -my, my) }, deg);
}

export type CropView = {
  natural: Size;
  media: Size;
  frame: Size;
  crop: Point;
  zoom: number;
  deg: number;
};

export type CropPlan = {
  /** Output canvas size: the frame's aspect, longest side ≤ maxSide, never larger than the photo's own pixels. */
  out: Size;
  /** The frame's size in the photo's own pixels (before any downscale): under 1200 wide, the result may look soft. */
  sourceWidth: number;
  /** ctx.translate(out/2) · scale(scale) · rotate(deg) · translate(−q) · scale(zoom/k) · translate(−natural/2), then drawImage(photo, 0, 0). */
  transform: { scale: number; rad: number; q: Point; unit: number };
};

/** From the view to the pixels: the output size and the canvas transform that draws exactly the framed part. */
export function cropPlan(view: CropView, maxSide: number): CropPlan {
  const k = view.natural.width / view.media.width; // photo pixels per screen pixel at zoom 1
  const sw = (view.frame.width * k) / view.zoom; // the frame in photo pixels
  const sh = (view.frame.height * k) / view.zoom;
  const down = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * down));
  const height = Math.max(1, Math.round((width * view.frame.height) / view.frame.width));
  return {
    out: { width, height },
    sourceWidth: sw,
    transform: {
      scale: width / view.frame.width,
      rad: rad(view.deg),
      q: frameCentreInPhoto(view.crop, view.deg),
      unit: view.zoom / k,
    },
  };
}

/** The output's four corners, mapped back onto the photo (photo pixels). Inside [0, natural] means no empty corner. */
export function sourceCorners(view: CropView, plan: CropPlan): Point[] {
  const { scale, q, unit } = plan.transform;
  const { c, s } = trig(view.deg);
  const { width: W, height: H } = view.natural;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    // Output corner → screen offset from the frame's centre → the photo's axes (turned by −deg) → photo pixels.
    const dx = (sx * plan.out.width) / 2 / scale;
    const dy = (sy * plan.out.height) / 2 / scale;
    const lx = c * dx + s * dy + q.x;
    const ly = -s * dx + c * dy + q.y;
    return { x: W / 2 + lx / unit, y: H / 2 + ly / unit };
  });
}

/** Scale w×h down (never up) so its longest side is at most max. */
export function fitLongest(size: Size, max: number): Size {
  const k = Math.min(1, max / Math.max(size.width, size.height));
  return { width: Math.round(size.width * k), height: Math.round(size.height * k) };
}
