import type { Category, ProductCard, StockState } from "@/lib/catalog";
import { productImageSrc } from "@/lib/format";
import type { SearchFields } from "@/lib/search";

/**
 * One published product as the header's search needs it: the fields it searches and what a result row shows. Served
 * by /products/search.json from the cached catalog, fetched once when the search opens. Safe in the browser.
 */
export type SearchItem = {
  slug: string;
  name_ar: string;
  family_ar: string | null;
  category_ar: string | null;
  /** The card's small photo (.sm.webp), or a local file; null for none. */
  image: string | null;
  price_ils: number;
  price_varies: boolean;
  stock_state: StockState;
};

export function toSearchItems(categories: Category[], products: ProductCard[]): SearchItem[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name_ar]));
  return products.map((p) => ({
    slug: p.slug,
    name_ar: p.name_ar,
    family_ar: p.family_ar,
    category_ar: nameById.get(p.category_id) ?? null,
    image: productImageSrc(p.image_path, "sm"),
    price_ils: p.price_ils,
    price_varies: p.price_varies,
    stock_state: p.stock_state,
  }));
}

export const searchItemFields = (i: SearchItem): SearchFields => [i.name_ar, i.family_ar, i.category_ar, i.slug];

/** The address of the search index. */
export const SEARCH_INDEX_URL = "/products/search.json";
