import sharp from "sharp";

/*
  Server only (sharp). Gallery photos and video posters come from the admin's ImageEditor as a JPEG (≤ 2400px,
  already framed). sharp checks it really is an image (with a pixel limit), turns it upright, crops the centre to the
  item's aspect (a photo kept "as it is" arrives uncropped), and writes WebP with no metadata at all, never larger
  than the pixels it has:
    photo   <id>/<uuid>.webp     1600px on the longest side, q82       <id>/<uuid>.sm.webp  480 wide, q78
    poster  <id>/<uuid>.webp     1080 wide, q82                         <id>/<uuid>.sm.webp  480 wide, q78
  Tested by `npm run check:gallery-files`.
*/

const MAX_PIXELS = 40_000_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

export type Framed = { large: Buffer; small: Buffer; width: number; height: number };

/**
 * Upright, the centre cropped to `ratio` (width / height), then two WebP files. `large` is bounded by `longest`
 * (photos) or `width` (posters); neither file is ever upscaled. Throws if the input isn't an image sharp reads.
 */
export async function framedWebp(input: Buffer, ratio: number, large: { longest?: number; width?: number }): Promise<Framed> {
  const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!meta.format || !FORMATS.has(meta.format) || !meta.width || !meta.height) throw new Error(`format ${meta.format}`);
  // Upright size (EXIF orientations 5–8 swap the sides).
  const turned = (meta.orientation ?? 1) >= 5;
  const w0 = turned ? meta.height : meta.width;
  const h0 = turned ? meta.width : meta.height;
  // The width of the largest centred box of this ratio.
  const cw = w0 / h0 > ratio ? Math.round(h0 * ratio) : w0;
  const fit = (w: number) => ({ width: w, height: Math.max(1, Math.round(w / ratio)) });
  const big = fit(
    Math.min(cw, large.width ?? cw, large.longest ? Math.round(ratio >= 1 ? large.longest : large.longest * ratio) : cw),
  );
  const sm = fit(Math.min(cw, 480));
  const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  const [l, s] = await Promise.all([
    base.clone().resize({ ...big, fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer(),
    base.clone().resize({ ...sm, fit: "cover", position: "centre" }).webp({ quality: 78 }).toBuffer(),
  ]);
  return { large: l, small: s, width: big.width, height: big.height };
}
