"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { setCategoryParam } from "@/lib/category-param";
import styles from "./SiteHeader.module.css";

type Props = { categories: { slug: string; name_ar: string }[] };

/** Header category links. On "/" they set ?c and scroll to the shelf without a navigation. */
export function CategoryNav({ categories }: Props) {
  const pathname = usePathname();

  function onClick(e: MouseEvent<HTMLAnchorElement>, slug: string) {
    if (pathname !== "/" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const shelf = document.getElementById("shelf");
    if (!shelf) return;
    e.preventDefault();
    setCategoryParam(slug, "shelf");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    shelf.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // Move keyboard focus with the view so the next Tab lands on the shelf.
    shelf.focus({ preventScroll: true });
  }

  return (
    <nav className={styles.nav} aria-label="الفئات">
      <ul>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/?c=${c.slug}#shelf`} onClick={(e) => onClick(e, c.slug)}>
              {c.name_ar}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
