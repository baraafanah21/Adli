import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SealStage } from "@/components/SealStage";
import { Button } from "@/components/Button";
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
  };
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
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

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={category ? `/?c=${category.slug}#shelf` : "/#shelf"}>
        <ArrowBackIcon />
        {category ? category.name_ar : "كل المنتجات"}
      </Link>
      <SealStage product={product} categoryName={category?.name_ar} size="lg" priority>
        {product.description_ar && <p className={`body-lg ${styles.description}`}>{product.description_ar}</p>}
      </SealStage>
    </main>
  );
}
