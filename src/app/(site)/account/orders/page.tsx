import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import styles from "./orders.module.css";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "طلباتي", robots: { index: false } };

// Depends on who is signed in: rendered per request (private, no-store), allowed to block on the session.
export const instant = false;

const STATUS: Record<string, string> = {
  new: "وصل الطلب",
  confirmed: "مؤكد",
  done: "تم التسليم",
  cancelled: "ملغى",
};

type Row = {
  id: string;
  code: string;
  status: string;
  total_ils: number;
  created_at: string;
  order_items: {
    id: number;
    name_ar: string;
    variant_name_ar: string | null;
    volume_ml: number | null;
    qty: number;
    unit_price_ils: number;
  }[];
};


export default async function MyOrdersPage() {
  const user = await requireUser("/account/orders");
  const supabase = await createClient();
  // RLS returns only this user's orders (user_id = auth.uid()); the filter is for the index.
  const { data, error } = await supabase
    .from("orders")
    .select("id, code, status, total_ils, created_at, order_items (id, name_ar, variant_name_ar, volume_ml, qty, unit_price_ils)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const orders = (data ?? []) as Row[];

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className="display-md">طلباتي</h1>
        <Link className={styles.link} href="/account">
          بياناتي
        </Link>
      </div>

      {error ? (
        <p className={styles.empty} role="alert">
          تعذّر تحميل طلباتك الآن. حاول مرة أخرى بعد قليل.
        </p>
      ) : orders.length === 0 ? (
        <div className={styles.empty}>
          <p>لا توجد طلبات على حسابك بعد. الطلبات التي أرسلتها كضيف لا تظهر هنا.</p>
          <Link className="ad-btn ad-btn--ghost" href="/#shelf">
            تصفّح المنتجات
          </Link>
        </div>
      ) : (
        <ol className={styles.list}>
          {orders.map((o) => (
            <li key={o.id} className={styles.order}>
              <div className={styles.orderHead}>
                <span className={styles.code}>{o.code}</span>
                <span className={styles.status} data-status={o.status}>
                  {STATUS[o.status] ?? o.status}
                </span>
              </div>
              <p className={styles.date}>{formatDateTime(o.created_at)}</p>
              <ul className={styles.items}>
                {o.order_items.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.name_ar}
                      {i.variant_name_ar ? ` ${i.variant_name_ar}` : ""}
                      {i.volume_ml ? ` ${i.volume_ml} مل` : ""} × {i.qty}
                    </span>
                    <span>{formatPrice(i.unit_price_ils * i.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="ad-total">
                <span>المجموع</span>
                <span className="ad-price">{formatPrice(o.total_ils)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
