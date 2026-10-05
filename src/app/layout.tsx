import type { Metadata, Viewport } from "next";
import { Amiri, Readex_Pro } from "next/font/google";
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
  title: "عدلي | صالون حلاقة وعطور",
  description: "صالون عدلي: حلاقة رجالية، عطور وكريمات. اختر منتجك وثبّت طلبك على واتساب.",
};

export const viewport: Viewport = {
  themeColor: "#0B300F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" data-theme="night" className={`${amiri.variable} ${readex.variable}`}>
      <body className="ad-root">{children}</body>
    </html>
  );
}
