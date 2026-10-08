import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/Button";
import styles from "./StatusPage.module.css";

/**
 * The 404 content. Each not-found.tsx renders it inside whatever frame it sits in:
 * (site) and admin already have their header from the layout; the root one adds SiteChrome itself.
 */
export function NotFoundBody() {
  return (
    <main className={styles.status}>
      <BrandMark kind="seal" width={120} />
      <h1 className="display-md">لم نجد هذه الصفحة</h1>
      <p className="body">ربما تغيّر الرابط أو لم يعد المنتج متوفراً.</p>
      <div className={styles.actions}>
        <Button variant="primary" href="/#shelf">
          تصفّح المنتجات
        </Button>
        <Button variant="ghost" href="/booking">
          احجز موعد
        </Button>
      </div>
    </main>
  );
}
