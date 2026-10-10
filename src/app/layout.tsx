import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@/styles/tokens.css";
import "@/styles/components.css";
import "./globals.css";
import { ROBOTS, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/seo";
import { SALON } from "@/lib/salon";

// Fonts (P-A, docs/PERFORMANCE.md): self-hosted subsets of the same versions Google Fonts serves, built by
// scripts/fonts/build-fonts.sh (src/fonts/README.md). Swap, each with next/font's size-adjusted fallback (no layout
// shift when it arrives). The unicode-range values match the script's.

// Readex Pro, the text font: one variable file (weights 160–700, as Google serves it) with Arabic, Latin and ₪, the only
// font preloaded.
const readex = localFont({
  src: "../fonts/readex-pro.woff2",
  weight: "160 700",
  variable: "--font-readex-loaded",
  display: "swap",
  adjustFontFallback: "Arial",
});

// Amiri, display text only: never preloaded, it loads where a display style is used. Arabic (with the space, digits and
// punctuation, so an Arabic heading needs only this file) and Latin letters are separate files: the Latin one loads only
// for a heading with a Latin name.
const amiri = localFont({
  src: [
    { path: "../fonts/amiri-regular-arabic.woff2", weight: "400" },
    { path: "../fonts/amiri-bold-arabic.woff2", weight: "700" },
  ],
  variable: "--font-amiri-loaded",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0020-0040,U+005B-0060,U+007B-007E,U+00A0,U+00AB,U+00BB,U+00D7,U+060C,U+061B,U+061F,U+0621-0652,U+0640,U+0670,U+067E,U+0686,U+06A4,U+06A9,U+06AF,U+06CC,U+200C-200F,U+2010-2014,U+2018-201D,U+2026,U+25CC",
    },
  ],
});

// Latin letters, digits and punctuation, as Google's latin file had them (scripts/fonts/build-fonts.sh says why). Listed
// before the Arabic family in --font-amiri (tokens.css), without a fallback of its own: a Latin letter skips the Arabic
// family (its unicode-range) and would otherwise land on that family's Times New Roman fallback first.
const amiriLatin = localFont({
  src: [
    { path: "../fonts/amiri-regular-latin.woff2", weight: "400" },
    { path: "../fonts/amiri-bold-latin.woff2", weight: "700" },
  ],
  variable: "--font-amiri-latin-loaded",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0021-007E,U+00A1-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2010-2027,U+2030-205E,U+20AC,U+2122" }],
});

export const metadata: Metadata = {
  // Absolute canonical and share URLs (src/lib/seo.ts: the production domain on Vercel, the dev server locally).
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | عدلي",
  },
  description: SITE_DESCRIPTION,
  // Large image previews, any snippet length (src/lib/seo.ts). The private pages override it with index: false.
  robots: ROBOTS,
  // Every public page replaces these with pageMeta() (Open Graph merges shallowly); this is the fallback for the rest.
  // The picture is app/opengraph-image.tsx.
  openGraph: { type: "website", locale: "ar_AR", siteName: SALON.name, title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // The logo's icons (public/brand/icons/; /favicon.ico is rewritten there in next.config.ts). Manifest: app/manifest.ts.
  icons: {
    icon: [
      { url: "/brand/icons/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/brand/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      // Larger than 48px, square, for Google's search results (https://developers.google.com/search/docs/appearance/favicon-in-search).
      { url: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/brand/icons/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B300F" },
    { media: "(prefers-color-scheme: light)", color: "#F5F5DB" },
  ],
};

// Before first paint: saved theme ("adli-theme", see src/lib/theme.ts), else prefers-color-scheme, else night.
const themeScript = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem("adli-theme")}catch(e){}if(t!=="day"&&t!=="night"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"day":"night"}d.dataset.theme=t})()`;

/** html, fonts and theme only. The public site's header and cart are in (site)/layout.tsx; /admin has its own frame. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script above may change data-theme before React hydrates.
    <html
      lang="ar"
      dir="rtl"
      data-theme="night"
      className={`${amiri.variable} ${amiriLatin.variable} ${readex.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="ad-root">{children}</body>
    </html>
  );
}
