"use client";

import { useEffect } from "react";
import "lenis/dist/lenis.css";

/**
 * Lenis smooth scrolling, for a mouse or trackpad only (`pointer: fine`): touch scrolling is already smooth, so phones
 * never download it. Loaded after the page is idle (dynamic import), off under prefers-reduced-motion, never inside
 * the order sheet or other dialogs.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let lenis: { destroy: () => void } | null = null;
    let cancelled = false;
    const start = () => {
      import("lenis").then(({ default: Lenis }) => {
        if (cancelled) return;
        lenis = new Lenis({
          autoRaf: true,
          anchors: true,
          prevent: (node) => node.closest("dialog") !== null,
        });
      });
    };
    const hasIdle = typeof window.requestIdleCallback === "function";
    const idle = hasIdle ? window.requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 1200);
    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(idle as number);
      else clearTimeout(idle as ReturnType<typeof setTimeout>);
      lenis?.destroy();
    };
  }, []);
  return null;
}
