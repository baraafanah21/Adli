import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DayHours, Week, Weekday } from "@/lib/salon";

/*
  Salon data from the database (Phase E): opening hours, services, barbers. Named columns only; RLS returns the
  active rows to everyone. On a read error each function returns null, and the page says it couldn't load.
*/

export type SalonService = {
  id: string;
  name_ar: string;
  price_ils: number;
  /** null for an add-on (not bookable online). */
  duration_min: number | null;
  bookable_online: boolean;
};

export type Barber = { id: string; name_ar: string };

/** "12:00:00" → "12:00" */
const hhmm = (t: string) => t.slice(0, 5);

export const getWeek = cache(async (): Promise<Week | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("salon_hours").select("weekday, open_time, close_time");
  if (error) {
    console.error("salon_hours", error.code, error.message);
    return null;
  }
  const week = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } as Record<Weekday, DayHours>;
  for (const row of data as { weekday: Weekday; open_time: string; close_time: string }[]) {
    week[row.weekday] = { open: hhmm(row.open_time), close: hhmm(row.close_time) };
  }
  return week;
});

export const getServices = cache(async (): Promise<SalonService[] | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name_ar, price_ils, duration_min, bookable_online")
    .eq("is_active", true)
    .order("sort");
  if (error) {
    console.error("services", error.code, error.message);
    return null;
  }
  return data as SalonService[];
});

export const getBarbers = cache(async (): Promise<Barber[] | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("barbers").select("id, name_ar").eq("is_active", true).order("sort");
  if (error) {
    console.error("barbers", error.code, error.message);
    return null;
  }
  return data as Barber[];
});
