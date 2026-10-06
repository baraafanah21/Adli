/*
  Salon services and prices, from the owner (docs/BOOKINGS-BRIEF.md).
  Temporary static file: once the bookings track ships the `services` table,
  the home page reads from it and this file is deleted.
*/

export type SalonService = { name: string; priceIls: number };

export const SERVICES: SalonService[] = [
  { name: "حلاقة كاملة", priceIls: 30 },
  { name: "تحديد شعر وتدريج لحية", priceIls: 15 },
  { name: "شمع", priceIls: 5 },
  { name: "سشوار", priceIls: 10 },
  { name: "تنظيف بشرة بالبخار", priceIls: 50 },
  { name: "لزقة زوان", priceIls: 5 },
  { name: "ماسك طين أو ألوفيرا", priceIls: 5 },
  { name: "تنظيف بشرة بالماسكات", priceIls: 25 },
  { name: "حمام زيت", priceIls: 10 },
  { name: "بروتين مع شامبو", priceIls: 200 },
  { name: "حلاقة عريس", priceIls: 200 },
];
