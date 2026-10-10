import Link from "next/link";
import styles from "./Breadcrumbs.module.css";

export type Crumb = { name: string; path: string };

/**
 * The page's place in the site, as links: «الرئيسية ‹ المنتجات ‹ عطور». The same trail the page's BreadcrumbList
 * JSON-LD names (breadcrumbJsonLd() in src/lib/seo.ts), so the structured data describes what is on the page.
 * Every crumb here is a link up; the page itself is its h1, right below.
 */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav className={styles.crumbs} aria-label="مسار الصفحة">
      <ol>
        {[{ name: "الرئيسية", path: "/" }, ...trail].map((c, i) => (
          <li key={c.path}>
            {i > 0 && (
              <span className={styles.sep} aria-hidden="true">
                ‹
              </span>
            )}
            <Link href={c.path}>{c.name}</Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
