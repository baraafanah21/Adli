"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { CategoryChips } from "@/components/CategoryChips";
import { ComingSoon } from "@/components/ComingSoon";
import { SealStage } from "@/components/SealStage";
import { Button } from "@/components/Button";
import { SearchIcon } from "@/components/icons";
import { setCategoryParam, setQueryParam } from "@/lib/category-param";
import type { Category, ProductCard } from "@/lib/catalog";
import { productCount } from "@/lib/format";
import { buildSearchIndex, cleanQuery, searchIndex } from "@/lib/search";
import styles from "./Shelf.module.css";

type Props = {
  categories: Category[];
  products: ProductCard[];
  /** Preload the first card's photo (the page's LCP on a phone: /products). */
  preloadFirst?: boolean;
};

/** The address follows the field after this pause (replaceState; the shelf filters from the address). */
const DEBOUNCE_MS = 200;

/**
 * Only categories with products are chips (U2): an empty one stays in the header's «الفئات» with «قريباً», and ?c= on
 * it still shows its «قريباً» panel.
 * `requested` is the ?c= slug and `query` the ?q= search; the page renders <ShelfFromUrl> inside <Suspense> with this
 * as the fallback, so the prerendered page shows the whole shelf and both apply on the client. Used by /products (the
 * home page shows its first cards only, without chips). The search ranks by src/lib/search.ts (name, family, category,
 * slug), inside the chosen category; the chips count what the search finds.
 */
export function Shelf({
  categories,
  products,
  preloadFirst = false,
  requested = null,
  query = "",
}: Props & { requested?: string | null; query?: string }) {
  const activeCategory = categories.find((c) => c.slug === requested) ?? null;
  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name_ar])), [categories]);
  const index = useMemo(
    () => buildSearchIndex(products, (p) => [p.name_ar, p.family_ar, nameById.get(p.category_id) ?? null, p.slug]),
    [products, nameById],
  );

  const found = query ? searchIndex(index, query) : products;
  const visible = activeCategory ? found.filter((p) => p.category_id === activeCategory.id) : found;
  const chips = categories
    .map((c) => ({ slug: c.slug, name_ar: c.name_ar, count: found.filter((p) => p.category_id === c.id).length }))
    .filter((c) => c.count > 0 || c.slug === activeCategory?.slug);

  const clearAll = () => {
    setQueryParam("");
    setCategoryParam(null);
  };

  return (
    <>
      <ShelfSearch query={query} found={query ? visible.length : null} />
      <CategoryChips
        categories={chips}
        total={found.length}
        active={activeCategory?.slug ?? null}
        onChange={(s) => setCategoryParam(s)}
      />
      {visible.length > 0 ? (
        <ul id="shelf-results" className={`ad-shelf ${styles.grid}`}>
          {visible.map((p, i) => (
            <li key={p.id}>
              <SealStage product={p} categoryName={nameById.get(p.category_id)} preload={preloadFirst && i === 0} />
            </li>
          ))}
        </ul>
      ) : query ? (
        <div className={styles.empty} role="status">
          <p className="body">لا توجد نتائج لـ «{query}»{activeCategory ? ` في ${activeCategory.name_ar}` : ""}.</p>
          <Button variant="ghost" onClick={clearAll}>
            كل المنتجات
          </Button>
        </div>
      ) : activeCategory ? (
        <ComingSoon category={activeCategory}>
          <Button variant="ghost" onClick={() => setCategoryParam(null)}>
            تصفّح كل المنتجات
          </Button>
        </ComingSoon>
      ) : (
        <div className={styles.empty} role="status">
          <p className="body">لا توجد منتجات حالياً.</p>
        </div>
      )}
    </>
  );
}

/** The search field above the chips. Typing is instant in the field; the address (and so the shelf) follows. */
function ShelfSearch({ query, found }: { query: string; found: number | null }) {
  const id = useId();
  const [value, setValue] = useState(query);
  const [seen, setSeen] = useState(query);

  // Back / forward or the header's search changed ?q=: the field follows (unless it already says the same).
  if (query !== seen) {
    setSeen(query);
    if (cleanQuery(value) !== query) setValue(query);
  }

  useEffect(() => {
    const q = cleanQuery(value);
    if (q === query) return;
    const t = setTimeout(() => setQueryParam(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, query]);

  return (
    <div role="search" className={styles.search}>
      <span className={styles.searchIcon}>
        <SearchIcon size={20} />
      </span>
      <input
        id={id}
        className={styles.searchInput}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="ابحث باسم المنتج، العائلة، أو القسم"
        aria-label="ابحث في المنتجات"
        aria-controls="shelf-results"
        aria-describedby={`${id}-status`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setQueryParam(cleanQuery(value)); // now, without waiting for the pause
        }}
      />
      {value && (
        <button
          type="button"
          className={styles.searchClear}
          aria-label="امسح البحث"
          onClick={() => {
            setValue("");
            setQueryParam("");
            document.getElementById(id)?.focus();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
      <p id={`${id}-status`} className={styles.searchStatus} role="status" aria-live="polite">
        {found ? `${productCount(found)} لـ «${query}»` : ""}
      </p>
    </div>
  );
}

/** The shelf filtered by ?c= and ?q= (search params are only known per request, so this sits inside <Suspense>). */
export function ShelfFromUrl(props: Props) {
  const params = useSearchParams();
  return <Shelf {...props} requested={params.get("c")} query={cleanQuery(params.get("q"))} />;
}
