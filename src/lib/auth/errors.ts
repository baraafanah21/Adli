import { EMAIL_ENABLED } from "@/lib/auth/email";

/*
  Supabase Auth errors → Arabic that says what to do next.
  Sign-in and password reset never reveal whether an email has an account. Sign-up does, on purpose: someone who
  signs up again with their own email would otherwise wait for a code that never comes (Supabase sends none), so
  SignupForm says «لهذا البريد حساب عندنا من قبل» and offers a sign-in code instead.
*/

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

export function authMessage(error: AuthErrorLike): string {
  switch (error?.code) {
    case "invalid_credentials":
      return EMAIL_ENABLED
        ? "البريد أو كلمة المرور غير صحيحة. نسيتها؟ ادخل برمز يصلك على بريدك."
        : "البريد أو كلمة المرور غير صحيحة. تأكد منهما، أو تواصل مع الصالون إذا نسيت كلمة المرور.";
    case "user_already_exists":
    case "email_exists":
      return "لهذا البريد حساب من قبل. ادخل به من صفحة الدخول.";
    case "email_not_confirmed":
      return "لم تؤكد بريدك بعد. اطلب رمز تأكيد جديداً وأدخله هنا.";
    case "weak_password":
      return "كلمة المرور ضعيفة. اكتب 8 أحرف على الأقل، واخلط حروفاً وأرقاماً.";
    case "same_password":
      return "هذه كلمة المرور الحالية نفسها. اكتب كلمة مرور جديدة.";
    case "otp_expired":
    case "flow_state_expired":
      return "انتهت صلاحية الرابط أو استُعمل من قبل. اطلب رابطاً جديداً.";
    case "email_address_invalid":
      return "اكتب بريداً إلكترونياً صحيحاً، مثل name@example.com.";
    case "over_email_send_rate_limit":
      return SEND_LIMIT;
    case "over_request_rate_limit":
      return "طلبات كثيرة في وقت قصير. انتظر دقيقة ثم حاول من جديد.";
    case "session_not_found":
    case "session_expired":
      return "انتهت جلستك. ادخل من جديد.";
  }
  if (error?.status === 429) return "طلبات كثيرة في وقت قصير. انتظر دقيقة ثم حاول من جديد.";
  return "حدث خطأ غير متوقع. تأكد من اتصالك بالإنترنت ثم حاول من جديد.";
}

export const MIN_PASSWORD = 8;

/*
  type="email" accepts "name@gmail" (no dot after @). Supabase then tries to send to it, the send fails, and the
  visitor sees a generic error. Check in the browser first.
*/
export const EMAIL_INCOMPLETE = "اكتب البريد كاملاً، مثل name@gmail.com";
export const isCompleteEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(email);

/** Supabase answers 500 `unexpected_failure` when sending the email fails (bad address, the mail provider refused it). */
export const isEmailSendFailure = (error: AuthErrorLike) => error?.code === "unexpected_failure" || error?.status === 500;

/** What the failed email was, in the message. */
const SENT_THING = {
  confirm: "رمز التأكيد",
  login: "رمز الدخول",
  reset: "رمز الاستعادة",
} as const;

export type SentThing = keyof typeof SENT_THING;

/** An error to show; `contact` adds «تواصل معنا على واتساب» as a link at the end of the sentence. */
export type AuthFailure = { message: string; contact?: boolean };

export const emailSendFailure = (what: SentThing): AuthFailure => ({
  message: `تعذّر إرسال ${SENT_THING[what]} إلى هذا البريد. تأكد منه وحاول مرة أخرى، أو`,
  contact: true,
});

/*
  Six-digit codes (Phase V). Supabase answers a wrong code and an expired one the same way (403 otp_expired),
  and says nothing about whether the email has an account; neither do these messages.
*/
export const OTP_LENGTH = 6;
/** The minimum interval between two emails to the same address in Supabase (Auth → Rate Limits). */
export const RESEND_SECONDS = 60;

const SEND_LIMIT = "أرسلنا رسائل كثيرة إلى هذا البريد في وقت قصير. انتظر دقيقة ثم اطلب رمزاً جديداً.";
const isRateLimited = (error: AuthErrorLike) => error?.status === 429 || !!error?.code?.startsWith("over_");

/** A failed verifyOtp({ email, token }) → what to do next. */
export function otpMessage(error: AuthErrorLike): string {
  if (error?.code === "over_email_send_rate_limit") return SEND_LIMIT;
  if (isRateLimited(error)) return "محاولات كثيرة في وقت قصير. انتظر دقيقة ثم جرّب الرمز من جديد.";
  if (error?.status && error.status >= 400 && error.status < 500)
    return "الرمز غير صحيح أو انتهت صلاحيته. تأكد من الأرقام الستة، أو اطلب رمزاً جديداً.";
  return authMessage(error);
}

/**
 * After asking Supabase to send a code (sign-in, reset, resend): the error worth showing, or null to say «sent».
 * Rate limits, a failed send and no answer at all (offline) are told; anything else (e.g. no account with this
 * email) is not, so the page never reveals who has an account.
 */
export function sendFailure(error: AuthErrorLike, what: SentThing): AuthFailure | null {
  if (!error) return null;
  if (isRateLimited(error)) return { message: authMessage(error) };
  if (isEmailSendFailure(error)) return emailSendFailure(what);
  if (!error.status) return { message: authMessage(error) };
  return null;
}

/** Arabic-Indic and Persian digits → western; anything else dropped; at most OTP_LENGTH digits. */
export function codeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, OTP_LENGTH);
}
