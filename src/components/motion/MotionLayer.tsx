"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// GSAP, its plugins and @gsap/react live in this chunk only: never in the first-load bundle.
const MotionRoot = dynamic(() => import("./MotionRoot"), { ssr: false });

/**
 * When the motion layer (U5.2) may start: after the `load` event (so the hero poster, the LCP, never waits for it),
 * once the browser is idle and the fonts are in (SplitText measures words), and never with prefers-reduced-motion:
 * then GSAP is never downloaded and the page stays exactly as the server sent it. Public pages only (SiteChrome),
 * restarted on every navigation. Inside <Suspense> in SiteChrome (usePathname on a route built at its first visit).
 */
export function MotionLayer() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let idle: number | undefined;
    const hasIdle = typeof window.requestIdleCallback === "function";
    const start = () => {
      const go = () => document.fonts.ready.then(() => !cancelled && setReady(true));
      idle = hasIdle ? window.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 1200);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
      if (idle !== undefined) (hasIdle ? window.cancelIdleCallback : window.clearTimeout)(idle);
    };
  }, []);

  return ready ? <MotionRoot key={pathname} /> : null;
}
