import Link from "next/link";
import { CategoryNav, CategoryStrip } from "@/components/CategoryNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SealMark } from "@/components/SealMark";
import { CartButton } from "@/components/cart/CartButton";
import { AccountMenu } from "@/components/account/AccountMenu";
import { getCurrentUser, getProfile } from "@/lib/auth/guards";
import { getCatalog } from "@/lib/catalog";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const [catalog, user, profile] = await Promise.all([getCatalog(), getCurrentUser(), getProfile()]);
  const categories = (catalog.data?.categories ?? []).map(({ slug, name_ar, icon }) => ({ slug, name_ar, icon }));
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.home} aria-label="عدلي، الصفحة الرئيسية">
          <SealMark size="sm" />
        </Link>
        {categories.length > 0 && <CategoryNav categories={categories} />}
        <div className={styles.actions}>
          {/* Reserved for the bookings track (feature/bookings): the «احجز موعد» button goes here, beside the bottle. */}
          <ThemeToggle />
          <AccountMenu user={user ? { name: profile?.full_name ?? user.name, email: user.email } : null} />
          <CartButton />
        </div>
      </div>
      {categories.length > 0 && <CategoryStrip categories={categories} />}
    </header>
  );
}
