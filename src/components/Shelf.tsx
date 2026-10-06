"use client";

import { useSearchParams } from "next/navigation";
import { CategoryChips } from "@/components/CategoryChips";
import { SealStage } from "@/components/SealStage";
import { Button } from "@/components/Button";
import { setCategoryParam } from "@/lib/category-param";
import type { Category, ProductCard } from "@/lib/catalog";
import styles from "./Shelf.module.css";

type Props = { categories: Category[]; products: ProductCard[] };

export function Shelf({ categories, products }: Props) {
  const params = useSearchParams();
  const requested = params.get("c");
  const active = categories.some((c) => c.slug === requested) ? requested : null;
  const activeId = categories.find((c) => c.slug === active)?.id;

  const nameById = new Map(categories.map((c) => [c.id, c.name_ar]));
  const visible = activeId ? products.filter((p) => p.category_id === activeId) : products;
  const chips = categories.map((c) => ({
    slug: c.slug,
    name_ar: c.name_ar,
    count: products.filter((p) => p.category_id === c.id).length,
  }));

  return (
    <>
      <CategoryChips categories={chips} total={products.length} active={active} onChange={(s) => setCategoryParam(s)} />
      {visible.length > 0 ? (
        <ul className={`ad-shelf ${styles.grid}`}>
          {visible.map((p) => (
            <li key={p.id}>
              <SealStage product={p} categoryName={nameById.get(p.category_id)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty} role="status">
          <p className="body">لا توجد منتجات في هذه الفئة حالياً.</p>
          <Button variant="ghost" onClick={() => setCategoryParam(null)}>
            الكل
          </Button>
        </div>
      )}
    </>
  );
}
