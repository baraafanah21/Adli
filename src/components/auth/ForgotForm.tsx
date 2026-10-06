"use client";

import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, emailSendFailure, EMAIL_INCOMPLETE, isCompleteEmail, isEmailSendFailure } from "@/lib/auth/errors";
import { AuthAlert } from "@/components/auth/AuthAlert";
import styles from "./auth.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string; contact?: boolean }
  | { kind: "sent"; email: string };

export function ForgotForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!em) return setStatus({ kind: "error", message: "اكتب البريد الذي سجلت به." });
    if (!isCompleteEmail(em)) return setStatus({ kind: "error", message: EMAIL_INCOMPLETE });
    setStatus({ kind: "busy" });
    const { error } = await createClient().auth.resetPasswordForEmail(em, {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/auth/update-password")}`,
    });
    if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
      return setStatus({ kind: "error", message: authMessage(error) });
    }
    // The send itself failed (500 unexpected_failure). Saying so is better than a «sent» that never arrives.
    if (error && isEmailSendFailure(error)) return setStatus({ kind: "error", ...emailSendFailure("reset") });
    setStatus({ kind: "sent", email: em });
  }

  if (status.kind === "sent") {
    return (
      <p className={styles.notice} role="status">
        إذا كان لـ <bdi dir="ltr">{status.email}</bdi> حساب عندنا، فقد أرسلنا إليه رابطاً لتعيين كلمة مرور جديدة. افتح
        الرسالة واضغط الرابط خلال ساعة.
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className="ad-field">
        <label htmlFor={id}>البريد الإلكتروني</label>
        <input id={id} type="email" autoComplete="email" inputMode="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {status.kind === "error" && <AuthAlert error={status} />}
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "جارٍ الإرسال…" : "أرسل رابط الاستعادة"}
      </button>
    </form>
  );
}
