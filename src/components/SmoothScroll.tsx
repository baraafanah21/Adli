"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/** Lenis smooth scrolling. Off under prefers-reduced-motion; never inside the order sheet or other dialogs. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      prevent: (node) => node.closest("dialog") !== null,
    });
    return () => lenis.destroy();
  }, []);
  return null;
}
