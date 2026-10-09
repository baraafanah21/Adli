/*
  Every date and time a person reads on the site and in the admin, in one place: the common month names (يناير،
  فبراير … أكتوبر), the usual weekday names (السبت، الأحد …), western digits, a 12-hour clock with ص / م, salon time
  (Asia/Hebron) unless told otherwise.

  The names are fixed here rather than taken from a locale: "ar-PS" says «تشرين الأول», "ar-EG" says «أكتوبر» on Node
  but browsers don't agree on every name and separator. Intl is only asked for the numbers (en-US parts in the time
  zone), so the server render and every browser print exactly the same text. Safe in the browser and on the server.

    formatDate(d)                         9 أكتوبر 2026
    formatDate(d, { weekday: true })      الجمعة، 9 أكتوبر 2026
    formatDayMonth(d)                     9 أكتوبر
    formatDayMonth(d, { weekday: true })  الجمعة، 9 أكتوبر
    formatDateTime(d)                     9 أكتوبر 2026، 3:45 م
    formatDayMonthTime(d)                 9 أكتوبر، 3:45 م
    formatWeekdayTime(d)                  الجمعة 3:45 م
    formatWeekday(d)                      الجمعة
    formatClock(d)                        3:45 م   (the admin's clock; the booking pages say «3:45 عصراً», lib/salon.ts)

  `timeZone: "UTC"` is for a salon day held as UTC midnight of its date (lib/bookings.ts, the admin calendar, the
  sales chart), so the date never shifts with the zone.
*/

import { SALON_TIME_ZONE } from "@/lib/salon";

export const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/** Sunday first, as Date.getDay() and Postgres extract(dow). */
export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

type Zone = { timeZone?: string };
type Parts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The date's numbers in a time zone (cached formatter per zone). */
function partsOf(date: Date | string | number, timeZone = SALON_TIME_ZONE): Parts {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormatters.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: WEEKDAY_EN.indexOf(p.weekday),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
  };
}

const clock = (p: Parts) => `${p.hour % 12 || 12}:${String(p.minute).padStart(2, "0")} ${p.hour < 12 ? "ص" : "م"}`;
const dayMonth = (p: Parts) => `${p.day} ${MONTHS_AR[p.month - 1]}`;
const withWeekday = (p: Parts, text: string, weekday?: boolean) => (weekday ? `${WEEKDAYS_AR[p.weekday]}، ${text}` : text);

/** 9 أكتوبر 2026 (with `weekday`: الجمعة، 9 أكتوبر 2026). */
export function formatDate(date: Date | string | number, o: Zone & { weekday?: boolean } = {}) {
  const p = partsOf(date, o.timeZone);
  return withWeekday(p, `${dayMonth(p)} ${p.year}`, o.weekday);
}

/** 9 أكتوبر (with `weekday`: الجمعة، 9 أكتوبر). */
export function formatDayMonth(date: Date | string | number, o: Zone & { weekday?: boolean } = {}) {
  const p = partsOf(date, o.timeZone);
  return withWeekday(p, dayMonth(p), o.weekday);
}

/** 9 أكتوبر 2026، 3:45 م */
export function formatDateTime(date: Date | string | number, o: Zone = {}) {
  const p = partsOf(date, o.timeZone);
  return `${dayMonth(p)} ${p.year}، ${clock(p)}`;
}

/** 9 أكتوبر، 3:45 م */
export function formatDayMonthTime(date: Date | string | number, o: Zone = {}) {
  const p = partsOf(date, o.timeZone);
  return `${dayMonth(p)}، ${clock(p)}`;
}

/** الجمعة 3:45 م */
export function formatWeekdayTime(date: Date | string | number, o: Zone = {}) {
  const p = partsOf(date, o.timeZone);
  return `${WEEKDAYS_AR[p.weekday]} ${clock(p)}`;
}

/** الجمعة */
export function formatWeekday(date: Date | string | number, o: Zone = {}) {
  return WEEKDAYS_AR[partsOf(date, o.timeZone).weekday];
}

/** 3:45 م */
export function formatClock(date: Date | string | number, o: Zone = {}) {
  return clock(partsOf(date, o.timeZone));
}
