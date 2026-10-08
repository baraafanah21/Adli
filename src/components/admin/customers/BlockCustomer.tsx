"use client";

import { useId, useRef, type MouseEvent } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { blockCustomer } from "@/app/admin/customers/actions";
import styles from "@/app/admin/customers/customers.module.css";

/**
 * «احظر الزبون» (owner): a confirmation sheet that names the customer, says what blocking does and asks for a reason.
 * The reason stays in the customer's record for the staff; the customer only ever sees «تواصل مع الصالون».
 */
export function BlockCustomer({ userId, name }: { userId: string; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const close = () => ref.current?.close();
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <>
      <button type="button" className="ad-btn ad-btn--ghost" onClick={() => ref.current?.showModal()}>
        احظر الزبون
      </button>
      <dialog ref={ref} className="ad-sheet-dialog" aria-labelledby={titleId} onClick={onBackdrop}>
        <section className="ad-sheet">
          <div className="ad-sheet__grip" aria-hidden="true" />
          <div className="ad-sheet__head">
            <h2 className="ad-sheet__title" id={titleId}>
              احظر «{name}»؟
            </h2>
            <button type="button" className="ad-sheet__close" onClick={close} aria-label="إغلاق">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p className={styles.private}>
            لن يقدر يحجز أو يطلب من حسابه، ويرى «تواصل مع الصالون». مواعيده القادمة تبقى، وتقرر فيها من التقويم. يقدر يطلب كضيف
            برقمه، وكل طلب يتأكد على واتساب.
          </p>
          <ActionForm
            action={blockCustomer}
            submit="احظر الزبون"
            pendingLabel="جارٍ الحظر…"
            aside={
              <button type="button" className="ad-btn ad-btn--ghost" onClick={close}>
                تراجع
              </button>
            }
          >
            <input type="hidden" name="userId" value={userId} />
            <div className="ad-field">
              <label htmlFor={reasonId}>السبب (لا يراه الزبون)</label>
              <input id={reasonId} name="reason" required minLength={3} maxLength={300} autoComplete="off" />
            </div>
          </ActionForm>
        </section>
      </dialog>
    </>
  );
}
