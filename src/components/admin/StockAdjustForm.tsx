"use client";

import { useActionState, useId, useState } from "react";
import { adjustStock } from "@/app/admin/stock/actions";
import { MANUAL_REASONS, REASON_LABEL, type ManualReason } from "@/lib/admin/stock";
import styles from "./forms.module.css";
import own from "./StockAdjustForm.module.css";

/**
 * Receive, count or write off. The quantity field and the button change with the reason, so it is always clear
 * whether the number is added («الكمية المستلمة»), the new total («العدد الفعلي بعد الجرد»), or taken off.
 */
export function StockAdjustForm({ variantId, current }: { variantId: string; current: number }) {
  const [state, action, pending] = useActionState(adjustStock, null);
  const [reason, setReason] = useState<ManualReason>("receive");
  const ids = { qty: useId(), note: useId() };
  const r = MANUAL_REASONS.find((m) => m.reason === reason)!;

  return (
    <form action={action} className={styles.section}>
      <input type="hidden" name="variantId" value={variantId} />
      <fieldset className={own.reasons}>
        <legend>السبب</legend>
        <div className={own.reasonList}>
          {MANUAL_REASONS.map((m) => (
            <label key={m.reason} className="ad-chip">
              <input
                type="radio"
                className="sr-only"
                name="reason"
                value={m.reason}
                checked={reason === m.reason}
                onChange={() => setReason(m.reason)}
              />
              {REASON_LABEL[m.reason]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.grid}>
        <div className="ad-field">
          <label htmlFor={ids.qty}>{r.field}</label>
          <input
            key={reason}
            id={ids.qty}
            name="quantity"
            type="number"
            inputMode="numeric"
            min={reason === "adjust" ? 0 : 1}
            step={1}
            dir="ltr"
            required
            defaultValue={reason === "adjust" ? current : ""}
          />
          <span className="ad-field__hint">
            {reason === "receive"
              ? `تُضاف إلى ${current}.`
              : reason === "adjust"
                ? `اكتب ما عددته فعلاً؛ الفرق عن ${current} يُسجّل وحده.`
                : `تُخصم من ${current}.`}
          </span>
        </div>
        <div className="ad-field">
          <label htmlFor={ids.note}>ملاحظة (اختياري)</label>
          <input id={ids.note} name="note" maxLength={500} placeholder={reason === "receive" ? "من المورّد…" : ""} />
        </div>
      </div>
      <div className="ad-form-actions">
        <button type="submit" className="ad-btn ad-btn--primary" disabled={pending}>
          {pending ? "جارٍ التسجيل…" : r.button}
        </button>
      </div>
      {state && (
        <p className={`ad-notice ${state.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
