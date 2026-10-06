"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { updateProduct } from "@/app/admin/products/actions";
import styles from "./forms.module.css";

export type EditableProduct = {
  id: string;
  slug: string;
  name_ar: string;
  family_ar: string | null;
  description_ar: string | null;
  price_ils: number;
  volume_ml: number | null;
  category_id: string;
  sort: number;
  is_active: boolean;
  kind: "simple" | "bundle";
};

type Props = { product: EditableProduct; categories: { id: string; name_ar: string }[] };

export function ProductDetailsForm({ product: p, categories }: Props) {
  const f = (name: string) => `pd-${name}`;
  return (
    <section className={styles.section} aria-labelledby="pd-title">
      <h2 id="pd-title">التفاصيل</h2>
      <ActionForm action={updateProduct} submit="حفظ التفاصيل">
        <input type="hidden" name="id" value={p.id} />
        <div className={styles.grid}>
          <div className={`ad-field ${styles.wide}`}>
            <label htmlFor={f("name")}>الاسم</label>
            <input id={f("name")} name="name" required maxLength={120} defaultValue={p.name_ar} />
          </div>
          <div className="ad-field">
            <label htmlFor={f("slug")}>الرابط</label>
            <input id={f("slug")} name="slug" required dir="ltr" maxLength={80} defaultValue={p.slug} />
            <span className="ad-field__hint">تغييره يغيّر رابط صفحة المنتج.</span>
          </div>
          <div className="ad-field">
            <label htmlFor={f("category")}>الفئة</label>
            <select id={f("category")} name="categoryId" defaultValue={p.category_id}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="ad-field">
            <label htmlFor={f("price")}>{p.kind === "bundle" ? "سعر البكجة (₪)" : "السعر (₪)"}</label>
            <input id={f("price")} name="price" type="number" inputMode="numeric" min={0} step={1} dir="ltr" required defaultValue={p.price_ils} />
            {p.kind === "simple" && <span className="ad-field__hint">سعر كل النسخ، إلا نسخة لها سعرها الخاص.</span>}
          </div>
          <div className="ad-field">
            <label htmlFor={f("volume")}>الحجم بالمل (اختياري)</label>
            <input id={f("volume")} name="volume" type="number" inputMode="numeric" min={1} step={1} dir="ltr" defaultValue={p.volume_ml ?? ""} />
          </div>
          <div className="ad-field">
            <label htmlFor={f("family")}>السطر القصير (اختياري)</label>
            <input id={f("family")} name="family" maxLength={60} defaultValue={p.family_ar ?? ""} placeholder="عطر شرقي، أو زبدة الشيا" />
          </div>
          <div className="ad-field">
            <label htmlFor={f("sort")}>الترتيب في الفئة</label>
            <input id={f("sort")} name="sort" type="number" inputMode="numeric" step={1} dir="ltr" required defaultValue={p.sort} />
          </div>
          <div className={`ad-field ${styles.wide}`}>
            <label htmlFor={f("description")}>الوصف</label>
            <textarea id={f("description")} name="description" rows={4} maxLength={2000} defaultValue={p.description_ar ?? ""} />
          </div>
          <label className={`ad-check ${styles.wide}`}>
            <input type="checkbox" name="active" defaultChecked={p.is_active} />
            ظاهر في الموقع
          </label>
        </div>
      </ActionForm>
    </section>
  );
}
