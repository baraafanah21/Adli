import { SealMark } from "@/components/SealMark";
import { Button } from "@/components/Button";
import styles from "./status.module.css";

export default function NotFound() {
  return (
    <main className={styles.status}>
      <SealMark />
      <h1 className="title">لم نجد هذه الصفحة</h1>
      <p className="body">ربما تغيّر الرابط أو لم يعد المنتج متوفراً.</p>
      <Button variant="ghost" href="/#shelf">
        تصفّح المنتجات
      </Button>
    </main>
  );
}
