"use client";

import { useId, useRef, type MouseEvent } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { deleteProduct, restoreProduct } from "@/app/admin/products/actions";
import formStyles from "@/components/admin/forms.module.css";

/**
 * «احذف المنتج» (owner): a confirmation sheet that names the product and says what will happen. The database
 * decides between a real delete and an archive (history), and refuses while the product is in a shown bundle.
 */
export function DeleteProduct({ id, name }: { id: string; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <section className={`${formStyles.section} ${formStyles.danger}`} aria-labelledby={`${titleId}-section`}>
      <h2 id={`${titleId}-section`}>حذف المنتج</h2>
      <p className={formStyles.lede}>
        المنتج الذي له طلبات أو حركات مخزون يُؤرشف بدل الحذف: يختفي من الموقع والقوائم، ويبقى في الطلبات وسجل المخزون، وتسترجعه من
        «المؤرشفة».
      </p>
      <div className="ad-form-actions">
        <button type="button" className="ad-btn ad-btn--ghost" onClick={() => ref.current?.showModal()}>
          احذف المنتج
        </button>
      </div>

      <dialog ref={ref} className="ad-sheet-dialog" aria-labelledby={titleId} onClick={onBackdrop}>
        <section className="ad-sheet">
          <div className="ad-sheet__grip" aria-hidden="true" />
          <div className="ad-sheet__head">
            <h2 className="ad-sheet__title" id={titleId}>
              احذف «{name}»؟
            </h2>
            <button type="button" className="ad-sheet__close" onClick={close} aria-label="إغلاق">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p className={formStyles.lede}>
            إن لم يكن له طلبات ولا حركات مخزون فسيُحذف نهائياً مع صوره. وإن كان له تاريخ فسيُؤرشف: يختفي من الموقع ويبقى رابطه
            محجوزاً له، فتسترجعه متى شئت.
          </p>
          <ActionForm action={deleteProduct} submit="احذف المنتج" pendingLabel="جارٍ الحذف…" aside={
            <button type="button" className="ad-btn ad-btn--ghost" onClick={close}>
              تراجع
            </button>
          }>
            <input type="hidden" name="id" value={id} />
          </ActionForm>
        </section>
      </dialog>
    </section>
  );
}

/** An archived product's editor: what archived means, and «استرجاع» (owner). The product comes back hidden. */
export function RestoreProduct({ id, canRestore }: { id: string; canRestore: boolean }) {
  return (
    <section className={formStyles.section} aria-labelledby="archived-title">
      <h2 id="archived-title">مؤرشف</h2>
      <p className={formStyles.lede}>
        هذا المنتج مؤرشف: لا يظهر في الموقع ولا في القوائم، ويبقى في الطلبات القديمة وسجل المخزون. لا يُعدَّل وهو مؤرشف.
        {canRestore && " بعد الاسترجاع يبقى مخفياً حتى تظهره من «التفاصيل»."}
      </p>
      {canRestore && (
        <ActionForm action={restoreProduct} submit="استرجاع" pendingLabel="جارٍ الاسترجاع…">
          <input type="hidden" name="id" value={id} />
        </ActionForm>
      )}
    </section>
  );
}
