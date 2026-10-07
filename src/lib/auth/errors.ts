import { EMAIL_ENABLED } from "@/lib/auth/email";

/*
  Supabase Auth errors → Arabic that says what to do next.
  Never reveals whether an email has an account (except sign-up while «Confirm email» is off: Supabase says so itself).
*/

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

export function authMessage(error: AuthErrorLike): string {
  switch (error?.code) {
    case "invalid_credentials":
      return EMAIL_ENABLED
        ? "البريد أو كلمة المرور غير صحيحة. تأكد منهما، أو ادخل برابط يصلك على بريدك."
        : "البريد أو كلمة المرور غير صحيحة. تأكد منهما، أو تواصل مع الصالون إذا نسيت كلمة المرور.";
    case "user_already_exists":
    case "email_exists":
      return "لهذا البريد حساب من قبل. ادخل به من صفحة الدخول.";
    case "email_not_confirmed":
      return "لم تؤكد بريدك بعد. افتح رسالة التأكيد التي أرسلناها، أو اطلب رسالة جديدة.";
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
  confirm: "رسالة التأكيد",
  login: "رابط الدخول",
  reset: "رابط الاستعادة",
} as const;

/** An error to show; `contact` adds «تواصل معنا على واتساب» as a link at the end of the sentence. */
export type AuthFailure = { message: string; contact?: boolean };

export const emailSendFailure = (what: keyof typeof SENT_THING): AuthFailure => ({
  message: `تعذّر إرسال ${SENT_THING[what]} إلى هذا البريد. تأكد منه وحاول مرة أخرى، أو`,
  contact: true,
});
