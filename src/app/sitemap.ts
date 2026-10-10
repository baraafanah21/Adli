import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog";
import { productImageSrc } from "@/lib/format";
import { absolute } from "@/lib/seo";

/**
 * /sitemap.xml: the public pages, and every live category and product from the same cached catalog as the shelf
 * (anon, tag `catalog`): a hidden or archived product, or one in a hidden category, is never listed. A product's
 * lastModified is its row's updated_at and its photo is listed with it; categories have none. If the catalog can't be read, the fixed pages still are.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await getCatalog();
  const categoriesWithProducts = new Set((data?.products ?? []).map((p) => p.category_id));
  return [
    { url: absolute("/"), changeFrequency: "weekly", priority: 1 },
    { url: absolute("/products"), changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/booking"), changeFrequency: "monthly", priority: 0.8 },
    { url: absolute("/privacy"), changeFrequency: "yearly", priority: 0.3 },
    ...(data?.categories ?? [])
      .filter((c) => categoriesWithProducts.has(c.id))
      .map((c) => ({ url: absolute(`/c/${c.slug}`), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...(data?.products ?? []).map((p) => {
      const image = productImageSrc(p.image_path, "lg");
      return {
        url: absolute(`/p/${p.slug}`),
        lastModified: p.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.7,
        // The product page's large photo (image sitemap: https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps).
        ...(image && { images: [image] }),
      };
    }),
  ];
}
