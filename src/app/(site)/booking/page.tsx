import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { Button } from "@/components/Button";
import { getCurrentUser, getProfile } from "@/lib/auth/guards";
import { getBarbers, getServices } from "@/lib/salon-data";
import styles from "@/components/booking/booking.module.css";

export const metadata: Metadata = {
  title: "احجز موعد",
  description: "احجز موعدك في صالون عدلي: اختر الخدمة والحلاق والوقت.",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/*
  Anyone can look at free times; booking itself needs an account (create_booking checks it again).
  ?service=&barber=&at= keep the choice across the sign-in detour.
*/
export default async function BookingPage({ searchParams }: PageProps<"/booking">) {
  const [services, barbers, user, profile, sp] = await Promise.all([
    getServices(),
    getBarbers(),
    getCurrentUser(),
    getProfile(),
    searchParams,
  ]);
  const bookable = services?.filter((s) => s.bookable_online && s.duration_min) ?? null;

  return (
    <main className={styles.page}>
      <h1 className="title">احجز موعد</h1>
      <p className={styles.lede}>اختر الخدمة والحلاق والوقت. التثبيت فوري، وتلغي من حسابك حتى ساعتين قبل الموعد.</p>

      {!bookable || !barbers ? (
        <div className={styles.empty} role="alert">
          <p>تعذّر تحميل المواعيد الآن. حاول مرة أخرى بعد قليل.</p>
          <Button variant="ghost" href="/booking">
            أعد المحاولة
          </Button>
        </div>
      ) : bookable.length === 0 || barbers.length === 0 ? (
        <div className={styles.empty}>
          <p>الحجز من الموقع غير متاح الآن. تواصل مع الصالون لتحجز.</p>
        </div>
      ) : (
        <BookingFlow
          services={bookable.map((s) => ({ id: s.id, name_ar: s.name_ar, price_ils: s.price_ils, duration_min: s.duration_min! }))}
          barbers={barbers}
          signedIn={Boolean(user)}
          prefill={{ name: profile?.full_name ?? user?.name ?? "", phone: profile?.phone ?? "" }}
          initial={{ service: one(sp.service), barber: one(sp.barber), at: one(sp.at) }}
        />
      )}
    </main>
  );
}
