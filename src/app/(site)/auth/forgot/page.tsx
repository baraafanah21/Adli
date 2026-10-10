import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";
import { EMAIL_ENABLED } from "@/lib/auth/email";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "نسيت كلمة المرور", robots: { index: false } };

export default function ForgotPage() {
  // No reset email can arrive while sending is off (src/lib/auth/email.ts): the salon resets the password by hand.
  if (!EMAIL_ENABLED) {
    return (
      <AuthShell title="نسيت كلمة المرور" footer={<Link href="/login">رجوع إلى الدخول</Link>}>
        <p className={styles.notice}>
          تواصل مع الصالون على واتساب من الرقم المسجّل في حسابك، ونساعدك تعيّن كلمة مرور جديدة.
        </p>
        <a
          className="ad-btn ad-btn--ghost ad-btn--block"
          href={whatsappUrl("مرحباً صالون عدلي، نسيت كلمة المرور لحسابي في الموقع.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          تواصل مع الصالون
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="نسيت كلمة المرور"
      lede="اكتب بريدك، ونرسل لك رمزاً من 6 أرقام تعيّن به كلمة مرور جديدة."
      footer={<Link href="/login">رجوع إلى الدخول</Link>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
