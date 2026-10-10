import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { ComingSoon } from "@/components/ComingSoon";
import { JsonLd } from "@/components/JsonLd";
import { SealStage } from "@/components/SealStage";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CategoryIcon } from "@/components/icons";
import { getCatalog, getCatalogSlugs, getCategoryShelf } from "@/lib/catalog";
import { productCount } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { breadcrumbJsonLd, clampDescription, pageMeta } from "@/lib/seo";
import styles from "./page.module.css";

/** The category's own words (categories.description_ar), or one plain line when the owner hasn't written any. */
const categoryLede = (c: { name_ar: string; description_ar: string | null }) =>
  c.description_ar?.trim() || `${c.name_ar} من ${SALON.name} في ${SALON.city}، تطلبها برسالة واتساب وتستلمها من الصالون.`;

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
  // «عطور في قلقيلية | صالون عدلي»: what the page is, where, and whose (under 60 characters for every category).
  return pageMeta({
    fullTitle: `${category.name_ar} في ${SALON.city} | ${SALON.name}`,
    description: clampDescription(`${category.name_ar} في ${SALON.city} من ${SALON.name}: ${categoryLede(category)} اطلبها برسالة واتساب واستلمها من الصالون.`),
    path: `/c/${category.slug}`,
  });
}

/**
 * One category's shelf. Inactive or unknown slugs are a 404 (a real one from src/proxy.ts; notFound() here is the
 * fallback); an active category with no products says «قريباً».
 */
export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const [{ data, error }, catalog] = await Promise.all([getCategoryShelf(slug), getCatalog()]);

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
  // «تصنيفات أخرى»: the other categories that have products (the cached catalog, no extra query).
  const others = (catalog.data?.categories ?? []).filter(
    (c) => c.slug !== category.slug && catalog.data!.products.some((p) => p.category_id === c.id),
  );

  return (
    <main className={styles.page}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "المنتجات", path: "/products" },
          { name: category.name_ar, path: `/c/${category.slug}` },
        ])}
      />
      <Breadcrumbs trail={[{ name: "المنتجات", path: "/products" }]} />
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <CategoryIcon name={category.icon} size={28} />
        </span>
        <h1 className="display-lg">
          {category.name_ar} <span className={styles.city}>في {SALON.city}</span>
        </h1>
        <p className={`body-lg ${styles.lede}`}>{categoryLede(category)}</p>
        {products.length > 0 && <p className={styles.count}>{productCount(products.length)}</p>}
      </header>

      {products.length > 0 ? (
        <ul className="ad-shelf">
          {/* The first card's photo is the page's LCP on a phone: preload it, and only it. */}
          {products.map((p, i) => (
            <li key={p.id}>
              <SealStage product={p} categoryName={category.name_ar} preload={i === 0} nameAs="h2" />
            </li>
          ))}
        </ul>
      ) : (
        // The description is already under the h1; ComingSoon only says «قريباً».
        <ComingSoon category={{ ...category, description_ar: null }} headingLevel="h2">
          <Button variant="ghost" href="/products">
            تصفّح كل المنتجات
          </Button>
        </ComingSoon>
      )}

      {others.length > 0 && (
        <nav className={`${styles.others} ad-reveal`} aria-labelledby="others-title">
          <h2 id="others-title" className={styles.othersTitle}>
            تصنيفات أخرى
          </h2>
          <ul className="ad-chips">
            {others.map((c) => (
              <li key={c.slug}>
                <Link className={`ad-chip ${styles.otherChip}`} href={`/c/${c.slug}`}>
                  <CategoryIcon name={c.icon} size={20} />
                  {c.name_ar}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
