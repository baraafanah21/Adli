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
  const [{ data: newOrders }, { data: bookingBadges }] = await Promise.all([
    supabase.rpc("admin_new_orders_count"),
    // New since my last visit to «المواعيد», and pending (admin_bookings_badges, E3.1).
    supabase.rpc("admin_bookings_badges"),
  ]);
  const badges = (bookingBadges ?? { new: 0, pending: 0 }) as { new: number; pending: number };

  return (
    <div className={styles.shell}>
      <AdminNav
        role={role.role}
        newOrders={typeof newOrders === "number" ? newOrders : 0}
        newBookings={badges.new}
        pendingBookings={badges.pending}
      />
      <div className={styles.main}>{children}</div>
    </div>
  );
}
