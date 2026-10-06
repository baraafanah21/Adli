import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SealStage } from "@/components/SealStage";
import { Button } from "@/components/Button";
import { BundleContents } from "@/components/BundleContents";
import { ProductPurchase } from "@/components/ProductPurchase";
import { ArrowBackIcon } from "@/components/icons";
import { getProduct } from "@/lib/catalog";
import styles from "./page.module.css";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await getProduct(slug);
  if (!data) return {};
  const description = data.description_ar ?? undefined;
  return {
    title: data.name_ar,
    description: description && description.length > 160 ? `${description.slice(0, 157)}…` : description,
    // Staff preview of a hidden product.
    robots: data.is_active ? undefined : { index: false },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { data: product, error } = await getProduct(slug);

  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <p className="body">تعذّر تحميل المنتج الآن. حاول مرة أخرى بعد قليل.</p>
          <Button variant="ghost" href={`/p/${slug}`}>
            أعد المحاولة
          </Button>
        </div>
      </main>
    );
  }
  if (!product) notFound();

  const category = product.category;
  // ?v=sku when it names an active variant; otherwise the first in stock, otherwise the first.
  const requested = typeof query.v === "string" ? query.v : null;
  const initial =
    product.variants.find((v) => v.sku === requested) ??
    product.variants.find((v) => v.stock_state !== "out") ??
    product.variants[0];

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={category ? `/c/${category.slug}` : "/#shelf"}>
        <ArrowBackIcon />
        {category ? category.name_ar : "كل المنتجات"}
      </Link>
      {!product.is_active && (
        <p className={styles.hidden} role="note">
          مخفي: يراه الطاقم فقط، والطلب منه يُرفض حتى يُفعَّل.
        </p>
      )}
      <SealStage
        product={{ ...product, only_variant: null, option_names: product.options.map((o) => o.name_ar) }}
        categoryName={category?.name_ar}
        size="lg"
        preload
        purchase={
          <ProductPurchase
            product={product}
            options={product.options}
            variants={product.variants}
            initialSku={initial?.sku ?? ""}
          />
        }
      >
        {product.description_ar && <p className={`body-lg ${styles.description}`}>{product.description_ar}</p>}
        {product.bundle && <BundleContents lines={product.bundle} bundlePrice={initial?.price_ils ?? product.price_ils} />}
      </SealStage>
    </main>
  );
}
