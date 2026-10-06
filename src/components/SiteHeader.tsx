import Link from "next/link";
import { CategoryNav } from "@/components/CategoryNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SealMark } from "@/components/SealMark";
import { CartButton } from "@/components/cart/CartButton";
import { getCatalog } from "@/lib/catalog";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const catalog = await getCatalog();
  const categories = catalog.data?.categories ?? [];
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.home} aria-label="عدلي، الصفحة الرئيسية">
          <SealMark size="sm" />
        </Link>
        {categories.length > 0 && <CategoryNav categories={categories} />}
        <div className={styles.actions}>
          <ThemeToggle />
          <CartButton />
        </div>
      </div>
    </header>
  );
}
