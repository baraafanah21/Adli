import Link from "next/link";
import { CategoryNav } from "@/components/CategoryNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SealMark } from "@/components/SealMark";
import { BottleIcon } from "@/components/icons";
import { getCatalog } from "@/lib/catalog";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const catalog = await getCatalog();
  const categories = catalog.data?.categories ?? [];
  // The cart arrives in Phase 2; the count stays 0 until then.
  const count = 0;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.home} aria-label="عدلي، الصفحة الرئيسية">
          <SealMark size="sm" />
        </Link>
        {categories.length > 0 && <CategoryNav categories={categories} />}
        <div className={styles.actions}>
          <ThemeToggle />
          <button type="button" className={styles.iconButton} aria-label={`سلة الطلب: ${count}`}>
            <BottleIcon size={26} />
            <span className={styles.badge} aria-hidden="true">
              {count}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
