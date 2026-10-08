"use client";

import { useSearchParams } from "next/navigation";
import { CategoryChips } from "@/components/CategoryChips";
import { ComingSoon } from "@/components/ComingSoon";
import { SealStage } from "@/components/SealStage";
import { Button } from "@/components/Button";
import { setCategoryParam } from "@/lib/category-param";
import type { Category, ProductCard } from "@/lib/catalog";
import styles from "./Shelf.module.css";

type Props = { categories: Category[]; products: ProductCard[] };

/**
 * Only categories with products are chips (U2): an empty one stays in the header's «الفئات» with «قريباً», and ?c= on
 * it still shows its «قريباً» panel.
 * `requested` is the ?c= slug; the home page renders <ShelfFromUrl> inside <Suspense> with this as the fallback,
 * so the prerendered page shows the whole shelf and ?c= applies on the client.
 */
export function Shelf({ categories, products, requested = null }: Props & { requested?: string | null }) {
  const activeCategory = categories.find((c) => c.slug === requested) ?? null;

  const nameById = new Map(categories.map((c) => [c.id, c.name_ar]));
  const visible = activeCategory ? products.filter((p) => p.category_id === activeCategory.id) : products;
  const chips = categories
    .map((c) => ({ slug: c.slug, name_ar: c.name_ar, count: products.filter((p) => p.category_id === c.id).length }))
    .filter((c) => c.count > 0 || c.slug === activeCategory?.slug);

  return (
    <>
      <CategoryChips
        categories={chips}
        total={products.length}
        active={activeCategory?.slug ?? null}
        onChange={(s) => setCategoryParam(s)}
      />
      {visible.length > 0 ? (
        <ul className={`ad-shelf ${styles.grid}`}>
          {visible.map((p) => (
            <li key={p.id}>
              <SealStage product={p} categoryName={nameById.get(p.category_id)} />
            </li>
          ))}
        </ul>
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

/** The shelf filtered by ?c= (search params are only known per request, so this sits inside <Suspense>). */
export function ShelfFromUrl(props: Props) {
  return <Shelf {...props} requested={useSearchParams().get("c")} />;
}
