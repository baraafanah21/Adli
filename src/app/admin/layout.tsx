import { SiteChrome } from "@/components/SiteChrome";

// Temporary: keeps the placeholder /admin looking as before the (site) move. Phase F1 replaces it with the admin shell.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <SiteChrome>{children}</SiteChrome>;
}
