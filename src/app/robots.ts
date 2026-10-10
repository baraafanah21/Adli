import type { MetadataRoute } from "next";
import { absolute } from "@/lib/seo";

/** /robots.txt: everything public is open; the account, admin, auth and API paths aren't for search (their pages are
 *  noindex too). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/auth", "/login", "/signup", "/api"] },
    sitemap: absolute("/sitemap.xml"),
  };
}
