/*
  Salon details shown on the home page. Waiting on the owner (docs/ROADMAP.md, «ما ننتظره»):
  empty values are simply not rendered, so nothing invented reaches the page.
*/

export type OpeningHours = { days: string; hours: string };

export const SALON = {
  /** e.g. "نابلس، رفيديا، شارع …" */
  address: null as string | null,
  /** A maps link (Google Maps or OpenStreetMap). Opened in a new tab; no embed until the visitor asks. */
  mapUrl: null as string | null,
  /** e.g. [{ days: "السبت إلى الخميس", hours: "10:00 – 22:00" }] */
  hours: [] as OpeningHours[],
  /** Real salon photos in public/salon/, e.g. [{ src: "/salon/chair.webp", alt: "…" }] */
  photos: [] as { src: string; alt: string }[],
};
