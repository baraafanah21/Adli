"use client";

import { useLayoutEffect } from "react";
import { sessionStore, type SiteSession } from "@/components/session/session-store";

/** Renders nothing: passes the session read on the server into the client store. Re-runs after sign-in / sign-out. */
export function SessionBridge({ session }: { session: SiteSession }) {
  useLayoutEffect(() => {
    sessionStore.set(session);
  }, [session]);
  return null;
}
