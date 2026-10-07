import { useSyncExternalStore } from "react";

/*
  Who is signed in, for the public site's client components (account menu, order sheet, booking form).
  The pages themselves never read the session, so they can be prerendered and cached; <SessionIsland> reads it
  inside a <Suspense> and hands it here through <SessionBridge>. Until then the state is "loading" (also on the
  server and during hydration), and each consumer shows its signed-out look or waits.
*/

export type SiteSession = {
  user: { id: string; name: string | null; email: string | null } | null;
  profile: { full_name: string | null; area: string | null; phone: string | null } | null;
};

export type SessionState = { status: "loading" } | ({ status: "ready" } & SiteSession);

const LOADING: SessionState = { status: "loading" };

let state: SessionState = LOADING;
let key = "";
const listeners = new Set<() => void>();

export const sessionStore = {
  set(next: SiteSession) {
    const nextKey = JSON.stringify(next);
    if (nextKey === key) return;
    key = nextKey;
    state = { status: "ready", ...next };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSiteSession(): SessionState {
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => state,
    () => LOADING,
  );
}
