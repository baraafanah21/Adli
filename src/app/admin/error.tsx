"use client";

import { useEffect } from "react";
import { Button } from "@/components/Button";
import styles from "@/components/StatusPage.module.css";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.status}>
      <h1 className="title">تعذّر تحميل هذه الصفحة</h1>
      <p className="body">حاول مرة أخرى. إذا تكرر الخطأ، تأكد من الاتصال بالإنترنت.</p>
      <Button variant="ghost" onClick={() => retry()}>
        أعد المحاولة
      </Button>
    </main>
  );
}
