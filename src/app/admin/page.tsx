import type { Metadata } from "next";
import Link from "next/link";
import { SalesChart, type DailySales } from "@/components/admin/SalesChart";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "الرئيسية" };

type StaffSummary = {
  new_orders: number;
  oldest_new_at: string | null;
  to_deliver: number;
  low_stock_count: number;
  low_stock: { variant_id: string; name_ar: string; qty: number; threshold: number }[];
};

type Dashboard = {
  sales: number;
  orders: number;
  avg: number;
  prev_sales: number;
  prev_orders: number;
  prev_avg: number;
  top: { name_ar: string; qty: number; revenue: number }[];
  areas: { area: string; orders: number; sales: number }[];
};

const PERIODS = {
  day: { label: "اليوم", vs: "عن أمس حتى هذه الساعة" },
  week: { label: "هذا الأسبوع", vs: "عن الأسبوع الماضي حتى اليوم نفسه" },
  month: { label: "هذا الشهر", vs: "عن الشهر الماضي حتى اليوم نفسه" },
} as const;
type Period = keyof typeof PERIODS;

const relative = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
function since(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return relative.format(-Math.max(1, minutes), "minute");
  if (minutes < 60 * 24) return relative.format(-Math.round(minutes / 60), "hour");
  return relative.format(-Math.round(minutes / (60 * 24)), "day");
}

/** «↑ 12٪ …» with the arrow as text, so the direction never rests on colour alone. */
function delta(cur: number, prev: number, vs: string) {
  if (prev === 0) return cur === 0 ? "لا مبيعات بعد في الفترتين" : "لا مبيعات في الفترة السابقة للمقارنة";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `مثل الفترة السابقة، ${vs}`;
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}٪ ${vs}`;
}

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const { user, role } = await requireRole(["owner", "staff"]);
  const isOwner = role.role === "owner";
  const sp = await searchParams;
  const period: Period = sp.period === "day" || sp.period === "week" ? sp.period : "month";

  const supabase = await createClient();
  const [summaryRes, dashRes, dailyRes] = await Promise.all([
    supabase.rpc("admin_staff_summary"),
    // Owner-only figures: not even requested for staff (the database would refuse anyway).
    isOwner ? supabase.rpc("admin_owner_dashboard", { p_period: period }) : Promise.resolve({ data: null, error: null }),
    isOwner ? supabase.rpc("admin_sales_daily", { p_days: 30 }) : Promise.resolve({ data: null, error: null }),
  ]);
  for (const [name, res] of [["staff_summary", summaryRes], ["owner_dashboard", dashRes], ["sales_daily", dailyRes]] as const) {
    if (res.error) console.error(`admin home ${name}`, res.error.code, res.error.message);
  }
  const s = summaryRes.data as StaffSummary | null;
  const d = dashRes.data as Dashboard | null;
  const daily = (dailyRes.data ?? []) as DailySales[];
  const who = user.name ?? user.email ?? "";

  return (
    <main className={styles.page}>
      <div>
        <h1 className="title">مرحباً، {who}</h1>
        <p className={styles.muted}>{isOwner ? "صاحب الصالون" : role.is_barber ? "حلاق" : "طاقم"}</p>
      </div>

      {/* Today's work: everyone */}
      <section aria-labelledby="today-title" className={styles.section}>
        <h2 id="today-title" className={styles.h2}>
          اليوم في الصالون
        </h2>
        {!s ? (
          <p className="ad-notice ad-notice--error" role="alert">
            تعذّر تحميل الملخص. حدّث الصفحة بعد قليل.
          </p>
        ) : (
          <ul className={styles.tiles}>
            <li>
              <Link href="/admin/orders?status=new" className={styles.tile} data-attention={s.new_orders > 0 || undefined}>
                <span className={styles.label}>بانتظار التأكيد</span>
                <span className={styles.value}>{s.new_orders}</span>
                <span className={styles.note}>{s.oldest_new_at ? `أقدمها ${since(s.oldest_new_at)}` : "لا طلبات جديدة"}</span>
              </Link>
            </li>
            <li>
              <Link href="/admin/orders?status=confirmed" className={styles.tile}>
                <span className={styles.label}>مؤكدة بانتظار التسليم</span>
                <span className={styles.value}>{s.to_deliver}</span>
              </Link>
            </li>
            <li>
              <Link href="/admin/stock?filter=low" className={styles.tile} data-attention={s.low_stock_count > 0 || undefined}>
                <span className={styles.label}>تحت حد الإنذار</span>
                <span className={styles.value}>{s.low_stock_count}</span>
                <span className={styles.note}>{s.low_stock_count === 0 ? "كل المعروض فيه ما يكفي" : "نسخ ظاهرة في الموقع"}</span>
              </Link>
            </li>
          </ul>
        )}
        {s && s.low_stock.length > 0 && (
          <ul className={styles.low}>
            {s.low_stock.map((v) => (
              <li key={v.variant_id}>
                <Link href={`/admin/stock/${v.variant_id}`}>
                  <span>{v.name_ar}</span>
                  <span className="ad-stock-state" data-state={v.qty <= 0 ? "out" : "low"}>
                    {v.qty <= 0 ? "نفد" : `بقي ${v.qty}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Money: owner only */}
      {isOwner && (
        <section aria-labelledby="sales-title" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 id="sales-title" className={styles.h2}>
              المبيعات
            </h2>
            <nav className="ad-chips" aria-label="الفترة">
              {(Object.keys(PERIODS) as Period[]).map((p) => (
                <Link key={p} className="ad-chip" href={p === "month" ? "/admin" : `/admin?period=${p}`} aria-current={p === period ? "page" : undefined}>
                  {PERIODS[p].label}
                </Link>
              ))}
            </nav>
          </div>
          <p className={styles.muted}>الطلبات المؤكدة والمسلّمة فقط، بتوقيت الصالون.</p>

          {!d ? (
            <p className="ad-notice ad-notice--error" role="alert">
              تعذّر تحميل المبيعات. حدّث الصفحة بعد قليل.
            </p>
          ) : (
            <>
              <ul className={styles.tiles}>
                <li className={styles.tile}>
                  <span className={styles.label}>المبيعات</span>
                  <span className={styles.value}>{formatPrice(d.sales)}</span>
                  <span className={styles.note}>{delta(d.sales, d.prev_sales, PERIODS[period].vs)}</span>
                </li>
                <li className={styles.tile}>
                  <span className={styles.label}>عدد الطلبات</span>
                  <span className={styles.value}>{d.orders}</span>
                  <span className={styles.note}>{delta(d.orders, d.prev_orders, PERIODS[period].vs)}</span>
                </li>
                <li className={styles.tile}>
                  <span className={styles.label}>متوسط قيمة الطلب</span>
                  <span className={styles.value}>{d.orders > 0 ? formatPrice(d.avg) : "—"}</span>
                  <span className={styles.note}>{d.orders > 0 ? delta(d.avg, d.prev_avg, PERIODS[period].vs) : "لا طلبات بعد"}</span>
                </li>
              </ul>

              {daily.length > 0 && (
                <div className={styles.panel}>
                  <SalesChart days={daily} />
                </div>
              )}

              <div className={styles.columns}>
                <div className={styles.panel}>
                  <h3 className={styles.h3}>الأكثر مبيعاً · {PERIODS[period].label}</h3>
                  {d.top.length === 0 ? (
                    <p className={styles.muted}>لا مبيعات في هذه الفترة بعد.</p>
                  ) : (
                    <Ranked rows={d.top.map((t) => ({ label: t.name_ar, value: t.qty, text: `${t.qty} قطعة · ${formatPrice(t.revenue)}` }))} />
                  )}
                </div>
                <div className={styles.panel}>
                  <h3 className={styles.h3}>الطلبات حسب المنطقة · {PERIODS[period].label}</h3>
                  {d.areas.length === 0 ? (
                    <p className={styles.muted}>لا طلبات في هذه الفترة بعد.</p>
                  ) : (
                    <Ranked
                      rows={d.areas.map((a) => ({
                        label: a.area || "بدون منطقة",
                        value: a.orders,
                        text: `${a.orders === 1 ? "طلب واحد" : `${a.orders} طلبات`} · ${formatPrice(a.sales)}`,
                      }))}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

/** A ranked list with a thin magnitude bar; the number is always written beside it (the bar only supports it). */
function Ranked({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className={styles.ranked}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className={styles.rankLabel}>{r.label}</span>
          <span className={styles.rankText}>{r.text}</span>
          <span className={styles.rankBar} aria-hidden="true">
            <span style={{ inlineSize: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}
