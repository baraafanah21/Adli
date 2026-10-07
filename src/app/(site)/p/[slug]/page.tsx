import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductPurchase, ProductPurchaseFromUrl } from "@/components/ProductPurchase";
import { ProductUnavailable, ProductView, initialVariant } from "@/components/ProductView";
import { getCatalogSlugs, getProduct } from "@/lib/catalog";

/** Every live product is prerendered; one shown later is built on its first visit (cached the same way). */
export async function generateStaticParams() {
  const { products } = await getCatalogSlugs();
  return products.length ? products.map((slug) => ({ slug })) : [{ slug: "oud-malaki" }];
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await getProduct(slug);
  if (!data) return {};
  const description = data.description_ar ?? undefined;
  return {
    title: data.name_ar,
    description: description && description.length > 160 ? `${description.slice(0, 157)}…` : description,
  };
}

/**
 * The shop's product page: active products only (cached, read as anon). A hidden product is a 404 here (a real one
 * from src/proxy.ts); staff look at it in /admin/products/[id]/preview.
 */
export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { data: product, error } = await getProduct(slug);
  if (error) return <ProductUnavailable href={`/p/${slug}`} />;
  if (!product) notFound();

  const purchase = {
    product,
    options: product.options,
    variants: product.variants,
    initialSku: initialVariant(product)?.sku ?? "",
  };
  return (
    <ProductView
      product={product}
      purchase={
        <Suspense fallback={<ProductPurchase {...purchase} />}>
          <ProductPurchaseFromUrl {...purchase} />
        </Suspense>
      }
    />
  );
}
