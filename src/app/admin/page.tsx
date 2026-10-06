import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import styles from "./admin-page.module.css";

export const metadata: Metadata = { title: "الرئيسية" };

// Phase F5 replaces this with the owner's sales figures and the staff's daily view.
export default async function AdminHome() {
  const { user, role } = await requireRole(["owner", "staff"]);
  const supabase = await createClient();
  const { data: newOrders } = await supabase.rpc("admin_new_orders_count");
  const who = user.name ?? user.email ?? "";

  return (
    <main className={styles.page}>
      <h1 className="title">مرحباً، {who}</h1>
      <p className={styles.tileLabel}>دخلت بصلاحية: {role.role === "owner" ? "صاحب الصالون" : role.is_barber ? "حلاق" : "طاقم"}</p>
      <ul className={styles.tiles}>
        <li>
          <Link href="/admin/orders?status=new" className={styles.tile}>
            <span className={styles.tileLabel}>طلبات بانتظار التأكيد</span>
            <span className={styles.tileValue}>{typeof newOrders === "number" ? newOrders : "—"}</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
