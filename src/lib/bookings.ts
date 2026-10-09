import { SALON_TIME_ZONE, formatTime } from "@/lib/salon";
import { formatDayMonth, formatWeekday } from "@/lib/dates";

/* Bookings: what create_booking() returns, and how dates and times read in the salon's time zone. */

export type BookingStatus = "pending" | "confirmed" | "completed" | "no_show" | "cancelled" | "rejected";

/** create_booking() → POST /api/bookings. */
export type PlacedBooking = {
  code: string;
  status: "pending" | "confirmed";
  starts_at: string;
  ends_at: string;
  barber_name_ar: string;
  service_name_ar: string;
  price_ils: number;
};

/** One day of booking_availability(). `day` is the salon date "YYYY-MM-DD"; slots are ISO start times. */
export type AvailabilityDay = { day: string; closed: boolean; mine: boolean; slots: string[] };

/** The customer cancels online until this many minutes before the start (private.booking_rule('cancel_min')). */
export const CANCEL_UNTIL_MIN = 120;

export const BOOKING_STATUS: Record<BookingStatus, string> = {
  pending: "بانتظار تأكيد الصالون",
  confirmed: "مؤكد",
  completed: "حضرت",
  no_show: "لم تحضر",
  cancelled: "ملغى",
  rejected: "لم يُؤكَّد",
};

const hhmmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: SALON_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SALON_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** «1:30 ظهراً», «7 مساءً»: the same words as the opening hours. */
export const formatSlot = (iso: string) => formatTime(hhmmFmt.format(new Date(iso)));

/** «الأحد 12 أكتوبر» */
export const formatDay = (iso: string) => formatDayMonth(iso, { weekday: true });

/** The salon date of an instant, "YYYY-MM-DD". */
export const salonDate = (at: Date) => ymdFmt.format(at);

/** A salon date "YYYY-MM-DD" at noon UTC, which is the same calendar day in Asia/Hebron: safe for weekday and day names. */
const noonOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/** Day chip label: «اليوم» / «بكرا» / «الثلاثاء», with the date under it («14 أكتوبر»). */
export function dayChip(ymd: string, now: Date): { name: string; date: string } {
  const today = salonDate(now);
  const tomorrow = salonDate(new Date(noonOf(today).getTime() + 86_400_000));
  const d = noonOf(ymd);
  const date = formatDayMonth(d, { timeZone: "UTC" });
  const name =
    ymd === today ? "اليوم" : ymd === tomorrow ? "بكرا" : formatWeekday(d, { timeZone: "UTC" });
  return { name, date };
}

/** «الأحد 12 أكتوبر، 1:30 ظهراً» */
export const formatWhen = (iso: string) => `${formatDay(iso)}، ${formatSlot(iso)}`;

/** Can the customer still cancel this online? (The database checks again.) */
export const canCancelOnline = (startsAt: string, now = new Date()) =>
  new Date(startsAt).getTime() - now.getTime() >= CANCEL_UNTIL_MIN * 60_000;

/** Minutes since midnight in salon time: "2026-10-12T14:30:00+00:00" → 1050 (17:30 in Hebron). */
export function salonMinutes(iso: string) {
  const [h, m] = hhmmFmt.format(new Date(iso)).split(":").map(Number);
  return h * 60 + m;
}

/** 1050 → "17:30" */
export const minutesToHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "YYYY-MM-DD" ± days, as a salon date. */
export function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
