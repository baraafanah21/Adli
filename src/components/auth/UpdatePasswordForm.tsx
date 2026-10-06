"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, MIN_PASSWORD } from "@/lib/auth/errors";
import styles from "./auth.module.css";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string; expired?: boolean };

/** Reached after the recovery link signed the visitor in (or from «بياناتي» to change the password). */
export function UpdatePasswordForm() {
  const router = useRouter();
  const ids = { password: useId(), confirm: useId() };
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD)
      return setStatus({ kind: "error", message: `كلمة المرور قصيرة. اكتب ${MIN_PASSWORD} أحرف على الأقل.` });
    if (password !== confirm) return setStatus({ kind: "error", message: "كلمتا المرور غير متطابقتين. اكتبهما من جديد." });

    setStatus({ kind: "busy" });
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return setStatus({ kind: "error", message: "انتهت صلاحية رابط الاستعادة. اطلب رابطاً جديداً.", expired: true });
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus({ kind: "error", message: authMessage(error) });
    router.replace("/account?password=updated");
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className="ad-field">
        <label htmlFor={ids.password}>كلمة المرور الجديدة ({MIN_PASSWORD} أحرف على الأقل)</label>
        <input id={ids.password} type="password" autoComplete="new-password" dir="ltr" minLength={MIN_PASSWORD} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="ad-field">
        <label htmlFor={ids.confirm}>اكتبها مرة ثانية</label>
        <input id={ids.confirm} type="password" autoComplete="new-password" dir="ltr" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {status.kind === "error" && (
        <p className={styles.error} role="alert">
          {status.message}
        </p>
      )}
      {status.kind === "error" && status.expired && (
        <Link className="ad-btn ad-btn--ghost ad-btn--block" href="/auth/forgot">
          اطلب رابطاً جديداً
        </Link>
      )}
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "جارٍ الحفظ…" : "احفظ كلمة المرور"}
      </button>
    </form>
  );
}
