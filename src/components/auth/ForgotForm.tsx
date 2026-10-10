"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMAIL_INCOMPLETE, isCompleteEmail, OTP_LENGTH, sendFailure } from "@/lib/auth/errors";
import { useOtpPending } from "@/lib/auth/otp-session";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { OtpStep } from "@/components/auth/OtpStep";
import styles from "./auth.module.css";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string; contact?: boolean };

/** The reset email's fallback link still goes through /auth/confirm; the code is the main way. */
const sendReset = async (email: string) =>
  (
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/auth/update-password")}`,
    })
  ).error;

export function ForgotForm() {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const otp = useOtpPending("recovery");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!em) return setStatus({ kind: "error", message: "اكتب البريد الذي سجلت به." });
    if (!isCompleteEmail(em)) return setStatus({ kind: "error", message: EMAIL_INCOMPLETE });
    setStatus({ kind: "busy" });
    // Rate limits and a failed send are told; «no such account» never is.
    const failure = sendFailure(await sendReset(em), "reset");
    if (failure) return setStatus({ kind: "error", ...failure });
    setStatus({ kind: "idle" });
    otp.save(em, "recovery");
  }

  if (otp.pending) {
    const sentTo = otp.pending.email;
    return (
      <OtpStep
        email={sentTo}
        type="recovery"
        sentAt={otp.pending.sentAt}
        what="reset"
        lede={
          <>
            إذا كان لـ <bdi dir="ltr">{sentTo}</bdi> حساب عندنا، فقد أرسلنا إليه رمزاً من {OTP_LENGTH} أرقام. اكتبه هنا، ثم
            تختار كلمة مرور جديدة.
          </>
        }
        resend={() => sendReset(sentTo)}
        onResent={() => otp.save(sentTo, "recovery")}
        onVerified={() => {
          otp.clear();
          router.replace("/auth/update-password");
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
        <label htmlFor={id}>البريد الإلكتروني</label>
        <input id={id} type="email" autoComplete="email" inputMode="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {status.kind === "error" && <AuthAlert error={status} />}
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "جارٍ الإرسال…" : "أرسل رمز الاستعادة"}
      </button>
    </form>
  );
}
