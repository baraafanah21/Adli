import type { Metadata } from "next";
import { BarberForm, HoursForm, ServiceForm, type AdminBarber, type AdminService, type StaffOption } from "@/components/admin/SalonForms";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { DAY_NAMES, type Weekday } from "@/lib/salon";
import formStyles from "@/components/admin/forms.module.css";
import styles from "@/app/admin/categories/categories.module.css";

export const metadata: Metadata = { title: "الصالون" };

/** The salon's week starts on Saturday. */
const WEEK_ORDER: Weekday[] = [6, 0, 1, 2, 3, 4, 5];

type StaffRow = { user_id: string; email: string; full_name: string | null };

export default async function AdminSalonPage() {
  await requireRole(["owner"], "/admin/salon");
  const supabase = await createClient();
  const [barbersRes, staffRes, servicesRes, hoursRes] = await Promise.all([
    supabase.rpc("admin_barbers"),
    supabase.rpc("admin_staff"),
    // The owner reads hidden services too (RLS: is_active or staff).
    supabase.from("services").select("id, slug, name_ar, price_ils, duration_min, bookable_online, sort, is_active").order("sort"),
    supabase.from("salon_hours").select("weekday, open_time, close_time"),
  ]);
  for (const [name, res] of [
    ["barbers", barbersRes],
    ["staff", staffRes],
    ["services", servicesRes],
    ["hours", hoursRes],
  ] as const) {
    if (res.error) console.error(`admin salon ${name}`, res.error.code, res.error.message);
  }

  const barbers = (barbersRes.data ?? []) as AdminBarber[];
  const staff: StaffOption[] = ((staffRes.data ?? []) as StaffRow[]).map((s) => ({
    user_id: s.user_id,
    label: s.full_name ? `${s.full_name} (${s.email})` : s.email,
  }));
  const services = (servicesRes.data ?? []) as AdminService[];
  const hours = new Map(
    ((hoursRes.data ?? []) as { weekday: Weekday; open_time: string; close_time: string }[]).map((h) => [
      h.weekday,
      { open: h.open_time.slice(0, 5), close: h.close_time.slice(0, 5) },
    ]),
  );
  const nextBarberSort = barbers.reduce((m, b) => Math.max(m, b.sort), 0) + 10;
  const nextServiceSort = services.reduce((m, s) => Math.max(m, s.sort), 0) + 10;
  const failed = barbersRes.error || servicesRes.error || hoursRes.error;

  return (
    <main className={styles.page}>
      <h1 className="title">الصالون</h1>
      <p className={formStyles.lede}>
        الحلاقون والخدمات وساعات الدوام كما يراها الزبون في الموقع وصفحة الحجز. المواعيد الموجودة تحتفظ بسعرها ومدتها.
      </p>

      {failed && (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل بعض البيانات. حدّث الصفحة بعد قليل.
        </p>
      )}

      <section className={formStyles.section} aria-labelledby="barbers-title">
        <h2 id="barbers-title">الحلاقون</h2>
        <ul className={styles.list}>
          {barbers.map((b) => (
            <li key={b.id} className={styles.item}>
              <details>
                <summary className={styles.summary}>
                  <span className={styles.main}>
                    <span className={styles.name}>{b.name_ar}</span>
                    <span className={styles.meta}>
                      {b.linked_name ?? b.linked_email ?? "بدون حساب"} · {b.upcoming} مواعيد قادمة
                    </span>
                  </span>
                  <span className={styles.state} data-active={b.is_active || undefined}>
                    {b.is_active ? "ظاهر" : "مخفي"}
                  </span>
                </summary>
                <div className={styles.body}>
                  <BarberForm barber={b} staff={staff} nextSort={nextBarberSort} />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details>
          <summary className={styles.summary}>
            <span className={styles.name}>حلاق جديد</span>
          </summary>
          <div className={styles.body}>
            <BarberForm staff={staff} nextSort={nextBarberSort} />
          </div>
        </details>
      </section>

      <section className={formStyles.section} aria-labelledby="services-title">
        <h2 id="services-title">الخدمات والأسعار</h2>
        <ul className={styles.list}>
          {services.map((s) => (
            <li key={s.id} className={styles.item}>
              <details>
                <summary className={styles.summary}>
                  <span className={styles.main}>
                    <span className={styles.name}>{s.name_ar}</span>
                    <span className={styles.meta}>
                      {formatPrice(s.price_ils)}
                      {s.duration_min ? ` · ${s.duration_min} دقيقة` : ""} ·{" "}
                      {s.bookable_online ? "تُحجز من الموقع" : "تُطلب في الصالون"}
                    </span>
                  </span>
                  <span className={styles.state} data-active={s.is_active || undefined}>
                    {s.is_active ? "ظاهرة" : "مخفية"}
                  </span>
                </summary>
                <div className={styles.body}>
                  <ServiceForm service={s} nextSort={nextServiceSort} />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details>
          <summary className={styles.summary}>
            <span className={styles.name}>خدمة جديدة</span>
          </summary>
          <div className={styles.body}>
            <ServiceForm nextSort={nextServiceSort} />
          </div>
        </details>
      </section>

      <section className={formStyles.section} aria-labelledby="hours-title">
        <h2 id="hours-title">ساعات الدوام</h2>
        <p className={formStyles.lede}>
          بتوقيت الصالون. لا يُحفظ تغيير يُخرج موعداً قائماً من الدوام: ألغِ الموعد أو انقله أولاً. الاستراحات من «المواعيد» ← «سكّر وقت».
        </p>
        {WEEK_ORDER.map((d) => (
          <HoursForm key={d} weekday={d} name={DAY_NAMES[d]} open={hours.get(d)?.open ?? null} close={hours.get(d)?.close ?? null} />
        ))}
      </section>
    </main>
  );
}
