import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "لوحة الصالون", robots: { index: false } };

/*
  Phase C: only proves the three layers (proxy → requireRole here → RLS). The dashboard itself is phase F.
  Every admin Server Component and Server Action starts with requireRole(...).
*/
export default async function AdminPage() {
  const { user, role } = await requireRole(["owner", "staff"]);
  const who = user.name ?? user.email ?? "";
  const roleName = role.role === "owner" ? "صاحب الصالون" : role.is_barber ? "حلاق" : "طاقم";

  return (
    <AuthShell title={`مرحباً، ${who}`} lede={`دخلت بصلاحية: ${roleName}. لوحة الصالون قيد التجهيز.`}>
      <></>
    </AuthShell>
  );
}
