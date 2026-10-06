import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type StockStatus = "in_stock" | "low" | "out";

export type Category = {
  id: string;
  slug: string;
  name_ar: string;
};

export type ProductCard = {
  id: string;
  slug: string;
  name_ar: string;
  family_ar: string | null;
  price_ils: number;
  volume_ml: number | null;
  image_path: string | null;
  stock_status: StockStatus;
  category_id: string;
};

export type ProductDetail = ProductCard & {
  description_ar: string | null;
  category: { slug: string; name_ar: string } | null;
};

type Result<T> = { data: T; error: null } | { data: null; error: string };

const CARD_COLUMNS = "id, slug, name_ar, family_ar, price_ils, volume_ml, image_path, stock_status, category_id";

export const getCatalog = cache(async (): Promise<Result<{ categories: Category[]; products: ProductCard[] }>> => {
  const supabase = await createClient();
  const [categories, products] = await Promise.all([
    supabase.from("categories").select("id, slug, name_ar").order("sort"),
    supabase.from("products").select(CARD_COLUMNS).eq("is_active", true).order("sort"),
  ]);
  if (categories.error || products.error) {
    console.error("getCatalog", categories.error ?? products.error);
    return { data: null, error: "catalog_unavailable" };
  }
  // Group by category order, then product sort (stable), so «الكل» reads perfumes, creams, grooming.
  const rank = new Map(categories.data.map((c, i) => [c.id, i]));
  const sorted = [...(products.data as ProductCard[])].sort(
    (a, b) => (rank.get(a.category_id) ?? 0) - (rank.get(b.category_id) ?? 0),
  );
  return { data: { categories: categories.data, products: sorted }, error: null };
});

export const getProduct = cache(async (slug: string): Promise<Result<ProductDetail | null>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_COLUMNS}, description_ar, category:categories (slug, name_ar)`)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("getProduct", error);
    return { data: null, error: "product_unavailable" };
  }
  return { data: data as ProductDetail | null, error: null };
});
