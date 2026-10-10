"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { authMessage, emailSendFailure, EMAIL_INCOMPLETE, isCompleteEmail, isEmailSendFailure, MIN_PASSWORD, OTP_LENGTH, sendFailure } from "@/lib/auth/errors";
import { useOtpPending } from "@/lib/auth/otp-session";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { confirmUrl } from "@/components/auth/LoginForm";
import { OtpStep } from "@/components/auth/OtpStep";
import { EMAIL_ENABLED } from "@/lib/auth/email";
import { NAME_PART_MAX, joinName, nameMessage, nameProblem, type NamePart } from "@/lib/person-name";
import styles from "./auth.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string; contact?: boolean }
  /** The email already has an account: Supabase sent nothing, so offer a sign-in code or a password reset. */
  | { kind: "exists"; email: string; sending?: boolean; failure?: { message: string; contact?: boolean } };

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const ids = { first: useId(), last: useId(), firstErr: useId(), lastErr: useId(), email: useId(), password: useId() };
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  // Each name field's own message, shown once the form is sent; while it's corrected only that field is re-checked.
  const [nameErrors, setNameErrors] = useState<Partial<Record<NamePart, string>>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const otp = useOtpPending("signup");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    const errors = { first: nameError("first", first), last: nameError("last", last) };
    setNameErrors(errors);
    if (errors.first || errors.last) {
      setStatus({ kind: "idle" });
      return document.getElementById(errors.first ? ids.first : ids.last)?.focus();
    }
    // One field in the database, as before: «الأول العائلة».
    const n = joinName(first, last);
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
    // «Confirm email» off: Supabase says it itself. Same screen as below, when codes can reach the customer.
    if (error && EMAIL_ENABLED && (error.code === "user_already_exists" || error.code === "email_exists")) {
      return setStatus({ kind: "exists", email: em });
    }
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
    // Confirmation on and the email already has an account: Supabase answers a user with no identities and sends no
    // email, so a code step would wait for nothing. Say so, and offer a sign-in code or a reset instead.
    if (data.user && data.user.identities?.length === 0) return setStatus({ kind: "exists", email: em });
    // Confirmation on: the email carries a six-digit code.
    setStatus({ kind: "idle" });
    otp.save(em, "signup");
  }

  const sendLoginCode = async (target: string) =>
    (await createClient().auth.signInWithOtp({ email: target, options: { shouldCreateUser: false, emailRedirectTo: confirmUrl(next) } }))
      .error;

  /** «ادخل برمز على بريدك»: a sign-in code to the account's email, then the code step (verify type "email"). */
  async function loginWithCode(target: string) {
    setStatus({ kind: "exists", email: target, sending: true });
    const failure = sendFailure(await sendLoginCode(target), "login");
    if (failure) return setStatus({ kind: "exists", email: target, failure });
    setStatus({ kind: "idle" });
    otp.save(target, "login");
  }

  if (otp.pending) {
    const { email: sentTo, flow } = otp.pending;
    const login = flow === "login";
    return (
      <OtpStep
        email={sentTo}
        type="email"
        sentAt={otp.pending.sentAt}
        what={login ? "login" : "confirm"}
        lede={
          login ? (
            <>
              أرسلنا رمز دخول من {OTP_LENGTH} أرقام إلى <bdi dir="ltr">{sentTo}</bdi>. اكتبه هنا فتدخل إلى حسابك.
            </>
          ) : (
            <>
              أرسلنا رمزاً من {OTP_LENGTH} أرقام إلى <bdi dir="ltr">{sentTo}</bdi>. اكتبه هنا لتفعيل حسابك.
            </>
          )
        }
        resend={async () =>
          login
            ? sendLoginCode(sentTo)
            : (await createClient().auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: confirmUrl(next) } })).error
        }
        onResent={() => otp.save(sentTo, flow)}
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
      <div className={styles.nameRow}>
        <NameField
          id={ids.first}
          errorId={ids.firstErr}
          label="الاسم الأول"
          autoComplete="given-name"
          value={first}
          error={nameErrors.first}
          onChange={(v) => {
            setFirst(v);
            if (nameErrors.first) setNameErrors({ ...nameErrors, first: nameError("first", v) });
          }}
        />
        <NameField
          id={ids.last}
          errorId={ids.lastErr}
          label="اسم العائلة"
          autoComplete="family-name"
          value={last}
          error={nameErrors.last}
          onChange={(v) => {
            setLast(v);
            if (nameErrors.last) setNameErrors({ ...nameErrors, last: nameError("last", v) });
          }}
        />
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
          onChange={(e) => {
            setEmail(e.target.value);
            if (status.kind === "exists") setStatus({ kind: "idle" });
          }}
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
      {status.kind === "exists" && (
        <div className={styles.exists}>
          <p className={styles.lede} role="alert">
            لهذا البريد حساب عندنا من قبل.
          </p>
          {status.failure && <AuthAlert error={status.failure} />}
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--block"
            disabled={status.sending}
            onClick={() => loginWithCode(status.email)}
          >
            {status.sending ? "جارٍ الإرسال…" : "ادخل برمز على بريدك"}
          </button>
          <Link className="ad-btn ad-btn--ghost ad-btn--block" href={`/auth/forgot?next=${encodeURIComponent(next)}`}>
            نسيت كلمة المرور
          </Link>
        </div>
      )}
      {/* While the email has an account, the way on is the code or the reset above; a new email brings this back. */}
      {status.kind !== "exists" && (
        <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "جارٍ إنشاء الحساب…" : "أنشئ الحساب"}
        </button>
      )}
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

/** A name field's message, or undefined when it's fine. */
function nameError(part: NamePart, value: string) {
  const problem = nameProblem(value);
  return problem ? nameMessage(part, problem) : undefined;
}

function NameField(props: {
  id: string;
  errorId: string;
  label: string;
  autoComplete: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="ad-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        autoComplete={props.autoComplete}
        maxLength={NAME_PART_MAX + 10}
        required
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? props.errorId : undefined}
      />
      {props.error && (
        <span className="ad-field__error" id={props.errorId}>
          {props.error}
        </span>
      )}
    </div>
  );
}
