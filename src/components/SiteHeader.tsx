import Link from "next/link";
import { CategoryNav, CategoryStrip } from "@/components/CategoryNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SealMark } from "@/components/SealMark";
import { CartButton } from "@/components/cart/CartButton";
import { AccountMenu } from "@/components/account/AccountMenu";
import { getCatalog } from "@/lib/catalog";
import styles from "./SiteHeader.module.css";

/** Same for every visitor: the account menu reads the session on the client (see SiteChrome). */
export async function SiteHeader() {
  const catalog = await getCatalog();
  const categories = (catalog.data?.categories ?? []).map(({ slug, name_ar, icon }) => ({ slug, name_ar, icon }));
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.home} aria-label="عدلي، الصفحة الرئيسية">
          <SealMark size="sm" />
        </Link>
        {categories.length > 0 && <CategoryNav categories={categories} />}
        <div className={styles.actions}>
          <ThemeToggle />
          <AccountMenu />
          <CartButton />
          <Link href="/booking" className={styles.bookButton}>
            احجز موعد
          </Link>
        </div>
      </div>
      {categories.length > 0 && <CategoryStrip categories={categories} />}
    </header>
  );
}
