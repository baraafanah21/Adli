import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ConfirmLink } from "@/components/auth/ConfirmLink";

export const metadata: Metadata = { title: "تأكيد الرابط", robots: { index: false } };

export default function ConfirmPage() {
  return (
    <AuthShell title="لحظة واحدة">
      <Suspense>
        <ConfirmLink />
      </Suspense>
    </AuthShell>
  );
}
