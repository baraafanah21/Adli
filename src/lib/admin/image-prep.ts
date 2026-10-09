/*
  Browser side of every admin photo upload (ImageEditor, ImageUploader): decode, crop, encode. Nothing here runs on
  the server; the upload routes still check type, size and pixels themselves and never trust this.

  1. decodePhoto: createImageBitmap with imageOrientation "from-image" (an iPhone photo stored sideways comes out
     upright), decoded straight to at most 3000px on its longest side (resizeWidth/Height: ~0.2 s for 12 MP on a
     mid phone, where drawing it onto a 3000px canvas took ~1.7 s); a canvas is the fallback where the browser can't
     resize while decoding, and an <img> where it can't decode at all. Never a canvas over 3000px: iOS refuses canvases
     over about 16.7 million pixels, and nothing larger is needed for a 2400px result. The editor shows the file itself
     (an object URL: the browser turns it upright too), so no preview is ever encoded.
  2. renderCrop / renderWhole: one canvas of the output size (≤ 2400px), drawn with the editor's transform
     (src/lib/image-crop.ts), on white (JPEG has no transparency). The canvas copies no metadata, so the place the photo
     was taken never leaves the phone.
  3. toJpeg: quality 0.92, stepping down only if the file would pass the upload budget.
*/
import { cropPlan, fitLongest, type CropView } from "@/lib/image-crop";

export const SOURCE_MAX = 3000;
export const OUTPUT_MAX = 2400;
export const SOFT_WIDTH = 1200;
const BUDGET = 4 * 1024 * 1024;

/** The photo to draw from (upright, ≤ 3000px) and the file's object URL for the editor to show. */
export type Photo = { source: ImageBitmap | HTMLCanvasElement; width: number; height: number; url: string };
/** `aspect`: the frame chosen (width / height), or for a photo kept as it is the allowed aspect nearest its own. */
export type Edited = { blob: Blob; width: number; height: number; edited: boolean; aspect: number };

export const isHeic = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#fff"; // JPEG has no transparency: a cut-out PNG sits on white, not black
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/** Frees a canvas's or a bitmap's pixels now rather than at the next garbage collection (it matters on a phone). */
export function release(pixels: HTMLCanvasElement | ImageBitmap | null | undefined) {
  if (!pixels) return;
  if (pixels instanceof HTMLCanvasElement) {
    pixels.width = 0;
    pixels.height = 0;
  } else pixels.close();
}

/** Frees a decoded photo: its pixels and its object URL. */
export function releasePhoto(photo: Photo | null | undefined) {
  if (!photo) return;
  release(photo.source);
  URL.revokeObjectURL(photo.url);
}

async function decodeWithImg(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The photo, upright and at most 3000px. */
export async function decodePhoto(file: File): Promise<Photo> {
  let full: ImageBitmap | HTMLImageElement;
  try {
    full = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    full = await decodeWithImg(file); // older Safari, some HEIC files
  }
  const w0 = full instanceof HTMLImageElement ? full.naturalWidth : full.width;
  const h0 = full instanceof HTMLImageElement ? full.naturalHeight : full.height;
  if (!w0 || !h0) throw new Error("empty image");
  const { width, height } = fitLongest({ width: w0, height: h0 }, SOURCE_MAX);
  const url = URL.createObjectURL(file);
  if (width === w0 && height === h0 && !(full instanceof HTMLImageElement)) return { source: full, width, height, url };

  // Decode again straight at the target size where the browser can (fast); else draw down onto a canvas.
  if (!(full instanceof HTMLImageElement)) {
    try {
      const small = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      });
      if (small.width === width && small.height === height) {
        full.close();
        return { source: small, width, height, url };
      }
      small.close();
    } catch {
      // no resize while decoding here: the canvas below
    }
  }
  const { canvas, ctx } = canvasOf(width, height);
  ctx.drawImage(full, 0, 0, width, height);
  if (!(full instanceof HTMLImageElement)) full.close();
  return { source: canvas, width, height, url };
}

/** Exactly what the editor's frame shows, at most 2400px on its longest side. */
export function renderCrop(photo: Photo, view: Omit<CropView, "natural">): HTMLCanvasElement {
  const plan = cropPlan({ ...view, natural: { width: photo.width, height: photo.height } }, OUTPUT_MAX);
  const { canvas, ctx } = canvasOf(plan.out.width, plan.out.height);
  const t = plan.transform;
  ctx.translate(plan.out.width / 2, plan.out.height / 2);
  ctx.scale(t.scale, t.scale);
  ctx.rotate(t.rad);
  ctx.translate(-t.q.x, -t.q.y);
  ctx.scale(t.unit, t.unit);
  ctx.translate(-photo.width / 2, -photo.height / 2);
  ctx.drawImage(photo.source, 0, 0);
  return canvas;
}

/** «استخدم الصورة كما هي»: upright, uncropped, at most 2400px. */
export function renderWhole(photo: Photo): HTMLCanvasElement {
  const { width, height } = fitLongest(photo, OUTPUT_MAX);
  const { canvas, ctx } = canvasOf(width, height);
  ctx.drawImage(photo.source, 0, 0, width, height);
  return canvas;
}

/** JPEG at 0.92, lower only if needed to stay under the upload budget. */
export async function toJpeg(canvas: HTMLCanvasElement, edited: boolean, aspect: number): Promise<Edited> {
  let quality = 0.92;
  let blob = await encode(canvas, quality);
  while (blob && blob.size > BUDGET && quality > 0.5) {
    quality -= 0.1;
    blob = await encode(canvas, quality);
  }
  if (!blob || blob.size > BUDGET) throw new Error("too large");
  return { blob, width: canvas.width, height: canvas.height, edited, aspect };
}
