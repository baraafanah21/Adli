import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog";
import { absolute } from "@/lib/seo";

/**
 * /sitemap.xml: the public pages, and every live category and product from the same cached catalog as the shelf
 * (anon, tag `catalog`): a hidden or archived product, or one in a hidden category, is never listed. A product's
 * lastModified is its row's updated_at; categories have none. If the catalog can't be read, the fixed pages still are.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await getCatalog();
  const categoriesWithProducts = new Set((data?.products ?? []).map((p) => p.category_id));
  return [
    { url: absolute("/"), changeFrequency: "weekly", priority: 1 },
    { url: absolute("/products"), changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/booking"), changeFrequency: "monthly", priority: 0.8 },
    ...(data?.categories ?? [])
      .filter((c) => categoriesWithProducts.has(c.id))
      .map((c) => ({ url: absolute(`/c/${c.slug}`), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...(data?.products ?? []).map((p) => ({
      url: absolute(`/p/${p.slug}`),
      lastModified: p.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
