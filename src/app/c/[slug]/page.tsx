import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { ComingSoon } from "@/components/ComingSoon";
import { SealStage } from "@/components/SealStage";
import { ArrowBackIcon, CategoryIcon } from "@/components/icons";
import { getCatalog } from "@/lib/catalog";
import styles from "./page.module.css";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await getCatalog();
  const category = data?.categories.find((c) => c.slug === slug);
  if (!category) return {};
  return { title: category.name_ar, description: category.description_ar ?? undefined };
}

/** One category's shelf. Inactive or unknown slugs are a 404; an active category with no products says «قريباً». */
export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const { data } = await getCatalog();

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <p className="body">تعذّر تحميل المنتجات الآن. حاول مرة أخرى بعد قليل.</p>
          <Button variant="ghost" href={`/c/${slug}`}>
            أعد المحاولة
          </Button>
        </div>
      </main>
    );
  }

  const category = data.categories.find((c) => c.slug === slug);
  if (!category) notFound();
  const products = data.products.filter((p) => p.category_id === category.id);

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/#shelf">
        <ArrowBackIcon />
        كل المنتجات
      </Link>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <CategoryIcon name={category.icon} size={28} />
        </span>
        <h1 className="display-lg">{category.name_ar}</h1>
        {category.description_ar && products.length > 0 && <p className={`body-lg ${styles.lede}`}>{category.description_ar}</p>}
      </header>

      {products.length > 0 ? (
        <ul className="ad-shelf">
          {products.map((p) => (
            <li key={p.id}>
              <SealStage product={p} categoryName={category.name_ar} />
            </li>
          ))}
        </ul>
      ) : (
        <ComingSoon category={category} headingLevel="h2">
          <Button variant="ghost" href="/#shelf">
            تصفّح كل المنتجات
          </Button>
        </ComingSoon>
      )}
    </main>
  );
}
