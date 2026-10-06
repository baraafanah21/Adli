"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { setOrderStatus } from "@/app/admin/orders/actions";
import { ORDER_ACTIONS, STATUS_LABEL, type OrderAction, type OrderStatus } from "@/lib/order-status";
import styles from "@/app/admin/orders/order.module.css";

type Props = { orderId: string; status: OrderStatus };

/**
 * The moves allowed from the current status. Confirm and deliver run at once; cancelling asks first, inside the
 * page, with an optional reason. Buttons are disabled while saving, and the database ignores a repeat anyway.
 */
export function OrderActions({ orderId, status }: Props) {
  const [state, action, pending] = useActionState(setOrderStatus, null);
  const [asking, setAsking] = useState<OrderAction | null>(null);
  const [shownStatus, setShownStatus] = useState(status);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const ids = { question: useId(), note: useId() };

  // The status changed (saved here or elsewhere): close the question. Adjusting state during render, not in an effect.
  if (status !== shownStatus) {
    setShownStatus(status);
    setAsking(null);
  }

  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);

  const actions = ORDER_ACTIONS[status];

  return (
    <section className={styles.actions} aria-label="تغيير حالة الطلب">
      <p className={`ad-notice ${state?.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state?.ok ? "status" : "alert"}>
        {state?.message ?? ""}
      </p>

      {actions.length === 0 ? (
        <p className={styles.muted}>لا خطوات بعد هذه: الطلب «{STATUS_LABEL[status]}».</p>
      ) : (
        <form action={action} className={styles.actionForm}>
          <input type="hidden" name="orderId" value={orderId} />
          {asking ? (
            <div className={styles.confirm} role="group" aria-labelledby={ids.question}>
              <p id={ids.question} className={styles.question}>
                {asking.confirm}
              </p>
              <div className="ad-field">
                <label htmlFor={ids.note}>السبب (اختياري)</label>
                <textarea id={ids.note} name="note" rows={2} maxLength={500} className={styles.textarea} />
              </div>
              <div className={styles.buttons}>
                <button
                  ref={confirmRef}
                  type="submit"
                  name="status"
                  value={asking.to}
                  className="ad-btn ad-btn--primary"
                  disabled={pending}
                >
                  {pending ? "جارٍ الحفظ…" : `نعم، ${asking.label}`}
                </button>
                <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setAsking(null)} disabled={pending}>
                  تراجع
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.buttons}>
              {actions.map((a) =>
                a.confirm ? (
                  <button key={a.to} type="button" className="ad-btn ad-btn--ghost" onClick={() => setAsking(a)} disabled={pending}>
                    {a.label}
                  </button>
                ) : (
                  <button key={a.to} type="submit" name="status" value={a.to} className="ad-btn ad-btn--primary" disabled={pending}>
                    {pending ? "جارٍ الحفظ…" : a.label}
                  </button>
                ),
              )}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
