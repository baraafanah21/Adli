import { ActionForm } from "@/components/admin/ActionForm";
import { updateVariant } from "@/app/admin/products/actions";
import type { StockState } from "@/lib/catalog";
import styles from "./forms.module.css";
import own from "./VariantsEditor.module.css";

export type EditorVariant = {
  id: string;
  sku: string;
  /** The label shown on the site: the override, or «أسود، مقاس L» generated from the values. */
  label: string | null;
  /** Only the override (variants.label_ar). */
  label_override: string | null;
  price_ils: number | null;
  low_stock_threshold: number;
  stock_quantity: number;
  stock_state: StockState;
  is_active: boolean;
  sort: number;
  option_count: number;
};

const STATE = { in: "متوفر", low: "كمية محدودة", out: "نفد" } as const;

type Props = { productId: string; productPrice: number; variants: EditorVariant[]; optionCount: number };

/** One small form per variant. Stock is read-only here: it moves through «المخزون» (with a reason). */
export function VariantsEditor({ productId, productPrice, variants, optionCount }: Props) {
  const visible = variants.filter((v) => v.is_active);
  const hidden = variants.filter((v) => !v.is_active);

  const row = (v: EditorVariant) => (
    <li key={v.id} className={own.variant}>
      <div className={own.top}>
        <span className={own.name}>{v.label ?? (v.option_count === 0 ? "النسخة الأساسية" : v.sku)}</span>
        <span className={own.stock} data-state={v.stock_state}>
          المخزون {v.stock_quantity} · {STATE[v.stock_state]}
        </span>
      </div>
      <ActionForm action={updateVariant} submit="حفظ النسخة" variant="ghost">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="variantId" value={v.id} />
        <input type="hidden" name="sort" value={v.sort} />
        <div className={styles.grid}>
          <div className="ad-field">
            <label htmlFor={`sku-${v.id}`}>رمز SKU</label>
            <input id={`sku-${v.id}`} name="sku" required dir="ltr" maxLength={80} defaultValue={v.sku} />
          </div>
          <div className="ad-field">
            <label htmlFor={`price-${v.id}`}>السعر (₪)</label>
            <input
              id={`price-${v.id}`}
              name="price"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              defaultValue={v.price_ils ?? ""}
              placeholder={`${productPrice} (سعر المنتج)`}
            />
          </div>
          {v.option_count > 0 && (
            <div className="ad-field">
              <label htmlFor={`label-${v.id}`}>اسم النسخة (اختياري)</label>
              <input id={`label-${v.id}`} name="label" maxLength={80} defaultValue={v.label_override ?? ""} placeholder={v.label ?? ""} />
              <span className="ad-field__hint">لتصحيح اللغة، مثل «سوداء، مقاس L» بدل «أسود، مقاس L».</span>
            </div>
          )}
          {v.option_count === 0 && <input type="hidden" name="label" value={v.label_override ?? ""} />}
          <div className="ad-field">
            <label htmlFor={`th-${v.id}`}>حد الإنذار</label>
            <input id={`th-${v.id}`} name="threshold" type="number" inputMode="numeric" min={0} step={1} dir="ltr" required defaultValue={v.low_stock_threshold} />
            <span className="ad-field__hint">عند هذه الكمية أو أقل يظهر «كمية محدودة».</span>
          </div>
          <label className={`ad-check ${styles.wide}`}>
            <input type="checkbox" name="active" defaultChecked={v.is_active} />
            ظاهرة في الموقع
          </label>
        </div>
      </ActionForm>
    </li>
  );

  return (
    <section className={styles.section} aria-labelledby="var-title">
      <h2 id="var-title">النسخ</h2>
      {optionCount > 0 && visible.length === 0 && (
        <p className={styles.muted}>لا نسخ ظاهرة بعد. أضف القيم ثم اضغط «ولّد النسخ».</p>
      )}
      <ul className={own.list}>{visible.map(row)}</ul>
      {hidden.length > 0 && (
        <details className={own.hidden}>
          <summary>نسخ مخفية ({hidden.length})</summary>
          <p className={styles.muted}>لا تظهر في الموقع ولا تُطلب. إن بقي فيها مخزون، انقله من «المخزون».</p>
          <ul className={own.list}>{hidden.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
