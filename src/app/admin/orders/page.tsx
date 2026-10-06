import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUSES, STATUS_LABEL, isOrderStatus, type OrderStatus } from "@/lib/order-status";
import styles from "./orders.module.css";

export const metadata: Metadata = { title: "الطلبات" };

const PAGE_SIZE = 30;

type Row = {
  id: string;
  code: string;
  status: OrderStatus;
  customer_name: string;
  area: string | null;
  phone: string | null;
  total_ils: number;
  item_count: number;
  created_at: string;
  total_count: number;
};

const timeFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", {
  timeZone: "Asia/Hebron",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireRole(["owner", "staff"], "/admin/orders");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const status = isOrderStatus(one("status")) ? (one("status") as OrderStatus) : null;
  const from = isDate(one("from")) ? one("from")! : null;
  const to = isDate(one("to")) ? one("to")! : null;
  const q = (one("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_orders", {
    p_status: status,
    p_from: from,
    p_to: to,
    p_q: q || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) console.error("admin_orders", error.code, error.message);
  const rows = (data ?? []) as Row[];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(status || from || to || q);

  /** This page's URL with some filters changed (page resets unless given). */
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | null> = { status, from, to, q: q || null, page: null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <main className={styles.page}>
      <h1 className="title">الطلبات</h1>

      <nav className={`ad-chips ${styles.chips}`} aria-label="الحالة">
        <Link className="ad-chip" href={href({ status: null })} aria-current={status === null ? "page" : undefined}>
          الكل
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} className="ad-chip" href={href({ status: s })} aria-current={status === s ? "page" : undefined}>
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      <form className={styles.filters} action="/admin/orders" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <div className={`ad-field ${styles.search}`}>
          <label htmlFor="orders-q">بحث</label>
          <input id="orders-q" name="q" type="search" defaultValue={q} placeholder="رقم الطلب أو الاسم أو الهاتف" maxLength={80} />
        </div>
        <div className="ad-field">
          <label htmlFor="orders-from">من</label>
          <input id="orders-from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor="orders-to">إلى</label>
          <input id="orders-to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <div className={styles.filterActions}>
          <button type="submit" className="ad-btn ad-btn--primary">
            بحث
          </button>
          {filtered && (
            <Link className="ad-btn ad-btn--ghost" href="/admin/orders">
              مسح
            </Link>
          )}
        </div>
      </form>

      {error ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل الطلبات. حدّث الصفحة بعد قليل.
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.empty} role="status">
          {filtered ? "لا توجد طلبات بهذه الشروط. غيّر البحث أو اضغط «مسح»." : "لا توجد طلبات بعد. ستظهر هنا فور إرسال أول طلب من الموقع."}
        </p>
      ) : (
        <>
          <p className={styles.count} role="status">
            {total === 1 ? "طلب واحد" : `${total} طلباً`}
          </p>

          {/* Desktop: a table. */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">الطلب</th>
                <th scope="col">الزبون</th>
                <th scope="col">المنطقة</th>
                <th scope="col">القطع</th>
                <th scope="col">المجموع</th>
                <th scope="col">الحالة</th>
                <th scope="col">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <th scope="row">
                    <Link href={`/admin/orders/${o.code}`}>{o.code}</Link>
                  </th>
                  <td>{o.customer_name}</td>
                  <td>{o.area ?? "—"}</td>
                  <td className={styles.num}>{o.item_count}</td>
                  <td className={styles.num}>{formatPrice(o.total_ils)}</td>
                  <td>
                    <span className="ad-status" data-status={o.status}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td className={styles.time}>{timeFmt.format(new Date(o.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phones: one card per order, the whole card is the link. */}
          <ul className={styles.cards}>
            {rows.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.code}`} className={styles.card}>
                  <span className={styles.cardTop}>
                    <span className={styles.code}>{o.code}</span>
                    <span className="ad-status" data-status={o.status}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </span>
                  <span className={styles.cardName}>
                    {o.customer_name}
                    {o.area ? <span className={styles.muted}> · {o.area}</span> : null}
                  </span>
                  <span className={styles.cardBottom}>
                    <span className={styles.muted}>
                      {timeFmt.format(new Date(o.created_at))} · {o.item_count} قطعة
                    </span>
                    <span className={styles.total}>{formatPrice(o.total_ils)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className={styles.pager} aria-label="الصفحات">
              {page > 1 ? (
                <Link className="ad-btn ad-btn--ghost" href={href({ page: String(page - 1) })}>
                  الأحدث
                </Link>
              ) : (
                <span />
              )}
              <span className={styles.muted}>
                صفحة {page} من {pages}
              </span>
              {page < pages ? (
                <Link className="ad-btn ad-btn--ghost" href={href({ page: String(page + 1) })}>
                  الأقدم
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
