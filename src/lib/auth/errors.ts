/*
  Supabase Auth errors → Arabic that says what to do next.
  Never reveals whether an email has an account.
*/

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

export function authMessage(error: AuthErrorLike): string {
  switch (error?.code) {
    case "invalid_credentials":
      return "البريد أو كلمة المرور غير صحيحة. تأكد منهما، أو ادخل برابط يصلك على بريدك.";
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
