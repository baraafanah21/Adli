# Supabase Auth email templates (Arabic, RTL)

Auth email goes out through Resend's SMTP (`smtp.resend.com`) from `no-reply@adlisalon.com`; the domain is verified
with DKIM, SPF and DMARC. The SMTP settings live in the Supabase dashboard only; nothing about them is in this repo. Paste each file into **Authentication → Emails → Templates**, with its subject:

| Template in Supabase | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `رمز تأكيد بريدك في عدلي: {{ .Token }}` |
| Magic link | `magic-link.html` | `رمز دخولك إلى عدلي` |
| Reset password | `reset-password.html` | `رمز استعادة كلمة المرور في عدلي` |

There is no «Change email address» template: the site has no way to change the email.

## Settings in the dashboard

- **Authentication → Sign In / Providers → Email**: «Email OTP Expiration» = `600` seconds, «Email OTP Length» = `6`.
  The site's code field takes exactly 6 digits, and every template says «صالح لمدة 10 دقائق».
- **Authentication → Rate Limits**: the minimum interval between emails to one address stays `60` seconds; the site's
  «أعد إرسال الرمز» waits the same 60 seconds (`RESEND_SECONDS` in `src/lib/auth/errors.ts`).
- **Authentication → URL Configuration → Redirect URLs**: `http://localhost:3000/**`, the production domain and the
  Vercel Preview domain (`https://*.vercel.app/**` or the project's own pattern). Only the fallback link needs them.

## How it works

- **The code (main way):** each template shows `{{ .Token }}` large, left to right. The visitor types it on the same
  page that sent it (`OtpStep`, `src/components/auth/OtpStep.tsx`), which calls `verifyOtp({ email, token, type })`
  with `type: "email"` after sign-up or a sign-in code and `type: "recovery"` after «نسيت كلمة المرور».
- **The button and the link (fallback, kept on purpose):** the site always sends `redirectTo` =
  `<site>/auth/confirm?next=…`, and the templates build `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email|recovery`.
  `/auth/confirm` verifies the token in the browser with `verifyOtp({ token_hash })`, so mail scanners that pre-open
  links don't use up the single-use token. So the same templates work with the code and with an older page still
  open that only waits for the link, from `http://localhost:3000` and the production domain alike.
- The code and the link come from the same token: using one uses the other, and both expire after 10 minutes.

Inline styles and HTML only, no images: many mail apps block images and drop `<style>`. Colors are the logo's
forest `#0B300F` and cream `#F5F5DB`, with brass `#C9A24A` for the button and the code's frame.
