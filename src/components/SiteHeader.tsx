import Link from "next/link";
import { CategoryNav, CategoryStrip } from "@/components/CategoryNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/brand/BrandMark";
import { CartButton } from "@/components/cart/CartButton";
import { AccountMenu } from "@/components/account/AccountMenu";
import { SearchButton } from "@/components/search/SearchButton";
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
          {/* Phones: the seal. From 720px: the wordmark, in the text colour (cream at night, forest by day). */}
          <BrandMark kind="seal" width={36} className={styles.homeSeal} />
          <BrandMark kind="wordmark" tone="mono" height={38} className={styles.homeWordmark} />
        </Link>
        {categories.length > 0 && <CategoryNav categories={categories} />}
        <div className={styles.actions}>
          <SearchButton />
          <ThemeToggle />
          <AccountMenu />
          <CartButton />
          <Link href="/booking" className={styles.bookButton} data-magnetic>
            احجز موعد
          </Link>
        </div>
      </div>
      {categories.length > 0 && <CategoryStrip categories={categories} />}
    </header>
  );
}
