"use client";

import { useEffect } from "react";
import { Button } from "@/components/Button";
import styles from "@/components/StatusPage.module.css";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.status}>
      <h1 className="title">حدث خطأ غير متوقع</h1>
      <p className="body">حاول مرة أخرى بعد قليل.</p>
      <Button variant="ghost" onClick={() => retry()}>
        أعد المحاولة
      </Button>
    </main>
  );
}
