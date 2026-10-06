import styles from "@/app/admin/admin-page.module.css";

/** A section that is part of the admin's structure but arrives in a later Phase F step. */
export function AdminSoon({ title, step }: { title: string; step: string }) {
  return (
    <main className={styles.page}>
      <h1 className="title">{title}</h1>
      <p className={styles.soon}>هذا القسم قيد البناء، ويصل في الخطوة {step} من لوحة الصالون.</p>
    </main>
  );
}
