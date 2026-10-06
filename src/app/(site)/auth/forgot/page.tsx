import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata: Metadata = { title: "نسيت كلمة المرور", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthShell
      title="نسيت كلمة المرور"
      lede="اكتب بريدك، ونرسل لك رابطاً تعيّن منه كلمة مرور جديدة."
      footer={<Link href="/login">رجوع إلى الدخول</Link>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
