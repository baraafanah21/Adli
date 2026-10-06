import type { Metadata } from "next";
import { AdminSoon } from "@/components/admin/AdminSoon";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "الفئات" };

export default async function Page() {
  await requireRole(["owner"], "/admin/categories");
  return <AdminSoon title="الفئات" step="F4" />;
}
