import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { ProductPurchase, ProductPurchaseFromUrl } from "@/components/ProductPurchase";
import { ProductUnavailable, ProductView, initialVariant, relatedProducts } from "@/components/ProductView";
import { HOME_SHELF, getCatalog, getCatalogSlugs, getProduct } from "@/lib/catalog";
import { formatPrice, productImageSrc } from "@/lib/format";
import { breadcrumbJsonLd, clampDescription, pageMeta, productJsonLd } from "@/lib/seo";

/*
  Only the home shelf's products are prerendered; every other product is built on its first visit, then cached the
  same way (tag `catalog`). Every deployment, Preview included, writes what it prerenders to Vercel's ISR cache: all
  84 product pages were ~1,300 of a deploy's ~1,800 write units (Hobby: 200,000 a month). docs/PERFORMANCE.md «ISR».
  Cache Components needs at least one param here.
*/
export async function generateStaticParams() {
  const { products } = await getCatalogSlugs();
  return products.length ? products.slice(0, HOME_SHELF).map((slug) => ({ slug })) : [{ slug: "oud-malaki" }];
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await getProduct(slug);
  if (!data) return {};
  const price = `${data.price_varies ? "من " : ""}${formatPrice(data.price_ils)}`;
  const image = productImageSrc(data.image_path, "lg");
  return pageMeta({
    title: data.name_ar,
    description: clampDescription(
      data.description_ar
        ? `${data.name_ar} من صالون عدلي في قلقيلية، ${price}. ${data.description_ar}`
        : `${data.name_ar} من صالون عدلي، صالون حلاقة رجالية في قلقيلية. ${price}، اطلبه برسالة واتساب واستلمه من الصالون.`,
    ),
    path: `/p/${data.slug}`,
    // The product's own photo (the large 4:5 WebP) when shared; without one, the site's picture.
    image: image ? { url: image, alt: data.name_ar, width: 1600, height: 2000 } : undefined,
  });
}

/**
 * The shop's product page: active products only (cached, read as anon). A hidden product is a 404 here (a real one
 * from src/proxy.ts); staff look at it in /admin/products/[id]/preview.
 */
export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const [{ data: product, error }, catalog] = await Promise.all([getProduct(slug), getCatalog()]);
  if (error) return <ProductUnavailable href={`/p/${slug}`} />;
  if (!product) notFound();

  // «من نفس الرف» from the cached catalog (no extra query); a catalog error just leaves it out.
  const categoryId = catalog.data?.categories.find((c) => c.slug === product.category?.slug)?.id;
  const related = catalog.data ? relatedProducts(catalog.data.products, product, categoryId) : [];

  const purchase = {
    product,
    options: product.options,
    variants: product.variants,
    initialSku: initialVariant(product)?.sku ?? "",
  };
  const trail = [
    { name: "المنتجات", path: "/products" },
    ...(product.category ? [{ name: product.category.name_ar, path: `/c/${product.category.slug}` }] : []),
    { name: product.name_ar, path: `/p/${product.slug}` },
  ];
  return (
    <>
      <JsonLd data={[productJsonLd(product), breadcrumbJsonLd(trail)]} />
      <ProductView
      product={product}
      related={related}
      purchase={
        <Suspense fallback={<ProductPurchase {...purchase} />}>
          <ProductPurchaseFromUrl {...purchase} />
        </Suspense>
      }
    />
    </>
  );
}
