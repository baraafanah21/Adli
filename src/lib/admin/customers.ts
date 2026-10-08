import type { BookingStatus } from "@/lib/bookings";
import type { OrderStatus } from "@/lib/order-status";

/*
  «الزبائن» (E3.2): every account that isn't staff, from admin_customers() / admin_customer(). Each order's amount is
  shown to staff (they collect it); a customer's total (`spent_ils`) is computed in the database for the owner only,
  and is null for everyone else.
*/

export const CUSTOMER_FILTERS = [
  { key: "flagged", label: "عليه وسم" },
  { key: "rate_limited", label: "وصل حد المحاولات" },
  { key: "blocked", label: "محظور" },
  { key: "upcoming", label: "له موعد قادم" },
  { key: "new_week", label: "جديد هذا الأسبوع" },
] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number]["key"];
export const isCustomerFilter = (v: unknown): v is CustomerFilter => CUSTOMER_FILTERS.some((f) => f.key === v);

export type CustomerRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  joined_at: string;
  attended: number;
  no_show: number;
  cancelled: number;
  next_booking: { id: string; starts_at: string; status: BookingStatus; service_name_ar: string; day: string } | null;
  orders: number;
  /** Owner only; null for staff. */
  spent_ils: number | null;
  last_visit: string | null;
  flagged: boolean;
  rate_limited: boolean;
  blocked: boolean;
};
export type CustomerList = { total: number; owner: boolean; rows: CustomerRow[] };

export type CustomerDetail = {
  owner: boolean;
  profile: { id: string; full_name: string | null; phone: string | null; area: string | null; email: string | null; joined_at: string };
  attended: number;
  no_show: number;
  cancelled: number;
  spent_ils: number | null;
  last_visit: string | null;
  bookings: { id: string; code: string; starts_at: string; day: string; status: BookingStatus; service_name_ar: string; barber_name_ar: string }[];
  orders: { id: string; code: string; created_at: string; status: OrderStatus; total_ils: number }[];
  flags: {
    id: number;
    flagged_at: string;
    flagged_by: string | null;
    booking_code: string | null;
    cleared_at: string | null;
    cleared_by: string | null;
    clear_note: string | null;
  }[];
  blocks: { blocked_at: string; blocked_by: string | null; reason: string; unblocked_at: string | null; unblocked_by: string | null; unblock_note: string | null }[];
  blocked: boolean;
  rate: { in_window: number; per_hour: number; limited: boolean; resets: { reset_at: string; reset_by: string | null }[] };
  note: { text: string; updated_at: string; updated_by: string | null } | null;
};

/** The customer's name as staff see it: name, else email, else «زبون بلا اسم». */
export const customerName = (c: { full_name: string | null; email: string | null }) =>
  c.full_name?.trim() || c.email || "زبون بلا اسم";

const shortDate = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { timeZone: "Asia/Hebron", day: "numeric", month: "short", year: "numeric" });
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
