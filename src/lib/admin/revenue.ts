import { addDays, salonDate } from "@/lib/bookings";
import { formatDayMonth } from "@/lib/dates";

/*
  «الإيرادات» on the admin home (owner): completed bookings, what was paid, by salon day. The filters live in the URL
  under their own names (rev, rev_from, rev_to, rev_barber, rev_service), so the sales card's ?period= is untouched.
*/

export type RevenueRow = { id: string; name_ar: string; total_ils: number; count: number };

export type Revenue = {
  from: string;
  to: string;
  total_ils: number;
  count: number;
  by_barber: RevenueRow[];
  by_service: RevenueRow[];
  by_day: { day: string; total_ils: number; count: number }[];
};

export const REVENUE_PERIODS = { day: "اليوم", week: "هذا الأسبوع", month: "هذا الشهر", range: "من – إلى" } as const;
export type RevenuePeriod = keyof typeof REVENUE_PERIODS;

/** admin_revenue() refuses longer ranges. */
export const MAX_RANGE_DAYS = 366;

export type RevenueFilters = {
  period: RevenuePeriod;
  from: string;
  to: string;
  barber: string | null;
  service: string | null;
  /** The from–to typed in the URL couldn't be used (then: this month). */
  rangeInvalid: boolean;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const isDay = (v: string | undefined): v is string => !!v && YMD.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** The URL's filters → salon dates (the week starts on Saturday, as in the sales figures). */
export function revenueFilters(sp: Record<string, string | string[] | undefined>, now = new Date()): RevenueFilters {
  const today = salonDate(now);
  const asked = one(sp.rev);
  const period: RevenuePeriod = asked === "day" || asked === "week" || asked === "range" ? asked : "month";
  const barber = one(sp.rev_barber);
  const service = one(sp.rev_service);
  const base = { barber: barber && UUID.test(barber) ? barber : null, service: service && UUID.test(service) ? service : null };
  const month = { from: `${today.slice(0, 8)}01`, to: today };

  if (period === "day") return { ...base, period, from: today, to: today, rangeInvalid: false };
  if (period === "week") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    return { ...base, period, from: addDays(today, -((dow + 1) % 7)), to: today, rangeInvalid: false };
  }
  if (period === "range") {
    const from = one(sp.rev_from);
    const to = one(sp.rev_to);
    if (isDay(from) && isDay(to) && from <= to && daysBetween(from, to) <= MAX_RANGE_DAYS) {
      return { ...base, period, from, to, rangeInvalid: false };
    }
    // An empty form (just switched to من – إلى) isn't an error: it shows this month until dates are chosen.
    return { ...base, period, ...month, rangeInvalid: Boolean(from || to) };
  }
  return { ...base, period, ...month, rangeInvalid: false };
}

/** «1 – 11 أكتوبر» / «11 أكتوبر»: a salon date is held as UTC midnight so it never shifts. */
export function rangeLabel(from: string, to: string) {
  const f = formatDayMonth(`${from}T00:00:00Z`, { timeZone: "UTC" });
  return from === to ? f : `${f} – ${formatDayMonth(`${to}T00:00:00Z`, { timeZone: "UTC" })}`;
}

export const dayLabel = (ymd: string) => formatDayMonth(`${ymd}T00:00:00Z`, { timeZone: "UTC", weekday: true });

export const visits = (n: number) => (n === 1 ? "زيارة واحدة" : n === 2 ? "زيارتان" : n <= 10 ? `${n} زيارات` : `${n} زيارة`);
