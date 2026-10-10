"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, emailSendFailure, EMAIL_INCOMPLETE, isCompleteEmail, isEmailSendFailure, MIN_PASSWORD, OTP_LENGTH } from "@/lib/auth/errors";
import { useOtpPending } from "@/lib/auth/otp-session";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { confirmUrl } from "@/components/auth/LoginForm";
import { OtpStep } from "@/components/auth/OtpStep";
import styles from "./auth.module.css";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string; contact?: boolean };

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const ids = { name: useId(), email: useId(), password: useId() };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const otp = useOtpPending("signup");

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
      // The redirect is only for the email's fallback link (/auth/confirm); the code is the main way in.
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
    // Confirmation on: the email carries a six-digit code. Same answer whether or not the email already had an account.
    setStatus({ kind: "idle" });
    otp.save(em, "signup");
  }

  if (otp.pending) {
    const sentTo = otp.pending.email;
    return (
      <OtpStep
        email={sentTo}
        type="email"
        sentAt={otp.pending.sentAt}
        what="confirm"
        lede={
          <>
            أرسلنا رمزاً من {OTP_LENGTH} أرقام إلى <bdi dir="ltr">{sentTo}</bdi>. اكتبه هنا لتفعيل حسابك.
          </>
        }
        resend={async () =>
          (await createClient().auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: confirmUrl(next) } })).error
        }
        onResent={() => otp.save(sentTo, "signup")}
        onVerified={() => {
          otp.clear();
          router.replace(next);
          router.refresh();
        }}
        onChangeEmail={() => {
          setEmail(sentTo);
          otp.clear();
        }}
      />
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
      {/* A new tab, so what is typed in the form stays. */}
      <p className={`${styles.hint} ${styles.consent}`}>
        بإنشاء حساب توافق على{" "}
        <Link className={styles.inlineLink} href="/privacy" target="_blank">
          سياسة الخصوصية
        </Link>
        .
      </p>
    </form>
  );
}
