/*
  Salon details and the display of opening hours. Safe in the browser: the hours themselves come from the
  database (`salon_hours`, read by src/lib/salon-data.ts on the server) and are passed in.
  SALON is waiting on the owner (docs/ROADMAP.md, «ما ننتظره»): empty values are simply not rendered.
*/

export const SALON_TIME_ZONE = "Asia/Hebron";

/** 0 = Sunday … 6 = Saturday, as in Date#getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Opening and closing time, "HH:MM" 24h, salon local time. null = closed all day. */
export type DayHours = { open: string; close: string } | null;

/** The salon's week as `salon_hours` holds it (src/lib/salon-data.ts reads it). A weekday with no hours is closed. */
export type Week = Record<Weekday, DayHours>;

export const SALON = {
  /** The city, always shown in «الموقع» (U4). */
  city: "قلقيلية",
  /** The street address, e.g. "قلقيلية، شارع …" (one value, used everywhere). Until it is set, «الموقع» shows the city. */
  address: null as string | null,
  /** The Google Maps link the owner gives: «افتح في خرائط جوجل» opens it in a new tab. */
  mapUrl: "https://www.google.com/maps/search/?api=1&query=32.188603,34.964322" as string | null,
  /** The salon's coordinates (from the owner: 32°11'18.97"N 34°57'51.56"E). With them «الموقع» shows a map that
   * loads on tap only. */
  geo: { lat: 32.188603, lng: 34.964322 } as { lat: number; lng: number } | null,
  /** A light still of the map in public/salon/ (shown before the tap). Without it the tap target is a plain card. */
  mapImage: null as string | null,
  /** Real salon photos in public/salon/, e.g. [{ src: "/salon/chair.webp", alt: "…" }] */
  photos: [] as { src: string; alt: string }[],
};

/* ---------- Display ---------- */

export const DAY_NAMES: Record<Weekday, string> = {
  0: "الأحد",
  1: "الاثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
  6: "السبت",
};

/** The salon's week starts on Saturday. */
const WEEK_ORDER: Weekday[] = [6, 0, 1, 2, 3, 4, 5];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "22:00" → "10 مساءً", "12:30" → "12:30 ظهراً". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "صباحاً" : h < 15 ? "ظهراً" : "مساءً";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${period}`;
}

const formatDay = (d: DayHours) => (d ? `${formatTime(d.open)} – ${formatTime(d.close)}` : "مغلق");

/** Days with the same hours share one row: «السبت، الأحد، … | 12 ظهراً – 10 مساءً». */
export function hoursRows(week: Week): { days: string; hours: string }[] {
  const rows: { days: string[]; hours: string }[] = [];
  for (const day of WEEK_ORDER) {
    const hours = formatDay(week[day]);
    const row = rows.find((r) => r.hours === hours);
    if (row) row.days.push(DAY_NAMES[day]);
    else rows.push({ days: [DAY_NAMES[day]], hours });
  }
  return rows.map((r) => ({ days: r.days.join("، "), hours: r.hours }));
}

/* ---------- Open now ---------- */

const localParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SALON_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAY_INDEX: Record<string, Weekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday and minutes since midnight in the salon's time zone, whatever the visitor's clock says. */
function salonClock(at: Date): { day: Weekday; minutes: number } {
  const parts = Object.fromEntries(localParts.formatToParts(at).map((p) => [p.type, p.value]));
  return { day: WEEKDAY_INDEX[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export type OpenStatus = { open: true; label: string } | { open: false; label: string };

/** «مفتوح الآن، يغلق 10 مساءً» / «مغلق الآن، يفتح اليوم 12 ظهراً» / «… يفتح السبت 12 ظهراً». */
export function openStatus(at: Date, week: Week): OpenStatus {
  const { day, minutes } = salonClock(at);
  const today = week[day];

  if (today && minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
    return { open: true, label: `مفتوح الآن، يغلق ${formatTime(today.close)}` };
  }
  if (today && minutes < toMinutes(today.open)) {
    return { open: false, label: `مغلق الآن، يفتح اليوم ${formatTime(today.open)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const next = ((day + i) % 7) as Weekday;
    const hours = week[next];
    if (hours) {
      const when = i === 1 ? "غداً" : DAY_NAMES[next];
      return { open: false, label: `مغلق الآن، يفتح ${when} ${formatTime(hours.open)}` };
    }
  }
  return { open: false, label: "مغلق الآن" };
}
