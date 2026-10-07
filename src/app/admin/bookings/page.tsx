import type { Metadata } from "next";
import { BookingsBoard, type PendingBooking, type WeeklyClosure, type OpenFlag } from "@/components/admin/bookings/BookingsBoard";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { salonDate } from "@/lib/bookings";
import type { BookingDay } from "@/lib/admin/bookings";
import styles from "@/components/admin/bookings/bookings.module.css";

export const metadata: Metadata = { title: "المواعيد" };

type Summary = { pending: PendingBooking[] };

/** ?day=YYYY-MM-DD (salon date); today by default. */
export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const { role } = await requireRole(["owner", "staff"], "/admin/bookings");
  const sp = await searchParams;
  const today = salonDate(new Date());
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;

  const supabase = await createClient();
  const [dayRes, summaryRes, servicesRes, weeklyRes, flagsRes] = await Promise.all([
    supabase.rpc("admin_bookings_day", { p_day: day }),
    supabase.rpc("admin_bookings_summary"),
    supabase.from("services").select("id, name_ar, duration_min").eq("is_active", true).not("duration_min", "is", null).order("sort"),
    supabase
      .from("closures")
      .select("id, barber_id, weekday, start_time, end_time, valid_from, valid_until, reason, barbers (name_ar)")
      .not("weekday", "is", null)
      .order("weekday")
      .order("start_time"),
    supabase.rpc("admin_open_flags"),
  ]);
  for (const [name, res] of [
    ["day", dayRes],
    ["summary", summaryRes],
    ["services", servicesRes],
    ["weekly", weeklyRes],
    ["flags", flagsRes],
  ] as const) {
    if (res.error) console.error(`admin bookings ${name}`, res.error.code, res.error.message);
  }

  const data = dayRes.data as BookingDay | null;
  if (!data) {
    return (
      <main className={styles.page}>
        <h1 className="title">المواعيد</h1>
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل المواعيد. حدّث الصفحة بعد قليل.
        </p>
      </main>
    );
  }

  return (
    <BookingsBoard
      data={data}
      today={today}
      isOwner={role.role === "owner"}
      pending={(summaryRes.data as Summary | null)?.pending ?? []}
      services={(servicesRes.data ?? []) as { id: string; name_ar: string; duration_min: number }[]}
      weekly={(weeklyRes.data ?? []) as unknown as WeeklyClosure[]}
      flags={(flagsRes.data ?? []) as OpenFlag[]}
    />
  );
}
