import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public";
import type { CategoryIconName } from "@/components/icons";

/*
  Reads the catalog with named columns only: product_variants.stock_quantity is not granted to the API roles,
  so select("*") on it is refused. Availability comes from the variant_availability view (in / low / out).

  Cached for every visitor ("use cache", profile `catalog` in next.config.ts), read as anon through the public
  client, so only active categories, active products and their active variants are ever in the cache (archived
  products are always hidden: products_archived_hidden). Tags:
    catalog            everything here (the shelf, the header's categories, every category and product page)
    category:<slug>    one category page
    product:<slug>     one product page
  Every admin write that changes what the shop shows calls updateTag("catalog") after its RPC succeeds (see
  src/lib/catalog-cache.ts); the profile's 5 minutes are the safety net for changes made elsewhere (SQL Editor).
  A read error is thrown inside the cached function, so it is never cached; the exported getters turn it into
  { error } for the page.
*/

export type StockState = "in" | "low" | "out";

export type Category = {
  id: string;
  slug: string;
  name_ar: string;
  icon: CategoryIconName | null;
  description_ar: string | null;
};

/** What a cart line needs from one variant. */
export type OrderableVariant = {
  id: string;
  sku: string;
  /** «أسود، مقاس L»; null for a product's default variant. */
  label_ar: string | null;
  price_ils: number;
  stock_state: StockState;
};

export type ProductCard = {
  id: string;
  slug: string;
  name_ar: string;
  family_ar: string | null;
  volume_ml: number | null;
  image_path: string | null;
  category_id: string;
  kind: "simple" | "bundle";
  /** Lowest variant price; `price_varies` shows it as «من ₪ 25». */
  price_ils: number;
  price_varies: boolean;
  /** Best state across the variants: one in stock is enough. */
  stock_state: StockState;
  /** Set when there is nothing to choose (one variant, no options): the card adds it directly. */
  only_variant: OrderableVariant | null;
  /** «المقاس», «اللون»: the card asks the customer to choose these on the product page. */
  option_names: string[];
};

export type OptionValue = { id: string; label_ar: string; hex: string | null };
export type ProductOption = { id: string; name_ar: string; kind: "size" | "color" | "text"; values: OptionValue[] };
export type Variant = OrderableVariant & { option_value_ids: string[] };

export type BundleLine = {
  qty: number;
  slug: string | null;
  name_ar: string;
  label_ar: string | null;
  unit_price_ils: number;
};

export type ProductDetail = Omit<ProductCard, "only_variant" | "option_names"> & {
  description_ar: string | null;
  is_active: boolean;
  category: { slug: string; name_ar: string } | null;
  options: ProductOption[];
  variants: Variant[];
  /** Bundles only: what is inside, with each piece's own price. */
  bundle: BundleLine[] | null;
};

type Result<T> = { data: T; error: null } | { data: null; error: string };

type RawVariant = { id: string; sku: string; option_value_ids: string[]; price_ils: number | null; is_active: boolean; sort: number };
type Availability = { variant_id: string; stock_state: StockState; label_ar: string | null };

const PRODUCT_COLUMNS = "id, slug, name_ar, family_ar, price_ils, volume_ml, image_path, category_id, kind, sort";
// FK hints: bundle_items / order_items link products and variants too, so plain embeds would be ambiguous.
const VARIANT_COLUMNS = "id, sku, option_value_ids, price_ils, is_active, sort";

const STATE_RANK: Record<StockState, number> = { in: 0, low: 1, out: 2 };
const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** Active variants with their price (inherited when empty) and availability, in sort order. */
function orderable(raw: RawVariant[], productPrice: number, availability: Map<string, Availability>): Variant[] {
  return raw
    .filter((v) => v.is_active && availability.has(v.id))
    .sort(bySort)
    .map((v) => {
      const a = availability.get(v.id)!;
      return {
        id: v.id,
        sku: v.sku,
        option_value_ids: v.option_value_ids,
        label_ar: a.label_ar,
        price_ils: v.price_ils ?? productPrice,
        stock_state: a.stock_state,
      };
    });
}

function summarize(variants: Variant[], productPrice: number) {
  const prices = variants.map((v) => v.price_ils);
  const states = variants.map((v) => v.stock_state);
  return {
    price_ils: prices.length ? Math.min(...prices) : productPrice,
    price_varies: new Set(prices).size > 1,
    stock_state: states.length
      ? states.reduce((best, s) => (STATE_RANK[s] < STATE_RANK[best] ? s : best), "out" as StockState)
      : ("out" as StockState),
  };
}

async function availabilityFor(supabase: SupabaseClient, productIds: string[]) {
  if (productIds.length === 0) return { data: new Map<string, Availability>(), error: null };
  const { data, error } = await supabase
    .from("variant_availability")
    .select("variant_id, stock_state, label_ar")
    .in("product_id", productIds);
  if (error) return { data: null, error };
  return { data: new Map((data as Availability[]).map((a) => [a.variant_id, a])), error: null };
}

class CatalogReadError extends Error {}

type Catalog = { categories: Category[]; products: ProductCard[] };

/** Active categories and products, as anon: the same for every visitor (staff included). */
async function catalogData(): Promise<Catalog> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  const supabase = createPublicClient();
  const [categories, products] = await Promise.all([
    supabase.from("categories").select("id, slug, name_ar, icon, description_ar").eq("is_active", true).order("sort"),
    supabase
      .from("products")
      .select(`${PRODUCT_COLUMNS}, product_variants!product_variants_product_id_fkey (${VARIANT_COLUMNS}), product_options (name_ar, sort)`)
      .eq("is_active", true)
      .order("sort"),
  ]);
  if (categories.error || products.error) {
    console.error("getCatalog", categories.error ?? products.error);
    throw new CatalogReadError("catalog");
  }

  type Row = {
    id: string; slug: string; name_ar: string; family_ar: string | null; price_ils: number; volume_ml: number | null;
    image_path: string | null; category_id: string; kind: "simple" | "bundle"; sort: number;
    product_variants: RawVariant[]; product_options: { name_ar: string; sort: number }[];
  };
  const rows = products.data as Row[];
  const availability = await availabilityFor(supabase, rows.map((p) => p.id));
  if (availability.error) {
    console.error("getCatalog availability", availability.error);
    throw new CatalogReadError("catalog availability");
  }

  // Only products in an active category; grouped by category order, then product sort.
  const rank = new Map(categories.data.map((c, i) => [c.id, i]));
  const cards: ProductCard[] = rows
    .filter((p) => rank.has(p.category_id))
    .sort((a, b) => rank.get(a.category_id)! - rank.get(b.category_id)! || a.sort - b.sort)
    .map((p) => {
      const variants = orderable(p.product_variants, p.price_ils, availability.data);
      const optionNames = [...p.product_options].sort(bySort).map((o) => o.name_ar);
      const single = variants.length === 1 && optionNames.length === 0 ? variants[0] : null;
      return {
        id: p.id,
        slug: p.slug,
        name_ar: p.name_ar,
        family_ar: p.family_ar,
        volume_ml: p.volume_ml,
        image_path: p.image_path,
        category_id: p.category_id,
        kind: p.kind,
        ...summarize(variants, p.price_ils),
        only_variant: single && { id: single.id, sku: single.sku, label_ar: single.label_ar, price_ils: single.price_ils, stock_state: single.stock_state },
        option_names: optionNames,
      };
    });

  return { categories: categories.data as Category[], products: cards };
}

export async function getCatalog(): Promise<Result<Catalog>> {
  try {
    return { data: await catalogData(), error: null };
  } catch (e) {
    // CatalogReadError is already logged; anything else (e.g. wrapped by the cache) is logged here.
    if (!(e instanceof CatalogReadError)) console.error("catalog read", e);
    return { data: null, error: "catalog_unavailable" };
  }
}

/** One active category and its products (the category page); null for an unknown or hidden slug. */
async function categoryData(slug: string): Promise<{ category: Category; products: ProductCard[] } | null> {
  "use cache";
  cacheTag("catalog", `category:${slug}`);
  cacheLife("catalog");
  const { categories, products } = await catalogData();
  const category = categories.find((c) => c.slug === slug);
  return category ? { category, products: products.filter((p) => p.category_id === category.id) } : null;
}

export async function getCategoryShelf(slug: string): Promise<Result<{ category: Category; products: ProductCard[] } | null>> {
  try {
    return { data: await categoryData(slug), error: null };
  } catch (e) {
    // CatalogReadError is already logged; anything else (e.g. wrapped by the cache) is logged here.
    if (!(e instanceof CatalogReadError)) console.error("catalog read", e);
    return { data: null, error: "catalog_unavailable" };
  }
}

/**
 * One product with its options, variants and (for a bundle) contents, through the given client: the public one for
 * the shop (RLS: active products only), the staff session for the admin preview (hidden products too). Throws on a
 * read error; null when there is no such product for this client.
 */
export async function loadProduct(supabase: SupabaseClient, by: { slug: string } | { id: string }): Promise<ProductDetail | null> {
  const query = supabase
    .from("products")
    .select(
      `${PRODUCT_COLUMNS}, description_ar, is_active, category:categories (slug, name_ar),
       product_variants!product_variants_product_id_fkey (${VARIANT_COLUMNS}),
       product_options (id, name_ar, kind, sort, product_option_values (id, label_ar, hex, sort))`,
    );
  const { data, error } = await ("slug" in by ? query.eq("slug", by.slug) : query.eq("id", by.id)).maybeSingle();
  if (error) {
    console.error("loadProduct", error);
    throw new CatalogReadError("product");
  }
  if (!data) return null;

  type Row = {
    id: string; slug: string; name_ar: string; family_ar: string | null; price_ils: number; volume_ml: number | null;
    image_path: string | null; category_id: string; kind: "simple" | "bundle"; description_ar: string | null;
    is_active: boolean; category: { slug: string; name_ar: string } | null; product_variants: RawVariant[];
    product_options: { id: string; name_ar: string; kind: ProductOption["kind"]; sort: number;
      product_option_values: (OptionValue & { sort: number })[] }[];
  };
  const p = data as unknown as Row;

  const [availability, bundle] = await Promise.all([
    availabilityFor(supabase, [p.id]),
    p.kind === "bundle" ? getBundleLines(supabase, p.id) : Promise.resolve({ data: null, error: null }),
  ]);
  if (availability.error || bundle.error) {
    console.error("loadProduct details", availability.error ?? bundle.error);
    throw new CatalogReadError("product details");
  }

  const variants = orderable(p.product_variants, p.price_ils, availability.data);
  const options: ProductOption[] = [...p.product_options].sort(bySort).map((o) => ({
    id: o.id,
    name_ar: o.name_ar,
    kind: o.kind,
    values: [...o.product_option_values].sort(bySort).map(({ id, label_ar, hex }) => ({ id, label_ar, hex })),
  }));

  return {
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    family_ar: p.family_ar,
    volume_ml: p.volume_ml,
    image_path: p.image_path,
    category_id: p.category_id,
    kind: p.kind,
    description_ar: p.description_ar,
    is_active: p.is_active,
    category: p.category,
    ...summarize(variants, p.price_ils),
    options,
    variants,
    bundle: bundle.data,
  };
}

/** The shop's product page: active products only, cached per slug. */
async function productData(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheTag("catalog", `product:${slug}`);
  cacheLife("catalog");
  return loadProduct(createPublicClient(), { slug });
}

export async function getProduct(slug: string): Promise<Result<ProductDetail | null>> {
  try {
    return { data: await productData(slug), error: null };
  } catch (e) {
    if (!(e instanceof CatalogReadError)) console.error("product read", e);
    return { data: null, error: "product_unavailable" };
  }
}

/** Every live product and category slug, for generateStaticParams (prerendered at build). */
export async function getCatalogSlugs(): Promise<{ products: string[]; categories: string[] }> {
  const { data } = await getCatalog();
  return { products: (data?.products ?? []).map((p) => p.slug), categories: (data?.categories ?? []).map((c) => c.slug) };
}

async function getBundleLines(supabase: SupabaseClient, bundleId: string) {
  const { data, error } = await supabase
    .from("bundle_items")
    .select("qty, sort, variant_id, variant:product_variants!bundle_items_variant_id_fkey (price_ils, product:products!product_variants_product_id_fkey (slug, name_ar, price_ils))")
    .eq("bundle_product_id", bundleId)
    .order("sort");
  if (error) return { data: null, error };

  type Row = {
    qty: number; sort: number; variant_id: string;
    variant: { price_ils: number | null; product: { slug: string; name_ar: string; price_ils: number } | null } | null;
  };
  const rows = data as unknown as Row[];
  const labels = await supabase
    .from("variant_availability")
    .select("variant_id, label_ar")
    .in("variant_id", rows.map((r) => r.variant_id));
  if (labels.error) return { data: null, error: labels.error };
  const labelById = new Map((labels.data as { variant_id: string; label_ar: string | null }[]).map((l) => [l.variant_id, l.label_ar]));

  // A component hidden from this visitor still shows as a line (by name only when known); the bundle is «نفدت» anyway.
  const lines: BundleLine[] = rows.map((r) => ({
    qty: r.qty,
    slug: r.variant?.product?.slug ?? null,
    name_ar: r.variant?.product?.name_ar ?? "قطعة غير متوفرة حالياً",
    label_ar: labelById.get(r.variant_id) ?? null,
    unit_price_ils: r.variant ? (r.variant.price_ils ?? r.variant.product?.price_ils ?? 0) : 0,
  }));
  return { data: lines, error: null };
}

/** Product name with its variant label: «طاقية أسود، مقاس L». */
export const variantName = (productName: string, label: string | null) => (label ? `${productName} ${label}` : productName);
