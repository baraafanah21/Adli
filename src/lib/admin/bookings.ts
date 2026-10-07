import { whatsappDigits } from "@/lib/phone";
import { formatWhen, type BookingStatus } from "@/lib/bookings";

/* The admin's side of bookings: what admin_bookings_day() returns, and the WhatsApp reminder. */

export type DayBarber = { id: string; name_ar: string; is_active: boolean; mine: boolean };

export type DayBooking = {
  id: string;
  code: string;
  kind: "online" | "walk_in";
  status: BookingStatus;
  barber_id: string;
  service_name_ar: string;
  price_ils: number;
  duration_min: number;
  starts_at: string;
  ends_at: string;
  customer_name: string | null;
  phone: string | null;
  /** The customer's account has an open no-show flag. */
  flagged: boolean;
  user_id: string | null;
  cancelled_by: "customer" | "salon" | "system" | null;
  cancel_reason: string | null;
};

export type DayClosure = {
  id: string;
  /** null: the whole salon. */
  barber_id: string | null;
  weekly: boolean;
  reason: string | null;
  starts_at: string;
  ends_at: string;
};

export type BookingDay = {
  day: string;
  hours: { open: string; close: string } | null;
  barbers: DayBarber[];
  bookings: DayBooking[];
  closures: DayClosure[];
};

/** Statuses that hold time on the calendar (a no-show stays visible but frees the time). */
export const ON_CALENDAR: BookingStatus[] = ["pending", "confirmed", "completed", "no_show"];

/** The staff's moves from each status (admin_set_booking_status checks the same rules, and the start time). */
export const ADMIN_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "مؤكد",
  completed: "حضر",
  no_show: "لم يحضر",
  cancelled: "ملغى",
  rejected: "مرفوض",
};

/** A ready reminder to the customer's WhatsApp, or null when the number can't be dialled. */
export function reminderUrl(b: Pick<DayBooking, "phone" | "customer_name" | "starts_at" | "service_name_ar" | "code">, barberName: string) {
  const digits = whatsappDigits(b.phone);
  if (!digits) return null;
  const hello = b.customer_name ? `مرحباً ${b.customer_name}،` : "مرحباً،";
  const text = [
    `${hello} تذكير بموعدك في صالون عدلي: ${formatWhen(b.starts_at)}.`,
    `${b.service_name_ar} مع ${barberName}. رقم الحجز ${b.code}.`,
    "إذا تغيّر شيء ردّ على هذه الرسالة.",
  ].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
