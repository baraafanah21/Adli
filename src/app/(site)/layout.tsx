import { SiteChrome } from "@/components/SiteChrome";

/** The public site (no URL segment): header, cart and smooth scroll around every page. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
