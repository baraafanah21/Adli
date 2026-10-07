import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { getCurrentUser } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/next";

export const metadata: Metadata = { title: "حساب جديد", robots: { index: false } };

// Depends on who is signed in: rendered per request (private, no-store), allowed to block on the session.
export const instant = false;

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNext((await searchParams).next as string | undefined);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell
      title="حساب جديد"
      lede="الحساب اختياري: تقدر تطلب كضيف دائماً. مع الحساب تحفظ بياناتك وترى طلباتك."
      footer={
        <>
          <span>لديك حساب؟</span>
          <Link href={`/login?next=${encodeURIComponent(next)}`}>ادخل</Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
