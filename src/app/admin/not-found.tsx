import Link from "next/link";
import styles from "./admin-page.module.css";

// notFound() inside the admin (an unknown order code): stays in the admin frame.
// A wrong role never gets here: the layout's requireRole() 404s first, with the public site's 404 page.
export default function AdminNotFound() {
  return (
    <main className={styles.page}>
      <h1 className="title">لم نجد هذه الصفحة</h1>
      <p className={styles.soon}>ربما تغيّر رقم الطلب أو الرابط. ابحث عنه في قائمة الطلبات.</p>
      <Link className="ad-btn ad-btn--ghost" href="/admin/orders">
        الطلبات
      </Link>
    </main>
  );
}
