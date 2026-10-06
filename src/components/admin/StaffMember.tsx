"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { removeStaff, updateStaff } from "@/app/admin/staff/actions";
import styles from "./forms.module.css";
import own from "./StaffMember.module.css";

export type Member = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "staff";
  is_barber: boolean;
  since: string;
  granted_by_name: string | null;
};

const dateFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { timeZone: "Asia/Hebron", dateStyle: "medium" });

/** One person: role and «حلاق» saved together; removal asks first, inside the page. */
export function StaffMember({ member: m, isSelf }: { member: Member; isSelf: boolean }) {
  const [asking, setAsking] = useState(false);
  const [state, removeAction, pending] = useActionState(removeStaff, null);
  const yes = useRef<HTMLButtonElement>(null);
  const name = m.full_name ?? m.email;

  useEffect(() => {
    if (asking) yes.current?.focus();
  }, [asking]);

  return (
    <li className={own.member}>
      <div className={own.head}>
        <span className={own.name}>
          {name}
          {isSelf && <span className={own.you}> (أنت)</span>}
        </span>
        <span className={own.meta} dir="ltr">
          {m.email}
        </span>
        <span className={own.meta}>
          منذ {dateFmt.format(new Date(m.since))}
          {m.granted_by_name ? ` · أضافه ${m.granted_by_name}` : ""}
        </span>
      </div>

      <ActionForm action={updateStaff} submit="حفظ" variant="ghost">
        <input type="hidden" name="userId" value={m.user_id} />
        <div className={styles.row}>
          <div className="ad-field">
            <label htmlFor={`role-${m.user_id}`}>الدور</label>
            <select id={`role-${m.user_id}`} name="role" defaultValue={m.role}>
              <option value="staff">طاقم</option>
              <option value="owner">صاحب صالون</option>
            </select>
          </div>
          <label className="ad-check">
            <input type="checkbox" name="barber" defaultChecked={m.is_barber} />
            حلاق
          </label>
        </div>
      </ActionForm>

      {asking ? (
        <form action={removeAction} className={own.confirm} role="group" aria-label={`إزالة ${name}`}>
          <input type="hidden" name="userId" value={m.user_id} />
          <p className={own.question}>
            {isSelf
              ? "ستُزال من الطاقم وتفقد الوصول إلى اللوحة فوراً. لا يمكن الرجوع إلا إذا أضافك صاحب صالون آخر."
              : `سيفقد ${name} الوصول إلى اللوحة فوراً. يمكنك إضافته من جديد لاحقاً.`}
          </p>
          <div className="ad-form-actions">
            <button ref={yes} type="submit" className="ad-btn ad-btn--primary" disabled={pending}>
              {pending ? "جارٍ الإزالة…" : "نعم، أزِل من الطاقم"}
            </button>
            <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setAsking(false)} disabled={pending}>
              تراجع
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={own.remove} onClick={() => setAsking(true)}>
          إزالة من الطاقم
        </button>
      )}
      {state && (
        <p className={`ad-notice ${state.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </li>
  );
}
