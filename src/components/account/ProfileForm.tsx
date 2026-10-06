"use client";

import { useActionState, useId } from "react";
import { updateProfile, type ProfileState } from "@/app/account/actions";
import styles from "@/components/auth/auth.module.css";

type Props = { email: string | null; profile: { full_name: string | null; area: string | null; phone: string | null } };

export function ProfileForm({ email, profile }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const ids = { name: useId(), area: useId(), phone: useId(), err: useId() };
  const err = (f: ProfileState["field"]) => state.field === f;

  return (
    <form className={styles.form} action={action} noValidate>
      {email && (
        <p className={styles.lede}>
          البريد: <bdi dir="ltr">{email}</bdi>
        </p>
      )}
      <div className="ad-field">
        <label htmlFor={ids.name}>الاسم</label>
        <input id={ids.name} name="full_name" autoComplete="name" maxLength={80} required defaultValue={profile.full_name ?? ""} aria-invalid={err("full_name") || undefined} />
      </div>
      <div className="ad-field">
        <label htmlFor={ids.area}>المنطقة (اختياري)</label>
        <input id={ids.area} name="area" autoComplete="address-level2" maxLength={80} placeholder="مثلاً: رفيديا" defaultValue={profile.area ?? ""} aria-invalid={err("area") || undefined} />
      </div>
      <div className="ad-field">
        <label htmlFor={ids.phone}>رقم الهاتف (اختياري)</label>
        <input id={ids.phone} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={20} placeholder="0599123456" defaultValue={profile.phone ?? ""} aria-invalid={err("phone") || undefined} />
      </div>
      {state.error && (
        <p className={styles.error} role="alert" id={ids.err}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className={styles.notice} role="status">
          حُفظت بياناتك. ستُملأ تلقائياً في طلبك القادم.
        </p>
      )}
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : "احفظ بياناتي"}
      </button>
    </form>
  );
}
