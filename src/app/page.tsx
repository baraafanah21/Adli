import { SealMark } from "@/components/SealMark";
import { Shelf } from "@/components/Shelf";
import { Button } from "@/components/Button";
import { getCatalog } from "@/lib/catalog";
import styles from "./page.module.css";

export default async function Home() {
  const catalog = await getCatalog();

  return (
    <main>
      <section className={styles.hero}>
        <SealMark />
        <h1 className={`display-xl ${styles.wordmark}`}>عدلي</h1>
        <p className="latin-mark">ADLI</p>
        <p className={`body-lg ${styles.lede}`}>صالون حلاقة رجالي، وعطور وكريمات تختارها هنا وتثبّت طلبها على واتساب.</p>
      </section>

      <section id="shelf" className={styles.shelf} aria-labelledby="shelf-title" tabIndex={-1}>
        <h2 id="shelf-title" className="title">
          منتجات الصالون
        </h2>
        {catalog.data ? (
          <Shelf categories={catalog.data.categories} products={catalog.data.products} />
        ) : (
          <div className={styles.error} role="alert">
            <p className="body">تعذّر تحميل المنتجات الآن. حاول مرة أخرى بعد قليل.</p>
            <Button variant="ghost" href="/">
              أعد المحاولة
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
