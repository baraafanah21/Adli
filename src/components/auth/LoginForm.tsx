"use client";

/*
  Auth calls run in the browser on purpose: Supabase rate-limits /token and /verify per IP, and calls
  from the server would put every visitor behind Vercel's IP. The server only reads the session cookie.
*/

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, emailSendFailure, EMAIL_INCOMPLETE, isCompleteEmail, isEmailSendFailure } from "@/lib/auth/errors";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { EMAIL_ENABLED } from "@/lib/auth/email";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./auth.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string; contact?: boolean; canResend?: boolean }
  | { kind: "sent"; message: string };

export const confirmUrl = (next: string) => `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const ids = { email: useId(), password: useId(), linkEmail: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [linkStatus, setLinkStatus] = useState<Status>({ kind: "idle" });

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setStatus({ kind: "error", message: "اكتب بريدك وكلمة المرور." });
      return;
    }
    setStatus({ kind: "busy" });
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setStatus({ kind: "error", message: authMessage(error), canResend: error.code === "email_not_confirmed" });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function resendConfirmation() {
    setStatus({ kind: "busy" });
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: confirmUrl(next) },
    });
    setStatus(
      !error
        ? { kind: "sent", message: "أرسلنا رسالة تأكيد جديدة. افتحها من بريدك ثم ادخل." }
        : isEmailSendFailure(error)
          ? { kind: "error", ...emailSendFailure("confirm") }
          : { kind: "error", message: authMessage(error) },
    );
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) {
      setLinkStatus({ kind: "error", message: "اكتب بريدك أولاً." });
      return;
    }
    if (!isCompleteEmail(target)) {
      setLinkStatus({ kind: "error", message: EMAIL_INCOMPLETE });
      return;
    }
    setLinkStatus({ kind: "busy" });
    const { error } = await createClient().auth.signInWithOtp({
      email: target,
      // A link never creates an account by accident; sign-up has its own page.
      options: { shouldCreateUser: false, emailRedirectTo: confirmUrl(next) },
    });
    // Rate limits are worth telling; "no such account" is not (it would reveal who has an account).
    if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
      setLinkStatus({ kind: "error", message: authMessage(error) });
      return;
    }
    // The send itself failed (500 unexpected_failure): say so instead of a «sent» that never arrives.
    if (error && isEmailSendFailure(error)) {
      setLinkStatus({ kind: "error", ...emailSendFailure("login") });
      return;
    }
    setLinkStatus({
      kind: "sent",
      message: `إذا كان لـ ${target} حساب عندنا، فقد أرسلنا إليه رابط دخول. افتح الرسالة واضغط الرابط خلال ساعة.`,
    });
  }

  const busy = status.kind === "busy";

  return (
    <>
      <form className={styles.form} onSubmit={signIn} noValidate>
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
          <label htmlFor={ids.password}>كلمة المرور</label>
          <input
            id={ids.password}
            type="password"
            name="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className={styles.row}>
          {EMAIL_ENABLED ? (
            <Link className={styles.link} href={`/auth/forgot?next=${encodeURIComponent(next)}`}>
              نسيت كلمة المرور؟
            </Link>
          ) : (
            // No reset email can arrive yet: the salon resets it by hand.
            <a
              className={styles.link}
              href={whatsappUrl("مرحباً صالون عدلي، نسيت كلمة المرور لحسابي في الموقع.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              نسيت كلمة المرور؟ تواصل مع الصالون
            </a>
          )}
        </div>
        {status.kind === "error" && <AuthAlert error={status} />}
        {status.kind === "sent" && (
          <p className={styles.notice} role="status">
            {status.message}
          </p>
        )}
        {status.kind === "error" && status.canResend && EMAIL_ENABLED && (
          <button type="button" className="ad-btn ad-btn--ghost ad-btn--block" onClick={resendConfirmation}>
            أرسل رسالة التأكيد من جديد
          </button>
        )}
        <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={busy}>
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
      </form>

      {EMAIL_ENABLED && (
        <>
          <p className={styles.divider}>أو بدون كلمة مرور</p>

          <form className={styles.form} onSubmit={sendLink} noValidate>
            <p className={styles.lede}>نرسل لك رابطاً على بريدك، تضغطه فتدخل مباشرة.</p>
            {linkStatus.kind === "error" && <AuthAlert error={linkStatus} />}
            {linkStatus.kind === "sent" ? (
              <p className={styles.notice} role="status">
                {linkStatus.message}
              </p>
            ) : (
              <button type="submit" className="ad-btn ad-btn--ghost ad-btn--block" disabled={linkStatus.kind === "busy"}>
                {linkStatus.kind === "busy" ? "جارٍ الإرسال…" : "أرسل لي رابط دخول"}
              </button>
            )}
          </form>
        </>
      )}
    </>
  );
}
