import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/Button";
import { ShelfControls, ShelfControlsFromUrl } from "@/components/Shelf";
import { ShelfGrid } from "@/components/ShelfGrid";
import { getCatalog } from "@/lib/catalog";
import { productCount } from "@/lib/format";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "كل المنتجات",
  description: "عطور وكريمات صالون عدلي، كلها في صفحة واحدة. اختر منتجك وثبّت طلبك على واتساب.",
  // ?c= only filters what is already on the page: one canonical address for every filter.
  alternates: { canonical: "/products" },
};

/**
 * Every published product, with the category chips (?c=slug, applied on the client: the page itself is the cached
 * catalog, the same for everyone). The home page shows the first few and links here. The cards are rendered once on
 * the server (<ShelfGrid>); only the search field, the chips and the filter are client code (<ShelfControls>).
 */
export default async function ProductsPage() {
  const catalog = await getCatalog();

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className="display-lg">كل المنتجات</h1>
        {catalog.data && catalog.data.products.length > 0 && (
          <p className={styles.count}>{productCount(catalog.data.products.length)}</p>
        )}
      </header>

      {catalog.data ? (
        <>
          <Suspense fallback={<ShelfControls categories={catalog.data.categories} products={catalog.data.products} />}>
            <ShelfControlsFromUrl categories={catalog.data.categories} products={catalog.data.products} />
          </Suspense>
          <ShelfGrid categories={catalog.data.categories} products={catalog.data.products} />
        </>
      ) : (
        <div className={styles.error} role="alert">
          <p className="body">تعذّر تحميل المنتجات الآن. حاول مرة أخرى بعد قليل.</p>
          <Button variant="ghost" href="/products">
            أعد المحاولة
          </Button>
        </div>
      )}
    </main>
  );
}
