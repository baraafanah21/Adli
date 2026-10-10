"use client";

/*
  Auth calls run in the browser on purpose: Supabase rate-limits /token and /verify per IP, and calls
  from the server would put every visitor behind Vercel's IP. The server only reads the session cookie.
*/

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, EMAIL_INCOMPLETE, isCompleteEmail, OTP_LENGTH, sendFailure } from "@/lib/auth/errors";
import { useOtpPending } from "@/lib/auth/otp-session";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { OtpStep } from "@/components/auth/OtpStep";
import { EMAIL_ENABLED } from "@/lib/auth/email";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./auth.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string; contact?: boolean; canResend?: boolean };

/** Where the emails' fallback links land (/auth/confirm verifies them); the six-digit code is the main way in. */
export const confirmUrl = (next: string) => `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const ids = { email: useId(), password: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [codeStatus, setCodeStatus] = useState<Status>({ kind: "idle" });
  const otp = useOtpPending("login");

  // A sign-in code never creates an account by accident; sign-up has its own page.
  const sendLoginCode = async (target: string) =>
    (await createClient().auth.signInWithOtp({ email: target, options: { shouldCreateUser: false, emailRedirectTo: confirmUrl(next) } }))
      .error;
  const sendConfirmCode = async (target: string) =>
    (await createClient().auth.resend({ type: "signup", email: target, options: { emailRedirectTo: confirmUrl(next) } })).error;

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

  /** «لم تؤكد بريدك»: a new sign-up code, then the code step (verify type "email" signs them in). */
  async function resendConfirmation() {
    const target = email.trim();
    setStatus({ kind: "busy" });
    const failure = sendFailure(await sendConfirmCode(target), "confirm");
    if (failure) return setStatus({ kind: "error", ...failure });
    setStatus({ kind: "idle" });
    otp.save(target, "confirm");
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return setCodeStatus({ kind: "error", message: "اكتب بريدك أولاً." });
    if (!isCompleteEmail(target)) return setCodeStatus({ kind: "error", message: EMAIL_INCOMPLETE });
    setCodeStatus({ kind: "busy" });
    // Rate limits and a failed send are told; «no such account» never is.
    const failure = sendFailure(await sendLoginCode(target), "login");
    if (failure) return setCodeStatus({ kind: "error", ...failure });
    setCodeStatus({ kind: "idle" });
    otp.save(target, "login");
  }

  if (otp.pending) {
    const { email: sentTo, flow } = otp.pending;
    const confirming = flow === "confirm";
    return (
      <OtpStep
        email={sentTo}
        type="email"
        sentAt={otp.pending.sentAt}
        what={confirming ? "confirm" : "login"}
        lede={
          confirming ? (
            <>
              أرسلنا رمز تأكيد من {OTP_LENGTH} أرقام إلى <bdi dir="ltr">{sentTo}</bdi>. اكتبه هنا فيتأكد بريدك وتدخل.
            </>
          ) : (
            <>
              إذا كان لـ <bdi dir="ltr">{sentTo}</bdi> حساب عندنا، فقد أرسلنا إليه رمز دخول من {OTP_LENGTH} أرقام. اكتبه هنا
              فتدخل.
            </>
          )
        }
        resend={() => (confirming ? sendConfirmCode(sentTo) : sendLoginCode(sentTo))}
        onResent={() => otp.save(sentTo, flow)}
        onVerified={() => {
          otp.clear();
          router.replace(next);
          router.refresh();
        }}
        onChangeEmail={() => {
          setEmail(sentTo);
          setStatus({ kind: "idle" });
          otp.clear();
        }}
      />
    );
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
        {status.kind === "error" && status.canResend && EMAIL_ENABLED && (
          <button type="button" className="ad-btn ad-btn--ghost ad-btn--block" onClick={resendConfirmation}>
            أرسل لي رمز تأكيد جديداً
          </button>
        )}
        <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={busy}>
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
      </form>

      {EMAIL_ENABLED && (
        <>
          <p className={styles.divider}>أو بدون كلمة مرور</p>

          <form className={styles.form} onSubmit={sendCode} noValidate>
            <p className={styles.lede}>نرسل لك رمزاً من {OTP_LENGTH} أرقام على بريدك، تكتبه هنا فتدخل.</p>
            {codeStatus.kind === "error" && <AuthAlert error={codeStatus} />}
            <button type="submit" className="ad-btn ad-btn--ghost ad-btn--block" disabled={codeStatus.kind === "busy"}>
              {codeStatus.kind === "busy" ? "جارٍ الإرسال…" : "أرسل لي رمز دخول"}
            </button>
          </form>
        </>
      )}
    </>
  );
}
