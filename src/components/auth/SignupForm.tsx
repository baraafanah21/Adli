"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, emailSendFailure, EMAIL_INCOMPLETE, isCompleteEmail, isEmailSendFailure, MIN_PASSWORD } from "@/lib/auth/errors";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { confirmUrl } from "@/components/auth/LoginForm";
import styles from "./auth.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string; contact?: boolean }
  | { kind: "sent"; email: string };

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const ids = { name: useId(), email: useId(), password: useId() };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    if (!n) return setStatus({ kind: "error", message: "اكتب اسمك ليظهر على طلباتك." });
    if (!em) return setStatus({ kind: "error", message: "اكتب بريدك الإلكتروني." });
    if (!isCompleteEmail(em)) return setStatus({ kind: "error", message: EMAIL_INCOMPLETE });
    if (password.length < MIN_PASSWORD)
      return setStatus({ kind: "error", message: `كلمة المرور قصيرة. اكتب ${MIN_PASSWORD} أحرف على الأقل.` });

    setStatus({ kind: "busy" });
    const { data, error } = await createClient().auth.signUp({
      email: em,
      password,
      options: { data: { full_name: n.slice(0, 80) }, emailRedirectTo: confirmUrl(next) },
    });
    if (error) {
      return setStatus(
        isEmailSendFailure(error) ? { kind: "error", ...emailSendFailure("confirm") } : { kind: "error", message: authMessage(error) },
      );
    }
    // «Confirm email» off in Supabase: the account is ready and signed in. Back to where they came from
    // (e.g. the confirm step of /booking, which keeps its choice in the URL).
    if (data.session) {
      router.replace(next);
      router.refresh();
      return;
    }
    // Confirmation on: the email carries the link. Same answer whether or not the email already had an account.
    setStatus({ kind: "sent", email: em });
  }

  if (status.kind === "sent") {
    return (
      <p className={styles.notice} role="status">
        أرسلنا رابط التأكيد إلى <bdi dir="ltr">{status.email}</bdi>. افتح الرسالة واضغط الرابط لتفعيل حسابك، ثم تدخل
        مباشرة. لم تصل؟ انظر في مجلد الرسائل غير المرغوب فيها.
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className="ad-field">
        <label htmlFor={ids.name}>الاسم</label>
        <input id={ids.name} name="name" autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="ad-field">
        <label htmlFor={ids.email}>البريد الإلكتروني</label>
        <input
          id={ids.email}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="ad-field">
        <label htmlFor={ids.password}>كلمة المرور ({MIN_PASSWORD} أحرف على الأقل)</label>
        <input
          id={ids.password}
          type="password"
          name="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={MIN_PASSWORD}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {status.kind === "error" && <AuthAlert error={status} />}
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "جارٍ إنشاء الحساب…" : "أنشئ الحساب"}
      </button>
    </form>
  );
}
