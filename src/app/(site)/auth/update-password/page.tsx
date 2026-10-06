import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";

export const metadata: Metadata = { title: "كلمة مرور جديدة", robots: { index: false } };

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="كلمة مرور جديدة" lede="اختر كلمة مرور جديدة لحسابك.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
