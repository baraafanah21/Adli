/*
  Can the site send auth emails to customers? Not yet: Resend has no verified sending domain, so only the project
  owner's address receives mail, and «Confirm email» is off in Supabase (sign-up gives a session at once).
  While this is false the site never offers anything that needs an email to arrive: no sign-in link, no «forgot
  password» (the salon is contacted on WhatsApp instead). Turn it on with NEXT_PUBLIC_EMAIL_ENABLED=true; the
  checklist is in CLAUDE.md («Email»).
*/
export const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED === "true";
