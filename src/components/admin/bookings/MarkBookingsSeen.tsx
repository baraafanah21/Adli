"use client";

import { useEffect } from "react";
import { markBookingsSeen } from "@/app/admin/bookings/actions";

/**
 * Records this visit to «المواعيد» (admin_mark_bookings_seen) once the page is really on screen. Done from the
 * browser on purpose: Next.js prefetches the menu's links, and a record made while rendering would mark everything
 * seen without a visit. The «جديد» marks on this page stay until the next visit; the menu count clears on the next
 * navigation.
 */
export function MarkBookingsSeen() {
  useEffect(() => {
    void markBookingsSeen();
  }, []);
  return null;
}
