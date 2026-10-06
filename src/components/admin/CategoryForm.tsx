"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveCategory } from "@/app/admin/categories/actions";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/icons";
import styles from "./forms.module.css";
import own from "./CategoryForm.module.css";

export type EditableCategory = {
  id: string;
  slug: string;
  name_ar: string;
  icon: string | null;
  description_ar: string | null;
  sort: number;
  is_active: boolean;
};

/** Spoken names for the icon picker (screen readers). */
const ICON_NAME_AR: Record<(typeof CATEGORY_ICON_NAMES)[number], string> = {
  perfume: "عطر",
  shaver: "ماكنة حلاقة",
  cap: "طاقية",
  watch: "ساعة",
  underwear: "ملابس داخلية",
  sports: "رياضة",
  sunglasses: "نظارة شمسية",
  gift: "هدية",
  beard: "لحية",
  body: "عناية بالجسم",
};

/** Add (no category) or edit a category. The icon is one of the fixed set the database allows. */
export function CategoryForm({ category: c, nextSort }: { category?: EditableCategory; nextSort: number }) {
  const key = c?.id ?? "new";
  const [description, setDescription] = useState(c?.description_ar ?? "");
  return (
    <ActionForm action={saveCategory} submit={c ? "حفظ الفئة" : "أضف الفئة"}>
      <input type="hidden" name="id" value={c?.id ?? ""} />
      <div className={styles.grid}>
        <div className="ad-field">
          <label htmlFor={`cn-${key}`}>الاسم</label>
          <input id={`cn-${key}`} name="name" required maxLength={60} defaultValue={c?.name_ar ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor={`cs-${key}`}>الرابط</label>
          <input id={`cs-${key}`} name="slug" required dir="ltr" maxLength={40} defaultValue={c?.slug ?? ""} placeholder="hair-beard" />
          <span className="ad-field__hint">يظهر في عنوان صفحة الفئة: /c/hair-beard</span>
        </div>
        <div className={`ad-field ${styles.wide}`}>
          <label htmlFor={`cd-${key}`}>وصف قصير</label>
          <textarea
            id={`cd-${key}`}
            name="description"
            rows={2}
            maxLength={140}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="ad-field__hint" aria-live="polite">
            {description.length} من 140 حرفاً. يظهر في صفحة الفئة وفي «قريباً».
          </span>
        </div>
        <fieldset className={`${own.icons} ${styles.wide}`}>
          <legend>الأيقونة</legend>
          <div className={own.iconGrid}>
            {CATEGORY_ICON_NAMES.map((name) => (
              <label key={name} className={own.icon}>
                <input type="radio" name="icon" value={name} defaultChecked={(c?.icon ?? CATEGORY_ICON_NAMES[0]) === name} className="sr-only" />
                <CategoryIcon name={name} size={28} />
                <span className="sr-only">{ICON_NAME_AR[name]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="ad-field">
          <label htmlFor={`co-${key}`}>الترتيب</label>
          <input id={`co-${key}`} name="sort" type="number" step={1} dir="ltr" required defaultValue={c?.sort ?? nextSort} />
        </div>
        <label className="ad-check">
          <input type="checkbox" name="active" defaultChecked={c?.is_active ?? true} />
          ظاهرة في الموقع
        </label>
      </div>
    </ActionForm>
  );
}
