"use client";

/*
  «أدخل الرمز»: the six-digit code from the email, for sign-up, sign-in and password recovery. One field
  (numeric keyboard, iOS / Android autofill from the email with one-time-code), pasting the whole code works,
  Arabic digits too. It verifies by itself once six digits are in. Resend waits RESEND_SECONDS, the same
  minimum interval Supabase enforces per address.
*/

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { codeDigits, OTP_LENGTH, otpMessage, RESEND_SECONDS, sendFailure, type AuthFailure, type SentThing } from "@/lib/auth/errors";
import { AuthAlert } from "@/components/auth/AuthAlert";
import styles from "./auth.module.css";

type Props = {
  email: string;
  /** "email" after sign-up or a sign-in code, "recovery" after «نسيت كلمة المرور». */
  type: "email" | "recovery";
  /** When the last code was sent (ms): the resend countdown runs from it, across a reload. */
  sentAt: number;
  /** What was sent, in a sentence (never saying whether the email has an account, except after sign-up). */
  lede: ReactNode;
  /** For the «couldn't send» message. */
  what: SentThing;
  /** Sends a new code; resolves with Supabase's error, if any. */
  resend: () => Promise<AuthError | null>;
  /** A new code went out: record its time. */
  onResent: () => void;
  /** The code was right and the session is set. */
  onVerified: () => void;
  /** «غيّر البريد»: back to the form. */
  onChangeEmail: () => void;
};

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "resent" } | ({ kind: "error" } & AuthFailure);

/** The current second, ticking while a countdown is shown. */
function subscribeSecond(onChange: () => void) {
  const t = window.setInterval(onChange, 1000);
  return () => window.clearInterval(t);
}
const currentSecond = () => Math.floor(Date.now() / 1000);
const noSecond = () => 0;

export function OtpStep({ email, type, sentAt, lede, what, resend, onResent, onVerified, onChangeEmail }: Props) {
  const ids = { code: useId(), hint: useId() };
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const now = useSyncExternalStore(subscribeSecond, currentSecond, noSecond);
  const wait = now === 0 ? RESEND_SECONDS : Math.max(0, RESEND_SECONDS - (now - Math.floor(sentAt / 1000)));
  const busy = status.kind === "busy";

  // The step replaces the form: put the caret in the field (the keyboard opens on phones that allow it).
  useEffect(() => {
    input.current?.focus();
  }, []);

  async function verify(token: string) {
    if (token.length !== OTP_LENGTH) {
      setStatus({ kind: "error", message: `اكتب الرمز كاملاً: ${OTP_LENGTH} أرقام.` });
      return;
    }
    setStatus({ kind: "busy" });
    const { error } = await createClient().auth.verifyOtp({ email, token, type });
    if (error) {
      setStatus({ kind: "error", message: otpMessage(error) });
      input.current?.select();
      return;
    }
    onVerified();
  }

  function onInput(value: string) {
    const digits = codeDigits(value);
    setCode(digits);
    if (status.kind === "error") setStatus({ kind: "idle" });
    // Typed or pasted in full: no need to press the button.
    if (digits.length === OTP_LENGTH && digits !== code && !busy) void verify(digits);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy) void verify(code);
  }

  async function sendAgain() {
    setStatus({ kind: "busy" });
    const failure = sendFailure(await resend(), what);
    if (failure) {
      setStatus({ kind: "error", ...failure });
      return;
    }
    onResent();
    setCode("");
    setStatus({ kind: "resent" });
    input.current?.focus();
  }

  const m = Math.floor(wait / 60);
  const s = String(wait % 60).padStart(2, "0");

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.notice} role="status">
        {lede}
      </p>
      <div className="ad-field">
        <label htmlFor={ids.code}>الرمز من {OTP_LENGTH} أرقام</label>
        <input
          ref={input}
          id={ids.code}
          className={styles.code}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          dir="ltr"
          maxLength={OTP_LENGTH * 2}
          placeholder={"•".repeat(OTP_LENGTH)}
          required
          aria-describedby={ids.hint}
          aria-invalid={status.kind === "error" || undefined}
          value={code}
          onChange={(e) => onInput(e.target.value)}
        />
        <p id={ids.hint} className={styles.hint}>
          الرمز صالح لمدة 10 دقائق ولمرة واحدة. لم يصل؟ انتظر دقيقة، وافتح مجلد البريد غير الهام (Junk)، خصوصاً iCloud.
        </p>
      </div>
      {status.kind === "error" && <AuthAlert error={status} />}
      {status.kind === "resent" && (
        <p className={styles.notice} role="status">
          أرسلنا رمزاً جديداً. استعمل آخر رمز وصلك.
        </p>
      )}
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={busy}>
        {busy ? "جارٍ التحقق…" : "تأكيد الرمز"}
      </button>
      <div className={styles.otpActions}>
        <button type="button" className={styles.linkButton} onClick={sendAgain} disabled={busy || wait > 0}>
          {/* One span: the button is inline-flex, which would drop the space before the time. */}
          {wait > 0 ? (
            <span>
              أعد إرسال الرمز بعد <bdi dir="ltr">{`${m}:${s}`}</bdi>
            </span>
          ) : (
            "أعد إرسال الرمز"
          )}
        </button>
        <button type="button" className={styles.linkButton} onClick={onChangeEmail} disabled={busy}>
          غيّر البريد
        </button>
      </div>
    </form>
  );
}
