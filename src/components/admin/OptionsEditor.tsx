"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/admin/errors";
import { ActionForm } from "@/components/admin/ActionForm";
import {
  deleteOption,
  deleteOptionValue,
  generateVariants,
  saveOption,
  saveOptionValue,
} from "@/app/admin/products/actions";
import styles from "./forms.module.css";
import own from "./OptionsEditor.module.css";

export type EditorOption = {
  id: string;
  name_ar: string;
  kind: "size" | "color" | "text";
  sort: number;
  values: { id: string; label_ar: string; hex: string | null }[];
};

const KIND_LABEL = { size: "مقاس", color: "لون", text: "نص" } as const;

type Props = { productId: string; options: EditorOption[]; usedValueIds: string[] };

/**
 * Options («المقاس», «اللون») and their values, then «ولّد النسخ». A value or option already used by a variant can't
 * be deleted (the database refuses too); hide the variant instead.
 */
export function OptionsEditor({ productId, options, usedValueIds }: Props) {
  const used = new Set(usedValueIds);
  const nextSort = options.reduce((m, o) => Math.max(m, o.sort), 0) + 1;

  return (
    <section className={styles.section} aria-labelledby="opt-title">
      <h2 id="opt-title">الخيارات</h2>
      <p className={styles.lede}>
        مثلاً «المقاس» بالقيم S وM وL، أو «اللون» بقيم لكل منها درجتها. بعد إضافة القيم اضغط «ولّد النسخ» لتُنشأ نسخة لكل
        تركيبة. المنتج بلا خيارات له نسخة واحدة.
      </p>

      {options.map((o) => {
        const optionUsed = o.values.some((v) => used.has(v.id));
        return (
          <div key={o.id} className={own.option}>
            <ActionForm
              action={saveOption}
              submit="حفظ الخيار"
              variant="ghost"
              className={own.optionHead}
              aside={
                !optionUsed && (
                  <DeleteButton action={deleteOption} label={`حذف الخيار ${o.name_ar}`} />
                )
              }
            >
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="optionId" value={o.id} />
              <div className={styles.row}>
                <div className="ad-field">
                  <label htmlFor={`on-${o.id}`}>اسم الخيار</label>
                  <input id={`on-${o.id}`} name="name" required maxLength={40} defaultValue={o.name_ar} />
                </div>
                <div className="ad-field">
                  <label htmlFor={`ok-${o.id}`}>النوع</label>
                  <select id={`ok-${o.id}`} name="kind" defaultValue={o.kind}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ad-field">
                  <label htmlFor={`os-${o.id}`}>الترتيب</label>
                  <input id={`os-${o.id}`} name="sort" type="number" step={1} dir="ltr" defaultValue={o.sort} />
                </div>
              </div>
            </ActionForm>

            <ul className={own.values}>
              {o.values.map((v) => (
                <li key={v.id}>
                  <ActionForm
                    action={saveOptionValue}
                    submit="حفظ"
                    variant="ghost"
                    className={own.value}
                    aside={
                      used.has(v.id) ? (
                        <span className={styles.muted}>مستعملة في نسخ</span>
                      ) : (
                        <DeleteButton action={deleteOptionValue} label={`حذف ${v.label_ar}`} />
                      )
                    }
                  >
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="optionId" value={o.id} />
                    <input type="hidden" name="valueId" value={v.id} />
                    <div className={styles.row}>
                      <div className="ad-field">
                        <label htmlFor={`vl-${v.id}`}>القيمة</label>
                        <input id={`vl-${v.id}`} name="label" required maxLength={40} defaultValue={v.label_ar} />
                      </div>
                      {o.kind === "color" && <HexField id={`vh-${v.id}`} defaultValue={v.hex ?? "#000000"} />}
                    </div>
                  </ActionForm>
                </li>
              ))}
            </ul>

            <ActionForm action={saveOptionValue} submit="أضف القيمة" variant="ghost" className={own.value}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="optionId" value={o.id} />
              <div className={styles.row}>
                <div className="ad-field">
                  <label htmlFor={`nv-${o.id}`}>قيمة جديدة لـ «{o.name_ar}»</label>
                  <input id={`nv-${o.id}`} name="label" required maxLength={40} placeholder={o.kind === "color" ? "أسود" : "L"} />
                </div>
                {o.kind === "color" && <HexField id={`nh-${o.id}`} defaultValue="#000000" />}
              </div>
            </ActionForm>
          </div>
        );
      })}

      <div className={own.option}>
        <ActionForm action={saveOption} submit="أضف الخيار">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="optionId" value="" />
          <input type="hidden" name="sort" value={nextSort} />
          <div className={styles.row}>
            <div className="ad-field">
              <label htmlFor="new-option-name">خيار جديد</label>
              <input id="new-option-name" name="name" required maxLength={40} placeholder="المقاس" />
            </div>
            <div className="ad-field">
              <label htmlFor="new-option-kind">النوع</label>
              <select id="new-option-kind" name="kind" defaultValue="size">
                {Object.entries(KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
      </div>

      {options.length > 0 && (
        <ActionForm action={generateVariants} submit="ولّد النسخ" pendingLabel="جارٍ التوليد…">
          <input type="hidden" name="productId" value={productId} />
          <p className={styles.muted}>
            تُنشأ نسخة لكل تركيبة ناقصة، مخزونها 0 وسعرها سعر المنتج. النسخ التي لا تغطي كل الخيارات (مثل النسخة الأساسية) تُخفى ولا
            تُحذف.
          </p>
        </ActionForm>
      )}
    </section>
  );
}

/** A colour picker plus the hex as text (screen readers and exact values), kept in sync. */
function HexField({ id, defaultValue }: { id: string; defaultValue: string }) {
  const [hex, setHex] = useState(defaultValue.toUpperCase());
  return (
    <div className="ad-field">
      <label htmlFor={id}>الدرجة</label>
      <span className={own.hex}>
        <input id={id} type="color" value={hex} onChange={(e) => setHex(e.target.value.toUpperCase())} aria-describedby={`${id}-v`} />
        <input name="hex" value={hex} onChange={(e) => setHex(e.target.value)} dir="ltr" maxLength={7} aria-label="رمز الدرجة" id={`${id}-v`} />
      </span>
    </div>
  );
}

/**
 * «حذف» inside a save form (forms can't nest): the button's formAction sends the same hidden ids
 * (productId + optionId / valueId) to the delete action, and shows that action's own result.
 */
function DeleteButton({ action, label }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; label: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <>
      <button type="submit" formAction={formAction} formNoValidate className={own.delete} aria-label={label} disabled={pending}>
        {pending ? "جارٍ الحذف…" : "حذف"}
      </button>
      {state && !state.ok && (
        <span className={own.deleteError} role="alert">
          {state.message}
        </span>
      )}
    </>
  );
}
