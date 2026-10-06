import type { Metadata } from "next";
import { AdminSoon } from "@/components/admin/AdminSoon";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "الطاقم" };

export default async function Page() {
  await requireRole(["owner"], "/admin/staff");
  return <AdminSoon title="الطاقم" step="F4" />;
}
