import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: { default: "لوحة الصالون", template: "%s | لوحة عدلي" },
  robots: { index: false, follow: false },
};

// Every admin page depends on who is signed in (and is private, no-store): it renders per request, never from a
// prerendered shell. Allowed to block on the session (cacheComponents).
export const instant = false;

/*
  Layer 2 of 3 for every admin page (the proxy is layer 1, the role check inside each database function layer 3).
  The layout's check is not enough on its own: every page and every Server Action calls requireRole() again.
*/
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { role } = await requireRole(["owner", "staff"]);
  const supabase = await createClient();
  const [{ data: newOrders }, { count: pendingBookings }] = await Promise.all([
    supabase.rpc("admin_new_orders_count"),
    // Staff read every booking (RLS); a head count, no rows.
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <div className={styles.shell}>
      <AdminNav
        role={role.role}
        newOrders={typeof newOrders === "number" ? newOrders : 0}
        pendingBookings={pendingBookings ?? 0}
      />
      <div className={styles.main}>{children}</div>
    </div>
  );
}
