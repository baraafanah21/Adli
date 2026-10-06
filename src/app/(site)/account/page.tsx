import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ProfileForm } from "@/components/account/ProfileForm";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(site)/auth/actions";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "بياناتي", robots: { index: false } };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, area, phone").eq("id", user.id).maybeSingle();
  const passwordUpdated = (await searchParams).password === "updated";

  return (
    <AuthShell
      title="بياناتي"
      lede="تُستعمل لملء نموذج الطلب تلقائياً. لا نشاركها مع أحد."
      footer={
        <>
          <Link href="/account/orders">طلباتي</Link>
          <Link href="/auth/update-password">غيّر كلمة المرور</Link>
          <form action={signOut}>
            <button type="submit" className={styles.linkButton}>
              خروج
            </button>
          </form>
        </>
      }
    >
      {passwordUpdated && (
        <p className={styles.notice} role="status">
          حُفظت كلمة المرور الجديدة.
        </p>
      )}
      <ProfileForm email={user.email} profile={profile ?? { full_name: user.name, area: null, phone: null }} />
    </AuthShell>
  );
}
