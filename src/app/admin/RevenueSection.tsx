import Form from "next/form";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { REVENUE_PERIODS, dayLabel, rangeLabel, revenueFilters, visits, type Revenue, type RevenuePeriod, type RevenueRow } from "@/lib/admin/revenue";
import styles from "./home.module.css";

type Search = Record<string, string | string[] | undefined>;

/**
 * «الإيرادات» (owner only; admin_revenue() refuses anyone else): completed bookings and what was paid, by salon day.
 * Its filters are links and a GET form, kept in the URL beside the sales card's ?period=.
 */
export async function RevenueSection({ sp, salesPeriod }: { sp: Search; salesPeriod: string | null }) {
  const f = revenueFilters(sp);
  const supabase = await createClient();
  const [revRes, barbersRes, servicesRes] = await Promise.all([
    supabase.rpc("admin_revenue", { p_from: f.from, p_to: f.to, p_barber: f.barber, p_service: f.service }),
    supabase.rpc("admin_barbers"),
    // Bookable services only (an add-on has no duration and is never a booking).
    supabase.from("services").select("id, name_ar, duration_min").not("duration_min", "is", null).order("sort"),
  ]);
  for (const [name, res] of [
    ["revenue", revRes],
    ["barbers", barbersRes],
    ["services", servicesRes],
  ] as const) {
    if (res.error) console.error(`admin home ${name}`, res.error.code, res.error.message);
  }
  const rev = revRes.data as Revenue | null;
  const barbers = (barbersRes.data ?? []) as { id: string; name_ar: string; is_active: boolean }[];
  const services = (servicesRes.data ?? []) as { id: string; name_ar: string }[];

  /** A link that keeps the sales period and the barber / service filters. */
  const href = (period: RevenuePeriod) => {
    const q = new URLSearchParams();
    if (salesPeriod) q.set("period", salesPeriod);
    if (period !== "month") q.set("rev", period);
    if (period === "range") {
      q.set("rev_from", f.from);
      q.set("rev_to", f.to);
    }
    if (f.barber) q.set("rev_barber", f.barber);
    if (f.service) q.set("rev_service", f.service);
    return `/admin${q.size ? `?${q}` : ""}#revenue-title`;
  };

  return (
    <section aria-labelledby="revenue-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="revenue-title" className={styles.h2}>
          الإيرادات
        </h2>
        <nav className="ad-chips" aria-label="فترة الإيرادات">
          {(Object.keys(REVENUE_PERIODS) as RevenuePeriod[]).map((p) => (
            <Link key={p} className="ad-chip" href={href(p)} aria-current={p === f.period ? "page" : undefined} scroll={false}>
              {REVENUE_PERIODS[p]}
            </Link>
          ))}
        </nav>
      </div>
      <p className={styles.muted}>
        المواعيد التي سُجّل فيها «حضر»، بالمبلغ المدفوع، حسب يوم الموعد بتوقيت الصالون. العطور والمنتجات في «المبيعات» تحت.
      </p>

      <Form action="/admin" scroll={false} className={styles.filters}>
        {salesPeriod && <input type="hidden" name="period" value={salesPeriod} />}
        {f.period !== "month" && <input type="hidden" name="rev" value={f.period} />}
        {f.period === "range" && (
          <>
            <div className="ad-field">
              <label htmlFor="rev-from">من</label>
              <input id="rev-from" type="date" name="rev_from" defaultValue={f.from} required dir="ltr" />
            </div>
            <div className="ad-field">
              <label htmlFor="rev-to">إلى</label>
              <input id="rev-to" type="date" name="rev_to" defaultValue={f.to} required dir="ltr" />
            </div>
          </>
        )}
        <div className="ad-field">
          <label htmlFor="rev-barber">الحلاق</label>
          <select id="rev-barber" name="rev_barber" defaultValue={f.barber ?? ""}>
            <option value="">كل الحلاقين</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
                {b.is_active ? "" : " (موقوف)"}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor="rev-service">الخدمة</label>
          <select id="rev-service" name="rev_service" defaultValue={f.service ?? ""}>
            <option value="">كل الخدمات</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_ar}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="ad-btn ad-btn--ghost">
          اعرض
        </button>
      </Form>

      {f.rangeInvalid && (
        <p className="ad-notice" role="status">
          اختر «من» قبل «إلى»، ولمدة سنة على الأكثر. المعروض الآن هذا الشهر.
        </p>
      )}

      {!rev ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل الإيرادات. حدّث الصفحة بعد قليل.
        </p>
      ) : (
        <>
          <ul className={styles.tiles}>
            <li className={styles.tile}>
              <span className={styles.label}>الإيرادات</span>
              <span className={styles.value}>{formatPrice(rev.total_ils)}</span>
              <span className={styles.note}>{rangeLabel(rev.from, rev.to)}</span>
            </li>
            <li className={styles.tile}>
              <span className={styles.label}>الزيارات</span>
              <span className={styles.value}>{rev.count}</span>
              <span className={styles.note}>{visits(rev.count)} سُجّل فيها «حضر»</span>
            </li>
            <li className={styles.tile}>
              <span className={styles.label}>متوسط الزيارة</span>
              <span className={styles.value}>{rev.count > 0 ? formatPrice(Math.round(rev.total_ils / rev.count)) : "—"}</span>
            </li>
          </ul>

          {rev.count === 0 ? (
            <p className={styles.muted}>لا زيارات مسجّلة بهذه الفلاتر بعد.</p>
          ) : (
            <div className={styles.columns}>
              <RevenueTable title="حسب الحلاق" first="الحلاق" rows={rev.by_barber} />
              <RevenueTable title="حسب الخدمة" first="الخدمة" rows={rev.by_service} />
              {rev.by_day.length > 1 && (
                <RevenueTable
                  title="حسب اليوم"
                  first="اليوم"
                  wide
                  rows={rev.by_day.map((d) => ({ id: d.day, name_ar: dayLabel(d.day), total_ils: d.total_ils, count: d.count }))}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RevenueTable({ title, first, rows, wide }: { title: string; first: string; rows: RevenueRow[]; wide?: boolean }) {
  return (
    <div className={`${styles.panel} ${wide ? styles.wide : ""}`}>
      <table className={styles.table}>
        <caption className={styles.h3}>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{first}</th>
            <th scope="col">الزيارات</th>
            <th scope="col">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.name_ar}</th>
              <td>{r.count}</td>
              <td>{formatPrice(r.total_ils)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
