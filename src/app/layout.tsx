import type { Metadata, Viewport } from "next";
import { Amiri, Readex_Pro } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "@/styles/tokens.css";
import "@/styles/components.css";
import "./globals.css";

const amiri = Amiri({
  variable: "--font-amiri-loaded",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
});

const readex = Readex_Pro({
  variable: "--font-readex-loaded",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "عدلي | صالون حلاقة وعطور",
    template: "%s | عدلي",
  },
  description: "صالون عدلي: حلاقة رجالية، عطور وكريمات. اختر منتجك وثبّت طلبك على واتساب.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B300F" },
    { media: "(prefers-color-scheme: light)", color: "#F5F5DB" },
  ],
};

// Before first paint: saved theme ("adli-theme", see src/lib/theme.ts), else prefers-color-scheme, else night.
const themeScript = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem("adli-theme")}catch(e){}if(t!=="day"&&t!=="night"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"day":"night"}d.dataset.theme=t})()`;

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
      <body className="ad-root">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
