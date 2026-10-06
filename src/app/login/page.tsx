import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/next";

export const metadata: Metadata = { title: "دخول", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next as string | undefined);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell
      title="دخول"
      lede="ادخل لترى طلباتك، ويُملأ نموذج الطلب ببياناتك."
      footer={
        <>
          <span>ليس لديك حساب؟</span>
          <Link href={`/signup?next=${encodeURIComponent(next)}`}>أنشئ حساباً</Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
