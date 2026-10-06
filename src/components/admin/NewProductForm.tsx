"use client";

import { useActionState } from "react";
import { createProduct } from "@/app/admin/products/actions";
import styles from "./forms.module.css";

type Props = { categories: { id: string; name_ar: string }[]; defaultKind: "simple" | "bundle" };

/** The minimum to create a product; everything else is on its page after. It starts hidden. */
export function NewProductForm({ categories, defaultKind }: Props) {
  const [state, action, pending] = useActionState(createProduct, null);
  return (
    <form action={action} className={styles.section}>
      <div className={styles.grid}>
        <div className="ad-field">
          <label htmlFor="np-kind">النوع</label>
          <select id="np-kind" name="kind" defaultValue={defaultKind}>
            <option value="simple">منتج</option>
            <option value="bundle">بكجة هدية</option>
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor="np-category">الفئة</label>
          <select id="np-category" name="categoryId" required defaultValue={categories[0]?.id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div className={`ad-field ${styles.wide}`}>
          <label htmlFor="np-name">الاسم</label>
          <input id="np-name" name="name" required maxLength={120} placeholder="مثلاً: عود ملكي" />
        </div>
        <div className="ad-field">
          <label htmlFor="np-slug">الرابط</label>
          <input id="np-slug" name="slug" required dir="ltr" maxLength={80} pattern="[a-z0-9\-]{2,80}" placeholder="oud-malaki" />
          <span className="ad-field__hint">حروف إنجليزية صغيرة وأرقام وشرطة. يظهر في عنوان الصفحة: /p/oud-malaki</span>
        </div>
        <div className="ad-field">
          <label htmlFor="np-price">السعر (₪)</label>
          <input id="np-price" name="price" required type="number" inputMode="numeric" min={0} step={1} dir="ltr" />
        </div>
      </div>
      <p className={`ad-notice ${state?.ok ? "ad-notice--ok" : "ad-notice--error"}`} role="alert">
        {state?.message ?? ""}
      </p>
      <div className={styles.actions}>
        <button type="submit" className="ad-btn ad-btn--primary" disabled={pending}>
          {pending ? "جارٍ الإنشاء…" : "أنشئ المنتج"}
        </button>
      </div>
      <p className={styles.muted}>يبدأ المنتج مخفياً ومخزونه 0. أكمل الصورة والخيارات، ثم أظهره من صفحته.</p>
    </form>
  );
}
