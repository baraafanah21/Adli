import type { Metadata } from "next";
import { AdminSoon } from "@/components/admin/AdminSoon";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "المنتجات" };

export default async function Page() {
  await requireRole(["owner", "staff"], "/admin/products");
  return <AdminSoon title="المنتجات" step="F2" />;
}
