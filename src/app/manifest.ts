import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** /manifest.webmanifest. Icons are the logo files in public/brand/icons/ (see public/brand/README.md). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "عدلي، صالون حلاقة وعطور",
    short_name: "عدلي",
    description: "صالون عدلي: حلاقة رجالية، عطور وكريمات. اختر منتجك وثبّت طلبك على واتساب.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: BRAND.cream,
    theme_color: BRAND.forest,
    icons: [
      { src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
