import { SealStage } from "@/components/SealStage";
import { SHELF_ALL_ID } from "@/components/shelf-ids";
import type { Category, ProductCard } from "@/lib/catalog";
import styles from "./Shelf.module.css";

type Props = {
  categories: Category[];
  products: ProductCard[];
};

/**
 * /products' cards, rendered once on the server (P-B). Each <li> carries its category's slug, which <ShelfControls>
 * uses to hide the others; the first card's photo is preloaded (the page's LCP on a phone). Cards below the first
 * rows are skipped by the browser until they come near (content-visibility, Shelf.module.css).
 */
export function ShelfGrid({ categories, products }: Props) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (
    <ul id={SHELF_ALL_ID} className={`ad-shelf ${styles.grid} ${styles.lazy}`}>
      {products.map((p, i) => {
        const category = byId.get(p.category_id);
        return (
          <li key={p.id} data-cat={category?.slug}>
            <SealStage product={p} categoryName={category?.name_ar} preload={i === 0} nameAs="h2" />
          </li>
        );
      })}
    </ul>
  );
}
