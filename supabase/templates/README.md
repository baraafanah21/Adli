# Supabase Auth email templates (Arabic, RTL)

Paste each file into **Authentication → Emails → Templates** in the Supabase dashboard:

| Template in Supabase | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `أكّد بريدك في عدلي` |
| Magic link | `magic-link.html` | `رابط دخولك إلى عدلي` |
| Reset password | `reset-password.html` | `كلمة مرور جديدة لحسابك في عدلي` |

How the links work:

- The site always sends `redirectTo` = `<site>/auth/confirm?next=…`, and the templates build
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email|recovery`. So the same templates work from
  `http://localhost:3000` and `https://adli-salon.vercel.app`.
- That only works when both are in **Authentication → URL Configuration → Redirect URLs**:
  `http://localhost:3000/**` and `https://adli-salon.vercel.app/**`. Otherwise Supabase falls back to the Site URL
  and the link breaks.
- `/auth/confirm` verifies the token in the browser with `verifyOtp`, so mail scanners that pre-open links don't use
  up the single-use token.

Inline styles and HTML only, no images: many mail apps block images and drop `<style>`. Colors are the logo's
forest `#0B300F` and cream `#F5F5DB`, with brass `#C9A24A` for the button.
