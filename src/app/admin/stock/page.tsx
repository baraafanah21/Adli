import type { Metadata } from "next";
import { AdminSoon } from "@/components/admin/AdminSoon";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "المخزون" };

export default async function Page() {
  await requireRole(["owner", "staff"], "/admin/stock");
  return <AdminSoon title="المخزون" step="F3" />;
}
