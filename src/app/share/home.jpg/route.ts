import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import sharp from "sharp";
import { getGallery } from "@/lib/gallery";
import { salonPhotos } from "@/lib/seo";

/*
  /share/home.jpg: the home page's shared picture (og:image), 1200×630. A real salon photo from the published gallery
  (a backdrop photo, else the featured video's poster: salonPhotos() in src/lib/seo.ts), cropped to fill, with the colour
  seal small in the corner where the product cards wear it (bottom, inline end: left in RTL). The seal is the file,
  public/brand/adli-seal.svg, never redrawn. No photo on the page: 404, and the home page names the logo picture
  (app/opengraph-image.tsx) instead.

  Cached with the gallery (tag `gallery`): built once, renewed only when «المعرض» changes. A JPEG, so it stays small
  (about 100KB) for WhatsApp and Facebook; every renewal is one ISR write.
*/

const SHARE_SIZE = { width: 1200, height: 630 };
const SEAL = 112;
const MARGIN = 32;

async function shareImage(): Promise<Uint8Array | null> {
  "use cache";
  cacheTag("gallery");
  cacheLife("gallery");
  const [photo] = salonPhotos(await getGallery(), 1);
  if (!photo) return null;

  const res = await fetch(photo.url);
  if (!res.ok) throw new Error(`share photo ${res.status}`);
  const seal = await sharp(await readFile(join(process.cwd(), "public/brand/adli-seal.svg")))
    .resize(SEAL, SEAL)
    .png()
    .toBuffer();

  const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    .resize(SHARE_SIZE.width, SHARE_SIZE.height, { fit: "cover", position: "attention" })
    .composite([{ input: seal, left: MARGIN, top: SHARE_SIZE.height - SEAL - MARGIN }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(jpeg);
}

export async function GET() {
  let image: Uint8Array | null;
  try {
    image = await shareImage();
  } catch (e) {
    // A failure is never cached (thrown inside the cached function): the next request tries again.
    console.error("share/home.jpg", e instanceof Error ? e.message : e);
    return new Response(null, { status: 503 });
  }
  if (!image) return new Response(null, { status: 404 });
  return new Response(image as BodyInit, { headers: { "Content-Type": "image/jpeg" } });
}
