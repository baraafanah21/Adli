import type { Metadata, Viewport } from "next";
import { Amiri, Readex_Pro } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/components.css";
import "./globals.css";

// Fonts (Phase G, measured in docs/PERFORMANCE.md): Arabic and Latin only, swap.
// Amiri is for display text only and its Arabic files are ~100 KB each, so it isn't preloaded: it loads where a
// display style is used, with next/font's size-adjusted fallback until then (no layout shift).
const amiri = Amiri({
  variable: "--font-amiri-loaded",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

// Readex Pro is a variable font: no `weight` → one file per subset for every weight (300–600 are used).
const readex = Readex_Pro({
  variable: "--font-readex-loaded",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "عدلي | صالون حلاقة وعطور",
    template: "%s | عدلي",
  },
  description: "صالون عدلي: حلاقة رجالية، عطور وكريمات. اختر منتجك وثبّت طلبك على واتساب.",
  // The logo's icons (public/brand/icons/; /favicon.ico is rewritten there in next.config.ts). Manifest: app/manifest.ts.
  icons: {
    icon: [
      { url: "/brand/icons/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/brand/icons/icon-32.png", sizes: "32x32", type: "image/png" },
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
      className={`${amiri.variable} ${readex.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="ad-root">{children}</body>
    </html>
  );
}
