import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { BOOKING_STATUS, canCancelOnline, formatDay, formatWhen, type BookingStatus } from "@/lib/bookings";
import { CancelBooking } from "./CancelBooking";
import styles from "./booking.module.css";

type Row = {
  id: string;
  code: string;
  status: BookingStatus;
  during: string;
  service_name_ar: string;
  price_ils: number;
  cancelled_by: "customer" | "salon" | "system" | null;
  cancel_reason: string | null;
  barbers: { name_ar: string } | null;
};

/** PostgREST sends a tstzrange as text: ["2026-10-10 10:00:00+00","2026-10-10 10:30:00+00"). → the start, ISO. */
function rangeStart(during: string): string {
  const m = /^[[(]"?([^",]+)"?,/.exec(during);
  if (!m) return during;
  return m[1].replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}

/**
 * «مواعيدي» on /account: the no-show flag if one is open, upcoming bookings with cancelling, and the history.
 * RLS returns only the caller's rows; the user_id filter is for the index.
 */
export async function MyBookings({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [bookings, flags] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, code, status, during, service_name_ar, price_ils, cancelled_by, cancel_reason, barbers (name_ar)")
      .eq("user_id", userId)
      .order("salon_date", { ascending: false })
      .limit(30),
    supabase.from("account_flags").select("flagged_at").eq("user_id", userId).is("cleared_at", null).maybeSingle(),
  ]);

  if (bookings.error) {
    console.error("my bookings", bookings.error.code, bookings.error.message);
    return (
      <section id="bookings" className={styles.bookings} aria-labelledby="bookings-title">
        <h2 id="bookings-title">مواعيدي</h2>
        <p className={styles.error} role="alert">
          تعذّر تحميل مواعيدك الآن. حاول مرة أخرى بعد قليل.
        </p>
      </section>
    );
  }

  const now = new Date();
  const rows = (bookings.data as unknown as Row[]).map((r) => ({ ...r, starts_at: rangeStart(r.during) }));
  const upcoming = rows
    .filter((r) => (r.status === "pending" || r.status === "confirmed") && new Date(r.starts_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = rows.filter((r) => !upcoming.includes(r));
  const flag = flags.data as { flagged_at: string } | null;

  return (
    <section id="bookings" className={styles.bookings} aria-labelledby="bookings-title">
      <h2 id="bookings-title">مواعيدي</h2>

      {flag && (
        <div className={styles.flag} role="note">
          <strong>على حسابك وسم «تخلّف عن موعد»</strong>
          لم تحضر موعداً سابقاً ({formatDay(flag.flagged_at)}). مواعيدك الجديدة تبقى بانتظار تأكيد الصالون حتى يرفع
          الصالون الوسم.
        </div>
      )}

      {upcoming.length === 0 ? (
        <>
          <p className={styles.muted}>ليس عندك موعد قادم.</p>
          <Link className="ad-btn ad-btn--primary ad-btn--block" href="/booking">
            احجز موعد
          </Link>
        </>
      ) : (
        upcoming.map((b) => (
          <article key={b.id} className={styles.card}>
            <div className={styles.cardHead}>
              <p className={styles.cardWhen}>{formatWhen(b.starts_at)}</p>
              <span className={styles.status} data-status={b.status}>
                {BOOKING_STATUS[b.status]}
              </span>
            </div>
            <p className={styles.cardMeta}>
              {b.service_name_ar} مع {b.barbers?.name_ar ?? "الصالون"} · {formatPrice(b.price_ils)} ·{" "}
              <bdi dir="ltr">{b.code}</bdi>
            </p>
            <CancelBooking bookingId={b.id} code={b.code} cancellable={canCancelOnline(b.starts_at, now)} />
          </article>
        ))
      )}

      {past.length > 0 && (
        <>
          <h3 className={styles.muted}>السجل</h3>
          <ul className={styles.history}>
            {past.map((b) => (
              <li key={b.id}>
                <div className={styles.historyRow}>
                  <span>{formatWhen(b.starts_at)}</span>
                  <span className={styles.status} data-status={b.status}>
                    {b.status === "cancelled" && b.cancelled_by === "salon" ? "ألغاه الصالون" : BOOKING_STATUS[b.status]}
                  </span>
                </div>
                <span className={styles.cardMeta}>
                  {b.service_name_ar} · <bdi dir="ltr">{b.code}</bdi>
                </span>
                {b.cancel_reason && b.cancelled_by !== "customer" && <p className={styles.reason}>السبب: {b.cancel_reason}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
