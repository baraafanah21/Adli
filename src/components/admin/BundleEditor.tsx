"use client";

import { useId, useState, useTransition } from "react";
import { setBundle } from "@/app/admin/products/actions";
import { formatPrice } from "@/lib/format";
import type { ActionState } from "@/lib/admin/errors";
import styles from "./forms.module.css";
import own from "./BundleEditor.module.css";

export type BundleChoice = { variant_id: string; name: string; price_ils: number; is_active: boolean };
type Line = { variant_id: string; qty: number };

type Props = { productId: string; price: number; items: Line[]; choices: BundleChoice[] };

/** The pieces of a fixed bundle and its price. Separate value and saving update as you edit; one save stores both. */
export function BundleEditor({ productId, price: initialPrice, items: initialItems, choices }: Props) {
  const ids = { pick: useId(), qty: useId(), price: useId() };
  const [items, setItems] = useState<Line[]>(initialItems);
  const [price, setPrice] = useState(String(initialPrice));
  const [pick, setPick] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  const byId = new Map(choices.map((c) => [c.variant_id, c]));
  const separate = items.reduce((s, l) => s + l.qty * (byId.get(l.variant_id)?.price_ils ?? 0), 0);
  const priceNum = Number.parseInt(price, 10);
  const saving = Number.isFinite(priceNum) ? separate - priceNum : 0;

  function add() {
    const qty = Math.min(20, Math.max(1, Number.parseInt(pickQty, 10) || 1));
    if (!pick) return;
    setItems((cur) =>
      cur.some((l) => l.variant_id === pick)
        ? cur.map((l) => (l.variant_id === pick ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
        : [...cur, { variant_id: pick, qty }],
    );
    setPick("");
    setPickQty("1");
    setState(null);
  }

  function setQty(id: string, qty: number) {
    setItems((cur) => (qty <= 0 ? cur.filter((l) => l.variant_id !== id) : cur.map((l) => (l.variant_id === id ? { ...l, qty: Math.min(20, qty) } : l))));
    setState(null);
  }

  function save() {
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setState({ ok: false, message: "اكتب سعر البكجة رقماً صحيحاً." });
      return;
    }
    start(async () => setState(await setBundle({ productId, price: priceNum, items })));
  }

  return (
    <section className={styles.section} aria-labelledby="bundle-title">
      <h2 id="bundle-title">محتوى البكجة</h2>

      {items.length === 0 ? (
        <p className={styles.muted}>لا قطع بعد. اختر من القائمة بالأسفل.</p>
      ) : (
        <ul className={own.lines}>
          {items.map((l) => {
            const c = byId.get(l.variant_id);
            return (
              <li key={l.variant_id} className={own.line}>
                <span className={own.name}>
                  {c?.name ?? "قطعة لم تعد موجودة"}
                  {c && !c.is_active && <span className={own.warn}> · مخفية، فالبكجة ستظهر «نفدت»</span>}
                </span>
                <span className="ad-stepper">
                  <button type="button" aria-label={`زيادة ${c?.name ?? ""}`} onClick={() => setQty(l.variant_id, l.qty + 1)} disabled={l.qty >= 20}>
                    +
                  </button>
                  <span aria-label={`الكمية ${l.qty}`}>{l.qty}</span>
                  <button
                    type="button"
                    aria-label={l.qty === 1 ? `احذف ${c?.name ?? ""}` : `إنقاص ${c?.name ?? ""}`}
                    onClick={() => setQty(l.variant_id, l.qty - 1)}
                  >
                    −
                  </button>
                </span>
                <span className={own.price}>{formatPrice(l.qty * (c?.price_ils ?? 0))}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.row}>
        <div className="ad-field">
          <label htmlFor={ids.pick}>أضف قطعة</label>
          <select id={ids.pick} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">اختر منتجاً</option>
            {choices.map((c) => (
              <option key={c.variant_id} value={c.variant_id}>
                {c.name} — {formatPrice(c.price_ils)}
                {c.is_active ? "" : " (مخفي)"}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor={ids.qty}>العدد</label>
          <input id={ids.qty} type="number" inputMode="numeric" min={1} max={20} dir="ltr" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
        </div>
        <button type="button" className="ad-btn ad-btn--ghost" onClick={add} disabled={!pick}>
          أضف
        </button>
      </div>

      <div className={own.sums}>
        <div className="ad-field">
          <label htmlFor={ids.price}>سعر البكجة (₪)</label>
          <input id={ids.price} type="number" inputMode="numeric" min={0} step={1} dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <p className={own.sum}>
          <span>قيمتها منفصلة</span>
          <span className={own.price}>{formatPrice(separate)}</span>
        </p>
        <p className={own.sum} aria-live="polite">
          <span>التوفير للزبون</span>
          <span className={saving > 0 ? own.saving : own.warn}>
            {saving > 0 ? formatPrice(saving) : saving === 0 ? "لا توفير" : `أغلى من القطع منفصلة بـ ${formatPrice(-saving)}`}
          </span>
        </p>
      </div>

      <div className="ad-form-actions">
        <button type="button" className="ad-btn ad-btn--primary" onClick={save} disabled={pending}>
          {pending ? "جارٍ الحفظ…" : "حفظ البكجة"}
        </button>
      </div>
      {state && (
        <p className={`ad-notice ${state.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </section>
  );
}
