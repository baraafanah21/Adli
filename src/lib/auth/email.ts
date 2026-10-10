/*
  Does the site offer what needs an email to arrive? Auth email goes out through Resend's SMTP from
  no-reply@adlisalon.com (set in the Supabase dashboard) and carries a six-digit code (Phase V).
  While this is false the site offers no sign-in code, no resend of the sign-up code from the login page and no
  «forgot password» (the salon is contacted on WhatsApp instead). Sign-up follows Supabase's «Confirm email» on
  its own: a session means signed in, none means the code step. Turn it on with NEXT_PUBLIC_EMAIL_ENABLED=true;
  the order is in CLAUDE.md («Email»).
*/
export const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED === "true";
