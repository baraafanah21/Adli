import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { SHARE_IMAGE } from "@/lib/seo";

/*
  The shared picture (WhatsApp, Facebook, X) for every page that has none of its own: the full logo (the seal and
  «ADLI ▯ عدلي») in cream on the logo's forest. The logo is the file itself, public/brand/adli-logo-mono.svg (one
  colour, `currentColor`, set to cream as the footer does), never retyped: the name is the wordmark's own drawing,
  and the image has no typed text at all. Built once at build time (the read is cached, see below).
*/

export const alt = SHARE_IMAGE.alt;
export const size = { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height };
export const contentType = SHARE_IMAGE.type;

// viewBox of adli-logo-mono.svg: 1165 × 1469.
const LOGO_HEIGHT = 500;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 1165) / 1469);

/** The logo file as a data URL, in cream. Cached: an uncached read would make the route dynamic under Cache
 *  Components, and then the prerendered pages wouldn't carry the image at all. */
async function logoDataUrl() {
  "use cache";
  const svg = (await readFile(join(process.cwd(), "public/brand/adli-logo-mono.svg"), "utf8")).replaceAll(
    "currentColor",
    BRAND.cream,
  );
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default async function Image() {
  const logo = await logoDataUrl();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.forest,
        }}
      >
        <img src={logo} width={LOGO_WIDTH} height={LOGO_HEIGHT} alt="" />
      </div>
    ),
    size,
  );
}
