import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { ComingSoon } from "@/components/ComingSoon";
import { SealStage } from "@/components/SealStage";
import { ArrowBackIcon, CategoryIcon } from "@/components/icons";
import { getCatalogSlugs, getCategoryShelf } from "@/lib/catalog";
import styles from "./page.module.css";

/** Every active category is prerendered; one added later is built on its first visit (cached the same way). */
export async function generateStaticParams() {
  const { categories } = await getCatalogSlugs();
  return categories.length ? categories.map((slug) => ({ slug })) : [{ slug: "perfumes" }];
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await getCategoryShelf(slug);
  const category = data?.category;
  if (!category) return {};
  return { title: category.name_ar, description: category.description_ar ?? undefined };
}

/**
 * One category's shelf. Inactive or unknown slugs are a 404 (a real one from src/proxy.ts; notFound() here is the
 * fallback); an active category with no products says «قريباً».
 */
export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const { data, error } = await getCategoryShelf(slug);

  if (error) {
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

  if (!data) notFound();
  const { category, products } = data;

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
          {/* The first card's photo is the page's LCP on a phone: preload it, and only it. */}
          {products.map((p, i) => (
            <li key={p.id}>
              <SealStage product={p} categoryName={category.name_ar} preload={i === 0} />
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
