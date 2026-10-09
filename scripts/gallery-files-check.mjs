// Gallery photo pipeline (src/lib/admin/framed-webp.ts): the centre cropped to the aspect, upright (EXIF), sizes,
// never upscaled, WebP without metadata, non-images refused. Run: npm run check:gallery-files
import sharp from "sharp";
import { framedWebp } from "../src/lib/admin/framed-webp.ts";
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};

// A test photo: left half red, right half blue, a green bar along the top (so orientation and centring show).
async function photo(width, height, { orientation, format = "jpeg" } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width / 2}" height="${height}" fill="#f00"/><rect x="${width / 2}" width="${width / 2}" height="${height}" fill="#00f"/>
    <rect width="${width}" height="${Math.round(height / 10)}" fill="#0f0"/></svg>`;
  let img = sharp(Buffer.from(svg));
  img = format === "png" ? img.png() : img.jpeg({ quality: 90 });
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}
const info = async (buf) => {
  const m = await sharp(buf).metadata();
  return { format: m.format, width: m.width, height: m.height, exif: Boolean(m.exif), orientation: m.orientation ?? null };
};
const pixel = async (buf, fx, fy) => {
  const { data, info: i } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(i.width - 1, Math.round(fx * i.width));
  const y = Math.min(i.height - 1, Math.round(fy * i.height));
  const o = (y * i.width + x) * 3;
  const [r, g, b] = [data[o], data[o + 1], data[o + 2]];
  return r > 150 && g < 100 && b < 100 ? "red" : b > 150 && r < 100 && g < 100 ? "blue" : g > 150 && r < 100 && b < 100 ? "green" : `${r},${g},${b}`;
};

// An editor-framed 4:5 photo (1920×2400), as a photo: 1280×1600 + 480×600.
{
  const f = await framedWebp(await photo(1920, 2400), 4 / 5, { longest: 1600 });
  eq("4:5 photo → large", await info(f.large), { format: "webp", width: 1280, height: 1600, exif: false, orientation: null });
  eq("4:5 photo → small", (await info(f.small)).width + "×" + (await info(f.small)).height, "480×600");
  eq("4:5 photo → recorded size", [f.width, f.height], [1280, 1600]);
}
// 9:16 photo: longest 1600 → 900×1600. 1:1: 1600×1600.
{
  const f = await framedWebp(await photo(1350, 2400), 9 / 16, { longest: 1600 });
  eq("9:16 photo → 900×1600", [f.width, f.height], [900, 1600]);
  const s = await framedWebp(await photo(2000, 2000), 1, { longest: 1600 });
  eq("1:1 photo → 1600×1600", [s.width, s.height], [1600, 1600]);
}
// «كما هي»: a landscape photo, uncropped, recorded as 9:16 → the centre (red | blue seam) cut to 9:16.
{
  const f = await framedWebp(await photo(2400, 1600), 9 / 16, { longest: 1600 });
  const i = await info(f.large);
  eq("as-is landscape → 9:16 centre crop", [i.width, i.height, Math.abs(i.width / i.height - 9 / 16) < 0.01], [900, 1600, true]);
  eq("as-is landscape → centred (red left of the seam, blue right)", [await pixel(f.large, 0.25, 0.5), await pixel(f.large, 0.75, 0.5)], ["red", "blue"]);
}
// EXIF orientation 6 (a phone photo stored sideways): upright before cropping, no EXIF left.
{
  const sideways = await sharp(await photo(1200, 1600)).rotate(-90).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const f = await framedWebp(sideways, 4 / 5, { longest: 1600 });
  const i = await info(f.large);
  eq("EXIF 6 → upright 4:5, no EXIF", [i.width, i.height, i.exif], [1200, 1500, false]);
  eq("EXIF 6 → the green bar is on top", await pixel(f.large, 0.5, 0.02), "green");
}
// Poster: 1080 wide at most; a 720×1280 frame is never upscaled.
{
  const big = await framedWebp(await photo(1350, 2400), 9 / 16, { width: 1080 });
  eq("poster from 1350×2400 → 1080×1920", [big.width, big.height], [1080, 1920]);
  const small = await framedWebp(await photo(720, 1280), 9 / 16, { width: 1080 });
  eq("poster from a 720×1280 frame → 720×1280 (no upscale)", [small.width, small.height], [720, 1280]);
  eq("poster small → 480 wide", (await info(small.small)).width, 480);
}
// A small photo: never upscaled, small copy no wider than the photo.
{
  const f = await framedWebp(await photo(400, 500), 4 / 5, { longest: 1600 });
  eq("400×500 photo → 400×500 and 400×500", [f.width, f.height, (await info(f.small)).width], [400, 500, 400]);
}
// PNG accepted; anything else refused.
{
  const f = await framedWebp(await photo(800, 800, { format: "png" }), 1, { longest: 1600 });
  eq("PNG → 800×800 WebP", [(await info(f.large)).format, f.width, f.height], ["webp", 800, 800]);
  let refused = false;
  try {
    await framedWebp(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>"), 1, { longest: 1600 });
  } catch {
    refused = true;
  }
  eq("SVG refused", refused, true);
  refused = false;
  try {
    await framedWebp(Buffer.from("not an image at all"), 1, { longest: 1600 });
  } catch {
    refused = true;
  }
  eq("text refused", refused, true);
}

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
