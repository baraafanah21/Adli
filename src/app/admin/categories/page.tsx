import type { Metadata } from "next";
import { CategoryForm, type EditableCategory } from "@/components/admin/CategoryForm";
import { CategoryIcon } from "@/components/icons";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import formStyles from "@/components/admin/forms.module.css";
import styles from "./categories.module.css";

export const metadata: Metadata = { title: "الفئات" };

type Row = EditableCategory & { products: { count: number }[] };

export default async function AdminCategoriesPage() {
  await requireRole(["owner"], "/admin/categories");
  const supabase = await createClient();
  // The owner reads hidden categories too (RLS: is_active or staff).
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name_ar, icon, description_ar, sort, is_active, products(count)")
    .order("sort");
  if (error) console.error("admin categories", error.code, error.message);
  const rows = (data ?? []) as Row[];
  const nextSort = rows.reduce((m, c) => Math.max(m, c.sort), 0) + 1;

  return (
    <main className={styles.page}>
      <h1 className="title">الفئات</h1>
      <p className={formStyles.lede}>
        الفئة المخفية لا تظهر في الموقع ولا في القائمة. الفئة الظاهرة بلا منتجات تظهر بـ «قريباً». لحذف فئة، أخفِها.
      </p>

      {error && (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل الفئات. حدّث الصفحة بعد قليل.
        </p>
      )}

      <ul className={styles.list}>
        {rows.map(({ products, ...c }) => (
          <li key={c.id} className={styles.item}>
            <details>
              <summary className={styles.summary}>
                <span className={styles.icon} aria-hidden="true">
                  <CategoryIcon name={c.icon} />
                </span>
                <span className={styles.main}>
                  <span className={styles.name}>{c.name_ar}</span>
                  <span className={styles.meta}>
                    {products[0]?.count ?? 0} منتج · /c/{c.slug}
                  </span>
                </span>
                <span className={styles.state} data-active={c.is_active || undefined}>
                  {c.is_active ? "ظاهرة" : "مخفية"}
                </span>
              </summary>
              <div className={styles.body}>
                <CategoryForm category={c} nextSort={nextSort} />
              </div>
            </details>
          </li>
        ))}
      </ul>

      <section className={formStyles.section} aria-labelledby="new-cat">
        <h2 id="new-cat">فئة جديدة</h2>
        <CategoryForm nextSort={nextSort} />
      </section>
    </main>
  );
}
