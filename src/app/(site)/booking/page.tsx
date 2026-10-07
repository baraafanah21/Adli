import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlow, BookingFromUrl } from "@/components/booking/BookingFlow";
import { Button } from "@/components/Button";
import { getBarbers, getServices } from "@/lib/salon-data";
import styles from "@/components/booking/booking.module.css";

export const metadata: Metadata = {
  title: "احجز موعد",
  description: "احجز موعدك في صالون عدلي: اختر الخدمة والحلاق والوقت.",
};

/*
  Anyone can look at free times; booking itself needs an account (create_booking checks it again).
  The page is the same for everyone: the session and ?service=&barber=&at= (the sign-in detour) are read on the
  client. Free times are never cached: BookingFlow asks booking_availability from the browser on every choice.
*/
export default async function BookingPage() {
  const [services, barbers] = await Promise.all([getServices(), getBarbers()]);
  const bookable = services?.filter((s) => s.bookable_online && s.duration_min) ?? null;
  const flow = {
    services: (bookable ?? []).map((s) => ({ id: s.id, name_ar: s.name_ar, price_ils: s.price_ils, duration_min: s.duration_min! })),
    barbers: barbers ?? [],
  };

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
        <Suspense fallback={<BookingFlow {...flow} initial={{}} />}>
          <BookingFromUrl {...flow} />
        </Suspense>
      )}
    </main>
  );
}
