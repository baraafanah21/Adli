"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CategoryIcon, ChevronDownIcon } from "@/components/icons";
import styles from "./SiteHeader.module.css";

type NavCategory = { slug: string; name_ar: string; icon: string | null };
type Props = { categories: NavCategory[] };

const hrefOf = (slug: string) => `/c/${slug}`;

/**
 * Desktop (≥ 720px): «الفئات» opens a grid of the categories with their icons.
 * Arrow keys move between them (RTL: ArrowLeft is next), Home/End jump, Esc closes and returns focus to the button.
 * Closes on an outside click, when focus leaves it, and after choosing a category.
 */
export function CategoryNav({ categories }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close after a navigation (a category link, the back button). Adjusting state during render, not in an effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const links = () => Array.from(root.current?.querySelectorAll<HTMLAnchorElement>("[data-cat-link]") ?? []);

  function focusLink(i: number) {
    const all = links();
    all[(i + all.length) % all.length]?.focus();
  }

  function columns() {
    const grid = root.current?.querySelector<HTMLElement>("[data-cat-grid]");
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 1;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.target === button.current) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => focusLink(0));
      }
      return;
    }
    const all = links();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    const step: Record<string, number> = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: columns(), ArrowUp: -columns() };
    if (e.key in step) {
      e.preventDefault();
      const next = i + step[e.key];
      // Up/down stop at the edges; left/right wrap.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") focusLink(next);
      else if (next >= 0 && next < all.length) focusLink(next);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusLink(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusLink(all.length - 1);
    }
  }

  return (
    <nav
      ref={root}
      className={styles.catMenu}
      aria-label="الفئات"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && !root.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.catButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        الفئات
        <ChevronDownIcon />
      </button>
      <div id={panelId} className={styles.catPanel} hidden={!open}>
        <ul className={styles.catGrid} data-cat-grid>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={hrefOf(c.slug)}
                data-cat-link
                aria-current={pathname === hrefOf(c.slug) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <CategoryIcon name={c.icon} />
                <span>{c.name_ar}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** Phones (< 720px): one row of categories under the header, scrolling sideways. The current one scrolls into view. */
export function CategoryStrip({ categories }: Props) {
  const pathname = usePathname();
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    // Scroll the strip only (not the page) so the current category is visible.
    if (current && list.current) {
      const strip = list.current.parentElement!;
      const a = current.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      strip.scrollLeft += a.left + a.width / 2 - (s.left + s.width / 2);
    }
  }, [pathname]);

  return (
    <nav className={styles.strip} aria-label="الفئات">
      <ul ref={list}>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={hrefOf(c.slug)} aria-current={pathname === hrefOf(c.slug) ? "page" : undefined}>
              <CategoryIcon name={c.icon} size={18} />
              {c.name_ar}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
